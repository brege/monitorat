import subprocess
import sys

import pytest
from helpers import PROJECT_ROOT, build_env, tail, wait_for_http

DEMO_PORTS = {
    "simple": 6100,
    "advanced": 6200,
    "federation": 6300,
}


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

        try:
            wait_for_http(
                f"http://localhost:{DEMO_PORTS[mode]}/api/config",
                timeout=30.0,
                proc=proc,
            )
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
