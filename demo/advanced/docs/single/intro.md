# Single-Node Setup

A single-node deployment displays data from one system. Install monitor@, configure widgets, serve.

The examples below show data from **nas-1**. Each widget is followed by its configuration.

## Feature Toggling

Most widgets support `show` config to display specific features:

```yaml
show:
  tiles: true
  history: false
```

This pattern applies to metrics, speedtest, and network widgets.
