# Installing from PyPI

Both `pip` and `uv` can install monitorat from [PyPI](https://pypi.org/project/monitorat/). This is the simplest path if you're not modifying the source code. If you are building an widget with an Agent, you will want to use a [source install](source.md) method and ready your agent in the project root.

## Quick Start with uv

I like [uv](https://github.com/astral-sh/uv):
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv tool install monitorat
monitorat demo  # --mode [simple|advanced|federation|editor|layout]
```
Then open a browser at http://localhost:6100.

To try the demo modes on [monitorat.brege.org](https://monitorat.brege.org):
- [simple](https://monitorat.brege.org/)
- [advanced](https://monitorat.brege.org/advanced)
- [federation](https://monitorat.brege.org/federation)

### Running the Server

Start the server with your config:
```bash
monitorat -c ~/.config/monitorat/config.yaml server --host 0.0.0.0 --port 6161
```

### Daemonizing with Systemd (uv)

To run monitorat as a systemd service with your normal user, group, and hostname:
```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-uv.sh)
```

This pulls the script from [scripts/install-systemd-uv.sh](../../scripts/install-systemd-uv.sh), using sudo internally to install the systemd unit to `/etc/systemd/system/monitor@.service`.

---

## Installing with Pip

The simplest way:
```bash
pip install monitorat
monitorat demo # --mode [simple|advanced|federation|editor|layout]
```

### Running the Server

```bash
monitorat -c ~/.config/monitorat/config.yaml server --host 0.0.0.0 --port 6161
```

### Daemonizing with Systemd (pip)

One-command installation:
```bash
bash <(curl -s https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/scripts/install-systemd-pip.sh)
```

The script uses sudo internally to install the systemd unit to `/etc/systemd/system/monitor@.service`. It detects your `user`, `group`, and `hostname`.

To review the script before running:
- **Local**: [`../../scripts/install-systemd-pip.sh`](../../scripts/install-systemd-pip.sh)
- **GitHub**: [https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh](https://github.com/brege/monitorat/blob/main/scripts/install-systemd-pip.sh)

---

## Configuration

Both the pip and uv installation methods assume you're using a configuration file at `~/.config/monitorat/config.yaml`.

Monitorat will resolve your config file either at the destination given by `-c|--config`, or the default location `~/.config/monitorat/config.yaml`.
