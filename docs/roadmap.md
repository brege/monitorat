# Roadmap

## Features

Editors and Web UI Configuration
- [x] System Metrics: Customizing tiles
- [x] ~~System Metrics: Customizing commands for tiles~~
  - **Decision:** Do not work on this now. Want metrics capability to grow, not fragment to user
    factions, in this early hour. Intentional debt.
- [ ] Network: log\_file path, enable chirper, pips and ranges

Sugar
- [ ] Add KaTex support for math (probably use `$`, `$$` notation like Hugo)
- [ ] Add GitHub-style admonitions ([!NOTE], [!IMPORTANT])

## Onboarding

- [ ] Deploy Layout and Editor demos to `prod`
- [ ] Create Docker image for a faster, bandwidth-saving, and friendlier deployment

## Backend / API

- [ ] Add a thin request-scoped resolver.. `flask.g.widget_config` set by a shared decorator (/api/<widget_name>/...)
