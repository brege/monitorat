## About

**Monitorat** is a federated dashboard and documentation system.

Its philosophy is to make system monitoring and documentation continuous, much like the way tables and figures are integrated in journal articles or [Wikipedia](https://wikipedia.org/).

### Quickstart
```bash
uv tool install monitorat
monitorat demo
```
then open your browser at [http://localhost:6100](http://localhost:6100).  Or checkout the [advanced](http://monitorat.brege.org/advanced) and [federation](http://monitorat.brege.org/federation) demos.

This dashboard is a read-only instance of [**monitorat**](https://github.com/brege/monitorat). It's similar to the one you could be using on your machine, just with synthetic data. Being scroll-focused and continuous, monitorat aims to be a dashboard that's a knowledge base and not a knowledge sink.

### Demos

There are three demos.

| Demo | Command | Port | Online Demo |
|:--- |:--- | --- |:--- |
| **Simple** | `monitorat demo --mode simple` | :6100  | [http://monitorat.brege.org/](http://monitorat.brege.org/) |
| **Advanced** | `monitorat demo --mode advanced` | :6200 | [http://monitorat.brege.org/advanced](http://monitorat.brege.org/advanced) |
| **Federation** | `monitorat demo --mode federation` | :6300 | [http://monitorat.brege.org/federation](http://monitorat.brege.org/federation) |

- The [simple](http://monitorat.brege.org/) demo goes over the widget basics.
- The [advanced](http://monitorat.brege.org/advanced) demo breaks down how different features of each widget can be toggled, configured, and adjusted for different display modes.
- [Federation](http://monitorat.brege.org/federation) is a multi-node demo that demonstrates how widgets can be shared and used from a central command. *Simple is a prerequisite for Advanced. Advanced is a prerequisite for Federation.* This demo launches 3 survers on ports `6300` (head), `6301` & `6302` (nodes).

### Widgets
- [Wiki](#overview)
- [Metrics](#metrics-widget)
- [Network](#network-widget)
- [Services](#services-widget)
- [Speedtest](#speedtest-widget)
- [Reminders](#reminders-widget)

For this (simple) demo, each widget is chased by a corresponding ["Wiki" widget](/#wiki) that provides the documentation for that widget.

On headless machines (Raspberry Pi, a NAS, NUC, or Beelink), monitorat becomes both a central dashboard and a system's bible.

### Purpose

- help me navigate to my services and check their statuses
- centralize my documentation and notes so I remember how I deployed them
- periodically check on system health, performance, and network quality

Monitorat's text editor for Markdown files is in beta. If you make edits with an editor like [Neovim](https://neovim.io/) or [Obsidian](https://obsidian.md/), simply save and refresh.


See the full project [README](https://github.com/brege/monitorat/#readme) for more information.

### Config Snippets

<details>
<summary><b>Show config</b></summary>

> **Note:** You will see in each widget's note block the config snippet for that widget. This is the *head* config that loads each of the snippets through `includes`/snippet files.

{{ include:code path="config.yaml" lang="yaml" }}
</details>
