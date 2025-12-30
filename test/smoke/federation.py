#!/usr/bin/env python3
"""
Smoke tests for federation client and proxy routes.

Prerequisites:
  Start test nodes before running:
  uv run monitorat -c test/fixtures/nas-1/config.yaml server --port 6601
  uv run monitorat -c test/fixtures/nas-2/config.yaml server --port 6602
  uv run monitorat -c test/fixtures/central/config.yaml server --port 6100

  Or use the test harness:
  uv run python test/harness.py

Usage:
  uv run python test/smoke/federation.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import httpx

from monitorat.federation import FederationClient


def test_direct_no_auth():
    """Direct request without auth should fail (401)."""
    print("Test: Direct request without auth...")
    try:
        response = httpx.get("http://localhost:6601/api/config", timeout=5)
        if response.status_code == 401:
            print("  PASS: Got 401 as expected")
            return True
        else:
            print(f"  FAIL: Expected 401, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_direct_wrong_key():
    """Direct request with wrong key should fail (401)."""
    print("Test: Direct request with wrong key...")
    try:
        response = httpx.get(
            "http://localhost:6601/api/config",
            headers={"X-API-Key": "wrong-key"},
            timeout=5,
        )
        if response.status_code == 401:
            print("  PASS: Got 401 as expected")
            return True
        else:
            print(f"  FAIL: Expected 401, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_direct_correct_key():
    """Direct request with correct key should succeed (200)."""
    print("Test: Direct request with correct key...")
    try:
        response = httpx.get(
            "http://localhost:6601/api/config",
            headers={"X-API-Key": "nas-1-secret"},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            site_name = data.get("site", {}).get("name")
            print(f"  PASS: Got 200, site.name={site_name}")
            return True
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None


def test_federation_client_fetch():
    """FederationClient.fetch() with correct config should succeed."""
    print("Test: FederationClient.fetch()...")

    client = FederationClient()
    client._client = httpx.Client(timeout=5)

    class MockConfig:
        def __getitem__(self, key):
            if key == "federation":
                return self
            raise KeyError(key)

        def get(self, type_):
            if type_ is bool:
                return True
            if type_ is float:
                return 5.0
            if type_ is list:
                return [
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
            return None

    client.__class__.remotes = property(
        lambda self: [
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
    )

    try:
        response = client.fetch("nas-1", "/api/config")
        if response.status_code == 200:
            data = response.json()
            site_name = data.get("site", {}).get("name")
            print(f"  PASS: Got 200 via FederationClient, site.name={site_name}")
            return True
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Server not running on port 6601")
        return None
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return False
    finally:
        client.close()


def test_federation_client_health_check():
    """FederationClient.health_check() should return status dict."""
    print("Test: FederationClient.health_check()...")

    client = FederationClient()
    client._client = httpx.Client(timeout=5)

    client.__class__.remotes = property(
        lambda self: [
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
    )

    try:
        result = client.health_check("nas-1")
        if result["ok"]:
            print(f"  PASS: Health check OK, latency={result['latency_ms']}ms")
            return True
        else:
            print(f"  INFO: Health check returned ok=False: {result['error']}")
            return None
    except Exception as exc:
        print(f"  FAIL: {exc}")
        return False
    finally:
        client.close()


def test_federation_client_unknown_remote():
    """FederationClient.fetch() with unknown remote should raise ValueError."""
    print("Test: FederationClient.fetch() unknown remote...")

    client = FederationClient()
    client.__class__.remotes = property(lambda self: [])

    try:
        client.fetch("nonexistent", "/api/config")
        print("  FAIL: Expected ValueError")
        return False
    except ValueError as exc:
        if "not found" in str(exc).lower():
            print("  PASS: Got ValueError as expected")
            return True
        print(f"  FAIL: Unexpected error: {exc}")
        return False
    finally:
        client.close()


def test_proxy_route_metrics_nas_1():
    """Central proxy route /api/metrics-nas-1 should return nas-1 metrics."""
    print("Test: Proxy route /api/metrics-nas-1...")
    try:
        response = httpx.get("http://localhost:6100/api/metrics-nas-1", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  PASS: Got 200 via proxy, keys={list(data.keys())[:3]}...")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_metrics_nas_2():
    """Central proxy route /api/metrics-nas-2 should return nas-2 metrics."""
    print("Test: Proxy route /api/metrics-nas-2...")
    try:
        response = httpx.get("http://localhost:6100/api/metrics-nas-2", timeout=5)
        if response.status_code == 200:
            data = response.json()
            print(f"  PASS: Got 200 via proxy, keys={list(data.keys())[:3]}...")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_with_subpath():
    """Central proxy route with subpath should forward correctly."""
    print("Test: Proxy route /api/metrics-nas-1/history...")
    try:
        response = httpx.get(
            "http://localhost:6100/api/metrics-nas-1/history",
            params={"period": "1 hour"},
            timeout=5,
        )
        if response.status_code == 200:
            data = response.json()
            row_count = len(data) if isinstance(data, list) else "N/A"
            print(f"  PASS: Got 200 via proxy, rows={row_count}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_wiki_nas_1():
    """Central proxy route /api/wiki-nas-1/doc should return nas-1 wiki doc."""
    print("Test: Proxy route /api/wiki-nas-1/doc...")
    try:
        response = httpx.get("http://localhost:6100/api/wiki-nas-1/doc", timeout=5)
        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            print(f"  PASS: Got 200 via proxy, content_type={content_type[:30]}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_merged_widget_history():
    """Central /api/metrics-combined/history should return merged data from both sources."""
    print("Test: Merged widget /api/metrics-combined/history...")
    try:
        response = httpx.get(
            "http://localhost:6100/api/metrics-combined/history",
            timeout=10,
        )
        if response.status_code == 200:
            data = response.json()
            sources = data.get("sources", [])
            rows = data.get("data", [])
            if len(sources) < 2:
                print(f"  FAIL: Expected 2+ sources, got {len(sources)}")
                return False
            if len(rows) == 0:
                print(f"  FAIL: Got sources={sources} but no rows")
                return False
            has_source_tags = any(r.get("_source") for r in rows[:10])
            if has_source_tags:
                print(f"  PASS: Got merged data, sources={sources}, rows={len(rows)}")
                return True
            else:
                print("  FAIL: Rows missing _source tags")
                return False
        elif response.status_code == 502:
            print("  SKIP: Merge returned 502 (remotes unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_federation_status_endpoint():
    """Central /api/federation/status should return remote health."""
    print("Test: Federation status endpoint...")
    try:
        response = httpx.get("http://localhost:6100/api/federation/status", timeout=5)
        if response.status_code == 200:
            data = response.json()
            if data.get("enabled") and "remotes" in data:
                remotes = data["remotes"]
                nas1_ok = remotes.get("nas-1", {}).get("ok")
                nas2_ok = remotes.get("nas-2", {}).get("ok")
                print(f"  PASS: Got status, nas-1={nas1_ok}, nas-2={nas2_ok}")
                return True
            elif not data.get("enabled"):
                print("  PASS: Federation disabled (expected if not configured)")
                return True
            else:
                print(f"  FAIL: Unexpected response structure: {data}")
                return False
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_services_nas_1():
    """Central proxy route /api/services-nas-1 should return nas-1 services."""
    print("Test: Proxy route /api/services-nas-1...")
    try:
        response = httpx.get("http://localhost:6100/api/services-nas-1", timeout=5)
        if response.status_code == 200:
            data = response.json()
            services = data.get("services", {})
            print(f"  PASS: Got 200 via proxy, services={list(services.keys())}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_services_nas_2():
    """Central proxy route /api/services-nas-2 should return nas-2 services."""
    print("Test: Proxy route /api/services-nas-2...")
    try:
        response = httpx.get("http://localhost:6100/api/services-nas-2", timeout=5)
        if response.status_code == 200:
            data = response.json()
            services = data.get("services", {})
            print(f"  PASS: Got 200 via proxy, services={list(services.keys())}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_reminders_nas_1():
    """Central proxy route /api/reminders-nas-1 should return nas-1 reminders."""
    print("Test: Proxy route /api/reminders-nas-1...")
    try:
        response = httpx.get("http://localhost:6100/api/reminders-nas-1", timeout=5)
        if response.status_code == 200:
            data = response.json()
            count = len(data) if isinstance(data, list) else 0
            print(f"  PASS: Got 200 via proxy, {count} reminders")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_reminders_nas_2():
    """Central proxy route /api/reminders-nas-2 should return nas-2 reminders."""
    print("Test: Proxy route /api/reminders-nas-2...")
    try:
        response = httpx.get("http://localhost:6100/api/reminders-nas-2", timeout=5)
        if response.status_code == 200:
            data = response.json()
            count = len(data) if isinstance(data, list) else 0
            print(f"  PASS: Got 200 via proxy, {count} reminders")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_speedtest_nas_1():
    """Central proxy route /api/speedtest-nas-1/history should return nas-1 speedtest data."""
    print("Test: Proxy route /api/speedtest-nas-1/history...")
    try:
        response = httpx.get(
            "http://localhost:6100/api/speedtest-nas-1/history", timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            rows = data.get("entries", []) if isinstance(data, dict) else data
            print(f"  PASS: Got 200 via proxy, {len(rows)} rows")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_speedtest_nas_2():
    """Central proxy route /api/speedtest-nas-2/history should return nas-2 speedtest data."""
    print("Test: Proxy route /api/speedtest-nas-2/history...")
    try:
        response = httpx.get(
            "http://localhost:6100/api/speedtest-nas-2/history", timeout=5
        )
        if response.status_code == 200:
            data = response.json()
            rows = data.get("entries", []) if isinstance(data, dict) else data
            print(f"  PASS: Got 200 via proxy, {len(rows)} rows")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_network_nas_1():
    """Central proxy route /api/network-nas-1/log should return nas-1 network log."""
    print("Test: Proxy route /api/network-nas-1/log...")
    try:
        response = httpx.get("http://localhost:6100/api/network-nas-1/log", timeout=5)
        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            lines = (
                len(response.text.strip().split("\n")) if response.text.strip() else 0
            )
            print(f"  PASS: Got 200 via proxy, {lines} lines, type={content_type[:20]}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_proxy_route_network_nas_2():
    """Central proxy route /api/network-nas-2/log should return nas-2 network log."""
    print("Test: Proxy route /api/network-nas-2/log...")
    try:
        response = httpx.get("http://localhost:6100/api/network-nas-2/log", timeout=5)
        if response.status_code == 200:
            content_type = response.headers.get("content-type", "")
            lines = (
                len(response.text.strip().split("\n")) if response.text.strip() else 0
            )
            print(f"  PASS: Got 200 via proxy, {lines} lines, type={content_type[:20]}")
            return True
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def _test_schema_endpoint(widget_name):
    """Helper to test schema endpoint for a widget."""
    endpoint = f"/api/{widget_name}-nas-1/schema"
    print(f"Test: Schema endpoint {endpoint}...")
    try:
        response = httpx.get(f"http://localhost:6100{endpoint}", timeout=5)
        if response.status_code == 200:
            data = response.json()
            widget = data.get("widget")
            version = data.get("version")
            endpoints = list(data.get("endpoints", {}).keys())
            if widget and version:
                print(
                    f"  PASS: Got schema, widget={widget}, version={version}, endpoints={endpoints}"
                )
                return True
            else:
                print(f"  FAIL: Missing widget or version in schema: {data}")
                return False
        elif response.status_code == 502:
            print("  SKIP: Proxy returned 502 (remote unavailable)")
            return None
        else:
            print(f"  FAIL: Expected 200, got {response.status_code}")
            return False
    except httpx.ConnectError:
        print("  SKIP: Central server not running on port 6100")
        return None


def test_schema_metrics():
    """Metrics schema endpoint should return valid schema."""
    return _test_schema_endpoint("metrics")


def test_schema_services():
    """Services schema endpoint should return valid schema."""
    return _test_schema_endpoint("services")


def test_schema_reminders():
    """Reminders schema endpoint should return valid schema."""
    return _test_schema_endpoint("reminders")


def test_schema_speedtest():
    """Speedtest schema endpoint should return valid schema."""
    return _test_schema_endpoint("speedtest")


def test_schema_network():
    """Network schema endpoint should return valid schema."""
    return _test_schema_endpoint("network")


def test_schema_wiki():
    """Wiki schema endpoint should return valid schema."""
    return _test_schema_endpoint("wiki")


CORE_TESTS = [
    test_direct_no_auth,
    test_direct_wrong_key,
    test_direct_correct_key,
    test_federation_client_fetch,
    test_federation_client_health_check,
    test_federation_client_unknown_remote,
    test_federation_status_endpoint,
]

WIDGET_TESTS = {
    "metrics": [
        test_proxy_route_metrics_nas_1,
        test_proxy_route_metrics_nas_2,
        test_proxy_route_with_subpath,
        test_merged_widget_history,
    ],
    "wiki": [
        test_proxy_route_wiki_nas_1,
    ],
    "services": [
        test_proxy_route_services_nas_1,
        test_proxy_route_services_nas_2,
    ],
    "reminders": [
        test_proxy_route_reminders_nas_1,
        test_proxy_route_reminders_nas_2,
    ],
    "speedtest": [
        test_proxy_route_speedtest_nas_1,
        test_proxy_route_speedtest_nas_2,
    ],
    "network": [
        test_proxy_route_network_nas_1,
        test_proxy_route_network_nas_2,
    ],
    "schema": [
        test_schema_metrics,
        test_schema_services,
        test_schema_reminders,
        test_schema_speedtest,
        test_schema_network,
        test_schema_wiki,
    ],
}


def main():
    import argparse

    parser = argparse.ArgumentParser(description="Federation smoke tests")
    parser.add_argument(
        "--widget",
        choices=list(WIDGET_TESTS.keys()),
        help="Run only tests for specified widget type",
    )
    args = parser.parse_args()

    print("=" * 60)
    if args.widget:
        print(f"Federation Smoke Tests ({args.widget})")
    else:
        print("Federation Smoke Tests")
    print("=" * 60)
    print()

    if args.widget:
        tests = CORE_TESTS + WIDGET_TESTS.get(args.widget, [])
    else:
        tests = CORE_TESTS[:]
        for widget_tests in WIDGET_TESTS.values():
            tests.extend(widget_tests)

    results = {"pass": 0, "fail": 0, "skip": 0}

    for test in tests:
        result = test()
        if result is True:
            results["pass"] += 1
        elif result is False:
            results["fail"] += 1
        else:
            results["skip"] += 1
        print()

    print("=" * 60)
    print(
        f"Results: {results['pass']} passed, {results['fail']} failed, {results['skip']} skipped"
    )
    print("=" * 60)

    return 0 if results["fail"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
