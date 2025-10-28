<details open>
<summary>Toggle boilerplate documentation</summary>

This file, `README.md`, is rendered in the UI and supports full markdown formatting.

<details>
<summary>Contents<br></summary>

[[toc]]

</details>

## Setup

```
├── config.example.yaml         # configuration
├── README.md                   # this document, rendered in index.html
├── systemd
│   └── monitor@.service        # gunicorn systemd template service
└── www/
    ├── app.js                  # frontend javascript
    ├── index.html              # web UI
    ├── monitor.py              # backend gunicorn/flask web server
    ├── requirements.txt        # flask, gunicorn
    ├── vendors/*.{js,css}      # markdown rendering (auto-downloaded)
    └── widgets/                # widget libraries
```

The `vendors/` are for rendering `README.md` and `index.html`. These libraries are for markdown rendering and are automatically downloaded locally by `monitor.py` only once.

### Web server

The backend is [gunicorn](https://gunicorn.org/). Setup:
```bash
cd www
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Run manually:
```bash
gunicorn --bind localhost:6161 monitor:app
```
The systemd unit file runs in this virtual environment. If running multiple instances,
you should adjust the port to avoid conflicts (e.g., `--bind localhost:6162`).

### Systemd service

Update `systemd/monitor@.service` with your paths and user, then:
```bash
sudo cp systemd/monitor@.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@INSTANCE.service
```

Replace `INSTANCE` with your identifier (e.g., `monitor@myhost.service`).

</details>
