#!/bin/bash
set -e

if [ "$EUID" -eq 0 ]; then
   echo "Do not run this script as root. It will prompt for sudo when needed."
   exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
   echo "uv is required but was not found in PATH." >&2
   exit 1
fi

if ! uv tool list | grep -q "^monitorat[[:space:]]"; then
   echo "monitorat is not installed as a uv tool. Run: uv tool install monitorat" >&2
   exit 1
fi

echo "Installing monitorat systemd service for uv tool installation..."

echo "Removing old monitor@* service files..."
sudo rm -f /etc/systemd/system/monitor@*.service

curl -o monitor@.service https://raw.githubusercontent.com/brege/monitorat/refs/heads/main/systemd/monitor%40uv.service
sed -i "s|/home/__user__|$HOME|g; s/__user__/$USER/g; s/__group__/$(id -gn)/g" monitor@.service

echo "Moving service file to /etc/systemd/system/..."
sudo mv monitor@.service /etc/systemd/system/
sudo chown root:root /etc/systemd/system/monitor@.service
sudo chmod 644 /etc/systemd/system/monitor@.service

# Fix SELinux context on Fedora/RHEL
sudo restorecon -v /etc/systemd/system/monitor@.service 2>/dev/null || true

echo "Reloading systemd daemon..."
sudo systemctl daemon-reload

echo "Enabling and starting monitor@${HOSTNAME}.service..."
sudo systemctl enable --now "monitor@${HOSTNAME}.service"
sudo systemctl restart "monitor@${HOSTNAME}.service"

echo ""
echo "Service installed successfully!"
echo "Status:"
sudo systemctl status "monitor@${HOSTNAME}.service" --no-pager
echo ""
echo "Access monitorat at: http://localhost:6161"
