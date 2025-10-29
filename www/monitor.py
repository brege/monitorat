#!/usr/bin/env python3
from flask import Flask, send_from_directory, jsonify, request
from subprocess import run, PIPE, TimeoutExpired
from pathlib import Path
from json import loads
from urllib.request import urlretrieve
import yaml
import importlib
import confuse

app = Flask(__name__)
BASE = Path(__file__).parent.parent
WWW = BASE / "www"
VENDORS = WWW / "vendors"
config = confuse.Configuration('monitor@', __name__)
# Add project config.yaml if it exists (higher priority than defaults)
project_config = BASE / "config.yaml"
if project_config.exists():
    config.set_file(project_config)
PACKS_DIR = BASE / "packs"
SPEEDTEST = "/usr/bin/speedtest-cli"

def get_data_path():
    data_dir = config['paths']['data'].get(str)
    if data_dir.startswith('/'):
        return Path(data_dir)
    else:
        return BASE / data_dir

def get_csv_path():
    return get_data_path() / "speedtest.csv"

VENDOR_URLS = {
    "github-markdown.min.css": "https://cdn.jsdelivr.net/npm/github-markdown-css@5.6.1/github-markdown.min.css",
    "markdown-it.min.js": "https://cdn.jsdelivr.net/npm/markdown-it/dist/markdown-it.min.js",
    "markdown-it-anchor.min.js": "https://cdn.jsdelivr.net/npm/markdown-it-anchor@9/dist/markdownItAnchor.umd.min.js",
    "markdown-it-toc-done-right.min.js": "https://cdn.jsdelivr.net/npm/markdown-it-toc-done-right@4/dist/markdownItTocDoneRight.umd.min.js",
}

def ensure_vendors():
    VENDORS.mkdir(exist_ok=True)
    for filename, url in VENDOR_URLS.items():
        filepath = VENDORS / filename
        if not filepath.exists():
            print(f"Downloading {filename}...")
            urlretrieve(url, filepath)
            print(f"Downloaded {filename}")

ensure_vendors()

def load_config():
    return config

@app.route("/")
def index():
    return send_from_directory(WWW, "index.html")

@app.route("/data/<path:filename>")
def data_files(filename):
    data_dir = config['paths']['data'].get(str)
    if data_dir.startswith('/'):
        # Absolute path
        return send_from_directory(data_dir, filename)
    else:
        # Relative to BASE
        return send_from_directory(BASE / data_dir, filename)

@app.route("/about.md")
def about():
    return send_from_directory(BASE, "about.md")

@app.route("/README.md")
def readme():
    return send_from_directory(BASE, "README.md")

@app.route("/api/wiki/doc")
def wiki_doc():
    from flask import request, jsonify
    
    try:
        widget_name = request.args.get('widget', 'wiki')
        
        widget_config = config['widgets'][widget_name].get(dict)
        doc_path = widget_config.get('doc')
        
        if not doc_path:
            return send_from_directory(BASE, "README.md")
        
        doc_file = Path(doc_path)
        return send_from_directory(doc_file.parent, doc_file.name)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/api/speedtest/run", methods=["POST"])
def speedtest_run():
    csv_path = get_csv_path()
    if not csv_path.exists():
        csv_path.write_text("timestamp,download,upload,ping,server\n")

    try:
        proc = run([SPEEDTEST, "--json"], stdout=PIPE, stderr=PIPE, text=True, timeout=100)
    except TimeoutExpired:
        return jsonify(success=False, error="Speedtest timed out after 100 seconds"), 500

    if proc.returncode:
        return jsonify(success=False, error=proc.stderr.strip() or "speedtest-cli failed"), 500

    data = proc.stdout.strip()
    if data:
        try:
            parsed = loads(data)
            line = "{},{},{},{},{}\n".format(
                parsed["timestamp"],
                parsed["download"],
                parsed["upload"],
                parsed["ping"],
                parsed["server"]["sponsor"].replace(",", " ")
            )
            with csv_path.open("a") as f:
                f.write(line)
            return jsonify(
                success=True,
                timestamp=parsed["timestamp"],
                download=parsed["download"],
                upload=parsed["upload"],
                ping=parsed["ping"],
                server=parsed["server"].get("sponsor")
            )
        except Exception as e:
            return jsonify(success=False, error=str(e)), 500

    return jsonify(success=False, error="No data returned"), 500


@app.route("/api/speedtest/history", methods=["GET"])
def speedtest_history():
    limit = request.args.get("limit", default=200, type=int)
    limit = max(1, min(limit or 200, 1000))

    csv_path = get_csv_path()
    if not csv_path.exists():
        return jsonify(entries=[])

    try:
        with csv_path.open("r") as f:
            lines = [line.strip() for line in f.readlines()[1:] if line.strip()]

        recent = lines[-limit:]
        entries = []
        for row in reversed(recent):
            parts = row.split(",", 4)
            if len(parts) < 5:
                continue
            timestamp, download, upload, ping, server = parts
            entries.append({
                "timestamp": timestamp,
                "download": download,
                "upload": upload,
                "ping": ping,
                "server": server
            })

        return jsonify(entries=entries)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/api/config", methods=["GET"])
def api_config():
    try:
        return jsonify(dict(config.get()))
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/api/services", methods=["GET"])
def api_services():
    try:
        services = config['services'].get(dict)
        return jsonify({"services": services})
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/api/services/status", methods=["GET"])
def api_services_status():
    try:
        services_module = importlib.import_module('widgets.services.api')
        if hasattr(services_module, 'get_service_status'):
            status = services_module.get_service_status()
        else:
            status = {}
        return jsonify(status)
    except Exception as exc:
        return jsonify(error=str(exc)), 500


@app.route("/favicon.ico")
def favicon():
    favicon_path = config['paths']['favicon'].get(str)
    if favicon_path.startswith('/'):
        # Absolute path
        return send_from_directory(Path(favicon_path).parent, Path(favicon_path).name)
    else:
        # Relative to WWW
        return send_from_directory(WWW, favicon_path)

@app.route("/img/<path:filename>")
def img_files(filename):
    img_dir = config['paths']['img'].get(str)
    if img_dir.startswith('/'):
        # Absolute path
        return send_from_directory(img_dir, filename)
    else:
        # Relative to WWW
        return send_from_directory(WWW / img_dir, filename)

@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(WWW, filename)

# Register widget API routes
try:
    import importlib
    
    # Register metrics widget routes
    metrics_module = importlib.import_module('widgets.metrics.api')
    if hasattr(metrics_module, 'register_routes'):
        metrics_module.register_routes(app)
        print("Loaded metrics widget API")
        
    # Register reminders widget routes  
    reminders_module = importlib.import_module('widgets.reminders.api')
    if hasattr(reminders_module, 'register_routes'):
        reminders_module.register_routes(app)
        print("Loaded reminders widget API")
        
        # Start notification daemon for reminders
        if hasattr(reminders_module, 'start_notification_daemon'):
            reminders_module.start_notification_daemon()
            print("Started reminders notification daemon")
            
except Exception as e:
    print(f"Error loading widget APIs: {e}")

if __name__ == "__main__":
    app.run()
def load_services_pack():
    services_dir = PACKS_DIR / "services"
    manifest = services_dir / "services.yaml"
    if not manifest.exists():
        return {}
    try:
        with manifest.open("r") as f:
            data = yaml.safe_load(f) or {}
            if isinstance(data, dict):
                return data.get("services", {})
    except Exception as exc:
        print(f"Failed to load services pack: {exc}")
    return {}
