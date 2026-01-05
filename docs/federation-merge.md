# Federation Merge Design

This document specifies how widgets merge data from multiple federated sources.

## Architecture Decision: Frontend Merge

**Decision**: Merge logic runs in the frontend, not backend.

**Rationale**:
- Server resources are limited (1GB RAM droplet)
- Client devices have ample resources (6-8GB RAM average in 2025)
- Proxy routes already handle auth/security - no additional data exposure
- Simpler implementation - no new backend code per widget
- Server stays dumb - just proxies bytes

**Implementation**:
1. Widget detects `config.federation.merge` array
2. Fetches all sources in parallel via existing proxy routes
3. Combines data based on `config.federation.display` strategy
4. Renders with source identification (badges)

## Component Types

Widgets are composed of these UI component types, each with distinct merge behaviors:

| Type      | Description              | Examples                          |
|-----------|--------------------------|-----------------------------------|
| tile      | Single-value stat card   | uptime, load, cpu temp, disk %    |
| chart     | Time-series line graph   | metrics chart, speedtest history  |
| table     | Tabular data with rows   | speedtest results, outage log     |
| button    | User-triggered action    | run speedtest                     |
| pill      | Small status indicator   | uptime pills, service status      |
| card      | Rich content block       | service tiles, reminder items     |
| document  | Rendered markdown        | wiki content                      |

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

| Component      | Desktop 2         | Desktop 3+      | Mobile  | Default |
|----------------|-------------------|-----------------|---------|---------|
| cards          | columnate/stack/merge | stack/merge | stack   | stack   |

**Merge behavior:**
- Cards: Can interleave or group by source
- Badge with source favicon on each card
- Section headers optional when grouped

**Sort options** (`sort_by`):
- `name.asc` / `name.desc` - alphabetical by service name
- `status.asc` / `status.desc` - by status (ok, unknown, down)

### reminders

| Component      | Desktop 2       | Desktop 3+      | Mobile          | Default |
|----------------|-----------------|-----------------|-----------------|---------|
| cards          | columnate/stack/merge | merge/stack | merge/stack   | merge   |

**Merge behavior:**
- Cards: Merge and sort (configurable)
- Badge with source favicon on each card
- When stacked: one list per source with source header

**Sort options** (`sort_by`):
- `name.asc` / `name.desc` - alphabetical by reminder name
- `due.asc` / `due.desc` - by days remaining (due.asc = most urgent first)
- `touched.asc` / `touched.desc` - by last touched date

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

| Component      | Desktop 2       | Desktop 3+      | Mobile   | Default |
|----------------|-----------------|-----------------|----------|---------|
| tiles          | columnate/stack | stack           | stack    | stack   |
| uptime pills   | columnate/stack | stack           | stack    | stack   |
| outages table  | merge/stack     | merge/stack     | stack    | stack   |

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
  reminders-combined:
    type: reminders
    name: "All Reminders"
    federation:
      merge: [nas-1, nas-2]
      display:
        cards: merge        # merge | stack | columnate
      sort_by: due.asc      # most urgent first
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

### Image Proxy

Federated widgets must proxy images through the central server. Use `getImgBase()`:

```javascript
class MyWidget {
  getImgBase () {
    return this.config.remote
      ? `api/proxy/${this.config.remote}/img`
      : 'img'
  }

  render () {
    icon.src = `${this.getImgBase()}/${item.icon}`
  }
}
```

The route `/api/proxy/<remote>/img/<path>` forwards to the remote's `/img/<path>`.

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

### Sort Dropdown Pattern

Widgets with sortable items use a field selector + direction toggle:

```html
<div class="widget-controls">
  <select class="widget-sort-select {widget}-sort-field">
    <option value="name">Name</option>
    <option value="status">Status</option>
  </select>
  <button class="sort-direction-btn {widget}-sort-dir">
    <svg class="sort-asc" viewBox="0 0 24 24"><path d="M7 14l5-5 5 5H7z"/></svg>
    <svg class="sort-desc" viewBox="0 0 24 24" style="display:none"><path d="M7 10l5 5 5-5H7z"/></svg>
  </button>
</div>
```

```javascript
initSortDropdown () {
  const fieldSelect = this.container.querySelector('.{widget}-sort-field')
  const dirBtn = this.container.querySelector('.{widget}-sort-dir')

  fieldSelect.addEventListener('change', () => {
    this.sortField = fieldSelect.value
    this.applySortAndRender()
  })

  dirBtn.addEventListener('click', () => {
    this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc'
    this.updateDirectionIcon(dirBtn)
    this.applySortAndRender()
  })
}
```

---

## Test Infrastructure

### Harness Scripts

| Script | Purpose |
|--------|---------|
| `test/harness.py` | Automated smoke tests - spawn servers, run assertions, teardown |
| `demo/launcher.py` | Interactive demo mode (simple/advanced/federation) |

### Interactive Usage

```bash
python demo/launcher.py --mode federation
```

For fixture-backed federation testing, start the three servers manually using the configs in `test/fixtures/`.

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

Test fixtures reference `demo/simple/img/` for icons via relative path:

```yaml
# test/fixtures/nas-1/config.yaml
paths:
  img: ../../../demo/simple/img/

services:
  items:
    plex:
      name: Plex
      icon: services/systemd/plex.png
```

Fallback icons for missing images:
- Container services: `services/docker/docker.svg`
- Systemd services/timers: `services/systemd/systemd.svg`

### Central Config Merge Stubs

The central fixture includes stubs for all merge strategies:

| Widget | Stubs |
|--------|-------|
| services | `services-combined`, `services-stacked`, `services-columns` |
| reminders | `reminders-combined`, `reminders-stacked`, `reminders-columns` |
| speedtest | `speedtest-combined`, `speedtest-stacked` |
| network | `network-combined`, `network-stacked`, `network-columns` |

### Test Matrix Per Widget

| Test Type | Description |
|-----------|-------------|
| single | Widget on standalone node |
| stacked | Same widget from 2+ sources, rendered separately |
| merged | Combined data from multiple sources in single component |
| columnated | Side-by-side display (desktop) |

Use `--widget` filter with dev.py to isolate widget-specific testing.

---

## Implementation Status

### Phase 5a: Widget Block Federation (stacking)

All widgets support remote proxying with simple stacking. **COMPLETE**

| Widget     | Proxy Routes | Frontend Loads | Image Proxy | Status |
|------------|--------------|----------------|-------------|--------|
| metrics    | [x]          | [x]            | n/a         | done   |
| wiki       | [x]          | [x]            | n/a         | done   |
| services   | [x]          | [x]            | [x]         | done   |
| reminders  | [x]          | [x]            | [x]         | done   |
| speedtest  | [x]          | [x]            | n/a         | done   |
| network    | [x]          | [x]            | n/a         | done   |

### Phase 5b: Merge Infrastructure

| Task | Status |
|------|--------|
| Image proxy route `/api/proxy/<remote>/img/<path>` | [x] |
| Frontend `getImgBase()` pattern | [x] |
| Source badge CSS component | [x] |
| Chart color palette per source | [x] (metrics) |

### Phase 5c: Per-Widget Merge Support

| Widget | Sort | Badges | Columnate | Stack | Merge |
|--------|------|--------|-----------|-------|-------|
| reminders | [x] | [x] | [x] | [x] | [x] |
| services | n/a | [x] | [x] | [x] | [x] |
| speedtest | n/a | [ ] | n/a | [ ] | [ ] |
| network | n/a | [ ] | [ ] | [ ] | [ ] |
| metrics | n/a | [ ] | [ ] | [x] | [x] |

---

## Open Questions

1. **Mobile breakpoint**: At what width does columnate become stack?
2. **Empty sources**: Show placeholder when a source returns no data?
3. **Favicon caching**: Fetch once per session, or store locally?
