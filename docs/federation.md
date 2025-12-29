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

Define remote instances in config.

**Config:**
```yaml
federation:
  remotes:
    - name: nas-1
      url: http://192.168.1.10:6161
      api_key: "nas-1-secret"
    - name: nas-2
      url: http://192.168.1.20:6161
      api_key: "nas-2-secret"
```

**Implementation:**
- Add `federation` block to `config_default.yaml`
- Remote client in `monitorat/federation.py`
- Use httpx for HTTP/2 and future async capability
- Timeout and retry configuration

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

The demo infrastructure (`demo/init.py`) enables local multi-instance testing without network complexity.

### Local Cluster Setup

```
Head node (central):     port 6100, config: demo/config-central.yaml
Remote nas-1:            port 6601, config: demo/config-nas-1.yaml
Remote nas-2:            port 6602, config: demo/config-nas-2.yaml
Remote nas-3:            port 6603, config: demo/config-nas-3.yaml
```

### Spin Up Test Cluster

```bash
# Terminal 1: Head node
monitorat -c demo/config-central.yaml server --port 6100

# Terminal 2-4: Remote nodes
monitorat -c demo/config-nas-1.yaml server --port 6601
monitorat -c demo/config-nas-2.yaml server --port 6602
monitorat -c demo/config-nas-3.yaml server --port 6603
```

### Auth Smoke Tests

```bash
# No auth configured - should succeed
curl http://localhost:6601/api/metrics

# Auth configured - should fail without key
curl http://localhost:6601/api/metrics
# Expected: 401

# Auth configured - should succeed with key
curl -H "Authorization: Bearer nas-1-secret" http://localhost:6601/api/metrics
# Expected: 200

# Central fetching from remote
curl http://localhost:6100/api/metrics-nas-1
# Expected: proxied response from nas-1
```

### Demo Data Generation

Extend `demo/init.py` to generate distinct synthetic data per node:
- Different hostname in metrics
- Unique load patterns (geometric/sinusoidal for visual distinction)
- Staggered timestamps

This provides visually distinguishable data when stacked or merged.

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

Phase 1:
- [ ] `monitorat/auth.py` - HTTPTokenAuth setup, decorators
- [ ] `monitorat/config_default.yaml` - add `auth:` block
- [ ] `monitorat/monitor.py` - apply auth to `/api/*` routes
- [ ] `pyproject.toml` - add Flask-HTTPAuth dependency

Phase 2:
- [ ] `monitorat/federation.py` - remote client, connection management
- [ ] `monitorat/config_default.yaml` - add `federation:` block
- [ ] `pyproject.toml` - add httpx dependency

Phase 3:
- [ ] `monitorat/monitor.py` - proxy route registration for remote widgets
- [ ] `demo/config-central.yaml` - test config with remote widgets
- [ ] `demo/config-nas-*.yaml` - test configs for remote nodes

Phase 4:
- [ ] `monitorat/static/shared/StatusIndicator.js` - health dot component
- [ ] Widget templates - add status indicator slot
- [ ] `/api/federation/status` endpoint
