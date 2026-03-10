import httpx
import pytest

from monitorat.federation import FederationClient


pytestmark = pytest.mark.federation


REMOTES = [
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


@pytest.fixture
def federation_client(monkeypatch):
    monkeypatch.setattr(
        FederationClient,
        "remotes",
        property(lambda self: REMOTES),
    )
    client = FederationClient()
    client._client = httpx.Client(timeout=5.0)
    try:
        yield client
    finally:
        client.close()


@pytest.mark.core
def test_direct_no_auth(federation_servers, http_client):
    response = http_client.get("http://localhost:6601/api/config")
    assert response.status_code == 401


@pytest.mark.core
def test_direct_wrong_key(federation_servers, http_client):
    response = http_client.get(
        "http://localhost:6601/api/config",
        headers={"X-API-Key": "wrong-key"},
    )
    assert response.status_code == 401


@pytest.mark.core
def test_direct_correct_key(federation_servers, http_client):
    response = http_client.get(
        "http://localhost:6601/api/config",
        headers={"X-API-Key": "nas-1-secret"},
    )
    assert response.status_code == 200
    assert response.json()["site"]["name"] == "@nas-1"


@pytest.mark.core
def test_federation_client_fetch(federation_servers, federation_client):
    response = federation_client.fetch("nas-1", "/api/config")
    assert response.status_code == 200
    assert response.json()["site"]["name"] == "@nas-1"


@pytest.mark.core
def test_federation_client_health_check(federation_servers, federation_client):
    result = federation_client.health_check("nas-1")
    assert result["ok"] is True
    assert result["status_code"] == 200
    assert result["latency_ms"] is not None


@pytest.mark.core
def test_federation_client_unknown_remote():
    client = FederationClient()
    try:
        with pytest.raises(ValueError, match="Remote not found"):
            client.fetch("nonexistent", "/api/config")
    finally:
        client.close()


@pytest.mark.core
def test_federation_status_endpoint(federation_servers, http_client):
    response = http_client.get("http://localhost:6100/api/federation/status")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["remotes"]["nas-1"]["ok"] is True
    assert data["remotes"]["nas-2"]["ok"] is True


@pytest.mark.metrics
@pytest.mark.parametrize(
    ("path", "expected_keys"),
    [
        ("/api/metrics-nas-1", {"timestamp", "values", "statuses"}),
        ("/api/metrics-nas-2", {"timestamp", "values", "statuses"}),
    ],
    ids=["nas-1", "nas-2"],
)
def test_metrics_proxy_routes(federation_servers, http_client, path, expected_keys):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    assert expected_keys.issubset(response.json())


@pytest.mark.metrics
def test_metrics_proxy_history_subpath(federation_servers, http_client):
    response = http_client.get(
        "http://localhost:6100/api/metrics-nas-1/history",
        params={"period": "1 hour"},
    )
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, dict)
    assert data["data"]


@pytest.mark.metrics
def test_merged_metrics_history(federation_servers, http_client):
    response = http_client.get("http://localhost:6100/api/metrics-combined/history")
    assert response.status_code == 200
    data = response.json()
    assert len(data["sources"]) >= 2
    assert data["data"]
    assert any(row.get("_source") for row in data["data"][:10])


@pytest.mark.wiki
def test_wiki_proxy_route(federation_servers, http_client):
    response = http_client.get("http://localhost:6100/api/wiki-nas-1/doc")
    assert response.status_code == 200
    assert "text/markdown" in response.headers["content-type"]
    assert response.text


@pytest.mark.services
@pytest.mark.parametrize(
    ("path", "expected_service"),
    [
        ("/api/services-nas-1", "plex"),
        ("/api/services-nas-2", "jellyfin"),
    ],
    ids=["nas-1", "nas-2"],
)
def test_services_proxy_routes(federation_servers, http_client, path, expected_service):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    assert expected_service in response.json()["services"]


@pytest.mark.reminders
@pytest.mark.parametrize(
    ("path", "minimum_items"),
    [
        ("/api/reminders-nas-1", 2),
        ("/api/reminders-nas-2", 1),
    ],
    ids=["nas-1", "nas-2"],
)
def test_reminders_proxy_routes(federation_servers, http_client, path, minimum_items):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    assert len(response.json()) >= minimum_items


@pytest.mark.speedtest
@pytest.mark.parametrize(
    "path",
    [
        "/api/speedtest-nas-1/history",
        "/api/speedtest-nas-2/history",
    ],
    ids=["nas-1", "nas-2"],
)
def test_speedtest_proxy_routes(federation_servers, http_client, path):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    data = response.json()
    entries = data["entries"] if isinstance(data, dict) else data
    assert entries


@pytest.mark.network
@pytest.mark.parametrize(
    "path",
    [
        "/api/network-nas-1/log",
        "/api/network-nas-2/log",
    ],
    ids=["nas-1", "nas-2"],
)
def test_network_proxy_routes(federation_servers, http_client, path):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    assert response.text.strip()
    assert "text/plain" in response.headers["content-type"]


@pytest.mark.schema
@pytest.mark.parametrize(
    ("widget", "path"),
    [
        ("metrics", "/api/metrics-nas-1/schema"),
        ("services", "/api/services-nas-1/schema"),
        ("reminders", "/api/reminders-nas-1/schema"),
        ("speedtest", "/api/speedtest-nas-1/schema"),
        ("network", "/api/network-nas-1/schema"),
        ("wiki", "/api/wiki-nas-1/schema"),
    ],
    ids=["metrics", "services", "reminders", "speedtest", "network", "wiki"],
)
def test_schema_endpoints(federation_servers, http_client, widget, path):
    response = http_client.get(f"http://localhost:6100{path}")
    assert response.status_code == 200
    data = response.json()
    assert data["widget"] == widget
    assert data["version"]
    assert data["endpoints"]
