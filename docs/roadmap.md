# Roadmap

## Services
- [x] [refactor] Extract the service modal into its own feature module (e.g., `services/features/modal.js`), leaving `snapshot.js` focused on card rendering.

## Reminders
- [x] [style] Hover on reminder alerts shows the URL target.
- [ ] [feature] Clicking a reminder opens a modal first (no navigation); modal is the entry point for confirmation/completion.
- [ ] [longterm] Modal markdown editor for reminders; save and sync to configured `docs/reminders/` path for checklist editing.
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
- [ ] [longterm] Modal markdown editor for wiki widgets; cache edits, confirm save, and sync to configured docs path.
- [x] [style] Federation demo wiki samples shorter or summary/detail for side-by-side readability.
- [ ] [longterm] Editor library evaluation and any required `vendors/` + `pyproject.toml` updates.

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
- [ ] [feature] Per-module subtitles (tiles/uptime/outages/history/etc) reuse the badge mechanic as the only style, instead of separate method.

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
    vendors: /config/vendors/  # <-- problematic
    widgets: widgets/
  ```

[1]: 

<svg stroke="currentColor" fill="none" stroke-width="2" viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M16 12H3"></path><path d="M16 18H3"></path><path d="M16 6H3"></path><path d="M21 12h.01"></path><path d="M21 18h.01"></path><path d="M21 6h.01"></path></svg>

[2]:

<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 256 256" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M119.51,143.51l88-88a12,12,0,1,1,17,17l-88,88a12,12,0,1,1-17-17Zm14.23-43.2a12,12,0,1,0,2.62-23.85A75.15,75.15,0,0,0,128,76a76.08,76.08,0,0,0-76,76,12,12,0,0,0,24,0,52.06,52.06,0,0,1,52-52A54.75,54.75,0,0,1,133.74,100.31Zm101.54,7.5A12,12,0,0,0,213.09,117a92.47,92.47,0,0,1,2.58,63H40.34A92.23,92.23,0,0,1,128,60h.84a91.43,91.43,0,0,1,34.2,6.91,12,12,0,0,0,9.14-22.19A116.07,116.07,0,0,0,18.57,190.58,20.09,20.09,0,0,0,37.46,204H218.53a20.06,20.06,0,0,0,18.88-13.38,116.39,116.39,0,0,0-2.13-82.81Z"></path></svg>

[3]:

<svg stroke="currentColor" fill="currentColor" stroke-width="0" viewBox="0 0 512 512" height="200px" width="200px" xmlns="http://www.w3.org/2000/svg"><path d="M256 464c22.779 0 41.411-18.719 41.411-41.6h-82.823c0 22.881 18.633 41.6 41.412 41.6zm134.589-124.8V224.8c0-63.44-44.516-117.518-103.53-131.041V79.2c0-17.682-13.457-31.2-31.059-31.2s-31.059 13.518-31.059 31.2v14.559c-59.015 13.523-103.53 67.601-103.53 131.041v114.4L80 380.8v20.8h352v-20.8l-41.411-41.6z"></path></svg>
