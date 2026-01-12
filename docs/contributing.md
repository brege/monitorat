## Contributors

### Developing widgets

See [install.md](install.md) for initializing a development server and running an alternative deployment.

### Agentic Archetype

An external repository for a widget created by AI is provided. This widget displays the number of system packages installed on a Fedora Workstation.

https://github.com/brege/monitorat-widget-packages

The AI agent (codex) created this widget in 12 minutes from this exact context.

1. dropped in monitorat's project directory
2. providing `prompt.md` with a description of the widget the user wants to create
3. configuring the agents with `AGENTS.md`

Full transparency logs are provided in `logs/`:

https://github.com/brege/monitorat-widget-packages/tree/main/logs

### User interface

Promise.
- responsive for mobile and desktop
- light and dark mode
- use of CSS variables for theming `var(--theme-...)`
- use of Firefox DevTools to measure performance
  - [5aeeff0](https://github.com/brege/monitorat/commit/5aeeff0)
    [51557cc](https://github.com/brege/monitorat/commit/51557cc)
    [027631b](https://github.com/brege/monitorat/commit/027631b)
- no emojis (SVG icons encouraged)

### Important dependencies

The `vendors/` are for plotting and especially rendering and styling markdown documents (via [markdown-it](https://github.com/markdown-it/markdown-it)) like `README.md` in HTML. These libraries are automatically downloaded locally by `monitor.py` only once.

This project uses [confuse](https://confuse.readthedocs.io/en/latest/) for configuration management,
and as such uses a common-sense config hierarchy. Parameters are set in `monitorat/config_default.yaml` and may be overridden in `~/.config/monitorat/config.yaml`.

See [confuse's docs](http://confuse.readthedocs.io/en/latest/usage.html) and [source](https://github.com/beetbox/confuse) for a deeper reference.

### Code quality

```bash
pre-commit install
```

This will install [pre-commit](https://pre-commit.com/) hooks for linting and formatting via [**biome**](https://biomejs.dev/) (JS/CSS/JSON) and [**ruff**](https://github.com/astral-sh/ruff) (Python).

See `pyproject.toml` for dependencies.

### Adding widgets

Widgets follow the three-file structure shown at the top of this document: `api.py`, `widget.html`, and `widget.js` in `monitorat/widgets/your-widget/`, or, users can drop custom widgets into the directory referenced by `paths.widgets` (default: `~/.config/monitorat/widgets/`) and reference them in `widgets.enabled`.

Monitorat will automatically load the matching backend `api.py` and its presets (a *local* `default.yaml`) and serve the widget's HTML/JS from that directory.
