## Changelog

### 2026-01-07

- Made service status resolving more robust for Docker and Systemd
- Expanded schema for services widget to cover more status cases
- Added toggle for local vs. CDN external JS/CSS (needed for demo on production)
- Caught up scattered ghost colors and theme leakage in JS

### 2026-01-06

- Added an installation guide for Docker
- Improved all installation-related documentation
- Bumped version to v0.9.3

### 2026-01-05

- Added quick-link footers to demos for easier navigation
- Made test network data non-degenerate and non-trivial
- Improved error handling in test harness when documents can't resolve
- Condensed 40+ \*.md snippets into demo/docs.{yml,py}
- Fixed non-snippetted config loading being overridden be defaults
- Renamed widgets/\*/config_default.yaml to widgets/\*/default.yaml and load them dynamically
- Bumped version to v0.9.2

### 2026-01-04

- Added test harness to GitHub Actions to prevent publishing some mistakes to PyPI
- Added smoke test for demos to check for 200/404/503 etc responses
- Added a compact view for services, so it feels like an app drawer
- Added mermaid diagrams to vendors so users can make flowcharts
- Unified the old test/dev and demo runner under one demo/launcher.py
- Many small adjustments to demo snippets to make examples more interesting
- Debut a fule demo stack showcasing:
  - simple: the standard one-node demo
  - advanced: a multi-node demo with federation
  - federation: a multi-node demo with federation

### 2026-01-01

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

### 2025-12-31

- Completed federation support for all widgets with per-feature merge strategies
- Network widget now supports columnate, stack, and merge for tiles, uptime, and outages separately
- Fixed network tiles in columnation showing all 6 metrics in 2-wide layout
- Fixed uptime column headers showing both source badge and period label
- Fixed badge positioning issue (badges were floating to page corners)
- Added `show.controls` and `show.history` visibility toggles to speedtest widget
- Reorganized metrics and speedtest directory structure: chart.js + table.js grouped into history/ folder
- Metrics widget fully federalized with per-feature display strategies
- Added new test configurations for speedtest: controls-only and history-only variants

### 2025-12-30

- Complete test apparatus implemented:
  - test/harness.py introduced 26 smoke tests to check basic asserts/API response
  - test/dev.py allowed launching multiple local instances of monitorat (since removed)
  - --widget [metrics|network|...] allows for launching only a simplified, one-widget page
  - Launces a head node and two "remote" nodes in one harness
- Fixed discovered DOM collisions from federation
- Added API-prefixes so clients, nodes can distinguish data on same widgets
- Bumped version to v0.8.1
- Renamed "gaps" CSS naming to "alerts"
- Added style switches to Wiki widget: seamless|featured|rail
- Serve services, reminders icons through API
- All widgets now have Schema
- All widget-specific configuration atomized into an includes' config snippets
- All widget client app.js chunked into features: {chart|table|snapshot|...}.js
- All widgets have decided-upon merging behaviors in federation; network widget still WIP
- Centralize data-downloaders (CSV, etc), table/chart/node filters in one standard container
- All widget federation tested with test/dev.py: merging, stacking, side-by-side, interleaving (since removed)

### 2025-12-29

- Created new branch: federation
- Added experimental federation and auth support in the federation branch
- Created test fixtures and a test harness to launch multiple instances at once
- Extended demo/inti.py to demo/setup.py that bootstraps -t test's and -d demo's
- Packages added: httpx, Flask-HTTPAuth
- Began backfilling this changelog
- Bumped version to v0.8
- Removed documentation scripts--these are not appropriate for this project
- Added LTTB sampling to clamp data points at 1500 for faster rendering, data transfer

### 2025-12-28

- Added an interactive demo mode and pushed to https://monitorat.brege.org
- Fixed incorrect colors in the network widget's stata
- Added support for nested markdown inclusions and shortcodes for {{file}} inclusion
- Reduced onboarding friction by adding 'monitorat server' instead of gunicorn command
- Condensed the README in favor of linking the interactive Demo

### 2025-12-27

- Favor uv-installs over pip installs by default
- Systemd and GitHub-Actions workflows updated for uv tool installs

### 2025-11-23

- Standardized widget structure with common mames: app.js, index.html, api.py, schema.json
- Fixed multiple issues with the Speedtest widget: 
  - Added a TimeSeries.js helper so temporal axes are consistent between widgets
  - Splitting responsibilities of charting and table formatting
  - Broken dropdowns and time-mismatches causing unstable UX on refresh
  - Made speedtest metadata declarative, removing duplicate code
- Refactor Metrics widget to use new time-series methods from Speedtest effort


### 2025-11-22

- Added JSON schema for all chart-based widgets and refactoring TS widgets to use their schema
- Make recording and measuring of metric quantities declarative, configurable by user
- Added a CSV handler so all widgets have predictable data handling

### 2025-11-20

- Moved all www/ code to monitorat/ so application code has less hairy pip-installs to Wheel
- Added an Alerts module for use by Metrics widget and Reminders widget
- Made central monitor.py less monolithic and more orchestrative:
  - Created monitorat/cli.py to provide 'monitorat config|ls-widgets' commands
  - Extract config management (confuse+adapters) to central monitorat/config.py
- Centralized client-side code in monitorat/static/

### 2025-11-19

- Fixed regression of multiple Wiki-widget support
- Added to Network widget a chirper to record activity, so users don't need ddclient+syslogs

### 2025-11-17

- Applied YAML formatting via opinionated linter package 'yamlfix' to config\_default.yaml
- Greatly improved new widget discovery to dynamically load user-defined widgets

---

> [!IMPORTANT]
> Everything below is generated by a `git-changelog` script using only the commit one-line messages.

```bash
git-changelog --before 2025-11-17 -P -d 3
```

### 2025-11-17 -- [908ff25..88f9474](https://github.com/brege/monitorat/compare/908ff25..88f9474)

* bump version to v0.3
* feat: change custom widget path from var to list
* docs: update developer docs, bump roadmap
* docs: update for new widget discovery copability
* feat: add support for user-defined widget locations

### 2025-11-16 -- [4ac4eb7..7e8f7e2](https://github.com/brege/monitorat/compare/4ac4eb7..7e8f7e2)

* fix: restore widget initialization in parallel
* feat: complete dynamic widget architecture refactor
* chore: remove legacy sub-widget enabled key
* chore: remove duplicate listeners from reminders widget
* chore: introduce wiki/api.py; register services identical to others
* chore: drop blueprint for speedtest widget

### 2025-11-15 -- [bdd1337..4977194](https://github.com/brege/monitorat/compare/bdd1337..4977194)

* docs: update performance refs with new hashes
* docs: extracted technical content into dedicated pages

### 2025-11-14 -- [25802e9..25802e9](https://github.com/brege/monitorat/compare/25802e9..25802e9)

* feat: support non-overriding configs (e.g. one YAML per-widget)

### 2025-11-13 -- [0be2624..8fc9b31](https://github.com/brege/monitorat/compare/0be2624..8fc9b31)

* docs(contrib): fix commit hashes and anchors in README
* bump version to v0.2
* docs: update installation instructions for pip-source installs
* feat: add speedtest widget as a default on first run
* docs: add UX section to readme.contributors
* chore(scripts): svg-to-png.sh A.svg B.ico enhanced

### 2025-11-12 -- [edf0bbe..edf0bbe](https://github.com/brege/monitorat/compare/edf0bbe..edf0bbe)

* fix: systemd installation on Fedora

### 2025-11-11 -- [01fd796..c5d4aca](https://github.com/brege/monitorat/compare/01fd796..c5d4aca)

* fix: typos and README errata
* add pypi publish workflow
* v0.1 initial release
* chore: improve alt text for masthead
* release: prepare for pypi
* feat: make sending only www/ a lightweight deployment alternative
* update README

### 2025-11-10 -- [7448817..12a2488](https://github.com/brege/monitorat/compare/7448817..12a2488)

* update README
* unwatermarked screenshots
* chore: remove orphaned code from early developement
* refactor: de-dupe temporal methods from metrics and speedtest
* refactor(3/3): remove hardcoded duplicates from metrics code
* refactor(2): better confuse implementation for reminders
* refactor(1): better align bootstrapper and entry-point with confuse
* fix: remove hardcoded wqleftover chart maximums
* feat: add confuse's config dumping method
* fix: download CSV consistency in metrics and speedtest
* refactor: centralize CSV downlaod logic
* fix: restrict table's 'show X more' to table display only
* refactor: remove top-level widgets.X bypasses

### 2025-11-08 -- [42b353b..42b353b](https://github.com/brege/monitorat/compare/42b353b..42b353b)

* chore: update network widget to use ddclient-style logs

### 2025-11-07 -- [703d197..a7423ad](https://github.com/brege/monitorat/compare/703d197..a7423ad)

* merge 'confuse' chores and subsequent fixes
* fix: restore cadence/threshold settings in network widget
* fix: use gaps.max directly in network config
* fix: don't call docker unconditionally
* chore: finish python logging
* chore: remove hardcoded fallbacks and embrace confuse
* merge: network widget for natural language periods
* feat: replace the hardcoded network pillswith user-defined
* fix: old routing of ddns log updated
* fix: default config and default period handling
* feat: support natural, dynamic time periods
* refactor: centralize favicon and yaml fix scripts
* feat(4): debut system metrics alerts

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


