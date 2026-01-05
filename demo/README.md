### Demo

Run the demo:
```bash
uv tool install monitorat
monitorat demo
```
Open your browser at [http://localhost:6100](http://localhost:6100).

This dashboard is a read-only instance of monitorat, similar to the one you could be using on your machine. monitorat is a continuous, scroll-focused dashboard with a widget system that aims to be a knowledge base, not a knowledge sink.

Other demo entry points:
- `monitorat demo --mode advanced` for the single-node widget deep dive
- `monitorat demo --mode federation` for the multi-node federation demo

**Online Demos**

- **Simple** - [http://monitorat.brege.org/](http://monitorat.brege.org/)
- **Advanced** - [http://monitorat.brege.org/advanced](http://monitorat.brege.org/advanced)
- **Federation** - [http://monitorat.brege.org/federation](http://monitorat.brege.org/federation)

The [advanced](http://monitorat.brege.org/advanced) demo breaks down how different features of each widget can be toggled or configured. 

[Federation](http://monitorat.brege.org/federation) is a multi-node demo that demonstrates how widgets can be shared and used from central command. *Simple is a prerequisite for Advanced. Advanced is a prerequisite for Federation.*

#### Ports

The demos run on the following ports:
- Simple: 6100 [http://localhost:6100](http://localhost:6100)
- Advanced: 6200 [http://localhost:6200](http://localhost:6200)
- Federation: 6300 (head) [http://localhost:6300](http://localhost:6300), 6301-6302 (remotes)

#### Contents
- [Metrics](#metrics-widget)
- [Network](#network-widget)
- [Services](#services-widget)
- [Speedtest](#speedtest-widget)
- [Reminders](#reminders-widget)

For this demo, each widget is chased by a corresponding ["Wiki" widget](/#wiki) that provides documentation for said widget. On my Linux computers, including a Raspberry Pi, each machine's monitor@README is its systems bible. It provides me with the three main things I want in a dashboard:

- service status and links to them
- performance of the system
- documentation of how I made all of it work

For documentation handling, I keep the `docs/` directory up-to-date through [Syncthing](https://syncthing.net/), making them phone-editable through [Obsidian](https://obsidian.md/) or [Markor](https://github.com/gsantner/markor). Documentation is an integral part of monitorat's philosophy: the dashboard is both the gauges and the manual. Refresh the page after you've saved your markdown edits.

For the full project README and its source code, see:
[https://github.com/brege/monitorat](https://github.com/brege/monitorat).

#### Config

> **Note**
>  
> You will see in each widget's note block the config snippet for that widget. This is the *head* config that loads each of the snippets through `includes`.

<details>
<summary><b>Show config</b></summary>

{{ include:code path="config.yaml" lang="yaml" }}
</details>
