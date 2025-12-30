# Federation Merge Design

This document specifies how widgets merge data from multiple federated sources.

## Component Types

Widgets are composed of these UI component types, each with distinct merge behaviors:

| Type      | Description                              | Examples                          |
|-----------|------------------------------------------|-----------------------------------|
| tile      | Single-value stat card                   | uptime, load, cpu temp, disk %    |
| chart     | Time-series line graph                   | metrics chart, speedtest history  |
| table     | Tabular data with rows                   | speedtest results, outage log     |
| button    | User-triggered action                    | run speedtest                     |
| pill      | Small status indicator                   | uptime pills, service status      |
| card      | Rich content block                       | service tiles, reminder items     |
| document  | Rendered markdown                        | wiki content                      |

## Merge Strategies

| Strategy   | Description                                                   |
|------------|---------------------------------------------------------------|
| stack      | Show components vertically, one per source                    |
| columnate  | Show components side-by-side (desktop only)                   |
| merge      | Combine into single component with source identification      |

## Widget Component Matrix

Each widget's components and their allowed merge strategies:

### metrics

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| tiles          | columnate/stack | stack           | stack           | stack   |
| chart          | merge/stack     | merge/stack     | merge/stack     | merge   |

**Merge behavior:**
- Tiles: Badge with source favicon, hover shows source name
- Chart: Separate line per source, distinct colors from palette

### services

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| cards          | columnate/stack/merge | stack/merge | stack         | stack   |

**Merge behavior:**
- Cards: Can interleave or group by source
- Badge with source favicon on each card
- Section headers optional when grouped

### reminders

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| cards          | merge/stack     | merge/stack     | merge/stack     | merge   |

**Merge behavior:**
- Cards: Merge and sort by date (configurable: `sort_by: date.desc` - new behavior)
- Badge with source favicon on each card
- When stacked: one list per source with source header

### speedtest

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| button         | columnate/stack | stack           | stack           | stack   |
| table          | merge/stack     | merge/stack     | stack           | stack   |
| chart          | merge/stack     | merge/stack     | merge/stack     | merge   |

**Merge behavior:**
- Button: Badge with source favicon on each button
- Table: Add "source" column when merged
- Chart: Separate series per source (solid/dashed/dotted line styles)

### network

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| tiles          | columnate/stack | stack           | stack           | stack   |
| uptime pills   | columnate/stack | stack           | stack           | stack   |
| outages table  | merge/stack     | merge/stack     | stack           | stack   |

**Merge behavior:**
- Tiles: Badge with source favicon
- Uptime pills: Per-source row with source label
- Outages: Merge temporally with source column, or stack as separate tables

### wiki

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| document       | stack           | stack           | stack           | stack   |

**Merge behavior:**
- Documents cannot meaningfully merge
- Stack with source header/divider

## Configuration Schema

```yaml
widgets:
  metrics-all:
    type: metrics
    federation:
      merge: [nas-1, nas-2]
      display:
        tiles: columnate    # columnate | stack
        chart: merge        # merge | stack
    name: "All Systems"
```

Per-component display options override defaults. Mobile ignores `columnate` and falls back to `stack`.

## Source Identification

Merged components identify sources via:

1. **Favicon badge**: Small icon from source's configured `site.favicon`
2. **Hover/tooltip**: Source name on mouseover
3. **Legend entry**: For charts, include source in legend
4. **Column**: For tables, optional "Source" column

CSS class naming:
```css
.federation-source-badge { }
.federation-source-[name] { }  /* e.g., .federation-source-nas-1 */
```

## Chart Color Palette

Merged charts use a consistent color sequence per source:

| Source Index | Primary    | Secondary  |
|--------------|------------|------------|
| 0            | #3498db    | #2980b9    |
| 1            | #2ecc71    | #27ae60    |
| 2            | #e74c3c    | #c0392b    |
| 3            | #9b59b6    | #8e44ad    |
| 4            | #f39c12    | #d68910    |

For multi-metric charts (speedtest: download/upload/ping), use line styles:
- Source 0: solid lines
- Source 1: dashed lines
- Source 2: dotted lines

## Implementation Checklist

### Phase 5a: Widget Block Federation (stacking)

All widgets support remote proxying with simple stacking.

| Widget     | Proxy Routes | Frontend Loads | Status |
|------------|--------------|----------------|--------|
| metrics    | [x]          | [x]            | done   |
| wiki       | [x]          | [x]            | done   |
| services   | [x]          | [x]            | done   |
| reminders  | [x]          | [x]            | done   |
| speedtest  | [x]          | [x]            | done   |
| network    | [x]          | [x]            | done   |

Test coverage: 20 smoke tests (7 core + 13 widget-specific) via `uv run python test/harness.py`

### Phase 5b: Merge Infrastructure

| Task                                      | Status |
|-------------------------------------------|--------|
| Favicon fetching/caching from remotes     | [ ]    |
| Source badge CSS component                | [ ]    |
| Chart color palette per source            | [ ]    |
| Table source column helper                | [ ]    |

### Phase 5c: Per-Widget Merge Support

| Widget     | Chart Merge | Table Merge | Tile Columnate | Card Merge |
|------------|-------------|-------------|----------------|------------|
| metrics    | [x]         | n/a         | [ ]            | n/a        |
| services   | n/a         | n/a         | n/a            | [ ]        |
| reminders  | n/a         | n/a         | n/a            | [ ]        |
| speedtest  | [ ]         | [ ]         | n/a            | n/a        |
| network    | n/a         | [ ]         | [ ]            | n/a        |
| wiki       | n/a         | n/a         | n/a            | n/a        |

## Open Questions

1. **Favicon caching**: Fetch once per session, or store locally?
2. **3+ sources**: Always stack tiles, or allow wrapping columnation?
3. **Sort options**: Reminders need configurable sort. Apply to other widgets?
4. **Mobile breakpoint**: At what width does columnate become stack?
5. **Empty sources**: Show placeholder when a source returns no data?

---

## Frontend Patterns for Federation

Widget developers must follow these patterns for federation compatibility.

### API Prefix

Federated widgets receive `_apiPrefix` in their config. Use it for all API calls:

```javascript
class MyWidget {
  getApiBase () {
    return this.config._apiPrefix
      ? `api/${this.config._apiPrefix}`
      : 'api/mywidget'
  }

  async loadData () {
    const response = await fetch(`${this.getApiBase()}/history`)
    // ...
  }
}
```

The main app.js sets `_apiPrefix` automatically when `config.remote` or `config.federation.merge` is present.

### DOM Scoping

Multiple instances of the same widget can appear on a federated dashboard. **Never use global selectors**:

```javascript
// BAD - causes collision when widget appears twice
const container = document.getElementById('my-widget-data')
const element = document.querySelector('[data-key="foo"]')

// GOOD - scoped to widget's container
const container = this.container.querySelector('.my-widget-data')
const element = this.container.querySelector('[data-key="foo"]')
```

All widgets must use `this.container.querySelector()` instead of `document.getElementById()` or `document.querySelector()`.

### Schema Endpoints

Every widget should expose `/api/{widget}/schema` returning:

```json
{
  "widget": "mywidget",
  "version": 1,
  "endpoints": {
    "list": "/api/mywidget",
    "schema": "/api/mywidget/schema"
  },
  "metadata": { "label": "My Widget" },
  "fields": [...]
}
```

---

## Test Infrastructure

### Harness Scripts

| Script | Purpose |
|--------|---------|
| `test/harness.py` | Automated smoke tests - spawn servers, run assertions, teardown |
| `test/dev.py` | Interactive development - spawn servers, keep running until Ctrl+C |

### Dev Harness Usage

```bash
uv run python test/dev.py                          # head + nas-1 + nas-2 (all widgets)
uv run python test/dev.py --single nas-1           # just nas-1
uv run python test/dev.py --remote nas-1           # head + nas-1
uv run python test/dev.py --widget services        # all nodes, services only
uv run python test/dev.py --remote nas-1 --widget speedtest
uv run python test/dev.py --list
```

Widget filtering generates temp configs with filtered `widgets.enabled` lists.

### Smoke Test Coverage

| Category | Tests |
|----------|-------|
| Core (auth, federation client) | 7 |
| metrics (proxy + merge) | 4 |
| wiki | 1 |
| services | 2 |
| reminders | 2 |
| speedtest | 2 |
| network | 2 |
| schema (all widgets) | 6 |
| **Total** | **26** |

---

## Test Fixture Design

### Image Paths

Test fixtures should reference `demo/img/` for service icons rather than using stubs:

```yaml
# test/fixtures/nas-1/config.yaml
services:
  items:
    plex:
      name: Plex
      icon: services/systemd/plex.png  # from demo/img/
      services: [plexmediaserver.service]
```

For missing icons, use fallbacks:
- Container services: `services/docker/docker.svg`
- Systemd services/timers: `services/systemd/systemd.svg`

Fixture configs need `paths.img` pointing to demo:
```yaml
paths:
  img: ../../../demo/img/
```

### Widget Parity in Fixtures

Each test node should have complete widget configurations to enable focused testing:

| Fixture | Wiki | Metrics | Services | Reminders | Speedtest | Network |
|---------|------|---------|----------|-----------|-----------|---------|
| nas-1   | [x]  | [x]     | [x]      | [x]       | [x]       | [x]     |
| nas-2   | [x]  | [x]     | [x]      | [x]       | [x]       | [x]     |
| nas-3   | [ ]  | [x]     | [ ]      | [x]       | [x]       | [x]     |
| central | proxy routes for all |

### Test Matrix Per Widget

For each widget, test infrastructure should support:

| Test Type | Description |
|-----------|-------------|
| single | Widget on standalone node |
| stacked | Same widget from 2+ sources, rendered separately |
| merged | Combined data from multiple sources in single component |
| columnated | Side-by-side display (desktop) |

Use `--widget` filter with dev.py to isolate widget-specific testing.

---

## Remaining Work

### Immediate Tasks

1. **Update fixture image paths** - Change `icon: favicon.svg` to proper demo/img paths
2. **Add `paths.img` to fixtures** - Point to `../../../demo/img/`
3. **Document patterns in contributing.md** - Add section on federation-compatible widget development
4. **Add wiki stubs to all fixtures** - Ensure parity for stacking/merge tests

### Phase 5b Tasks (Merge Infrastructure)

| Task | Status |
|------|--------|
| Favicon fetching/caching from remotes | [ ] |
| Source badge CSS component | [ ] |
| Chart color palette per source | [ ] |
| Table source column helper | [ ] |
| services-combined example | [ ] |

### Phase 5c Tasks (Per-Widget Merge)

| Widget | Chart Merge | Table Merge | Tile Columnate | Card Merge |
|--------|-------------|-------------|----------------|------------|
| metrics | [x] | n/a | [ ] | n/a |
| services | n/a | n/a | n/a | [ ] |
| reminders | n/a | n/a | n/a | [ ] |
| speedtest | [ ] | [ ] | n/a | n/a |
| network | n/a | [ ] | [ ] | n/a |
| wiki | n/a | n/a | n/a | n/a |

### Documentation Tasks

- [ ] Add "Federation Compatibility" section to docs/contributing.md
- [ ] Update test/README.md with fixture image path conventions
- [ ] Add widget developer checklist for federation support
