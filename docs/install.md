## Installation

Both installation methods assume you are using a configuration file at `~/.config/monitor@/config.yaml`.

### Installing with uv

Install the package from PyPI:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install monitorat
```

Or install the package from source:
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
uv tool install .
```

To run the development server with gunicorn, install into a venv:
```bash
uv venv .venv
source .venv/bin/activate
uv pip install monitorat
gunicorn monitorat.monitor:app --bind localhost:6161
```

To run as a production server, use Systemd.

#### Systemd service (uv)

One command install:

```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-uv.sh)
```

The script uses sudo internally to install the systemd unit for uv tool installations to `/etc/systemd/system/monitor@.service`. It detects your `user`, `group`, and `hostname`. Fedora Workstation can be tricky because of SELinux.

To review the script before running:
- [`../scripts/install-systemd-uv.sh`](../scripts/install-systemd-uv.sh) (local)
- [View on GitHub](https://github.com/brege/monitorat/blob/main/scripts/install-systemd-uv.sh)

Or download and run manually:
```bash
curl -O https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-uv.sh
bash install-systemd-uv.sh
```

> [!NOTE]
> With **uv**, the systemd install works for both uv-pypi and uv-source installations.

### Installing with pip

Install from PyPI:
```bash
pip install monitorat
```

Or install the package from source:
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
pip install .
```

Then run with:
```bash
gunicorn monitorat.monitor:app --bind localhost:6161
```

#### Systemd service (pip)

One command install:

```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-pip.sh)
```

### Alternative: Deploy monitorat/ directly

You can also deploy the `monitorat/` directory directly to `/opt/monitor@/` or elsewhere without packaging. This is useful for development or when you want direct access to edit files.

Clone this repository:
```bash
sudo apt install python3 python3-pip
sudo mkdir -p /opt/monitor@
sudo chown -R __user__:__group__ /opt/monitor@
cd /opt/monitor@
git clone https://github.com/brege/monitorat.git .
```

Install dependencies:
```bash
cd monitorat
python3 -m venv .venv
source .venv/bin/activate
pip install .
deactivate
```

Run manually:
```bash
source .venv/bin/activate
gunicorn --bind localhost:6161 monitor:app  # not monitorat.monitor:app
```

#### Systemd service (source)

Update `systemd/monitor@source.service` replacing `__project__`, `__user__`, `__group__`, and `__port__`, then:
```bash
sudo cp systemd/monitor@source.service /etc/systemd/system/monitor@.service
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@.service
```
