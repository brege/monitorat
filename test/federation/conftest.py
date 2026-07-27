import subprocess
import sys

import httpx
import pytest
from helpers import PROJECT_ROOT, build_env, run_checked, tail, wait_for_http

from monitorat.federation import FederationClient

# nas nodes: shared source of truth for server startup and FederationClient patching
NODES = [
    {
        "name": "nas-1",
        "config": "test/fixtures/nas-1/config.yaml",
        "port": 6601,
        "api_key": "nas-1-secret",
    },
    {
        "name": "nas-2",
        "config": "test/fixtures/nas-2/config.yaml",
        "port": 6602,
        "api_key": "nas-2-secret",
    },
]

CENTRAL = {
    "name": "central",
    "config": "test/fixtures/central/config.yaml",
    "port": 6100,
}


@pytest.fixture(scope="module")
def federation_servers(tmp_path_factory):
    config_home = tmp_path_factory.mktemp("federation-config")
    run_checked(
        [sys.executable, "demo/setup.py", "--test"],
        env=build_env(config_home=config_home),
    )

    servers = [
        *[{**n, "health_url": f"http://localhost:{n['port']}/"} for n in NODES],
        {**CENTRAL, "health_url": f"http://localhost:{CENTRAL['port']}/"},
    ]

    log_dir = tmp_path_factory.mktemp("federation-logs")
    processes = []
    urls = {s["name"]: f"http://localhost:{s['port']}" for s in servers}

    try:
        for server in servers:
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


@pytest.fixture
def federation_client(monkeypatch):
    remotes = [
        {
            "name": n["name"],
            "url": f"http://localhost:{n['port']}",
            "api_key": n["api_key"],
        }
        for n in NODES
    ]
    monkeypatch.setattr(FederationClient, "remotes", property(lambda self: remotes))
    client = FederationClient()
    client._client = httpx.Client(timeout=5.0)
    try:
        yield client
    finally:
        client.close()
