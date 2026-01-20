# Roadmap

## Features

New Subwidget Capabilities
- [ ] Add an alerts subwidget for System Metrics events (alternative to Apprise)
- [ ] Conversely, add Apprise notifications for Network alerts

Editors and Web UI Configuration
- [ ] System Metrics: Customizing tiles and custom commands
- [ ] Network: log\_file path, enable chirper, pips and ranges

Sugar
- [ ] Add KaTex support for math (probably use `$`, `$$` notation like Hugo)
- [ ] Add GitHub-style admonitions ([!NOTE], [!IMPORTANT])

## Onboarding

- [ ] Deploy Layout and Editor demos to `prod`
- [ ] Create Docker image for a faster, bandwidth-saving, and friendlier deployment

## Backend / API

- [ ] Add a thin request-scoped resolver.. `flask.g.widget_config` set by a shared decorator (/api/<widget_name>/...)
