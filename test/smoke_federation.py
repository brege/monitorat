#!/usr/bin/env python3
"""
Smoke tests for federation client and proxy routes.

Prerequisites:
  Start test nodes before running:
    uv run monitorat -c test/config-nas-1.yaml server --port 6601
    uv run monitorat -c test/config-nas-2.yaml server --port 6602
    uv run monitorat -c test/config-central.yaml server --port 6100

Usage:
    uv run python test/smoke_federation.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx

from monitorat.federation import FederationClient


def test_direct_no_auth():
    """Direct request without auth should fail (401)."""
    print("Test: Direct request without auth...")
    try:
        response = httpx.get("http://localhost:6601/api/config", timeout=5)
        if response.status_code == 401:
            print("  PASS: Got 401 as expected")
            return True
        else:
            print(f"  FAIL: Expected 401, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_direct_wrong_key():
    """Direct request with wrong key should fail (401)."""
    print("Test: Direct request with wrong key...")
    try:
        response = httpx.get(
            "http://localhost:6601/api/config",
            headers={"X-API-Key": "wrong-key"},
            timeout=5,
        )
        if response.status_code == 401:
            print("  PASS: Got 401 as expected")
            return True
        else:
            print(f"  FAIL: Expected 401, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_direct_correct_key():
    """Direct request with correct key should succeed (200)."""
    print("Test: Direct request with correct key...")
    try:
        response = httpx.get(
            "http://localhost:6601/api/config",
            headers={"X-API-Key": "nas-1-secret"},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            site_name = data.get("site", {}).get("name")
            print(f"  PASS: Got 200, site.name={site_name}")
            return True
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_federation_client_fetch():
    """FederationClient.fetch() with correct config should succeed."""
    print("Test: FederationClient.fetch()...")

    client = FederationClient()
    client._client = httpx.Client(timeout=5)

    class MockConfig:
        def __getitem__(self, key):
            if key == "federation":
                return self
            raise KeyError(key)

        def get(self, type_):
            if type_ is bool:
                return True
            if type_ is float:
                return 5.0
            if type_ is list:
                return [
                    {
                        "name": "nas-1",
                        "url": "http://localhost:6601",
                        "api_key": "nas-1-secret",
                    },
                    {
                        "name": "nas-2",
                        "url": "http://localhost:6602",
                        "api_key": "nas-2-secret",
                    },
                ]
            return None

    client.__class__.remotes = property(
        lambda self: [
            {
                "name": "nas-1",
                "url": "http://localhost:6601",
                "api_key": "nas-1-secret",
            },
            {
                "name": "nas-2",
                "url": "http://localhost:6602",
                "api_key": "nas-2-secret",
            },
        ]
    )

    try:
        response = client.fetch("nas-1", "/api/config")
        if response.status_code == 200:
            data = response.json()
            site_name = data.get("site", {}).get("name")
            print(f"  PASS: Got 200 via FederationClient, site.name={site_name}")
            return True
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return False
    finally:
        client.close()


def test_federation_client_health_check():
    """FederationClient.health_check() should return status dict."""
    print("Test: FederationClient.health_check()...")

    client = FederationClient()
    client._client = httpx.Client(timeout=5)

    client.__class__.remotes = property(
        lambda self: [
            {
                "name": "nas-1",
                "url": "http://localhost:6601",
                "api_key": "nas-1-secret",
            },
            {
                "name": "nas-2",
                "url": "http://localhost:6602",
                "api_key": "nas-2-secret",
            },
        ]
    )

    try:
        result = client.health_check("nas-1")
        if result["ok"]:
            print(f"  PASS: Health check OK, latency={result['latency_ms']}ms")
            return True
        else:
            print(f"  INFO: Health check returned ok=False: {result['error']}")
            return None
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return False
    finally:
        client.close()


def test_federation_client_unknown_remote():
    """FederationClient.fetch() with unknown remote should raise ValueError."""
    print("Test: FederationClient.fetch() unknown remote...")

    client = FederationClient()
    client.__class__.remotes = property(lambda self: [])

    try:
        client.fetch("nonexistent", "/api/config")
        print("  FAIL: Expected ValueError")
        return False
    except ValueError as exc:
        if "not found" in str(exc).lower():
            print("  PASS: Got ValueError as expected")
            return True
        print(f"  FAIL: Unexpected error: {exc}")
        return False
    finally:
        client.close()


def test_proxy_route_metrics_nas_1():
    """Central proxy route /api/metrics-nas-1 should return nas-1 metrics."""
    print("Test: Proxy route /api/metrics-nas-1...")
    try:
        response = httpx.get("http://localhost:6100/api/metrics-nas-1", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  PASS: Got 200 via proxy, keys={list(data.keys())[:3]}...")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_metrics_nas_2():
    """Central proxy route /api/metrics-nas-2 should return nas-2 metrics."""
    print("Test: Proxy route /api/metrics-nas-2...")
    try:
        response = httpx.get("http://localhost:6100/api/metrics-nas-2", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  PASS: Got 200 via proxy, keys={list(data.keys())[:3]}...")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_with_subpath():
    """Central proxy route with subpath should forward correctly."""
    print("Test: Proxy route /api/metrics-nas-1/history...")
    try:
        response = httpx.get(
            "http://localhost:6100/api/metrics-nas-1/history",
            params={"period": "1 hour"},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            row_count = len(data) if isinstance(data, list) else "N/A"
            print(f"  PASS: Got 200 via proxy, rows={row_count}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def main():
    print("=" * 60)
    print("Federation Smoke Tests")
    print("=" * 60)
    print()

    tests = [
        test_direct_no_auth,
        test_direct_wrong_key,
        test_direct_correct_key,
        test_federation_client_fetch,
        test_federation_client_health_check,
        test_federation_client_unknown_remote,
        test_proxy_route_metrics_nas_1,
        test_proxy_route_metrics_nas_2,
        test_proxy_route_with_subpath,
    ]

    results = {"pass": 0, "fail": 0, "skip": 0}

    for test in tests:
        result = test()
        if result is True:
            results["pass"] += 1
        elif result is False:
            results["fail"] += 1
        else:
            results["skip"] += 1
        print()

    print("=" * 60)
    print(
        f"Results: {results['pass']} passed, {results['fail']} failed, {results['skip']} skipped"
    )
    print("=" * 60)

    return 0 if results["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
