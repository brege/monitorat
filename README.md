<img src="./docs/img/masthead.svg" alt="monitor@/monitorat masthead that shows the french IPA phonetics and the tagline 'a system for observing and documenting status' and an icon with a monitor and superimposed at-character" width="100%">

# <div align=center> [ [demo](https://monitorat.brege.org) ] </div>

This file is **monitor@**'s README, which is the default document served in the web UI. Document rendering is but one widget available in monitor@.

Available widgets:
- [metrics](#system-metrics)
- [network](#network)
- [reminders](#reminders)
- [services](#services)
- [speedtest](#speedtest)
- [wiki](#wiki)

Widgets have a general, self-contained structure where both API and UI are straightforward to create.

```
~/.config/monitor@/widgets/
└── my-widget
    ├── api.py
    ├── index.html
    └── app.js
```

You can also add your own documentation through the Wiki widget, which may help you or your loved ones figure out how your headless homelab or riceware works. This document and any others you add to your wiki will be rendered in GitHub-flavored markdown via [markdown-it](https://github.com/markdown-it/markdown-it).

But you want an actual monitor or dashboard.

### Gallery

<!-- 
TODO: update screenshots 
4 + 2 + 4
4 - light mode phone
darkmode desktop + lightmode desktop
4 - darkmode desktop
use https://monitorat.brege.org/ to create screenshots
-->

<table>
  <tr>
    <td><img src="docs/img/screenshots/metrics.png" width="100%"></td>
    <td><img src="docs/img/screenshots/services.png" width="100%"></td>
    <td><img src="docs/img/screenshots/reminders.png" width="100%"></td>
    <td><img src="docs/img/screenshots/speedtest.png" width="100%"></td>
  </tr>
</table>
<table>
  <tr>
    <td><img src="docs/img/screenshots/network.png" width="100%"></td>
  </tr>
</table>

- See [how hot your CPU got today](https://monitorat.brege.org/#metrics-widget).
- Be alerted [when under high load](#alerts).
- Keep a record of and [graph your internet speed](https://monitorat.brege.org/#speedtest-widget).
- List of [all your reverse-proxied services](https://monitorat.brege.org/#services-widget) with offline-friendly bookmarks.


## Installation

Both installation methods assume you are using a configuration file at `~/.config/monitor@/config.yaml`.

### Installing with uv

**PyPI**: The simplest way is to install from PyPI.
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install monitorat
```

**Source**: Or install the package from source/development:
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
uv tool install -e .
```

In either case, start the server:
```bash
monitorat -c path/to/config.yaml server --host 0.0.0.0 --port 6161
```
or run the demo:
```bash
monitorat -c demo/config.yaml server
```

#### Systemd service

Assuming you'd like to run monitor@ as a systemd service with your normal user, group, and hostname:
```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-uv.sh)
```
This pulls the uv-flavored systemd script from [scripts/install-systemd-uv.sh](./scripts/install-systemd-uv.sh), using sudo internally to install the systemd unit to `/etc/systemd/system/monitor@.service`.

For **alternate installs**, see [docs/install.md](docs/install.md) to install `monitor@/monitorat` => `/opt/monitor@` and other deployments.

## The Dashboard

Open `http://localhost:6161` or configure this through a reverse proxy. If you're just interested in playing with a read-only version, check out [**the demo**](https://monitorat.brege.org).

### Configuration

These are the basic monitor@ settings for your system, assuming you want to put all icons, data and the config file in `~/.config/monitor@/` which is the default location.

```yaml
site:
  name: "@my-nas"
  title: "Dashboard @my-nas"

paths:
  data: data/
  img: img/  # or /home/user/.config/monitor@/img/

widgets: { ... }

# privacy: { ... }
# alerts: { ... }
# notifications: { ... }
```

### Widgets

**monitor@** is an extensible widget system. You can add any number of widgets to your dashboard, re-order them, and enable/disable any you don't need. You can add more widgets from others in `~/.config/monitor@/widgets/`.

```yaml
widgets:
  enabled:             # dashboard positions: from top to bottom
    - services
    - services-wiki    # type: wiki
    - metrics
    - metrics-wiki     # type: wiki
    - # reminders      # '#' disables this widget
    - network
    - speedtest
    - my-widget        # in ~/.config/monitor@/widgets/
```

Each widget can be configured in its own YAML block. To configure a widget in its own file,
```yaml
includes:
  - "/home/user/.config/monitor@/widgets/my-widget.yaml"
```
or do this for every widget:
```yaml
includes:
  - include/services.yaml
  - include/metrics.yaml
  - include/reminders.yaml
  - include/network.yaml
  - include/speedtest.yaml
  - include/my-widget.yaml
  - # ... wikis, user widgets, etc
```

##### Making your own

They are also quite easy to build. Example of a widget built with Codex in 12 minutes:

- [Contributing: Agentic Archetype](docs/contributing.md#agentic-archetype)

#### **Services**  
  The **Service Status** widget is a simple display to show what systemd service daemons, timers and docker containers are running or have failed.
  
  [github](./demo/docs/services.md) - [demo](https://monitorat.brege.org/#services-widget)

  You can configure the service tiles to have both your URL (or WAN IP) and a local address (or LAN IP) for use offline. **monitor@ is completely encapsulated and works offline even when internet is down.**

#### **Wiki**  
  Some widgets you may want to use more than once. For two markdown documents ("wikis"), use **`type: wiki`**. **`wiki: <title>`** may only be used once.

  [github](./demo/README.md) - [demo](https://monitorat.brege.org/#wiki)

   Changing widget order or enabling/disabling widgets is rather straightforward.

   ```yaml
   widgets:
     enabled: 
       - network
       - network-wiki
       - services
       - services-wiki
       - metrics
       - speedtest
       - ...
   ```

   **monitor@ uses GitHub-flavored markdown**

#### **System Metrics**  
  Metrics provides an overview of system performance, including CPU, memory, disk and network usage, and temperature over time.  Data is logged to `metrics.csv`.

  [github](./demo/docs/metrics.md) - [demo](https://monitorat.brege.org/#metrics-widget)

#### **Speedtest**  
  The **Speedtest** widget allows you to keep a record of your internet performance over time.
It does not perform automated runs.

  [github](./demo/docs/speedtest.md) - [demo](https://monitorat.brege.org/#speedtest-widget)

#### **Network**  
  The **Network** widget may be the most specific. This example uses `ddclient`-style generated logs.

  [github](./demo/docs/network.md) - [demo](https://monitorat.brege.org/#network-widget)

  The network widget is best used on machines with continuous uptime. You might even keep monitor@ running on your pi-hole.

#### **Reminders**  
  The **Reminders** widget allows you to set reminders for system chores, login/key change reminders, and other one-offs chirps.

  [github](./demo/docs/reminders.md) - [demo](https://monitorat.brege.org/#reminders-widget)

  Reminders are facilitated by [Apprise](https://github.com/caronc/apprise) (see [below](#notifications)).


### Privacy

The privacy mask helps share your setup online without exposing personal information. Those are just string replacements; add as many as you like.

```yaml
privacy:
  replacements:
    my-site.org: example.com
    my-hostname: masked-hostname
    ...
  mask_ips: true
```

Running
```bash
monitorat config
```
will print the runtime config with these masks applied.

### Alerts

Alerts are tied to system metrics, where you set a threshold and a message for each event.

<details>
<summary><b>Alerts</b> example configuration</summary>

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

### Notifications

The notifications system uses [Apprise](https://github.com/caronc/apprise) to notify through practically any service, via apprise URLs.

```yaml
notifications:
  apprise_urls:
    - "pover://abscdefghijklmnopqrstuvwxyz1234@4321zyxwvutsrqponmlkjihgfedcba"
    - "mailto://1234 5678 9a1b 0c1d@sent.com?user=main@fastmail.com&to=alias@sent.com"
    - # more apprise urls if needed...
```

---

## Contributors

See [installing from source](./docs/install.md) for initializing a development server and alternative deployment methods.

For all other development, see [**contributing**](./docs/contributing.md).

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)
