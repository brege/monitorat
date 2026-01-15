# Installing with Docker

## Setup

1. Copy and customize the compose file into your container path. Example:
```bash
mkdir -p ~/docker/monitorat  # CHANGE
cp compose.yml ~/docker/monitorat/compose.yml
```

2. Edit `compose.yml` with your values. The file comments show where to get each from the host:
   - User/group IDs: `id -u`, `id -g`
   - Docker group: `getent group docker | cut -d: -f3`
   - Messagebus group: `getent group messagebus | cut -d: -f3` (if non-standard)
   - Port and container name (for multiple instances on one host)

3. Build and run:
```bash
docker compose -f compose.yml up --build --detach
```

4. Access at `http://localhost:PORT` (default PORT=6161)

## Management

All configuration goes through `/config/config.yaml` on your host. You can use include snippets relative to `./config/` as well. See `demo/simple` for an example.

- **Config**: Edit the file, then restart:
  ```bash
  docker compose -f compose.yml restart monitorat
  ```

- **Logs**:
  ```bash
  docker compose -f compose.yml logs monitorat -f
  ```

- **Shutdown**:
  ```bash
  docker compose -f compose.yml down
  ```

Volume paths in `compose.yml` must exist on your host and be updated in the file before first run.
