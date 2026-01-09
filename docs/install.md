## Installation

### Installing with uv

See: [README](../README.md#installation).

I like uv because it's fast.

<details>
<summary>Click to see uv-install -> usable Web UI in &lt; 3s</summary>

```
$ uv tool uninstall monitorat
$ uv cache clean

$ time (uv tool install monitorat && monitorat demo --background && firefox http://localhost:6100)
Resolved 30 packages in 621ms
      Built monitorat @ file:///home/user/code/apps/monitor@
Prepared 30 packages in 1.11s
Installed 30 packages in 18ms
 + anyio==4.12.1
 + apprise==1.9.6
 + blinker==1.9.0
 + certifi==2026.1.4
 + charset-normalizer==3.4.4
 + click==8.3.1
 + confuse==2.1.0
 + flask==3.1.2
 + flask-httpauth==4.8.0
 + gunicorn==23.0.0
 + h11==0.16.0
 + httpcore==1.0.9
 + httpx==0.28.1
 + idna==3.11
 + itsdangerous==2.2.0
 + jinja2==3.1.6
 + markdown==3.10
 + markupsafe==3.0.3
 + monitorat==0.9.2 (from file:///home/user/code/apps/monitor@)
 + oauthlib==3.3.1
 + packaging==25.0
 + psutil==7.2.1
 + pytimeparse==1.1.8
 + pyyaml==6.0.3
 + requests==2.32.5
 + requests-oauthlib==2.0.0
 + schedule==1.2.2
 + speedtest-cli==2.1.3
 + urllib3==2.6.2
 + werkzeug==3.1.4
Installed 1 executable: monitorat
Demo mode: generating demo data
  Generated /home/user/.local/share/uv/tools/monitorat/lib/python3.14/site-packages/monitorat/demo/simple/data/network.log (1008 entries)
  Generated /home/user/.local/share/uv/tools/monitorat/lib/python3.14/site-packages/monitorat/demo/simple/data/speedtest.csv (32 rows)
Done
Starting demo servers...
  simple: started (PID 1395934)

Waiting for servers to be ready...
  simple: ready

============================================================
monitorat Demo Servers
============================================================
  simple       [HEAD]  http://localhost:6100

Servers running in background.
Use 'monitorat demo --stop' to stop.
============================================================

real	0m2.792s
user	0m0.997s
sys     0m0.533s
```

</details>

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

One-command installation:

```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-pip.sh)
```

The script uses sudo internally to install the systemd unit for Pip installations to `/etc/systemd/system/monitor@.service`. It detects your `user`, `group`, and `hostname`.

To review the script before running:
- **Local**: [`../scripts/install-systemd-pip.sh`](../scripts/install-systemd-pip.sh)
- **GitHub**: [https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh](https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh)

### Deploying to /opt

You can also deploy monitorat directly to `/opt/monitorat/` or elsewhere without the extra packaging. This is useful for thinner deployments or when you want direct access to edit files.

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
