# Installing from Source

Install the package from source if you're developing widgets or want to deploy to a specific location like. 

This guide assumes `/opt/monitorat` as the target installation path.

## Local Development Install

Clone the repo:
```bash
git clone https://github.com/brege/monitorat.git
cd monitorat
```

### With uv

```bash
uv tool install -e .
```

### With Pip

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

Then run the server:
```bash
monitorat -c path/to/config.yaml server --host 0.0.0.0 --port 6161
```

---

## Deploying to /opt

You can also deploy monitorat directly to `/opt/monitorat/` or elsewhere without the extra packaging. This is useful for thinner deployments or when you want direct access to edit files.

### Setup

Clone the repo to `/opt`:
```bash
sudo apt install python3 python3-pip
sudo mkdir -p /opt/monitorat
sudo chown -R __user__:__group__ /opt/monitorat
cd /opt/monitorat
git clone https://github.com/brege/monitorat.git .
```

### Running with uv

Install dependencies and run the server:
```bash
cd /opt/monitorat
uv tool install -e .
monitorat -c config.yaml server --host 0.0.0.0 --port 6161
```

### Running with Pip

Install dependencies:
```bash
cd /opt/monitorat
python3 -m venv .venv
source .venv/bin/activate
pip install .
deactivate
```

Run the server:
```bash
source /opt/monitorat/.venv/bin/activate
monitorat -c config.yaml server --host 0.0.0.0 --port 6161
```

### Daemonizing with Systemd

Update `systemd/monitor@source.service` with your values:
- `__project__`: path to monitorat directory
- `__user__`: your username
- `__group__`: your group
- `__port__`: port to bind to

Then install:
```bash
sudo cp systemd/monitor@source.service /etc/systemd/system/monitor@.service
sudo systemctl daemon-reload
sudo systemctl enable --now monitor@.service
```
