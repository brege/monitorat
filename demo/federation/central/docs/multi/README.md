## Overview 

Prerequisites:

- Simple demo: [https://monitorat.brege.org/](https://monitorat.brege.org/)
- Advanced demo: [https://monitorat.brege.org/advanced/](https://monitorat.brege.org/advanced/)

Federation aggregates data from multiple monitor@ instances into a unified view. This makes comparing metric data across two or more instances more continuous, allowing you to merge charts, mix reminders and service status, and pull documentation from multiple sources in one continuous display.

## How widgets can merge data in federation

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

```mermaid
flowchart TB
  central["Central Head Node<br/>(public, proxies requests)"]
  nas1["nas-1<br/>:6301"]
  nas2["nas-2<br/>:6302"]
  central --> nas1
  central --> nas2
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
