# Single-Node Setup

A single-node monitor@ installation displays data from one system. This is the simplest deployment: install monitor@, configure your widgets, and serve.

The examples below show data from **nas-1**, a single remote node. Each widget is followed by its configuration snippet.

## Feature Toggling

Most widgets support `show` configuration to display only specific features:

```yaml
widgets:
  my-metrics:
    type: metrics
    show:
      tiles: true      # Show the stat tiles
      history: false   # Hide the chart/table
```

This pattern applies to metrics, speedtest, and network widgets.
