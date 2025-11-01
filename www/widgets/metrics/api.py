#!/usr/bin/env python3

import json
import os
import psutil
from datetime import datetime

def get_uptime():
    """Get system uptime as formatted string"""
    try:
        with open('/proc/uptime', 'r') as f:
            uptime_seconds = float(f.read().split()[0])
        
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)
        
        if days > 0:
            return f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            return f"{hours}h {minutes}m"
        else:
            return f"{minutes}m"
    except Exception:
        return "Unknown"

def get_load_average():
    """Get 1min, 5min, 15min load averages"""
    try:
        return list(os.getloadavg())
    except Exception:
        return [0.0, 0.0, 0.0]

def get_metric_status(metric_type, value, **kwargs):
    """Determine status (ok/caution/critical) for a metric"""
    if metric_type == 'load':
        # Use 1-minute load average normalized by CPU count
        cpu_count = psutil.cpu_count()
        normalized_load = value / cpu_count if cpu_count > 0 else value
        if normalized_load <= 1.0:
            return 'ok'
        elif normalized_load <= 2.0:
            return 'caution'
        else:
            return 'critical'
    
    elif metric_type == 'memory':
        # Memory percentage
        if value <= 75:
            return 'ok'
        elif value <= 90:
            return 'caution'
        else:
            return 'critical'
    
    elif metric_type == 'temp':
        # Temperature in Celsius
        if value <= 60:
            return 'ok'
        elif value <= 80:
            return 'caution'
        else:
            return 'critical'
    
    elif metric_type == 'disk':
        # Disk usage percentage
        if value <= 80:
            return 'ok'
        elif value <= 95:
            return 'caution'
        else:
            return 'critical'
    
    elif metric_type == 'storage':
        # Storage usage percentage  
        if value <= 85:
            return 'ok'
        elif value <= 95:
            return 'caution'
        else:
            return 'critical'
    
    return 'ok'

def get_system_metrics():
    """Get all system metrics and their statuses"""
    try:
        # Get basic metrics
        uptime = get_uptime()
        load = get_load_average()
        load_str = f"{load[0]:.2f} {load[1]:.2f} {load[2]:.2f}"
        
        # Memory info
        memory = psutil.virtual_memory()
        memory_str = f"{memory.used / (1024**3):.1f}GB / {memory.total / (1024**3):.1f}GB"
        
        # Temperature
        try:
            sensors = psutil.sensors_temperatures()
            temp = 0
            if 'coretemp' in sensors:
                temps = [s.current for s in sensors['coretemp']]
                temp = max(temps) if temps else 0
            elif 'cpu_thermal' in sensors:
                temp = sensors['cpu_thermal'][0].current
            elif 'k10temp' in sensors:
                temps = [s.current for s in sensors['k10temp']]
                temp = max(temps) if temps else 0
            else:
                # fallback: first available sensor group with plausible temps
                for entries in sensors.values():
                    for s in entries:
                        if 10 < s.current < 120:
                            temp = s.current
                            break
                    if temp:
                        break

            temp_str = f"{temp:.1f}°C"
        except Exception:
            temp = 0
            temp_str = "Unknown"

        # Disk usage
        disk = psutil.disk_usage('/')
        disk_str = f"{disk.used / (1024**3):.1f}GB / {disk.total / (1024**3):.1f}GB ({disk.percent:.0f}%)"
        
        # NFS storage (check first available mount point)
        storage_paths = ['', '', '', '']
        storage_found = False
        for path in storage_paths:
            try:
                if os.path.exists(path):
                    storage = psutil.disk_usage(path)
                    storage_str = f"{storage.used / (1024**4):.1f}TB / {storage.total / (1024**4):.1f}TB ({storage.percent:.0f}%)"
                    storage_found = True
                    break
            except Exception:
                continue
        
        if not storage_found:
            storage_str = "Not mounted"
            storage = type('obj', (object,), {'percent': 0})()
        
        metrics = {
            'uptime': uptime,
            'load': load_str,
            'memory': memory_str,
            'temp': temp_str,
            'disk': disk_str,
            'storage': storage_str,
            'status': 'Running',
            'lastUpdated': datetime.now().isoformat()
        }
        
        statuses = {
            'load': get_metric_status('load', load[0]),
            'memory': get_metric_status('memory', memory.percent),
            'temp': get_metric_status('temp', temp),
            'disk': get_metric_status('disk', disk.percent),
            'storage': get_metric_status('storage', storage.percent)
        }
        
        return metrics, statuses
        
    except Exception as e:
        print(f"Error getting system metrics: {e}")
        return {}, {}

def register_routes(app):
    """Register metrics API routes with Flask app"""
    
    @app.route("/api/metrics", methods=["GET"])
    def api_metrics():
        metrics, statuses = get_system_metrics()
        return app.response_class(
            response=json.dumps({
                'metrics': metrics,
                'metric_statuses': statuses
            }),
            status=200,
            mimetype='application/json'
        )
