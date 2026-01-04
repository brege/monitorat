### Demo

Run the demo:
```bash
uv tool install monitorat
monitorat demo --port 6161
```
Open your browser at [http://localhost:6161](http://localhost:6161).

This dashboard is a read-only instance of monitor@, similar to the one you could be using on your machine. monitor@ is a continuous, scroll-focused dashboard with a widget system that aims to not be a knowledge sink.

This demo mode is using mostly synthetic data (e.g., `network.log` and `speedtest.csv`). The data presented in the Metrics widget is real and provided by `demo/simple/data/metrics.csv`. But it's not showing you real *live* data.

Other demo entry points:
- `demo/advanced/config.yaml` for the single-node widget deep dive
- `demo/federation/launcher.py` for the multi-node federation demo

#### Contents
- [Metrics](#metrics-widget)
- [Network](#network-widget)
- [Services](#services-widget)
- [Speedtest](#speedtest-widget)
- [Reminders](#reminders-widget)

For this demo, each widget is chased by a corresponding "Wiki" widget that provides documentation for said widget. On my Linux computers, I'm in the habit of using each machine's monitor@README as its systems bible. This helps one-off projects and systems-tuning feel less confusing and more enjoyable, like gardening.

Each widget's note block is rendered by the [**wiki widget**](https://github.com/brege/monitor@/wiki). You could keep your `docs/` directory up-to-date through [Syncthing](https://syncthing.net/) in tandem with [Obsidian](https://obsidian.md/) or [Markor](https://github.com/gsantner/markor). Documentation is an integral part of monitor@'s philosophy: the dashboard is both the gauges and the manual.  

For the full project README and source, see:
[https://github.com/brege/monitorat](https://github.com/brege/monitorat).

#### Config

> **Note**
>  
> You will see in each widget's note block the config snippet for that widget. This is the *head* config that loads each of the snippets through `includes`.

<details>
<summary><b>Show config</b></summary>

{{ include:code path="config.yaml" lang="yaml" }}
</details>
