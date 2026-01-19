## Contributors

### Developing widgets

See [install/source.md](./install/source.md) for initializing a development server and running an alternative deployment.

### Agentic Archetype

An external repository for a widget created by AI is provided. This widget displays the number of system packages installed on a Fedora Workstation ([github.com/brege/monitorat-widget-packages](https://github.com/brege/monitorat-widget-packages)).

The AI agent (codex-5.2) created this widget in 12 minutes from this exact context.

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

The `vendors/` are for plotting and especially rendering and styling markdown documents (via [markdown-it](https://github.com/markdown-it/markdown-it)) like `README.md` in HTML. These libraries are automatically downloaded locally by `monitor.py` only once. You can disable the local download to use the CDN's permanently too (to save my bandwidth, the public-facing demos at [monitorat.brege.org](https://monitorat.brege.org/) use the CDN configuration).

This project uses [confuse](https://confuse.readthedocs.io/en/latest/) for configuration management, which boasts a common-sense config hierarchy. Parameters are set in `monitorat/config_default.yaml` and may be overridden in `~/.config/monitorat/config.yaml`.

See `pyproject.toml` for dependencies.

### Code quality

#### Config files and parameter presets

>[!IMPORTANT]
>**Do NOT use fallbacks for user-configurable values in the code.** If a parameter is user-facing, it must go in `config_default.yaml` (or `default.yaml` for your widget) and **NOT** have an initialized value in the code. See [confuse's docs](http://confuse.readthedocs.io/en/latest/usage.html) and [source](https://github.com/beetbox/confuse) for a deeper reference.

#### Schema

For repetitive, non-user-facing parameters, please create a `schema.json` for your widget.

#### Linting and formatting

```bash
pre-commit install
```

This will install [pre-commit](https://pre-commit.com/) hooks for linting and formatting via [**biome**](https://biomejs.dev/) (JS/CSS/JSON) and [**ruff**](https://github.com/astral-sh/ruff) (Python).

### Adding widgets

Structure:

```
~/.config/monitorat/widgets/
└── my-widget
    ├── api.py              # backend and routing
    ├── default.yaml        # preset user-configurable parameters
    ├── schema.json         # repetitive parameters
    ├── index.html          # main layout
    ├── style.css           # only widget-specifc CSS
    ├── features/*.js       # (optional) if using app.js as an index/orchestrator of <features>.js
    └── app.js              # main client-side JS
```

Monitorat will automatically load the matching backend `api.py` and its presets (a *local* `default.yaml`) and serve the widget's HTML/JS from that directory.

### CSS and JS rules: a constant battle

There are three CSS scopes:

1. app/site wide CSS (buttons, typography, theme: `default.css`)
2. component-specific CSS (header/menu, tiles, charts, etc.: `tiles/tiles.css`)
3. widget-specific CSS (pips, modals, etc.: `my-widget/style.css`)

Do not use `default.css` as a catch-all and do not create redundant styling in `styles.css` that `default.css` already supplies. Once a feature becomes common to multiple widgets, extract it into either a component or make it site-wide.

The `formal.css` theme assumes the `default.css` theme loads first. All theming is relative to `default.css`. Users can deposit themes in their XDG-Config-Home's `themes/` directory.

All JS functions the same way.

See `tree monitorat/static/` and `tree --gitignore monitorat/widgets/` to illustrate this structure.
