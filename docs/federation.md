# Federation

Federation enables a central monitor@ instance to aggregate data from remote instances, providing a unified view across multiple machines.

## Design Principles

- **Pull model**: Central instance fetches from remotes on demand
- **Backward compatible**: Instances without federation config behave as before
- **Stacking first**: Remote widgets appear as separate stacked widgets before attempting chart merging
- **Offline tolerant**: Remote unavailability degrades gracefully with status indicators
- **Live updates deferred**: Real-time refresh is a v1.0 goal; focus on solid mechanics first

## Phases

### Phase 1: Auth Layer

Add API key authentication to protect `/api/*` routes.

**Goals:**
- Standalone value: secures single instances without relying on reverse proxy auth
- Unblocks federation: remote instances need auth for central to connect securely

**Config:**
```yaml
auth:
  api_key: "your-secret-key"
```

**Behavior:**
- No `auth.api_key` configured: open access (current behavior)
- `auth.api_key` set: require `Authorization: Bearer <key>` or `X-API-Key: <key>` header
- Failed auth returns 401

**Implementation:**
- `monitorat/auth.py`: Flask-HTTPAuth with HTTPTokenAuth
- Apply to `/api/*` routes
- Exclude static assets, index, vendors

**Library:** Flask-HTTPAuth

```python
from flask_httpauth import HTTPTokenAuth

auth = HTTPTokenAuth(scheme="Bearer")

@auth.verify_token
def verify_token(token):
    api_key = config["auth"]["api_key"].get(str)
    if not api_key:
        return True
    return hmac.compare_digest(token, api_key)
```

Supports both `Authorization: Bearer <key>` and can be extended for `X-API-Key` header.

### Phase 2: Remote Definitions

Define remote instances in config and implement the client to fetch from them.

**Config:**
```yaml
federation:
  enabled: true
  timeout_seconds: 10
  remotes:
    - name: nas-1
      url: http://192.168.1.10:6161
      api_key: "nas-1-secret"
    - name: nas-2
      url: http://192.168.1.20:6161
      api_key: "nas-2-secret"
```

**Implementation: `monitorat/federation.py`**

```python
class FederationClient:
    """HTTP client for fetching from remote monitor@ instances."""

    def __init__(self):
        self._client = None
        self._remotes = {}

    def get_remote(self, name: str) -> dict | None:
        """Get remote config by name."""

    def fetch(self, remote_name: str, path: str) -> httpx.Response:
        """Fetch from a remote instance with auth."""

    def health_check(self, remote_name: str) -> dict:
        """Check if remote is reachable, return status dict."""

federation_client = FederationClient()
```

**Exports:**
- `federation_client` - singleton instance
- `get_remote(name)` - lookup remote by name
- `fetch(remote, path)` - make authenticated request

**Library:** httpx

Chosen over requests for HTTP/2 support and async-readiness when live updates are implemented.

### Phase 3: Remote Widget Stacking

Leverage existing `type:` pattern to stack remote widgets.

**Config:**
```yaml
widgets:
  enabled:
    - metrics
    - metrics-nas-1
    - metrics-nas-2

  metrics-nas-1:
    type: metrics
    remote: nas-1
    title: "nas-1 metrics"

  metrics-nas-2:
    type: metrics
    remote: nas-2
    title: "nas-2 metrics"
```

**Behavior:**
- Widget with `remote:` key proxies API calls to that remote
- Central: `/api/metrics-nas-1/*` proxies to `http://nas-1:6161/api/metrics/*`
- Frontend unchanged: widget JS fetches from local `/api/metrics-nas-1/*`

**Implementation:**
- Modify widget discovery to detect `remote:` config
- Register proxy routes instead of importing local widget module
- Pass remote's API key in outgoing requests

### Phase 4: Status Indicators

Show remote health in widget headers.

**Behavior:**
- Health check on page load (live polling deferred to v1.0)
- Status dot in widget header: green (ok), yellow (slow/degraded), red (unreachable)
- Tooltip or badge showing last successful fetch time
- Stale data indicator if remote was reachable but now isn't

**Implementation:**
- `/api/federation/status` endpoint returning remote health
- Frontend checks on widget load
- CSS classes for status states

### Phase N: Chart Merging (Future)

Overlay data from multiple remotes on single charts.

**Config (tentative):**
```yaml
widgets:
  metrics-combined:
    type: metrics
    federation:
      merge: [nas-1, nas-2, local]
      series_labels: true
```

**Considerations:**
- Axis scaling across different value ranges
- Legend with host colors
- Tooltip coordination
- Time alignment across sources

Deferred until stacking is stable.

---

## Testing Strategy

Test configs live in `test/` to keep `demo/` pristine. Demo data (`demo/data/`) is reused.

### Local Cluster Setup

```
Head node (central):     port 6100, config: test/config-central.yaml
Remote nas-1:            port 6601, config: test/config-nas-1.yaml
Remote nas-2:            port 6602, config: test/config-nas-2.yaml
```

### Spin Up Test Cluster

```bash
# Terminal 1: Head node (no auth, fetches from remotes)
uv run monitorat -c test/config-central.yaml server --port 6100

# Terminal 2-3: Remote nodes (auth enabled)
uv run monitorat -c test/config-nas-1.yaml server --port 6601
uv run monitorat -c test/config-nas-2.yaml server --port 6602
```

### Federation Smoke Tests

```bash
# Direct to remote - should fail without key
curl -s -w "\n%{http_code}\n" http://localhost:6601/api/metrics
# Expected: 401

# Direct to remote - should succeed with key
curl -s -H "X-API-Key: nas-1-secret" http://localhost:6601/api/metrics | jq .
# Expected: 200 with metrics data

# Central proxying to remote (Phase 3)
curl -s http://localhost:6100/api/metrics-nas-1 | jq .
# Expected: proxied response from nas-1
```

### Validation Script

`test/smoke_federation.py` automates the above checks:
- Spawns test nodes
- Validates auth rejection/acceptance
- Tests proxy routes (Phase 3)
- Reports pass/fail

---

## Dependency Additions

```toml
# pyproject.toml additions
dependencies = [
  ...
  "Flask-HTTPAuth>=4.8.0",
  "httpx>=0.27.0",
]
```

---

## Open Questions

1. **Key storage**: Plaintext in config acceptable for now? Hashing adds complexity without much gain for static keys.
2. **Key rotation**: Document manual process (update config, reload). Automated rotation deferred.
3. **Per-remote keys**: Each remote has its own key (as shown). Central stores all remote keys.
4. **Audit logging**: Log auth failures to existing monitor.log.
5. **Rate limiting**: Defer. Not critical for trusted LAN deployments.

---

## File Checklist

Phase 1: **COMPLETE**
- [x] `monitorat/auth.py` - HTTPTokenAuth setup, `before_request` handler
- [x] `monitorat/config_default.yaml` - add `auth:` block
- [x] `monitorat/monitor.py` - import and register auth handler
- [x] `pyproject.toml` - add Flask-HTTPAuth dependency
- [x] `test/config-auth-test.yaml` - test fixture

Phase 2:
- [ ] `monitorat/federation.py` - remote client, connection management
- [ ] `monitorat/config_default.yaml` - add `federation:` block
- [ ] `pyproject.toml` - add httpx dependency
- [ ] `test/config-nas-*.yaml` - test node configs
- [ ] `test/smoke_federation.py` - validation script

Phase 3:
- [ ] `monitorat/monitor.py` - proxy route registration for remote widgets
- [ ] `test/config-central.yaml` - test config with remote widgets

Phase 4:
- [ ] `monitorat/static/shared/StatusIndicator.js` - health dot component
- [ ] Widget templates - add status indicator slot
- [ ] `/api/federation/status` endpoint
