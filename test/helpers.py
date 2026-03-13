import os
import subprocess
import time
from pathlib import Path

import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def tail(path: Path, limit: int = 40) -> str:
    if not path.exists():
        return ""
    lines = path.read_text().splitlines()
    return "\n".join(lines[-limit:])


def wait_for_http(
    url: str, timeout: float = 15.0, proc: subprocess.Popen | None = None
):
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        if proc is not None and proc.poll() is not None:
            raise RuntimeError(f"process exited with code {proc.returncode}")
        try:
            response = httpx.get(url, timeout=1.0)
            if response.status_code == 200:
                return
        except (httpx.ConnectError, httpx.TimeoutException):
            pass
        time.sleep(0.2)
    raise TimeoutError(f"timed out waiting for {url}")


def build_env(
    state_home: Path | None = None, config_home: Path | None = None
) -> dict[str, str]:
    env = os.environ.copy()
    env.setdefault("UV_CACHE_DIR", str(PROJECT_ROOT / ".uv-cache"))
    if state_home is not None:
        env["XDG_STATE_HOME"] = str(state_home)
    if config_home is not None:
        env["XDG_CONFIG_HOME"] = str(config_home)
        env["HOME"] = str(config_home.parent)
    return env


def run_checked(
    args: list[str], *, env: dict[str, str] | None = None, timeout: float = 120
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        args,
        cwd=PROJECT_ROOT,
        env=env,
        text=True,
        capture_output=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"command failed: {' '.join(args)}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )
    return result
