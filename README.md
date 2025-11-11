<img src="./docs/masthead.svg" alt="monitor@/monitorat masthead" height="200">

This file is **monitor@**'s README, which is the default document served in the web UI. Document rendering is but one widget available in monitor@.

Available widgets:
- [metrics](#metrics)
- [network](#network)
- [reminders](#reminders)
- [services](#services)
- [speedtest](#speedtest)
- [wiki](#wiki) (this file, maybe)

Widgets have a general, self-contained structure providing both API and UI are straightforward to create.

```
www/widgets/
└── my-sweet-widget
    ├── api.py
    ├── my-sweet-widget.html
    └── my-sweet-widget.js
```

You can also add your own documentation through the Wiki widget, which may help you or your loved ones figure out how your headless homelab or riceware works. This document and any others you add to your wiki will be rendered in[GitHub flavored markdown via [markdown-it](https://github.com/markdown-it/markdown-it).

But you want an actual monitor or dashboard.

Something like

![monitor screenshot](./docs/img/metrics.png)

You want to see [how hot your CPU got today](#metrics), or be alerted [when under high load](#alerts).

You'd like to keep a record and [graph your internet speed](#speedtest), to see how much your ISP is screwing you. Perhaps you just want a list of [all your reverse-proxied services](#services) as LAN-friendly bookmarks.

If any of these are of interest to you, read on.

<details>
<summary><b>Contents</b><br></summary>

[[toc]]

</details>

## Installation

Both installation methods assume you are using a configuration file at `~/.config/monitor@/config.yaml`.

### Pip (easier)
```bash
pip install monitorat
```

Then run with:
```bash
gunicorn monitorat.monitor:app --bind localhost:6161
```

#### Systemd service (pip)

Download the service file, replace `__user__` and `__group__` with your username and group, then
```bash
curl -o monitor@.service https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/systemd/monitor%40pip.service
sudo mv monitor@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@.service
```

### Installing from source

You can also clone **monitor@** in `/opt/monitor@/` (or anywhere else). This involves creating the correct virtual environment for your OS and installing dependencies.

Clone this repository
```bash
sudo apt install python3 python3-pip
sudo mkdir -p /opt/monitor@
sudo chown -R __user__:__group__ /opt/monitor@
cd /opt/monitor@
git clone https://github.com/brege/monitorat.git .
```

The typical virtualenv setup is
```bash
cd www
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate
```

monitor@ runs as a [gunicorn](https://gunicorn.org/) daemon. To run manually
```bash
source .venv/bin/activate
gunicorn --bind localhost:6161 monitor:app  # not monitorat.monitor:app
```

This process is exactly what you might do when developing new widgets.

#### Systemd service (source)

Update `systemd/monitor@source.service` replacing `__project__`, `__user__`, `__group__`, and `__port__`, then
```bash
sudo cp systemd/monitor@source.service /etc/systemd/system/monitor@.service
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@.service
```

## Web UI

Open `http://localhost:6161` or configure this through a reverse proxy.

### Configuration

These are the basic monitor@ settings for your system, assuming you want to put all icons, data and the config file in `~/.config/monitor@/` which is the default location.

```yaml
site:
  name: "@my-nas"
  title: "System Monitor @my-nas"
  base_url: "https://example.com/my-nas"

paths:
  data: "/home/user/.config/monitor@/data/"
  img: "/home/user/.config/monitor@/img/"
  favicon: "/home/user/.config/monitor@/img/favicon.ico"

# privacy: { ... }
# alerts: { ... }
# notifications: { ... }
# widgets: { ... }
```

### Widgets

**monitor@** is an extensible widget system. You can add any number of widgets to your dashboard, re-ordering them, and enable/disable any you don't need.

```yaml
widgets:
  enabled:
    - services
    - metrics
    - about        # type: wiki
    - # reminders  # disabled
    - README       # type: wiki
    - network
    - speedtest
```

Each widget can be configured in its own YAML block.

#### Services

![services screenshot](./docs/img/services.png)

The **Service Status** widget is a simple display to show what systemd service daemons, timers and docker containers are running or have failed.

```yaml
jellyfin:
  name: Jellyfin
  icon: jellyfin.png
  containers: [ "jellyfin" ]
  url: https://example.com/jellyfin/
  local: http://my-nas:8096/jellyfin

plex:
  name: Plex
  icon: plex.png  
  services: [plexmediaserver.service]
  url: https://plex.example.com
  local: http://my-nas:32400
```

<details>
<summary><b>Services</b> example from screenshot</summary>

```yaml
widgets:
  services:
    enabled: true
    items:
      jellyfin:
        name: Jellyfin
        icon: jellyfin.png
        containers: [ "jellyfin" ]
        url: "https://example.com/jellyfin/"
        local: "http://my-nas:8096/jellyfin"

      immich:
        name: Immich
        icon: immich.webp
        containers:
          [
            "immich_server",
            "immich_machine_learning",
            "immich_microservices",
            "immich_postgres",
            "immich_redis"
          ]
        url: "https://immich.example.com/"
        local: "http://my-nas:2283"

      syncthing:
        name: Syncthing
        icon: syncthing.png
        services: [ "syncthing@user.service" ]
        url: "https://example.com/syncthing"
        local: "http://my-nas:8384"
```

</details>


You can configure these to have both your URL (or WAN IP) and a local address (or LAN IP) for use offline. **monitor@ is completely encapsulated and works offline even when internet is down.**

#### Wiki

Some widgets you may want to use more than once. For two markdown documents ("wikis") to render in your monitor, use **`type: wiki`**. Using **`wiki: <title>`** may only be used once.

```yaml
widgets:
  about:
    type: wiki  
    name: "wiki@my-nas"
    enabled: true
    doc: "about.md"                          # relative to www/
  README:
    type: wiki
    name: "README"
    enabled: true
    collapsible: true
    hidden: false
    doc: "/opt/monitor@my-nas/README.md"     # absolute path
```

Then, you can change the order of widgets in the UI.

```yaml
widgets:
  enabled: 
    - network
    - speedtest
    - services
    - metrics
    - about
    - reminders
    - README
```

**monitor@ uses GitHub flavored markdown, and as such can be used as a README previewer.**

#### Metrics

Metrics provides an overview of system performance, including CPU, memory, disk and network usage, and temperature over time.  Data is logged to `metrics.csv`.

![metrics screenshot](./docs/img/metrics.png)


<details>
<summary><b>Metrics</b> example from screenshot</summary>

```yaml
metrics:
  name: System Metrics
  enabled: true
  default: chart  # table, none
  periods:
    - 30 days
    - 1 week
    - 24 hours
    - 6 hours
    - 1 hour
    # any number of periods 
  chart:
    default_metric: temp_c
    default_period: 6 hours
    height: 300px
    days: 30
  table:
    min: 5
    max: 20
```

</details>

#### Speedtests

The **Speedtest** widget allows you to keep a record of your internet performance over time.
It does not perform automated runs.

![speedtest screenshot](./docs/img/speedtest.png)

<details>
<summary><b>Speedtest</b> example from screenshot</summary>

```yaml
speedtest:
  name: Speedtests
  enabled: true
  periods: [1 year, 1 month, 1 week]
  default: chart  # table, none
  table:
    min: 5
    max: 100
  chart:
    default_period: 1 month
    height: 300px
    days: 30
```

</details>

#### Network

The **Network** widget may be the most specific. This example uses `ddclient`-style generated logs.

![network screenshot](./docs/img/network.png)

<details>
<summary><b>Network</b> example from screenshot</summary>

```yaml
network:
  name: Network Outages
  log_file: /var/lib/porkbun-ddns/porkbun.log
  enabled: true
  collapsible: true
  metrics:
    show: true
  uptime:
    show: true
    periods:
      - period: '1 hour'
        segment_size: '5 minutes'    # 12 pills
      - period: '6 hours'
        segment_size: '30 minutes'   # 12 pills
      - period: '1 day'
        segment_size: '2 hours'      # 12 pills
      - period: '1 week'
        segment_size: '1 day'        # 7 pills
      - period: '2 months'
        segment_size: '1 week'       # ~8 pills
  gaps:
    show: true
    max: 3
    cadence: 0
```

</details>

#### Reminders

![reminders screenshot](./docs/img/reminders.png) 

Example reminders (configure everything under `widgets.reminders`)

```yaml
nudges: [ 14, 7 ]      # days before expiry to send gentle reminders
urgents: [ 3, 1, 0 ]   # days before expiry to send urgent notifications  
time: "21:00"          # daily check time (24h format)
apprise_urls:
  - "pover://abscdefghijklmnopqrstuvwxyz1234@4321zyxwvutsrqponmlkjihgfedcba"
items:
  my reminder:
    name: My Reminder
    url: https://reminder.example.com
    icon: my-reminder.png
    reason: "A chore I'm supposed to do on a regular basis"
  # more reminders...
```

<details>
<summary><b>Reminders</b> example from screenshot</summary>

```yaml
widgets:
  reminders:
    nudges: [ 14, 7 ]      # days before expiry to send gentle reminders
    urgents: [ 3, 1, 0 ]   # days before expiry to send urgent notifications  
    time: "21:00"          # daily check time (24h format)
    apprise_urls:
      - "pover://abscdefghijklmnopqrstuvwxyz1234@4321zyxwvutsrqponmlkjihgfedcba"
      - "mailto://1234 5678 9a1b 0c1d@sent.com?user=main@fastmail.com&to=alias@sent.com"
    items:
      beets:
        name: "Beets"
        url: "https://beets.example.com"
        icon: beets.png
        expiry_days: 14
        reason: "Check music inbox for new arrivals to process with beets"
      github:
        name: "GitHub SSH Key"
        url: "https://github.com/login"
        icon: github.png
        expiry_days: 365
        reason: "Change your GitHub SSH key once a year"
      protonmail:   
        name: Proton Mail
        url: https://proton.me
        icon: protonmail.png
        expiry_days: 365
        reason: Login every 365 days
      google_mail:
        name: "Gmail Trashcan"
        url: "https://mail.google.com/"
        icon: gmail.png
        expiry_days: 3
        reason: |
          You use POP3 to forward gmail, but Google leaves a copy in its Trash can.
          Periodically clean it.
```

</details>

### Privacy

The privacy mask helps share your setup online without exposing personal information. Those are just string replacements; add as many as you like.

```yaml
privacy:
  replacements:
    my-site.org: example.com
    my-hostname: masked-hostname
    my-user: user
    # A: B such that A -> B
  mask_ips: true
```

When sharing your config, you can generate the full runtime configuration with 

```bash
source www/.venv/bin/activate && python www/monitor.py config
```

### Alerts

Alerts are tied to system metrics, where you set a threshold and a message for each event.

<details>
<summary><b>Alerts</b> example configuration</summary>

```yaml
alerts:
  cooldown_minutes: 60  # Short cooldown for testing
  rules:
    high_load:
      threshold: 2.5    # load average e.g., the '1.23' in 1.23 0.45 0.06
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

The notifications system uses [apprise](https://github.com/caronc/apprise) to notify through practically any service, via apprise URLs.

```yaml
notifications:
  apprise_urls:
    - "pover://abscdefghijklmnopqrstuvwxyz1234@4321zyxwvutsrqponmlkjihgfedcba"
    - "mailto://1234 5678 9a1b 0c1d@sent.com?user=main@fastmail.com&to=alias@sent.com"
    - # more apprise urls if needed...
```

---

## Contributors

### Developing widgets

See [installing from source](#installing-from-source) for initializing a development server.

### Project structure

```
├── README.md                   # this document
├── docs/img/                   # README screenshots
├── systemd
│   └── monitor@.service        # template systemd unit
└── www/
    ├── app.js                  # frontend javascript
    ├── config_default.yaml     # all preset values
    ├── index.html              # web UI
    ├── monitor.py              # backend gunicorn server
    ├── requirements.txt        # dependencies
    ├── scripts/                # development
    ├── shared/                 # javascript helpers for widgets
    ├── vendors/                # markdown-it
    └── widgets/                # widgets
```

### Important dependencies

The `vendors/` are for rendering and styling markdown documents (via [markdown-it](https://github.com/markdown-it/markdown-it)) like `README.md` in HTML. These libraries are automatically downloaded locally by `monitor.py` only once.

This project uses [confuse](https://confuse.readthedocs.io/en/latest/) for configuration management, 
and as such uses a common-sense config hierarchy. Parameters are set in `www/config_default.yaml` and may be overridden in `~/.config/monitor@/config.yaml`.

See [confuse's docs](http://confuse.readthedocs.io/en/latest/usage.html) and [source](https://github.com/beetbox/confuse) for a deeper reference.

### Code quality

```bash
pre-commit install
```

This will install [pre-commit](https://pre-commit.com/) hooks for linting and formatting for Python and JavaScript.

While JavaScript uses `standard` and Python uses `ruff` for formatting, YAML is done manually. The opinionated `yamlfix` is used via `scripts/yamlfixfix.py ~/.config/monitor@/config.yaml`.

See `requirements.txt` for dependencies.

### Adding widgets

Widgets follow the three-file structure shown at the top of this document: `api.py`, `widget.html`, and `widget.js` in `www/widgets/your-widget/`.

Register your widget in `www/monitor.py` and declare presets in `www/config_default.yaml`. PRs are always welcome.

### Roadmap

Top three priorities.

- provide `~/.config/monitor@/widgets/` for user-made widgets
- add a non-DDNS-based network logger for general users or those using Cloudflare or Tailscale
- API keys for widgets for aggregating specs from multiple instances monitor@machineA and monitor@machineB viewable in monitor@local, perhaps.

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)
