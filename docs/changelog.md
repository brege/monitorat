## Changelog


### 2026-01-12 -- [7f8d8c7..e2251c7](https://github.com/brege/monitorat/compare/7f8d8c7..e2251c7)

- Introduced tile-packing algorithm "Tyler" (see: `static/tiles/tyler.tex`)
- Desktop/mobile can click/tap the status indicator Dot in in compact Service view
- Fixed Docker installs from attempting to install vendors/ in the wheel
- BREAKING: Deprecated widget-headers for section-headers (see: e083da4)
- Add node-source filters for other widgets
- CSS Refactor Procedure:
  1. extract all common patterns from `widgets/*/index.html` into `common.css`
  2. extract all `<style>` tags from `widgets/*/index.html` into `widgets/*/style.css`
  3. remove widget-specific CSS from `default.css` in `widgets/*/style.css`
  4. marry `common.css` into `default.css`
- Switched from StandardJS to Biome linting and formatting (for CSS)
- Updated all code to Biome's standard rules (js, css)
- Made default color palette sharper, less pastel
- Repaired broken href's, leading to client bugs when behind Nginx reverse proxy
- Bumped version to v0.10.4

### 2026-01-11 --  [3143083..cae4a55](https://github.com/brege/monitorat/compare/3143083..cae4a55)

- Orthogonalize Federation demos from Layout specification
- Deprecate federation "stacked" and "columnated" mergers in favor of full integrations
- Added true columnation: group by widgets as tables when needed
- Added node-source filtering to the network.outages
- Created Layout demo for testing new columnation+positioning scheme

### 2026-01-10 -- [7643259..6d5ee72](https://github.com/brege/monitorat/compare/7643259..6d5ee72)

- Introduced modal Markdown editing (esperimental) via textarea
- Standardize Action buttons into new icon-label group (save, cancel, restore, run speedtest)
- Made chart legends much easier to read
- Trimmed the full-fat widgets from advanced demo, so it focuses only on: 
  - features
  - styling
  - components  
  of each widget
- Made app icons more expressive on hover
- Divided the main demo/docs.yml into demo-specifc index.yml's
- No longer differentiate widgets by stacking or columnated

### 2026-01-09 -- [2ee8b57..d400921](https://github.com/brege/monitorat/compare/2ee8b57..d400921)

- Add Roadmap
- Hover on reminder alerts shows the URL target
- Run button uses an speedometer icon
- Federation demo wiki samples shorter or summary/detail for side-by-side readability
- Chart.js hover tooltip legend squares should be solid fill
- CSV button hover tooltip should read "Download CSV"
- Change "show less" to "show fewer"
- Unit time labels use "hour"/"day" when unity; keep numerals for non-unity
- Added link-icon expansion for informational links/modals
- Added docs.py to pre-commit as insurance before pushing to prod demos
- Refactored header and menu code into central monitorat/static/header/
- Added TOC button to left of site header for easier navigation

### 2026-01-08 -- [15d51fe..7de663f](https://github.com/brege/monitorat/compare/15d51fe..7de663f)

- Overhauled chart legends and created two-legend scheme for federation
- Made ollama icon look better on both light and dark backgrounds
- Overhauled headers inside and outside Markdown containers
- Added Wikipedia chevrons to first-rate headers for easier collapsing
- Made all demo section headers collapsible
- Fixed ~50 typos and grammar errors in Markdown
- Make server shutdowns more graceful
- Bumped version to v0.10

### 2026-01-07 -- [d17e19c..ebd479f](https://github.com/brege/monitorat/compare/d17e19c..ebd479f)

- Made service status resolving more robust for Docker and Systemd
- Expanded schema for services widget to cover more status cases
- Added toggle for local vs. CDN external JS/CSS (needed for demo on production)
- Caught up scattered ghost colors and theme leakage in JS
- Added a formal.css theme for a LaTeX/Journal look
- Gave users a theming key in config.yaml so they can change or layer on top of the factory themes
- Added a new about modal with live theme switching
- Added a modal for long press on services cards/icons for more details
- Added an info icon for services cards/icons (desktop benefits too)
- Made markdown tables and TableManager tables gracefully overflow through scrolling in-body
- Made demo bind to 0.0.0.0 for easier mobile debugging on Fedora


### 2026-01-06 -- [c2d5013..78af0e6](https://github.com/brege/monitorat/compare/c2d5013..78af0e6)

- Added an installation guide for Docker
- Improved all installation-related documentation
- Modernized screenshots in README to reflect new capabilities like federation
- Bumped version to v0.9.3

### 2026-01-05 -- [b29068a..769b1b9](https://github.com/brege/monitorat/compare/b29068a..769b1b9)

- Added quick-link footers to demos for easier navigation
- Made test network data non-degenerate and non-trivial
- Improved error handling in test harness when documents can't resolve
- Condensed 40+ \*.md snippets into demo/docs.{yml,py}
- Fixed non-snippetted config loading being overridden by default values
- Renamed widgets/\*/config_default.yaml to widgets/\*/default.yaml and load them dynamically
- Bumped version to v0.9.2

### -- [b8bdb34..a95ab80](https://github.com/brege/monitorat/compare/b8bdb34..a95ab80)

- Added test harness to GitHub Actions to prevent publishing some mistakes to PyPI
- Added smoke test for demos to check for 200/404/503 etc responses
- Added a compact view for services, so it feels like an app drawer
- Added mermaid diagrams to vendors so users can make flowcharts
- Unified the old test/dev and demo runner under one demo/launcher.py
- Many small adjustments to demo snippets to make examples more interesting
- Debut a full demo stack showcasing:
  - simple: the standard one-node demo
  - advanced: a multi-node demo with federation
  - federation: a multi-node demo with federation

### 2026-01-01 -- [b402afa..406035e](https://github.com/brege/monitorat/compare/b402afa..406035e)

- Extracted three shared utilities to reduce federation bloat in widget code:
  - `FeatureVisibility.js` - centralizes show/hide logic for widget features
  - `FederationRenderer.js` - provides columnate/stack rendering patterns
  - `TileRenderer.js` - creates stats tiles with consistent structure
- Refactored network, metrics, and speedtest widgets to use new shared utilities
- Fixed config resolution for includes snippets
- Added bootstrap command so install -> demo is two commands
- Extended demo infrastructure for living documentation:
  - Created `demo/launcher.py` to start simple/advanced/federation demos
  - Created partitioned config structure: `demo/federation/central/`, `demo/federation/nas-1/`, `demo/federation/nas-2/`
  - Introduced snippet-based config assembly for pedagogical widget ordering
  - Created `docs/demo-architecture.md` with implementation checklist

### 2025-12-31 -- [c0ccc97..63f8097](https://github.com/brege/monitorat/compare/c0ccc97..63f8097)

- Completed federation support for all widgets with per-feature merge strategies
- Network widget now supports columnate, stack, and merge for tiles, uptime, and outages separately
- Fixed network tiles in columnation showing all 6 metrics in 2-wide layout
- Fixed uptime column headers showing both source badge and period label
- Fixed badge positioning issue (badges were floating to page corners)
- Added `show.controls` and `show.history` visibility toggles to speedtest widget
- Reorganized metrics and speedtest directory structure: chart.js + table.js grouped into history/ folder
- Metrics widget fully federalized with per-feature display strategies
- Added new test configurations for speedtest: controls-only and history-only variants

### 2025-12-30 -- [5b0f6d2..e9aaba9](https://github.com/brege/monitorat/compare/5b0f6d2..e9aaba9)

- Complete test apparatus implemented:
  - test/harness.py introduced 26 smoke tests to check basic asserts/API response
  - test/dev.py allowed launching multiple local instances of monitorat (since removed)
  - --widget [metrics|network|...] allows for launching only a simplified, one-widget page
  - Launches a head node and two "remote" nodes in one harness
- Fixed discovered DOM collisions from federation
- Added API-prefixes so clients, nodes can distinguish data on same widgets
- Bumped version to v0.8.1
- Renamed "gaps" CSS naming to "alerts"
- Added style switches to Wiki widget: seamless|featured|rail
- Serve service and reminder icons through API
- All widgets now have Schema
- All widget-specific configuration atomized into an includes' config snippets
- All widget client app.js chunked into features: {chart|table|snapshot|...}.js
- All widgets have decided-upon merging behaviors in federation; network widget still WIP
- Centralize data-downloaders (CSV, etc), table/chart/node filters in one standard container
- All widget federation tested with test/dev.py: merging, stacking, side-by-side, interleaving (since removed)

### 2025-12-29 -- [d8da266..af3b061](https://github.com/brege/monitorat/compare/d8da266..af3b061)

- Created new branch: federation
- Added experimental federation and auth support in the federation branch
- Created test fixtures and a test harness to launch multiple instances at once
- Extended demo/init.py to demo/setup.py that bootstraps -t tests and -d demos
- Packages added: httpx, Flask-HTTPAuth
- Began backfilling this changelog
- Bumped version to v0.8
- Removed documentation scripts--these are not appropriate for this project
- Added LTTB sampling to clamp data points at 1500 for faster rendering, data transfer

### 2025-12-28 -- [3a1c4eb..3d9a566](https://github.com/brege/monitorat/compare/3a1c4eb..3d9a566)

- Added an interactive demo mode and pushed to https://monitorat.brege.org
- Fixed incorrect colors in the network widget's stats
- Added support for nested markdown inclusions and shortcodes for {{file}} inclusion
- Reduced onboarding friction by adding 'monitorat server' instead of gunicorn command
- Condensed the README in favor of linking the interactive Demo

### 2025-12-27 -- [feccd25..47e3521](https://github.com/brege/monitorat/compare/feccd25..47e3521)

- Favor uv-installs over pip installs by default
- Systemd and GitHub-Actions workflows updated for uv tool installs

### 2025-11-23-- [19902ad..7b64821](https://github.com/brege/monitorat/compare/19902ad..7b64821)

- Standardized widget structure with common names: app.js, index.html, api.py, schema.json
- Fixed multiple issues with the Speedtest widget: 
  - Added a TimeSeries.js helper so temporal axes are consistent between widgets
  - Splitting responsibilities of charting and table formatting
  - Broken dropdowns and time-mismatches causing unstable UX on refresh
  - Made speedtest metadata declarative, removing duplicate code
- Refactored Metrics widget to use new time-series methods from Speedtest effort


### 2025-11-22 -- [8a39f1c..21aa74b](https://github.com/brege/monitorat/compare/8a39f1c..21aa74b)

- Added JSON schema for all chart-based widgets and refactored TS widgets to use their schema
- Made recording and measuring of metric quantities declarative, configurable by user
- Added a CSV handler so all widgets have predictable data handling

### 2025-11-20 -- [6d3c8c9..7b3609f](https://github.com/brege/monitorat/compare/6d3c8c9..7b3609f)

- Moved all www/ code to monitorat/ so application code has less hairy pip-installs to Wheel
- Added an Alerts module for use by Metrics widget and Reminders widget
- Made central monitor.py less monolithic and more orchestrative:
  - Created monitorat/cli.py to provide 'monitorat config|ls-widgets' commands
  - Extract config management (confuse+adapters) to central monitorat/config.py
- Centralized client-side code in monitorat/static/

### 2025-11-19 -- [feaafb5..2e11323](https://github.com/brege/monitorat/compare/feaafb5..2e11323)

- Fixed regression of multiple Wiki-widget support
- Added to Network widget a chirper to record activity, so users don't need ddclient+syslogs

### 2025-11-17

- Applied YAML formatting via opinionated linter package 'yamlfix' to config\_default.yaml
- Greatly improved new widget discovery to dynamically load user-defined widgets

---

### 2025-11-17 -- [908ff25..88f9474](https://github.com/brege/monitorat/compare/908ff25..88f9474)

- Changed custom widget path from var to list (confuse)
- Added support widget discovery

### 2025-11-16 -- [4ac4eb7..7e8f7e2](https://github.com/brege/monitorat/compare/4ac4eb7..7e8f7e2)

- Fix regression that allowed widget initialization in parallel
- Made factory widgets/* dynamically loadable
- Remove legacy sub-widget enabled key
- Remove duplicate listeners from reminders widget
- Introduce `wiki/api.py` and register services identical to others (multiple wikis)

### 2025-11-14 -- [25802e9..25802e9](https://github.com/brege/monitorat/compare/25802e9..25802e9)

- Added support molecular config snippets (e.g. one YAML per-widget)

### 2025-11-13 -- [0be2624..8fc9b31](https://github.com/brege/monitorat/compare/0be2624..8fc9b31)

- Bump version to v0.2
- Improve installation instructions for pip-source installs
- Added speedtest widget as a first-run default

### 2025-11-11 -- [01fd796..c5d4aca](https://github.com/brege/monitorat/compare/01fd796..c5d4aca)

- Release v0.1 and publish to PyPI
- Added a publish workflow for PyPI
- Added masthead

### 2025-11-10 -- [7448817..12a2488](https://github.com/brege/monitorat/compare/7448817..12a2488)

- Removed alpha code and outdated documentation
- De-duplicated Time Series methods from System Metrics and Speedtest widgets
- Improved Reminders widget's confuse implementation
- Added confuse's config dumping method
- Download-CSV consistency between System Metrics and Speedtest
- Restrict table's 'show X more' to table display only

### 2025-11-08 -- [42b353b..42b353b](https://github.com/brege/monitorat/compare/42b353b..42b353b)

- Updated network widget to use ddclient-style logs

### 2025-11-07 -- [703d197..a7423ad](https://github.com/brege/monitorat/compare/703d197..a7423ad)

- Restored cadence and threshold settings in Network widget
- Service detection for Docker, Systemd better scoped
- Improved configuration language (natural language times)
- Added backend logging
- Removed hardcoded fall backs: embrace confuse
- Debut System Metrics alerts

---

# TODO: finish backfilling changelog from git-changelog

---

### 2025-11-06 -- [e4ce686..8a8a753](https://github.com/brege/monitorat/compare/e4ce686..8a8a753)

* refactor(3): add logging to metrics widget
* refactor(2): add logging to monitor.py and reminders' api.py
* refactor(1): extract notification handler from reminders
* add key for default metric
* fix: period duration option for speedtest chart
* Merge linting setup
* update README
* chore: enforce basic code quality standards
* Merge branch 'devel'
* chore(yaml): code quality/linting
* feat: add duration default view option for charts
* feat: ghost raw data on spiky plots; add smooth avg
* refactor: centralize widget headers and de-dupe timestamp helpers

### 2025-11-05 -- [9e7759d..776ea43](https://github.com/brege/monitorat/compare/9e7759d..776ea43)

* chore: remove legacy config shims, console noise, and wrappers
* feat: add charts for system metrics
* extract data handling from speedtest widget
* enhance metrics widget o make historical CSV

### 2025-11-03 -- [c90cfcd..c90cfcd](https://github.com/brege/monitorat/compare/c90cfcd..c90cfcd)

* feat: add app reload for changes made in config.yaml

### 2025-11-02 -- [61fba0a..61fba0a](https://github.com/brege/monitorat/compare/61fba0a..61fba0a)

* fix: add Daylight Savings Time change handling

### 2025-11-01 -- [b852022..0eb8c8f](https://github.com/brege/monitorat/compare/b852022..0eb8c8f)

* favicon: add pipeline for new icon
* performance: fix dupe chart fetch and improve speedtest graph loading
* preformance: cache network pills so refresh doesn't repaint
* update README
* fix: provide api for ddns log, not using data/
* chore: linting for whitespac, unused vars, etc
* remove legacy pushover support
* feat: support general apprise urls
* fix broken notification handler

### 2025-10-31 -- [5aeeff0..5aeeff0](https://github.com/brege/monitorat/compare/5aeeff0..5aeeff0)

* fix: load widgets in parallel to improve performance

### 2025-10-30 -- [5d47fb1..880c46c](https://github.com/brege/monitorat/compare/5d47fb1..880c46c)

* fix: network widget hardcoded darks and edge cases
* fix(styles): light mode, add toggle, better svg
* docs: add README screenshots, with 'sample' text
* fix: click behavior and hover text on service widget boxes
* fix: run speedtest and cpu temps on old hw

### 2025-10-29 -- [8467262..2021ca7](https://github.com/brege/monitorat/compare/8467262..2021ca7)

* Merge branch 'speedtest-chart'
* refactor: extract speedtest api from monitor and improve its config
* feat: add a speedtest plotting method
* docs: update README, add screenshots, remove ddns log dummy
* fix: pushover level
* feat: improve network log ticker usefulness
* fix: move run speedtest button into section matter
* refactor: move pushover keys into reminders
* fix: widget api harness, revert non-.md anchors, widget ordering

### 2025-10-28 -- [747e82a..4b6c5eb](https://github.com/brege/monitorat/compare/747e82a..4b6c5eb)

* feat: allow collapsing widgets to anchored headers
* feat: support multiple of same widgets
* better confuse implementation

### 2025-10-27 -- [7bede9b..811390a](https://github.com/brege/monitorat/compare/7bede9b..811390a)

* wrong vendor error strikes again
* css makeover
* initial commit
