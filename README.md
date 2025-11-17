<img src="./docs/img/masthead.svg" alt="monitor@/monitorat masthead that shows the french IPA phonetics and the tagline 'a system for observing and documenting status' and an icon with a monitor and superimposed at-character" width="100%">

This file is **monitor@**'s README, which is the default document served in the web UI. Document rendering is but one widget available in monitor@.

Available widgets:
- [metrics](#metrics)
- [network](#network)
- [reminders](#reminders)
- [services](#services)
- [speedtest](#speedtests)
- [wiki](#wiki) (this file, maybe)

Widgets have a general, self-contained structure where both API and UI are straightforward to create.

```
~/.config/monitor@/widgets/
└── my-sweet-widget
    ├── api.py
    ├── my-sweet-widget.html
    └── my-sweet-widget.js
```

You can also add your own documentation through the Wiki widget, which may help you or your loved ones figure out how your headless homelab or riceware works. This document and any others you add to your wiki will be rendered in GitHub flavored markdown via [markdown-it](https://github.com/markdown-it/markdown-it).

But you want an actual monitor or dashboard.

Something like

![monitor screenshot](./docs/img/screenshots/metrics.png)

You want to see [how hot your CPU got today](#metrics), or be alerted [when under high load](#alerts).

You'd like to keep a record and [graph your internet speed](#speedtest), to see how much your ISP is screwing you. Perhaps you just want a list of [all your reverse-proxied services](#services) as LAN-friendly bookmarks.

If any of these are of interest to you, read on.

## Installation

Both installation methods assume you are using a configuration file at `~/.config/monitor@/config.yaml`.

### Installing with Pip

The simplest way is to install from PyPI.
```bash
pip install monitorat
```

Or install the package from source:
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
pip install .
```

In either case, start the development server:
```bash
gunicorn monitorat.monitor:app --bind localhost:6161
```

#### Systemd service (pip)

Assuming you'd like to run monitor@ as a systemd service with your normal user, group, and hostname:
```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-pip.sh)
```
The script uses sudo internally to install the systemd unit for pip installations to `/etc/systemd/system/monitor@.service`.

### Alternative installations

See [alternate installs](docs/install.md) to install `monitor@/www` => `/opt/monitor@` other deployments.

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
  vendors: "/home/user/.config/monitor@/vendors/"
  widgets: "/home/user/.config/monitor@/widgets/"

# privacy: { ... }
# alerts: { ... }
# notifications: { ... }
# widgets: { ... }
```

### Widgets

**monitor@** is an extensible widget system. You can add any number of widgets to your dashboard, re-order them, and enable/disable any you don't need. You can add more widgets from others in `~/.config/monitor@/widgets/`.

```yaml
widgets:
  enabled:
    - services
    - metrics
    - about            # type: wiki
    - # reminders      # disables this widget
    - README           # type: wiki
    - network
    - speedtest
    - my-sweet-widget  # in ~/.config/monitor@/widgets
```

Each widget can be configured in its own YAML block. To configure a widget in its own file,
```yaml
include: "/home/user/.config/monitor@/widgets/my-sweet-widget.yaml"
```

#### Services

![services screenshot](./docs/img/screenshots/services.png)

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

Some widgets you may want to use more than once. For two markdown documents ("wikis"), use **`type: wiki`**. **`wiki: <title>`** may only be used once.

```yaml
widgets:
  about:
    type: wiki  
    name: "wiki@my-nas"
    doc: "about.md"  # relative to www/
  README:
    type: wiki
    name: "README"
    collapsible: true
    hidden: false
    doc: "/opt/monitor@my-nas/README.md"  # absolute path
```

Changing widget order or enabling/disabling widgets is rather straightforward.

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

![metrics screenshot](./docs/img/screenshots/metrics.png)


<details>
<summary><b>Metrics</b> example from screenshot</summary>

```yaml
metrics:
  name: System Metrics
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

![speedtest screenshot](./docs/img/screenshots/speedtest.png)

<details>
<summary><b>Speedtest</b> example from screenshot</summary>

```yaml
speedtest:
  name: Speedtests
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

![network screenshot](./docs/img/screenshots/network.png)

<details>
<summary><b>Network</b> example from screenshot</summary>

```yaml
network:
  name: Network Outages
  log_file: /var/lib/porkbun-ddns/porkbun.log
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

The network widget is best used on machines with continuous uptime. You might even keep monitor@ running on your pi-hole.

#### Reminders

![reminders screenshot](./docs/img/screenshots/reminders.png) 

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

See [installing from source](./docs/install.md) for initializing a development server and alternative deployment methods.

For all other development, see [**contributing**](./docs/contributing.md).

## License

[GPLv3](https://www.gnu.org/licenses/gpl-3.0.en.html)
