## Contributors

### Developing widgets

See [install.md](install.md) for initializing a development server and running an alternative deployment.

### Agentic Archetype

An external repository for a widget created by AI is provided. This widget displays the number of system packages installed on a Fedora Workstation.

https://github.com/brege/monitorat-widget-packages

The AI agent (codex) created this widget in 12 minutes from this exact context.

1. dropped in monitor@'s project directory
2. providing `prompt.md` with a description of the widget the user wants to create
3. configuring the agents with `AGENTS.md`

Full transparency logs are provided in `logs/`:

https://github.com/brege/monitorat-widget-packages/tree/main/logs

### User interface

Promise.
- responsive for mobile and desktop
- light and dark mode
- use of CSS variables for theming `var(--theme-...)`
- use of Firefox dev tools to measure performance 
  - [5aeeff0](https://github.com/brege/monitorat/commit/5aeeff0)
    [51557cc](https://github.com/brege/monitorat/commit/51557cc)
    [027631b](https://github.com/brege/monitorat/commit/027631b)
- no emojis (SVG icons encouraged)

### Project structure

```
├── README.md                   # project readme
├── docs/                       # supporting docs, README screenshots
├── systemd
│   ├── monitor@pip.service     # systemd unit for pip installations
│   └── monitor@source.service  # systemd unit for source installations
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

The `vendors/` are for plotting and especially rendering and styling markdown documents (via [markdown-it](https://github.com/markdown-it/markdown-it)) like `README.md` in HTML. These libraries are automatically downloaded locally by `monitor.py` only once.

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

Widgets follow the three-file structure shown at the top of this document: `api.py`, `widget.html`, and `widget.js` in `www/widgets/your-widget/`, or, users can drop custom widgets into the directory referenced by `paths.widgets` (default: `~/.config/monitor@/widgets/`) and reference them in `widgets.enabled`.

monitor@ will automatically load the matching backend `api.py` and its presets (a *local* `config_default.yaml`) and serve the widget's HTML/JS from that directory.

### Roadmap

Top three priorities:

- **network logger** add a non-DDNS-based network logger for general users or those using Cloudflare or Tailscale
- **federation** API keys for widgets for aggregating specs from multiple instances monitor@machineA and monitor@machineB viewable in monitor@local, perhaps.
