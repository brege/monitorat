import httpx
import pytest

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


@pytest.fixture(scope="session")
def http_client():
    with httpx.Client(timeout=5.0) as client:
        yield client
