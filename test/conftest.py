import os
import subprocess
import sys
import time
from pathlib import Path

import httpx
import pytest


PROJECT_ROOT = Path(__file__).resolve().parent.parent

FEDERATION_SERVERS = [
    {
        "name": "nas-1",
        "config": "test/fixtures/nas-1/config.yaml",
        "port": 6601,
        "health_url": "http://localhost:6601/",
    },
    {
        "name": "nas-2",
        "config": "test/fixtures/nas-2/config.yaml",
        "port": 6602,
        "health_url": "http://localhost:6602/",
    },
    {
        "name": "central",
        "config": "test/fixtures/central/config.yaml",
        "port": 6100,
        "health_url": "http://localhost:6100/",
    },
]

DEMO_PORTS = {
    "simple": 6100,
    "advanced": 6200,
    "federation": 6300,
}

WIDGET_MARKERS = {
    "metrics",
    "network",
    "reminders",
    "schema",
    "services",
    "speedtest",
    "wiki",
}


def pytest_addoption(parser):
    parser.addoption(
        "--widget",
        action="store",
        choices=sorted(WIDGET_MARKERS),
        help="run only core tests plus one federation widget group",
    )
    parser.addoption(
        "--set",
        action="store",
        choices=["all", "demo", "federation"],
        default="all",
        help="select the test set to run",
    )


def pytest_collection_modifyitems(config, items):
    selected = []
    deselected = []
    widget = config.getoption("--widget")
    test_set = config.getoption("--set")

    for item in items:
        is_demo = "demo" in item.keywords
        is_federation = "federation" in item.keywords

        if test_set == "demo" and not is_demo:
            deselected.append(item)
            continue

        if test_set == "federation" and not is_federation:
            deselected.append(item)
            continue

        if widget:
            if not is_federation:
                deselected.append(item)
                continue
            if "core" not in item.keywords and widget not in item.keywords:
                deselected.append(item)
                continue

        selected.append(item)

    if deselected:
        config.hook.pytest_deselected(items=deselected)
        items[:] = selected


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
):
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


@pytest.fixture(scope="session")
def http_client():
    with httpx.Client(timeout=5.0) as client:
        yield client


@pytest.fixture(scope="module")
def federation_servers(tmp_path_factory):
    config_home = tmp_path_factory.mktemp("federation-config")
    run_checked(
        [sys.executable, "demo/setup.py", "--test"],
        env=build_env(config_home=config_home),
    )

    log_dir = tmp_path_factory.mktemp("federation-logs")
    processes = []
    urls = {
        server["name"]: f"http://localhost:{server['port']}"
        for server in FEDERATION_SERVERS
    }

    try:
        for server in FEDERATION_SERVERS:
            log_path = log_dir / f"{server['name']}.log"
            log_file = log_path.open("w")
            proc = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "monitorat.cli",
                    "--config",
                    server["config"],
                    "server",
                    "--port",
                    str(server["port"]),
                ],
                cwd=PROJECT_ROOT,
                env=build_env(config_home=config_home),
                stdout=log_file,
                stderr=subprocess.STDOUT,
                text=True,
            )
            processes.append((server, proc, log_path, log_file))

        for server, proc, log_path, _ in processes:
            try:
                wait_for_http(server["health_url"], proc=proc)
            except Exception as exc:
                raise RuntimeError(
                    f"{server['name']} failed to start: {exc}\n{tail(log_path)}"
                ) from exc

        yield urls
    finally:
        for _, proc, _, log_file in processes:
            if proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
                    proc.wait(timeout=5)
            log_file.close()


@pytest.fixture(scope="module")
def demo_server(tmp_path_factory):
    state_home = tmp_path_factory.mktemp("demo-state")
    config_home = tmp_path_factory.mktemp("demo-config")
    env = build_env(state_home, config_home)
    processes = {}

    def start(mode: str) -> str:
        if mode in processes:
            return f"http://localhost:{DEMO_PORTS[mode]}"

        log_dir = tmp_path_factory.mktemp(f"demo-{mode}-logs")
        log_path = log_dir / f"{mode}.log"
        log_file = log_path.open("w")
        proc = subprocess.Popen(
            [sys.executable, "demo/launcher.py", "--mode", mode],
            cwd=PROJECT_ROOT,
            env=env,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
        processes[mode] = (proc, log_file, log_path)

        url = f"http://localhost:{DEMO_PORTS[mode]}/api/config"
        try:
            wait_for_http(url, timeout=30.0, proc=proc)
        except Exception as exc:
            raise RuntimeError(
                f"{mode} demo failed to start: {exc}\n{tail(log_path)}"
            ) from exc

        return f"http://localhost:{DEMO_PORTS[mode]}"

    yield start

    for proc, log_file, _ in processes.values():
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=5)
        log_file.close()
