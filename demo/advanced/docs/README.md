## Overview

- Simple demo: [https://monitorat.brege.org/](https://monitorat.brege.org/)
- Federation demo: [https://monitorat.brege.org/federation](https://monitorat.brege.org/federation)

This demo focuses on per-widget configuration patterns and feature toggles for a single server. Each widget example is paired with the exact snippet used to render it, so you can lift the config directly.

## Feature Toggling

Most widgets support `show` config to display specific features:

```yaml
show:
  tiles: true
  history: false
```

This pattern applies to metrics, speedtest, and network widgets.

## Sections

<table>
  <!-- using an HTML table in case of href's spamming the source doc -->
  <tr>
    <td><b>wiki</b></td>
    <td>rail mode</td>
    <td>featured</td>
    <td>seamless</td>
  </tr>
  <tr>
    <td><b>metrics</b></td>
    <td>tiles</td>
    <td>history</td>
    <td></td>
  </tr>
  <tr>
    <td><b>services</b></td>
    <td>compact</td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><b>reminders</b></td>
    <td></td>
    <td></td>
    <td></td>
  </tr>
  <tr>
    <td><b>speedtest</b></td>
    <td>full</td>
    <td>controls only</td>
    <td>history only</td>
  </tr>
  <tr>
    <td><b>network</b></td>
    <td>tiles only</td>    
    <td>uptime only</td>
    <td>outages only</td>
  </tr>
</table>

Widget order matches the simple and federation demos.
