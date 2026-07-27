import shutil
import tarfile
from pathlib import Path

import httpx
import pytest

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_ARCHIVE = PROJECT_ROOT / "demo" / "federation" / "fixtures.tar.gz"
FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures"
FIXTURE_DIRS = [
    FIXTURE_ROOT / "central",
    FIXTURE_ROOT / "nas-1",
    FIXTURE_ROOT / "nas-2",
    FIXTURE_ROOT / "nas-3",
]

WIDGET_MARKERS = {
    "metrics",
    "network",
    "reminders",
    "schema",
    "services",
    "speedtest",
    "wiki",
}


def reset_fixtures() -> None:
    for path in FIXTURE_DIRS:
        if path.exists():
            shutil.rmtree(path)
    if FIXTURE_ROOT.exists():
        FIXTURE_ROOT.rmdir()


def pytest_sessionstart(session):
    if not FIXTURE_ARCHIVE.exists():
        raise RuntimeError(f"missing fixture archive: {FIXTURE_ARCHIVE}")
    reset_fixtures()
    with tarfile.open(FIXTURE_ARCHIVE, "r:gz") as archive:
        archive.extractall(PROJECT_ROOT, filter="data")


def pytest_sessionfinish(session, exitstatus):
    reset_fixtures()


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


@pytest.fixture(scope="session")
def http_client():
    with httpx.Client(timeout=5.0) as client:
        yield client
