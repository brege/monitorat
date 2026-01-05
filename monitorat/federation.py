#!/usr/bin/env python3
import logging
from typing import Optional
from urllib.parse import urljoin

import httpx

try:
    from .config import config
except ImportError:
    from config import config

logger = logging.getLogger(__name__)


class FederationClient:
    """HTTP client for fetching from remote monitorat instances."""

    def __init__(self):
        self._client: Optional[httpx.Client] = None

    @property
    def enabled(self) -> bool:
        try:
            return config["federation"]["enabled"].get(bool)
        except Exception:
            return False

    @property
    def timeout(self) -> float:
        try:
            return config["federation"]["timeout_seconds"].get(float)
        except Exception:
            return 10.0

    @property
    def remotes(self) -> list:
        try:
            return config["federation"]["remotes"].get(list)
        except Exception:
            return []

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(timeout=self.timeout)
        return self._client

    def get_remote(self, name: str) -> Optional[dict]:
        """Get remote config by name."""
        for remote in self.remotes:
            if remote.get("name") == name:
                return remote
        return None

    def list_remotes(self) -> list:
        """Return list of remote names."""
        return [r.get("name") for r in self.remotes if r.get("name")]

    def fetch(self, remote_name: str, path: str) -> httpx.Response:
        """
        Fetch from a remote instance with auth.

        Args:
            remote_name: Name of the remote as defined in config
            path: API path to fetch (e.g., "/api/metrics")

        Returns:
            httpx.Response object

        Raises:
            ValueError: If remote not found
            httpx.HTTPError: On network/HTTP errors
        """
        remote = self.get_remote(remote_name)
        if not remote:
            raise ValueError(f"Remote not found: {remote_name}")

        url = urljoin(remote["url"].rstrip("/") + "/", path.lstrip("/"))
        headers = {}

        api_key = remote.get("api_key")
        if api_key:
            headers["X-API-Key"] = api_key

        logger.debug("Fetching %s from remote %s", path, remote_name)
        return self.client.get(url, headers=headers)

    def health_check(self, remote_name: str) -> dict:
        """
        Check if remote is reachable.

        Returns:
            dict with keys: ok (bool), status_code (int|None), error (str|None), latency_ms (float|None)
        """
        remote = self.get_remote(remote_name)
        if not remote:
            return {
                "ok": False,
                "status_code": None,
                "error": f"Remote not found: {remote_name}",
                "latency_ms": None,
            }

        try:
            import time

            start = time.monotonic()
            response = self.fetch(remote_name, "/api/config")
            latency_ms = (time.monotonic() - start) * 1000

            return {
                "ok": response.status_code == 200,
                "status_code": response.status_code,
                "error": None
                if response.status_code == 200
                else f"HTTP {response.status_code}",
                "latency_ms": round(latency_ms, 2),
            }
        except httpx.TimeoutException:
            return {
                "ok": False,
                "status_code": None,
                "error": "Timeout",
                "latency_ms": None,
            }
        except httpx.ConnectError as exc:
            return {
                "ok": False,
                "status_code": None,
                "error": f"Connection failed: {exc}",
                "latency_ms": None,
            }
        except Exception as exc:
            return {
                "ok": False,
                "status_code": None,
                "error": str(exc),
                "latency_ms": None,
            }

    def close(self):
        """Close the HTTP client."""
        if self._client is not None:
            self._client.close()
            self._client = None


federation_client = FederationClient()
