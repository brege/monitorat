## Editor Demo

This is the **editor demo** for monitorat. Any widget that can be edited or configured through the UI can be edited here.

### How to Edit

Use the widget affordances:

- Wiki: hover the wiki header and click the pencil-paper icon
- Reminders: click the header `...` to add a reminder, or hover a card and
  click its corner `...` to edit it
- Services: click the header `...` to add a service, or hover a card and click
  its corner `...` to open the info modal, then use the wrench to edit
- Metrics: click the `...` in the snapshot header to configure snapshot tiles

### Features

- Temporary edits are auto-saved to localStorage
- Live preview with markdown-it in the editor modal
- Saved documents are version controlled (last 10 saves stored in `.versions/`)
- All UI configuration changes are saved directly to the base YAML files

### Markdown Editor

- **Edit**: Write markdown in the textarea (wiki) or edit the fields and settings
- **Preview**: Click the Preview/Editor header to preview document
- **Save**: Click Save to persist changes

### Card Editors

- **Add**: Click the header `...` action to add a new display card for
  - System Metrics
  - Services
  - Reminders
- **Edit**: Use the card `...` action or modal wrench for widget items
- **Save**: Click Save to persist changes

### Caveats

- **Histories**: Charts and Tables, in addition to their display quantities and dropdowns, are only editable through YAML
- **Notifications**: Apprise URLs for the notification harness are also YAML-only (used by multiple widgets)
