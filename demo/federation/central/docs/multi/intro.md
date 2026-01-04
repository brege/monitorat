# Federation

Federation aggregates data from multiple monitor@ instances into a unified view. This makes comparing metric data across two or more instances more continuous, allowing you to merge charts, mix reminders and service status, and pull documentation from multiple sources in one continuous display.

## Overview

Different widgets and widget features support different integrations.

| widget | feature | stack | columnate | merge |
| --- | --- | --- | --- | --- |
| wiki | document | ✔ | ✔ | ✖ |
| metrics | tiles | ✔ | ✔ | ✖ |
| metrics | history | ? | ✖ | ✔ |
| services | cards | ✔ | ✔ | ✔ |
| reminders | cards | ✔ | ✔ | ✔ |
| speedtest | chart/table | ? | ✖ | ✔ |
| network | tiles | ✔ | ✔ | ✖ |
| network | uptime | ✔ | ✔ | ✖ |
| network | outages | ✖ | ✔ | ✔ |

Each federated widget declares its sources with `federation.nodes: [nas-1, nas-2]`.

Stacking can always be done by using consecutive widgets of a single feature display (?).

## Display Strategies

- **columnate** - Side-by-side columns
- **stack** - Vertical sections
- **merge** - Combined unified view

## Architecture

```
       Central Head Node
      (public, proxies requests)
              │
      ┌───────┴───────┐
      ▼               ▼
   nas-1           nas-2
   :6301           :6302
```

## Configuration

```yaml
federation:
  enabled: true
  remotes:
    - name: nas-1
      url: http://localhost:6301
      api_key: "secret"
    - name: nas-2
      url: http://localhost:6302
      api_key: "secret"
```
