## Overview

The layout demo focuses on page compaction and columnation of widgets.

## Other demos

- Simple demo: [monitorat.brege.org](https://monitorat.brege.org/)
- Advanced demo: [monitorat.brege.org/advanced](https://monitorat.brege.org/advanced/)
- Federation demo: [monitorat.brege.org/federation](https://monitorat.brege.org/federation/)

## Reference

| Key        | Description |
| ----------- | ----------- |
| `group`     | widgets with the same `section` + `group` share one grid row/block |
| `section`   | controls which section header (`sections.<name>`) a widget appears under |
| `columns`   | maximum column number to expand horizontally before wrapping to new row |
| `position`  | explicit sort order within a group. Lower numbers render first |
| `min_width` | minimum width to compress widget (e.g. `500px`) before bumping next widget to new row |

Narrow viewports like mobile layouts wrap to a single column. Columnation in tandem with federation provide for intricate, compact multi machine dashboards. Use `min_width` 

## Configuration Sources

- Site-level setup: `snippets/site.yaml`
- Section 1 layout: `snippets/section-1.yaml`
- Section 2 layout: `snippets/section-2.yaml`
- Section 3 layout: `snippets/section-3.yaml`
