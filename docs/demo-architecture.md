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
├── setup.py                        # Generates demo/test data (existing)
│
├── central/
│   ├── config.yaml                 # Main config, includes all snippets
│   ├── data/                       # Central-specific data (if any)
│   └── snippets/
│       │
│       │ ## Site & Federation Setup
│       ├── 00-site.yaml            # Site name, title, paths
│       ├── 01-federation.yaml      # Remote definitions (nas-1, nas-2)
│       │
│       │ ## Chapter 1: Single-Node Basics
│       ├── 10-wiki-welcome.yaml
│       ├── 11-wiki-single-node-intro.yaml
│       │
│       ├── 12-metrics-basic.yaml
│       ├── 13-wiki-metrics-basic.yaml
│       ├── 14-metrics-tiles-only.yaml
│       ├── 15-wiki-metrics-tiles-only.yaml
│       ├── 16-metrics-history-only.yaml
│       ├── 17-wiki-metrics-history-only.yaml
│       │
│       ├── 18-services-basic.yaml
│       ├── 19-wiki-services-basic.yaml
│       │
│       ├── 20-reminders-basic.yaml
│       ├── 21-wiki-reminders-basic.yaml
│       │
│       ├── 22-speedtest-basic.yaml
│       ├── 23-wiki-speedtest-basic.yaml
│       ├── 24-speedtest-controls-only.yaml
│       ├── 25-wiki-speedtest-controls-only.yaml
│       ├── 26-speedtest-history-only.yaml
│       ├── 27-wiki-speedtest-history-only.yaml
│       │
│       ├── 28-network-basic.yaml
│       ├── 29-wiki-network-basic.yaml
│       ├── 30-network-tiles-only.yaml
│       ├── 31-wiki-network-tiles-only.yaml
│       ├── 32-network-uptime-only.yaml
│       ├── 33-wiki-network-uptime-only.yaml
│       ├── 34-network-outages-only.yaml
│       ├── 35-wiki-network-outages-only.yaml
│       │
│       │ ## Chapter 2: Federation
│       ├── 50-wiki-federation-intro.yaml
│       ├── 51-wiki-federation-theory.yaml
│       │
│       │ ## Wiki Federation
│       ├── 52-wiki-nas-1.yaml
│       ├── 53-wiki-nas-2.yaml
│       ├── 54-wiki-columnate.yaml
│       ├── 55-wiki-columnate-doc.yaml
│       ├── 56-wiki-stack.yaml
│       ├── 57-wiki-stack-doc.yaml
│       │
│       │ ## Metrics Federation
│       ├── 60-wiki-metrics-federation.yaml
│       ├── 61-metrics-combined.yaml
│       ├── 62-wiki-metrics-combined.yaml
│       ├── 63-metrics-tiles-columnate.yaml
│       ├── 64-wiki-metrics-tiles-columnate.yaml
│       ├── 65-metrics-stacked.yaml
│       ├── 66-wiki-metrics-stacked.yaml
│       │
│       │ ## Services Federation
│       ├── 70-wiki-services-federation.yaml
│       ├── 71-services-merged.yaml
│       ├── 72-wiki-services-merged.yaml
│       ├── 73-services-stacked.yaml
│       ├── 74-wiki-services-stacked.yaml
│       ├── 75-services-columnate.yaml
│       ├── 76-wiki-services-columnate.yaml
│       │
│       │ ## Reminders Federation
│       ├── 80-wiki-reminders-federation.yaml
│       ├── 81-reminders-merged.yaml
│       ├── 82-wiki-reminders-merged.yaml
│       ├── 83-reminders-stacked.yaml
│       ├── 84-wiki-reminders-stacked.yaml
│       │
│       │ ## Speedtest Federation
│       ├── 90-wiki-speedtest-federation.yaml
│       ├── 91-speedtest-merged.yaml
│       ├── 92-wiki-speedtest-merged.yaml
│       │
│       │ ## Network Federation
│       ├── 100-wiki-network-federation.yaml
│       ├── 101-network-combined.yaml
│       ├── 102-wiki-network-combined.yaml
│       ├── 103-network-tiles-columnate.yaml
│       ├── 104-wiki-network-tiles-columnate.yaml
│       ├── 105-network-uptime-columnate.yaml
│       ├── 106-wiki-network-uptime-columnate.yaml
│       ├── 107-network-outages-columnate.yaml
│       ├── 108-wiki-network-outages-columnate.yaml
│       └── ...
│
├── nas-1/
│   ├── config.yaml                 # Standalone config with auth
│   └── data/ -> ../data/nas-1/     # Symlink to shared data
│
├── nas-2/
│   ├── config.yaml                 # Standalone config with auth
│   └── data/ -> ../data/nas-2/     # Symlink to shared data
│
├── data/                           # Shared demo data
│   ├── nas-1/
│   │   ├── metrics.csv
│   │   ├── speedtest.csv
│   │   ├── network.log
│   │   └── ...
│   └── nas-2/
│       ├── metrics.csv
│       ├── speedtest.csv
│       ├── network.log
│       └── ...
│
└── docs/                           # Documentation for wiki widgets
    │
    ├── README.md                   # Homepage welcome
    │
    ├── single-node/
    │   ├── intro.md                # What monitor@ is, basic setup
    │   ├── metrics.md              # Metrics widget explanation
    │   ├── metrics-tiles-only.md   # Feature toggle explanation
    │   ├── metrics-history-only.md
    │   ├── services.md
    │   ├── reminders.md
    │   ├── speedtest.md
    │   ├── speedtest-controls-only.md
    │   ├── speedtest-history-only.md
    │   ├── network.md
    │   ├── network-tiles-only.md
    │   ├── network-uptime-only.md
    │   └── network-outages-only.md
    │
    └── federation/
        ├── intro.md                # What federation is
        ├── theory.md               # Merge strategies (from federation-merge.md)
        │
        ├── wiki.md                 # Wiki federation options
        ├── wiki-columnate.md
        ├── wiki-stack.md
        │
        ├── metrics.md              # Metrics federation overview
        ├── metrics-combined.md
        ├── metrics-tiles-columnate.md
        ├── metrics-stacked.md
        │
        ├── services.md
        ├── services-merged.md
        ├── services-stacked.md
        ├── services-columnate.md
        │
        ├── reminders.md
        ├── reminders-merged.md
        ├── reminders-stacked.md
        │
        ├── speedtest.md
        ├── speedtest-merged.md
        │
        ├── network.md
        ├── network-combined.md
        ├── network-tiles-columnate.md
        ├── network-uptime-columnate.md
        └── network-outages-columnate.md
```

## Snippet Pattern

Each snippet is a self-contained widget definition:

```yaml
# snippets/61-metrics-combined.yaml
metrics-combined:
  type: metrics
  name: "All Systems (Combined)"
  federation:
    merge: [nas-1, nas-2]
    display:
      tiles: columnate
  chart:
    periods: [24 hours, 6 hours, 1 hour]
    default_period: 6 hours
```

The accompanying wiki snippet shows the config inline:

```yaml
# snippets/62-wiki-metrics-combined.yaml
wiki-metrics-combined:
  type: wiki
  name: "Config: metrics-combined"
  style: seamless
  doc: |
    **Configuration:**
    ```yaml
    {{file:snippets/61-metrics-combined.yaml}}
    ```
```

## Central Config Assembly

The main config assembles snippets in pedagogical order:

```yaml
# demo/central/config.yaml
includes:
  - snippets/00-site.yaml
  - snippets/01-federation.yaml
  # ... all snippets in order

widgets:
  enabled:
    # Chapter 1: Single-Node
    - wiki-welcome
    - wiki-single-node-intro
    - metrics-basic
    - wiki-metrics-basic
    - metrics-tiles-only
    - wiki-metrics-tiles-only
    # ... continues in order

    # Chapter 2: Federation
    - wiki-federation-intro
    - wiki-federation-theory
    - wiki-nas-1
    - wiki-nas-2
    - wiki-columnate
    - wiki-columnate-doc
    # ... continues
```

## Launcher Script

```python
# demo/launcher.py
"""
Production-ready launcher for the demo.

Usage:
    python demo/launcher.py                    # Start all servers
    python demo/launcher.py --central-only     # Start only central (for testing)
    python demo/launcher.py --stop             # Stop all servers
"""
```

The launcher:
1. Starts nas-1 on :6601 with auth
2. Starts nas-2 on :6602 with auth
3. Starts central on :6100 (or configurable)
4. Manages PID files for clean shutdown
5. Optionally daemonizes for production

## Dashboard Flow

**Chapter 1: Single-Node Basics**
```
┌─────────────────────────────────────────┐
│ Welcome to monitor@                     │  wiki-welcome
├─────────────────────────────────────────┤
│ Single-Node Setup                       │  wiki-single-node-intro
├─────────────────────────────────────────┤
│ System Metrics                          │  metrics-basic
├─────────────────────────────────────────┤
│ Config: metrics-basic                   │  wiki-metrics-basic (shows yaml)
├─────────────────────────────────────────┤
│ Metrics: Tiles Only                     │  metrics-tiles-only
├─────────────────────────────────────────┤
│ Config: show.history: false             │  wiki-metrics-tiles-only
├─────────────────────────────────────────┤
│ ... (services, reminders, etc.)         │
└─────────────────────────────────────────┘
```

**Chapter 2: Federation**
```
┌─────────────────────────────────────────┐
│ Federation: Aggregating Multiple Nodes  │  wiki-federation-intro
├─────────────────────────────────────────┤
│ Merge Strategies & Display Options      │  wiki-federation-theory
├─────────────────────────────────────────┤
│ NAS-1 Wiki                              │  wiki-nas-1 (single remote)
├─────────────────────────────────────────┤
│ NAS-2 Wiki                              │  wiki-nas-2 (single remote)
├─────────────────────────────────────────┤
│ All Wikis (columns)                     │  wiki-columnate
├─────────────────────────────────────────┤
│ Config: wiki columnate                  │  wiki-columnate-doc
├─────────────────────────────────────────┤
│ ... (metrics federation, etc.)          │
└─────────────────────────────────────────┘
```

## Implementation Checklist

### Phase 1: Infrastructure
- [ ] Create `demo/launcher.py` (adapt from `test/dev.py`)
- [ ] Create `demo/central/config.yaml` skeleton
- [ ] Create `demo/nas-1/config.yaml` with auth
- [ ] Create `demo/nas-2/config.yaml` with auth
- [ ] Set up data directory structure and symlinks
- [ ] Verify three-server startup works locally

### Phase 2: Single-Node Chapter (snippets + docs)
- [ ] Create `snippets/00-site.yaml`, `01-federation.yaml`
- [ ] Create `docs/README.md` (welcome)
- [ ] Create `docs/single-node/intro.md`
- [ ] Metrics: basic, tiles-only, history-only (snippets + docs)
- [ ] Services: basic (snippets + docs)
- [ ] Reminders: basic (snippets + docs)
- [ ] Speedtest: basic, controls-only, history-only (snippets + docs)
- [ ] Network: basic, tiles-only, uptime-only, outages-only (snippets + docs)

### Phase 3: Federation Chapter (snippets + docs)
- [ ] Create `docs/federation/intro.md`
- [ ] Create `docs/federation/theory.md` (adapt from federation-merge.md)
- [ ] Wiki: single remotes, columnate, stack (snippets + docs)
- [ ] Metrics: combined, tiles-columnate, stacked (snippets + docs)
- [ ] Services: merged, stacked, columnate (snippets + docs)
- [ ] Reminders: merged, stacked (snippets + docs)
- [ ] Speedtest: merged (snippets + docs)
- [ ] Network: combined, per-feature columnate (snippets + docs)

### Phase 4: Assembly & Testing
- [ ] Assemble `demo/central/config.yaml` with all includes
- [ ] Build `widgets.enabled` list in pedagogical order
- [ ] Test full demo locally with launcher.py
- [ ] Run smoke tests against demo configuration
- [ ] Update `deploy -p` script if needed

### Phase 5: Production
- [ ] Configure systemd unit for launcher.py
- [ ] Test production deployment
- [ ] Verify public demo at demo.monitorat.brege.org
