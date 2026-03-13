import pytest

pytestmark = pytest.mark.federation

CENTRAL = "http://localhost:6100"

# URL pattern per widget type; {node} is substituted at parametrize time.
# Schema path is always /api/{widget}-{node}/schema — derived, not stored here.
WIDGETS = {
    "metrics": "/api/metrics-{node}",
    "services": "/api/services-{node}",
    "reminders": "/api/reminders-{node}",
    "speedtest": "/api/speedtest-{node}/history",
    "network": "/api/network-{node}/log",
    "wiki": "/api/wiki-{node}/doc",
}

NODES = ["nas-1", "nas-2"]


# schema


@pytest.mark.schema
@pytest.mark.parametrize(
    ("widget", "path"),
    [(w, f"/api/{w}-nas-1/schema") for w in WIDGETS],
    ids=list(WIDGETS),
)
def test_schema_endpoints(federation_servers, http_client, widget, path):
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    data = response.json()
    assert data["widget"] == widget
    assert data["version"]
    assert data["endpoints"]


# metrics


@pytest.mark.metrics
@pytest.mark.parametrize("node", NODES)
def test_metrics_proxy(federation_servers, http_client, node):
    path = WIDGETS["metrics"].format(node=node)
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    assert {"timestamp", "values", "statuses"}.issubset(response.json())


@pytest.mark.metrics
def test_metrics_proxy_history_subpath(federation_servers, http_client):
    response = http_client.get(
        f"{CENTRAL}/api/metrics-nas-1/history",
        params={"period": "1 hour"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert data["data"]


@pytest.mark.metrics
def test_merged_metrics_history(federation_servers, http_client):
    response = http_client.get(f"{CENTRAL}/api/metrics-combined/history")
    assert response.status_code == 200
    data = response.json()
    assert len(data["sources"]) >= 2
    assert data["data"]
    assert any(row.get("_source") for row in data["data"][:10])


# services


@pytest.mark.services
@pytest.mark.parametrize(
    ("node", "expected_service"),
    [("nas-1", "plex"), ("nas-2", "jellyfin")],
)
def test_services_proxy(federation_servers, http_client, node, expected_service):
    path = WIDGETS["services"].format(node=node)
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    assert expected_service in response.json()["services"]


# reminders


@pytest.mark.reminders
@pytest.mark.parametrize(
    ("node", "minimum_items"),
    [("nas-1", 2), ("nas-2", 1)],
)
def test_reminders_proxy(federation_servers, http_client, node, minimum_items):
    path = WIDGETS["reminders"].format(node=node)
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    assert len(response.json()) >= minimum_items


# speedtest


@pytest.mark.speedtest
@pytest.mark.parametrize("node", NODES)
def test_speedtest_proxy(federation_servers, http_client, node):
    path = WIDGETS["speedtest"].format(node=node)
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    data = response.json()
    entries = data["entries"] if isinstance(data, dict) else data
    assert entries


# network


@pytest.mark.network
@pytest.mark.parametrize("node", NODES)
def test_network_proxy(federation_servers, http_client, node):
    path = WIDGETS["network"].format(node=node)
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    assert response.text.strip()
    assert "text/plain" in response.headers["content-type"]


# wiki


@pytest.mark.wiki
def test_wiki_proxy(federation_servers, http_client):
    path = WIDGETS["wiki"].format(node="nas-1")
    response = http_client.get(f"{CENTRAL}{path}")
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert response.text
