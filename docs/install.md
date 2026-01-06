## Installation

### Installing with uv

See: [README](../README.md#installation).

### Installing with Docker

See: [Docker](docker.md) for running monitorat in a Docker container.

### Installing with Pip

#### **PyPI**
```bash
pip install monitorat
```

#### Local Install
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
pip install .
```

Then run with:
```bash
monitorat -c config.yaml server --host 0.0.0.0 --port 6161
```

#### Systemd service (pip)

One command install:

```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-pip.sh)
```

The script uses sudo internally to install the systemd unit for Pip installations to `/etc/systemd/system/monitor@.service`. It detects your `user`, `group`, and `hostname`.

To review the script before running:
- **Local**: [`../scripts/install-systemd-pip.sh`](../scripts/install-systemd-pip.sh)
- **GitHub**: [https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh](https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh)

### Deploying to /opt

You can also deploy monitorat directly to `/opt/monitorat/` or elsewhere without the extra packaging. This is useful for thinner developments or when you want direct access to edit files.

Clone the repo:
```bash
sudo apt install python3 python3-pip
sudo mkdir -p /opt/monitorat
sudo chown -R __user__:__group__ /opt/monitorat
cd /opt/monitorat
git clone https://github.com/brege/monitorat.git .
```

#### Pip

Install dependencies:
```bash
cd monitorat
python3 -m venv .venv
source .venv/bin/activate
pip install .
deactivate
```

Run the server:
```bash
source .venv/bin/activate
monitorat -c config.yaml server --host 0.0.0.0 --port 6161
```

#### uv

Install dependencies and run the server:
```bash
cd /opt
git clone https://github.com/brege/monitorat.git monitorat && cd monitorat
uv tool install -e .
monitorat -c config.yaml server --host 0.0.0.0 --port 6161
```

#### Systemd service for /opt installs 

Update `systemd/monitor@source.service` replacing `__project__`, `__user__`, `__group__`, and `__port__`, then:
```bash
sudo cp systemd/monitor@source.service /etc/systemd/system/monitor@.service
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@.service
```
