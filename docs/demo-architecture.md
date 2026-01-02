# Demo Architecture

The demo serves as living documentation: every widget configuration is visible, every federation layout is demonstrated, and config snippets are embedded inline via `{{shortcode}}` rendering.

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                    Reverse Proxy (:443)                     │
│                  demo.monitorat.brege.org                   │
└─────────────────────────────────┬───────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Central Head Node (:6100)                 │
│                     demo/central/config.yaml                │
│                                                             │
│   - Serves public dashboard                                 │
│   - Proxies federation requests to nas-1, nas-2            │
│   - Demo mode enabled (read-only, privacy masks)           │
└──────────────┬─────────────────────────────┬────────────────┘
               │                             │
               ▼                             ▼
┌──────────────────────────┐   ┌──────────────────────────┐
│    nas-1 (:6601)         │   │    nas-2 (:6602)         │
│  demo/nas-1/config.yaml  │   │  demo/nas-2/config.yaml  │
│                          │   │                          │
│  - Auth required         │   │  - Auth required         │
│  - Not publicly exposed  │   │  - Not publicly exposed  │
│  - Serves metrics, wiki, │   │  - Serves metrics, wiki, │
│    services, etc.        │   │    services, etc.        │
└──────────────────────────┘   └──────────────────────────┘
```

## Directory Structure

```
demo/
├── launcher.py                     # Starts all three servers
├── setup.py                        # Generates demo/test data
│
├── central/
│   ├── config.yaml                 # Main config, includes snippets
│   │
│   ├── snippets/
│   │   ├── site.yaml               # Site name, title
│   │   ├── federation.yaml         # Remote definitions
│   │   │
│   │   ├── single/                 # Single-node configurations
│   │   │   ├── widgets/            # Basic widget configs
│   │   │   │   ├── wiki.yaml
│   │   │   │   ├── metrics.yaml
│   │   │   │   ├── services.yaml
│   │   │   │   ├── reminders.yaml
│   │   │   │   ├── speedtest.yaml
│   │   │   │   └── network.yaml
│   │   │   │
│   │   │   ├── wiki/               # Wiki display modes
│   │   │   │   ├── rail.yaml
│   │   │   │   ├── featured.yaml
│   │   │   │   └── seamless.yaml
│   │   │   │
│   │   │   ├── metrics/            # Feature toggles
│   │   │   │   ├── tiles-only.yaml
│   │   │   │   └── history-only.yaml
│   │   │   │
│   │   │   ├── speedtest/
│   │   │   │   ├── controls-only.yaml
│   │   │   │   └── history-only.yaml
│   │   │   │
│   │   │   └── network/
│   │   │       ├── tiles-only.yaml
│   │   │       ├── uptime-only.yaml
│   │   │       └── outages-only.yaml
│   │   │
│   │   └── multi/                  # Federation configurations
│   │       ├── intro.yaml
│   │       │
│   │       ├── wiki/
│   │       │   ├── each.yaml       # Per-remote
│   │       │   ├── column.yaml
│   │       │   └── stack.yaml
│   │       │
│   │       ├── metrics/
│   │       │   ├── each.yaml
│   │       │   ├── tiles/
│   │       │   │   ├── merge.yaml
│   │       │   │   ├── stack.yaml
│   │       │   │   └── column.yaml
│   │       │   └── history/
│   │       │       ├── merge.yaml
│   │       │       └── stack.yaml
│   │       │
│   │       ├── services/
│   │       │   ├── merge.yaml
│   │       │   ├── stack.yaml
│   │       │   └── column.yaml
│   │       │
│   │       ├── reminders/
│   │       │   ├── merge.yaml
│   │       │   ├── stack.yaml
│   │       │   └── column.yaml
│   │       │
│   │       ├── speedtest/
│   │       │   └── merge.yaml
│   │       │
│   │       └── network/
│   │           ├── combined.yaml
│   │           ├── tiles/
│   │           │   ├── column.yaml
│   │           │   └── stack.yaml
│   │           ├── uptime/
│   │           │   ├── column.yaml
│   │           │   └── stack.yaml
│   │           └── outages/
│   │               ├── column.yaml
│   │               └── merge.yaml
│   │
│   └── docs/                       # Wiki content (mirrors snippets/)
│       ├── README.md
│       │
│       ├── single/
│       │   ├── intro.md
│       │   ├── widgets/
│       │   │   ├── metrics.md
│       │   │   ├── services.md
│       │   │   └── ...
│       │   ├── features/
│       │   │   ├── metrics-tiles.md
│       │   │   ├── metrics-history.md
│       │   │   └── ...
│       │   └── modes/wiki/
│       │       ├── rail.md
│       │       ├── featured.md
│       │       └── seamless.md
│       │
│       └── multi/
│           ├── intro.md
│           ├── wiki/
│           ├── metrics/
│           │   ├── each.md
│           │   ├── tiles/
│           │   └── history/
│           ├── services/
│           ├── reminders/
│           ├── speedtest/
│           └── network/
│
├── nas-1/
│   └── config.yaml                 # Standalone config with auth
│
├── nas-2/
│   └── config.yaml                 # Standalone config with auth
│
├── data/                           # Shared demo data
│   ├── metrics.csv
│   ├── speedtest.csv
│   ├── network.log
│   └── ...
│
└── docs/                           # Original demo docs (legacy)
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
python demo/launcher.py                    # Start all servers
python demo/launcher.py --central-only     # Central only
python demo/launcher.py --background       # Daemonize
python demo/launcher.py --stop             # Stop all
python demo/launcher.py --status           # Show status
```

## Implementation Checklist

### Phase 1: Infrastructure [DONE]
- [x] Create `demo/launcher.py`
- [x] Create `demo/central/config.yaml`
- [x] Create `demo/nas-1/config.yaml` with auth
- [x] Create `demo/nas-2/config.yaml` with auth
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
- [ ] Test full demo locally with launcher.py
- [ ] Run smoke tests against demo configuration
- [ ] Regenerate demo data with fresh timestamps

### Phase 5: Production
- [ ] Update systemd unit for launcher.py
- [ ] Update deploy script
- [ ] Verify public demo
