# Roadmap

## Features

- [ ] Add reminders modal for completion confirmation
- [ ] Add Wiki widget's Markdown editor to reminders modal and provide a YAML archetype
- [ ] Add an alerts subwidget for System Metrics events (alternative to Apprise)

## Onboarding

- [ ] Deploy Layout and Editor demos to `prod`
- [ ] Create Docker image for a faster, bandwidth-saving, and friendlier deployment

## Backend / API

- [ ] Add a thin request-scoped resolver.. `flask.g.widget_config` set by a shared decorator (/api/<widget_name>/...)
