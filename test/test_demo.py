from pathlib import Path

import pytest
import yaml

from monitorat.config import ConfigManager


pytestmark = pytest.mark.demo

DEMO_DIR = Path(__file__).resolve().parent.parent / "demo"
MODE_TO_CONFIG = {
    "simple": DEMO_DIR / "simple" / "config.yaml",
    "advanced": DEMO_DIR / "advanced" / "config.yaml",
    "federation": DEMO_DIR / "federation" / "central" / "config.yaml",
}


DATA_ENDPOINTS = {
    "metrics": {
        "local": "/api/metrics",
        "remote": "/api/{name}",
    },
    "services": {
        "local": "/api/services",
        "remote": "/api/{name}",
    },
    "reminders": {
        "local": "/api/reminders",
        "remote": "/api/{name}",
    },
    "speedtest": {
        "local": "/api/speedtest/history",
        "remote": "/api/{name}/history",
    },
    "network": {
        "local": "/api/network/log",
        "remote": "/api/{name}/log",
    },
}

FEDERATION_ENDPOINTS = {
    "metrics": "/api/metrics-{source}",
    "services": "/api/services-{source}",
    "reminders": "/api/reminders-{source}",
    "speedtest": "/api/speedtest-{source}/history",
    "network": "/api/network-{source}/log",
}

SCHEMA_TYPES = {"metrics", "services", "reminders", "speedtest", "network", "wiki"}


def build_urls(config: dict, mode: str) -> list[str]:
    widgets = config.get("widgets", {})
    enabled = widgets.get("enabled") or []

    data_urls = set()
    schema_urls = set()
    wiki_doc_urls = set()

    for widget_name in enabled:
        widget_cfg = widgets.get(widget_name, {})
        if widget_cfg.get("show") is False:
            continue

        widget_type = widget_cfg.get("type", widget_name)
        remote = widget_cfg.get("remote")
        federation_nodes = widget_cfg.get("federation", {}).get("nodes")

        if widget_type == "wiki":
            if remote:
                wiki_doc_urls.add(f"/api/{widget_name}/doc")
            elif federation_nodes:
                for source in federation_nodes:
                    wiki_doc_urls.add(f"/api/wiki-{source}/doc")
            elif widget_cfg.get("doc"):
                wiki_doc_urls.add(f"/api/wiki/doc?widget={widget_name}")
        elif widget_type in DATA_ENDPOINTS:
            if federation_nodes and widget_type in FEDERATION_ENDPOINTS:
                for source in federation_nodes:
                    data_urls.add(
                        FEDERATION_ENDPOINTS[widget_type].format(source=source)
                    )
            elif remote:
                data_urls.add(
                    DATA_ENDPOINTS[widget_type]["remote"].format(name=widget_name)
                )
            else:
                data_urls.add(DATA_ENDPOINTS[widget_type]["local"])

        if widget_type in SCHEMA_TYPES:
            if remote or federation_nodes:
                schema_urls.add(f"/api/{widget_name}/schema")
            else:
                schema_urls.add(f"/api/{widget_type}/schema")

    if mode == "federation":
        data_urls.add("/api/federation/status")

    return sorted(data_urls | schema_urls | wiki_doc_urls)


def build_cases() -> list[pytest.ParameterSet]:
    cases = []
    for mode, config_path in MODE_TO_CONFIG.items():
        config = yaml.safe_load(ConfigManager(config_path).get().dump(full=True))
        for path in ["/api/config", *build_urls(config, mode)]:
            case_id = f"{mode}:{path.removeprefix('/api/')}"
            cases.append(pytest.param(mode, path, id=case_id))
    return cases


@pytest.mark.parametrize(("mode", "path"), build_cases())
def test_demo_endpoint(mode, path, demo_server, http_client):
    base_url = demo_server(mode)
    response = http_client.get(f"{base_url}{path}", timeout=5.0)
    assert response.status_code == 200
