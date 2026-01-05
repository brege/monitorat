## Overview

- Simple demo: [https://monitorat.brege.org/](https://monitorat.brege.org/)
- Federation demo: [https://monitorat.brege.org/federation](https://monitorat.brege.org/federation)

This demo focuses on per-widget configuration patterns and feature toggles for a single server. Each widget example is paired with the exact snippet used to render it, so you can lift the config directly.

## Feature Toggling

Most widgets support `show` config to display specific features:

```yaml
show:
  tiles: true
  history: false
```

This pattern applies to metrics, speedtest, and network widgets.

## Sections

| widget | section 1 | section 2 | section 3 |
| --- | --- | --- | --- |
| wiki | rail mode | featured | seamless |
| metrics | full | tiles only | history only |
| services | full | — | — |
| reminders | full | — | — |
| speedtest | full | controls only | history only |
| network | tiles only | uptime only | outages only |

Widget order matches the simple and federation demos.
