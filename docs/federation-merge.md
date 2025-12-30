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
