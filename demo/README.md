### Demo

Run the demo:
```bash
git clone https://github.com/brege/monitorat
uv run python demo/setup.py --demo
uv tool install -e .
monitorat -c demo/config.yaml server --port 6161
```

This dashboard is a read-only instance of monitor@, similar to the one you would see on your machine. monitor@ is a continuous, scroll-focused dashboard with a minimal-onboarding widget system.

Demo mode only generates `network.log` and `speedtest.csv`. The demo metrics data comes from the repo-tracked `demo/data/metrics.csv`.

#### Contents
- [Metrics](#metrics-widget)
- [Network](#network-widget)
- [Services](#services-widget)
- [Speedtest](#speedtest-widget)
- [Reminders](#reminders-widget)

For this demo, each widget is chased by a corresponding "wiki" widget that provides documentation for said widget. On my Linux computers, I'm in the habit of using each machine's monitor@README as its systems bible. This helps one-off projects and systems-tuning feel less confusing and more enjoyable like gardening.

Each widget's note block is rendered by the [**wiki widget**](https://github.com/brege/monitor@/wiki). You could keep your `docs/` directory up-to-date through [Syncthing](https://syncthing.net/) in tandem with [Obsidian](https://obsidian.md/) or [Markor](https://github.com/gsantner/markor). Documentation is an integral part of monitor@'s philosophy: it is both a manual and the gauges.    

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
