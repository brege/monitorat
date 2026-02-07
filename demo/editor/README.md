## Editor Demo

This is the **editor demo** for monitorat. Any widget that can be edited or configured through the UI can be edited here.

### How to Edit

Click the pencil icon next to or on any wiki or card, or create a new entry with "Add Widget item" button, to open the editor.

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

- **Add**: Click the "Add Widget Item" button to add a new display card for
  - System Metrics
  - Services
  - Reminders
- **Edit**: Click the pencil icon to edit a display card
- **Save**: Click Save to persist changes

### Caveats

- **Histories**: Charts and Tables, in addition to their display quantities and dropdowns, are only editable through YAML
- **Notifications**: Apprise URLs for the notification harness are also YAML-only (used by multiple widgets)

