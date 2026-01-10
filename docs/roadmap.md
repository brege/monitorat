# Roadmap

## Services
- [x] [refactor] Extract the service modal into its own feature module (e.g., `services/features/modal.js`), leaving `snapshot.js` focused on card rendering.

## Reminders
- [x] [style] Hover on reminder alerts shows the URL target.
- [ ] [feature] Clicking a reminder opens a modal first (no navigation); modal is the entry point for confirmation/completion.
- [ ] [longterm] Modal markdown editor for reminders; save and sync to configured `docs/reminders/` path for checklist editing.
  - **New thought**: provide user a pre-formed config snippet archetype. Store a YAML, not a Markdown file.
- [x] ~~[style] Add bell icon to the "Test Notification" button.
  - cite:[3]~~

## Speedtest
- [ ] [feature] Smooth demo ping data in `demo/setup.py` so the chart line is not jagged or unrealistic on mobile.  
  - /tmp/nshot/Screenshot-From-2026-01-08-21-11-41.png
- [x] [style] Run button uses an speedometer icon on a square button.
  - cite:[2]
  
## Metrics
- [ ] [longterm] Alerts module (like network outages) for recent metrics warnings (high temp/load) aligned with notifications.

## Wiki
- [x] [longterm] Modal markdown editor for wiki widgets; cache edits, confirm save, and sync to configured docs path.
- [x] [style] Federation demo wiki samples shorter or summary/detail for side-by-side readability.
- [x] [longterm] Editor library evaluation and any required `vendors/` + `pyproject.toml` updates.

## Histories (metrics/speedtest/network)
- [x] [style] Chart.js hover tooltip legend squares should be solid fill.
- [x] [style] CSV button hover tooltip should read "Download CSV".

## Menu / Header
- [x] [feature] "Remember expansions" in menu modal: headers hidden (priority) and chart dropdowns; local storage overrides config.
- [x] [style] Menu modal GitHub/release links behave like service card info buttons (no modal).
- [x] [feature] Add the provided Wikipedia icon to the left of the monitor@demo header.  
  - /tmp/nshot/Screenshot-From-2026-01-08-21-16-55.png
  - cite:[1] for icon
- [x] [refactor] Extract the header and main menu code (not modal) into static/header/{index.js,style.css}

## UI Copy / Units
- [x] [style] Change "show less" to "show fewer".
- [x] [style] Unit time labels use "hour"/"day" when unity; keep numerals for non-unity.
- [ ] [feature] Per-module subtitles (tiles/uptime/outages/history/etc) to now reuse the badge mechanic as the only style, instead of separate method.

## Performance / Load
- [x] [refactor] Find the hamburger/menu lag source (possible blocking API call before paint).
- [x] [refactor] Improve initial load order so the first widget renders promptly instead of a full-soup settle.

## Docker

- [ ] [longterm] Currently, the Docker build fails unless you set an absolute path for `vendors/`. Otherwise, it install vendors in the install directory (`/usr/local/lib/python3.11/site-packages/monitorat/vendors`)
  ```yaml 
  # compose.yml: /home/notroot/.config/monitorat:/config
  ---
  paths:
    data: data/
    img: img/
    vendors: /config/vendors/  # <-- problematic, make relative like others
    widgets: widgets/
  ```

