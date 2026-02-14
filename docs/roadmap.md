# Roadmap

## Features

Editors/UI Configuration
- Network: log\_file path, enable chirper, pips and ranges
  - Status: **Wait.** There are other finer network widget features to add:
    1. click on a pill for finer details for that datetime range
    2. syncronize events log with this datetime range

## Backend / API

- Add a thin request-scoped resolver. `flask.g.widget_config` set by a shared decorator (/api/<widget_name>/...)
  - This issue is related to the fact you cannot federate a local monitorat instance with a remote without spinning up a *second* local monitorat instance as a data-collection instance.

  If all monitorat instances were instead running in a two-flask model by default, then any unit could federate with any other unit from any head node. 
  This way, the special code in each widget becomes the normal code, where interleaving with a null instance, in singleton scenarios, becomes equivalent to the unfederated cases (like a multiplicative identity).
  - Status: **Needs Refactoring.** Make as a goal for a major release change.
