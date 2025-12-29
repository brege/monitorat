### Demo

From the repository root:
```bash
python3 demo/init.py
uv tool install -e .
monitorat -c demo/config.yaml server --port 6161
```

This demo dashboard shows the live layout and the exact widget configuration used for each section. Each widget note block is rendered by the wiki widget to keep the documentation close to the UI it describes.

#### Contents
- [Metrics](#metrics-widget)
- [Network](#network-widget)
- [Services](#services-widget)
- [Speedtest](#speedtest-widget)
- [Reminders](#reminders-widget)

For the full project README and source, see:
[https://github.com/brege/monitorat](https://github.com/brege/monitorat)

#### Config

<details>
<summary><b>Show config</b></summary>

{{ include:code path="config.yaml" lang="yaml" }}
</details>
