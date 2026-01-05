# Demo Architecture

The demo serves as living documentation: every widget configuration is visible, every federation layout is demonstrated, and config snippets are embedded inline via `{{shortcode}}` rendering.

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (:443)                     │
│                   monitorat.brege.org                       │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Central Head Node (:6300)                 │
│               demo/federation/central/config.yaml           │
│                                                             │
│   - Serves public dashboard                                 │
│   - Proxies federation requests to nas-1, nas-2            │
│   - Demo mode enabled (read-only, privacy masks)           │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│    nas-1 (:6301)         │   │    nas-2 (:6302)         │
│ demo/federation/nas-1/config.yaml │   │ demo/federation/nas-2/config.yaml │
│                          │   │                          │
│  - Auth required         │   │  - Auth required         │
│  - Not publicly exposed  │   │  - Not publicly exposed  │
│  - Serves metrics, wiki, │   │  - Serves metrics, wiki, │
│    services, etc.        │   │    services, etc.        │
└──────────────────────────┘   └──────────────────────────┘
```

Subpath routing:
- `/` -> simple demo on :6100
- `/advanced` -> advanced demo on :6200
- `/federation` -> federation demo on :6300

## Directory Structure

```
demo/
├── launcher.py                    # Starts simple/advanced/federation demos
├── README.md
├── setup.py                        # Generates demo/test data
│
├── simple/
│   ├── config.yaml                 # Simple demo config
│   ├── include/                    # Widget defaults
│   ├── docs/                       # Widget docs for simple demo
│   ├── data/                       # Shared demo data
│   └── img/                        # Icons and images
│
├── advanced/
│   ├── config.yaml                 # Single-node advanced demo
│   ├── snippets/                   # Advanced widget snippets
│   │   ├── site.yaml               # Site name, title
│   │   ├── widgets/
│   │   ├── wiki/
│   │   ├── metrics/
│   │   ├── speedtest/
│   │   └── network/
│   └── docs/                       # Advanced wiki content
│       ├── README.md
│       └── single/
│           ├── intro.md
│           ├── widgets/
│           ├── features/
│           └── modes/wiki/
│
└── federation/
    ├── central/
    │   ├── config.yaml             # Main config, includes snippets
    │   ├── snippets/
    │   │   ├── site.yaml
    │   │   ├── federation.yaml     # Remote definitions
    │   │   └── multi/              # Federation configurations
    │   └── docs/                   # Wiki content (mirrors snippets/)
    │       └── multi/
    │
    ├── nas-1/
    │   └── config.yaml             # Standalone config with auth
    │
    └── nas-2/
        └── config.yaml             # Standalone config with auth
```

## Snippet Pattern

Each snippet defines widgets under a `widgets:` key:

```yaml
# snippets/multi/metrics/tiles/column.yaml
widgets:
  metrics-tiles-column:
    type: metrics
    name: "Metrics: Tiles Columnated"
    federation:
      merge: [nas-1, nas-2]
      display:
        tiles: columnate
    show:
      tiles: true
      history: false

  wiki-metrics-tiles-column:
    type: wiki
    name: "Config: Tiles Columnated"
    style: seamless
    doc: docs/multi/metrics/tiles/column.md
```

Docs reference snippets via shortcode:

```markdown
<!-- docs/multi/metrics/tiles/column.md -->
```yaml
{{file:snippets/multi/metrics/tiles/column.yaml}}
```​
```

## Launcher Script

```bash
python demo/launcher.py                               # Start simple demo
python demo/launcher.py --mode advanced               # Start advanced demo
python demo/launcher.py --mode federation             # Start federation demo
python demo/launcher.py --background                  # Daemonize
python demo/launcher.py --stop                        # Stop all
```

## Implementation Checklist

### Phase 1: Infrastructure [DONE]
- [x] Create `demo/launcher.py`
- [x] Create `demo/federation/central/config.yaml`
- [x] Create `demo/federation/nas-1/config.yaml` with auth
- [x] Create `demo/federation/nas-2/config.yaml` with auth
- [x] Verify three-server startup

### Phase 2: Single-Node Chapter [DONE]
- [x] Create `snippets/site.yaml`, `federation.yaml`
- [x] Create `docs/README.md`
- [x] Create `docs/single/intro.md`
- [x] Metrics: basic, tiles-only, history-only
- [x] Services, Reminders: basic
- [x] Speedtest: basic, controls-only, history-only
- [x] Network: basic, tiles-only, uptime-only, outages-only
- [x] Wiki modes: rail, featured, seamless

### Phase 3: Federation Chapter [DONE]
- [x] Create `docs/multi/intro.md`
- [x] Wiki: each, column, stack
- [x] Metrics: each, tiles/{merge,stack,column}, history/{merge,stack}
- [x] Services: merge, stack, column
- [x] Reminders: merge, stack, column
- [x] Speedtest: merge
- [x] Network: combined, tiles/{column,stack}, uptime/{column,stack}, outages/{column,merge}

### Phase 4: Testing
- [ ] Test full demo locally with demo/launcher.py
- [ ] Run smoke tests against demo configuration
- [ ] Regenerate demo data with fresh timestamps

### Phase 5: Production
- [ ] Update systemd unit for launcher.py
- [ ] Update deploy script
- [ ] Verify public demo
