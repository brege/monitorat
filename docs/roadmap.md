# Roadmap

## Reminders
- [ ] [feature] Clicking a reminder opens a modal first (no navigation); modal is the entry point for confirmation/completion.
- [ ] [editor] Modal markdown editor for reminders; save and sync to configured `docs/reminders/` path for checklist editing.
  - **New thought**: provide user a pre-formed config snippet archetype. Store a YAML, not a Markdown file.
  
## Metrics
- [ ] [feature] Alerts module (like network outages) for recent metrics warnings (high temp/load) aligned with notifications.

## Docker
- [ ] [build] Currently, the Docker build fails unless you set an absolute path for `vendors/`. Otherwise, it install vendors in the install directory (`/usr/local/lib/python3.11/site-packages/monitorat/vendors`)
  ```yaml 
  # compose.yml: /home/notroot/.config/monitorat:/config
  ---
  paths:
    data: data/
    img: img/
    vendors: /config/vendors/  # <-- problematic, make relative like others
    widgets: widgets/
  ```

