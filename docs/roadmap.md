# Roadmap

## Services
- [ ] [refactor] Extract the service modal into its own feature module (e.g., `services/features/modal.js`), leaving `snapshot.js` focused on card rendering.

## Reminders
- [ ] [style] Hover on reminder alerts shows the URL target.
- [ ] [feature] Clicking a reminder opens a modal first (no navigation); modal is the entry point for confirmation/completion.
- [ ] [longterm] Modal markdown editor for reminders; save and sync to configured `docs/reminders/` path for checklist editing.

## Speedtest
- [ ] [feature] Smooth demo ping data in `demo/setup.py` so the chart line is not jagged or unrealistic on mobile.  
  - /tmp/nshot/Screenshot-From-2026-01-08-21-11-41.png
- [ ] [style] Run button uses an speedodometer icon on a square button.
  - cite:[2]
  
## Metrics
- [ ] [longterm] Alerts module (like network outages) for recent metrics warnings (high temp/load) aligned with notifications.

## Wiki
- [ ] [longterm] Modal markdown editor for wiki widgets; cache edits, confirm save, and sync to configured docs path.
- [ ] [style] Federation demo wiki samples shorter or summary/detail for side-by-side readability.
- [ ] [longterm] Editor library evaluation and any required `vendors/` + `pyproject.toml` updates.

## Histories (metrics/speedtest/network)
- [ ] [style] Chart.js hover tooltip legend squares should be solid fill.
- [ ] [style] CSV button hover tooltip should read "Download CSV".

## Menu / Header
- [ ] [feature] "Remember settings" in menu modal: headers hidden (priority) and chart dropdowns; local storage overrides config.
- [ ] [style] Menu modal GitHub/release links behave like service card info buttons (no modal).
- [ ] [feature] Add the provided Wikipedia icon to the left of the monitor@demo header.  
  - /tmp/nshot/Screenshot-From-2026-01-08-21-16-55.png
  - cite:[1] for icon

## UI Copy / Units
- [ ] [style] Change "show less" to "show fewer".
- [ ] [style] Unit time labels use "hour"/"day" when unity; keep numerals for non-unity.
- [ ] [feature] Per-module subtitles (tiles/uptime/outages/history/etc) reuse the badge mechanic as the only style, instead of separate method.

## Performance / Load
- [ ] [refactor] Find the hamburger/menu lag source (possible blocking API call before paint).
- [ ] [refactor] Improve initial load order so the first widget renders promptly instead of a full-soup settle.

## Docker

- [ ] [longterm] Currently, the Docker build fails unless you set an absolute path for `vendors/`. Otherwise, it install vendors in the install directory (`/usr/local/lib/python3.11/site-packages/monitorat/vendors`)
  ```yaml 
  # compose.yml: /home/notroot/.config/monitorat:/config
  ---
  paths:
    data: data/
    img: img/
    vendors: /config/vendors/  # <-- problematic
    widgets: widgets/
  ```

[1]: 

<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="200px"
width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M80 368H16a16 16 0 0 0-16 16v64a16 16 0 0 0
16 16h64a16 16 0 0 0 16-16v-64a16 16 0 0 0-16-16zm0-320H16A16 16 0 0 0 0 64v64a16 16 0 0 0 16 16h64a16
16 0 0 0 16-16V64a16 16 0 0 0-16-16zm0 160H16a16 16 0 0 0-16 16v64a16 16 0 0 0 16 16h64a16 16 0 0 0
16-16v-64a16 16 0 0 0-16-16zm416 176H176a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h320a16 16 0 0 0 16-
16v-32a16 16 0 0 0-16-16zm0-320H176a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16V80a16
16 0 0 0-16-16zm0 160H176a16 16 0 0 0-16 16v32a16 16 0 0 0 16 16h320a16 16 0 0 0 16-16v-32a16 16 0 0
0-16-16z"></path></svg>

[2]:

<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 256 256" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M119.51,143.51l88-88a12,12,0,1,1,17,17l-88,88a12,12,0,1,1-17-17Zm14.23-43.2a12,12,0,1,0,2.62-23.85A75.15,75.15,0,0,0,128,76a76.08,76.08,0,0,0-76,76,12,12,0,0,0,24,0,52.06,52.06,0,0,1,52-52A54.75,54.75,0,0,1,133.74,100.31Zm101.54,7.5A12,12,0,0,0,213.09,117a92.47,92.47,0,0,1,2.58,63H40.34A92.23,92.23,0,0,1,128,60h.84a91.43,91.43,0,0,1,34.2,6.91,12,12,0,0,0,9.14-22.19A116.07,116.07,0,0,0,18.57,190.58,20.09,20.09,0,0,0,37.46,204H218.53a20.06,20.06,0,0,0,18.88-13.38,116.39,116.39,0,0,0-2.13-82.81Z"></path></svg>

