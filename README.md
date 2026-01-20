<img src="./docs/img/masthead.svg" alt="monitor@/monitorat masthead that shows the french IPA phonetics and the tagline 'a system for observing and documenting status' and an icon with a monitor and superimposed at-character" width="100%">

# <div align=center> [ [demo](https://monitorat.brege.org) ] </div>

**Monitorat** is a federated dashboard and documentation system.

Its philosophy is to make system monitoring and documentation continuous, much like the way tables and figures are integrated within journal articles or [Wikipedia](https://wikipedia.org/).

Available widgets:
- [metrics](#system-metrics)
- [network](#network)
- [reminders](#reminders)
- [services](#services)
- [speedtest](#speedtest)
- [wiki](#wiki)

Widgets have a general, self-contained structure where both API and UI are straightforward to create.

```
~/.config/monitorat/widgets/
└── my-widget
    ├── api.py
    ├── default.yaml
    ├── index.html
    └── app.js
```

Documentation is editable in-browser and handled by proliferating Wiki widgets across your dashboard. Each document fragment added is a new widget instance. All documents you add to your wiki will be rendered in GitHub-flavored Markdown via [markdown-it](https://github.com/markdown-it/markdown-it).

## Gallery

[**The Demo**](https://monitorat.brege.org) is a fully interactive version of the application and provides complete resource parity between widget layouts and their YAML config snippets. In that sense, *the demo is the documentation*.

<table>
  <tr>
    <td><img src="docs/img/screenshots/desktop/dark/101.png" width="100%"></td>
    <td><img src="docs/img/screenshots/desktop/dark/102.png" width="100%"></td>
    <td><img src="docs/img/screenshots/desktop/dark/103.png" width="100%"></td>
  </tr>
</table>
<table>
  <tr>
    <td><img src="docs/img/screenshots/desktop/dark/100.png" width="100%"></td>
    <td><img src="docs/img/screenshots/desktop/light/110.png" width="100%"></td>
  </tr>
</table>
<table>
  <tr>
    <td><img src="docs/img/screenshots/desktop/light/111.png" width="100%"></td>
    <td><img src="docs/img/screenshots/desktop/light/112.png" width="100%"></td>
    <td><img src="docs/img/screenshots/desktop/light/113.png" width="100%"></td>
  </tr>
</table>
<table>
  <tr>
    <td><img src="docs/img/screenshots/mobile/dark/201.png" width="100%"></td>
    <td><img src="docs/img/screenshots/mobile/dark/202.png" width="100%"></td>
    <td><img src="docs/img/screenshots/mobile/light/211.png" width="100%"></td>
    <td><img src="docs/img/screenshots/mobile/light/212.png" width="100%"></td>
  </tr>
</table>

## Features

- Beautiful documentation for your Homelab and media servers.
- Completely headless and works offline.
- Responsive design for mobile and desktop, with light and dark modes.
- Track [how hot your CPU gets](https://monitorat.brege.org/#metrics-widget) over the course of the day.
- Be alerted [when under extremely high load](#alerts).
- Keep a record of [internet speedtests](https://monitorat.brege.org/#speedtest-widget) even when AFK.
- List [all your reverse-proxied services](https://monitorat.brege.org/#services-widget) with offline-friendly bookmarks.
- Even runs on Raspberry Pi 2/3 w/ Pi-Hole, Unraid, and other homelab systems.
- Has [**federation**](https://monitorat.brege.org/federation): you can monitor services, metrics data, and documentation across many machines from a central command.


---

## Installation

### PyPI

Try the demo in 3 seconds:
```bash
uv tool install monitorat && monitorat demo
```
Then open http://localhost:6100.

See: **[Package Install](./docs/install/package.md)** for installing from PyPI with pip or uv.

### Docker

See: **[Docker Install](./docs/install/docker.md)** for installation in a container.

### Source

See: **[Source Install](./docs/install/source.md)** for git-based installations or deployments to `/opt`.

---

## The Dashboard

Open `http://localhost:6161`, or your specified port, or configure through a reverse proxy.

### Configuration

These are the basic monitorat settings for your system, assuming you want to keep all icons and data close to your config file (usually `~/.config/monitorat/`):

```yaml
site:
  name: "@my-nas"
  title: "Dashboard @my-nas"
  editing: true

paths:
  data: data/
  img: img/  # or /home/user/.config/monitorat/img/

widgets: { ... }

# privacy: { ... }
# alerts: { ... }
# notifications: { ... }
```

## Widgets

**Monitorat** has an extensible widget system. You can add any number of widgets to your dashboard multiple times over, re-order them, and enable/disable any you don't need. 

### Configuration

You can add more widgets of other origin in `~/.config/monitorat/widgets/`.

```yaml
widgets:
  enabled:             # dashboard positions: from top to bottom
    - my-server-notes  # type: wiki
    - services
    - metrics
    - # reminders      # '#' disables this widget
    - network
    - speedtest
    - my-widget        # in ~/.config/monitorat/widgets/
```

Each widget can be configured in its own YAML block. To configure a widget in its own file:
```yaml
includes:
  - "/home/user/.config/monitorat/widgets/my-widget.yaml"
```
or do this for every widget through config snippets:
```yaml
includes:
  - snippets/services.yaml
  - snippets/metrics.yaml
  - # ... wikis, user widgets, etc
```

##### Making your own

Widgets are also quite easy to build with AI. Widget built with Codex in 12 minutes:
> [Agentic Archetype: Building Widgets with AI](docs/contributing.md#agentic-archetype)

## Available Widgets

### **Services**  
- monitor systemd services, timers, and Docker containers in real time
- can be used as *homelab bookmarks* in compact cards layout
- simultaneously provides both your URL (or WAN IP) and local address (or LAN IP) for use offline
- **monitorat is completely encapsulated and works offline even when internet is down**

### **Wiki**  
- uses [markdown-it](https://github.com/markdown-it/markdown-it) and GitHub-flavored markdown
- can columnate multiple documents/Markdown fragments
- editor can be used to spruce up system docs in the browser
- supports [Mermaid](https://mermaid-js.github.io/mermaid/#/) diagrams

### **System Metrics**  
- provides an overview of system performance over time in `metrics.csv`
- measures CPU, memory, disk and network usage, temperature, etc.
- get notified when system metrics exceed configured thresholds:

<details>
<summary><b>Configuring Alerts</b></summary>

```yaml
alerts:
  cooldown_minutes: 60  # Short cooldown for testing
  rules:
    high_load:
      threshold: 2.5    # load average (e.g., the '1.23' in 1.23 0.45 0.06)
      priority: 0       # normal priority
      message: High CPU load detected
    high_temp:
      threshold: 82.5   # celsius
      priority: 1       # high priority  
      message: High temperature warning
    low_disk:
      threshold: 95     # percent
      priority: 0       # normal priority
      message: Low disk space warning
```

</details>

### **Speedtest**  
- keep a record of your internet performance over time
- currently does not perform automated runs

### **Network**  
The network widget is best used on machines with continuous uptime. Two options:
- (a) using a `ddclient`-style log, or
- (b) use the built-in chirper

### **Reminders**  
- facilitated by [Apprise URLs](https://github.com/caronc/apprise) (see [below](#notifications)).
- ping yourself for system chores, key changes, etc.

### Summary of Widget Features

<table>
  <thead>
    <tr>
      <th>Widget</th>
      <th>Chart</th>
      <th>Filters</th>
      <th>Snapshot</th>
      <th>Recording</th>
      <th>Editing</th>
      <th>Federation Merge</th>
      <th>Notify</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>S. Metrics</td>
      <td><a href="https://monitorat.brege.org/#section-metrics">Y</a></td>
      <td>-</td>
      <td>Y (tiles)</td>
      <td>Y</td>
      <td>N</td>
      <td><a href="https://monitorat.brege.org/federation/#section-metrics">Y (chart)</a></td>
      <td>Y (alert)</td>
    </tr>
    <tr>
      <td>Network</td>
      <td><a href="https://monitorat.brege.org/#section-network">Y (pips)</a></td>
      <td>Y (outages)</td>
      <td>Y (tiles)</td>
      <td>Y</td>
      <td>N</td>
      <td><a href="https://monitorat.brege.org/federation/#section-network">Y (interleave)</a></td>
      <td>N</td>
    </tr>
    <tr>
      <td>Speedtest</td>
      <td><a href="https://monitorat.brege.org/#section-speedtest">Y</a></td>
      <td>-</td>
      <td>-</td>
      <td>N</td>
      <td>-</td>
      <td><a href="https://monitorat.brege.org/federation/#section-speedtest">Y (chart)</a></td>
      <td>N</td>
    </tr>
    <tr>
      <td>Services</td>
      <td>-</td>
      <td><a href="https://monitorat.brege.org/#section-services">Y</a></td>
      <td>Y (cards)</td>
      <td>N</td>
      <td>Y</td>
      <td><a href="https://monitorat.brege.org/federation/#section-services">Y (interleave)</a></td>
      <td>N</td>
    </tr>
    <tr>
      <td>Reminders</td>
      <td>-</td>
      <td><a href="https://monitorat.brege.org/#section-reminders">Y</a></td>
      <td>-</td>
      <td>-</td>
      <td>Y</td>
      <td><a href="https://monitorat.brege.org/federation/#section-reminders">Y (interleave)</a></td>
      <td>Y</td>
    </tr>
    <tr>
      <td>Wiki</td>
      <td><a href="https://monitorat.brege.org/#about">Y</a></td>
      <td>-</td>
      <td>-</td>
      <td>-</td>
      <td>Y</td>
      <td>Y (continuous)</td>
      <td>-</td>
    </tr>
  </tbody>
</table>

> Y = supported | N = planned / potential feature | \- = not applicable

## General Features

### Editing

- built-in Markdown editor and previewer
- configure new reminders and services directly through the web interface
- Web UI configuration seamlessly updates the YAML config file or downstream snippets

### Notifications

The notifications system uses [Apprise](https://github.com/caronc/apprise) to notify through practically any service via apprise URLs.

```yaml
notifications:
  apprise_urls:
    - "pover://abscdefghijklmnopqrstuvwxyz1234@4321zyxwvutsrqponmlkjihgfedcba"
    - "mailto://1234 5678 9a1b 0c1d@sent.com?user=main@fastmail.com&to=alias@sent.com"
    - # more apprise urls if needed...
```

### Federation

Yes, you can even federate multiple instances of monitorat:
- compare and plot metrics data across multiple machines
- see service statuses for your entire homelab/network from a central node
- especially useful for filtering and sorting events network-wide

> [!NOTE]
> To simultaneously use federation of remotes AND local monitoring, you must setup a client monitorat instance and a separate monitorat server to federate locals and remotes in the same pane.

### Privacy

The privacy mask helps share your setup online without exposing personal information.
```yaml
privacy:
  replacements:
    my-site.org: example.com
    replace-me: with-this
    ...
  mask_ips: true
```
Running `monitorat config` will print the runtime config with these masks applied as well.

---

## Development

- [**contributing**](./docs/contributing.md)
- [**changelog**](./docs/changelog.md)
- [**roadmap**](./docs/roadmap.md)

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)
