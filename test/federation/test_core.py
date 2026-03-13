import pytest

from monitorat.federation import FederationClient

pytestmark = pytest.mark.federation

NAS1 = "http://localhost:6601"
CENTRAL = "http://localhost:6100"


@pytest.mark.core
def test_direct_no_auth(federation_servers, http_client):
    response = http_client.get(f"{NAS1}/api/config")
    assert response.status_code == 401


@pytest.mark.core
def test_direct_wrong_key(federation_servers, http_client):
    response = http_client.get(f"{NAS1}/api/config", headers={"X-API-Key": "wrong-key"})
    assert response.status_code == 401


@pytest.mark.core
def test_direct_correct_key(federation_servers, http_client):
    response = http_client.get(
        f"{NAS1}/api/config", headers={"X-API-Key": "nas-1-secret"}
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
    response = http_client.get(f"{CENTRAL}/api/federation/status")
    assert response.status_code == 200
    data = response.json()
    assert data["enabled"] is True
    assert data["remotes"]["nas-1"]["ok"] is True
    assert data["remotes"]["nas-2"]["ok"] is True
