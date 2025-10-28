#!/usr/bin/env python3

import json
import subprocess
import yaml
from pathlib import Path
import sys
sys.path.append(str(Path(__file__).parent.parent))
from monitor import config

BASE = Path(__file__).parent.parent.parent.parent

def get_docker_status():
    """Get status of Docker containers"""
    container_statuses = {}
    
    try:
        result = subprocess.run(
            ['/usr/bin/docker', 'ps', '-a', '--format', '{{.Names}}\t{{.State}}'], 
            capture_output=True, text=True, timeout=10
        )
        
        if result.returncode == 0:
            for line in result.stdout.strip().split('\n'):
                if '\t' in line:
                    name, state = line.split('\t', 1)
                    container_statuses[name] = 'ok' if 'running' in state.lower() else 'down'
        
    except Exception as e:
        print(f"Docker command exception: {e}")
    
    return container_statuses

def get_systemd_status():
    """Get status of systemd services and timers"""
    service_statuses = {}
    
    # Load config to get dynamic service/timer lists
    try:
        services_config = {"services": config['services'].get(dict)}
        
        # Collect all unique services and timers from YAML
        all_services = set()
        all_timers = set()
        
        for service_key, service_info in services_config['services'].items():
            if 'services' in service_info:
                all_services.update(service_info['services'])
            
            if 'timers' in service_info:
                all_timers.update(service_info['timers'])
        
        # Check services
        for service in all_services:
            try:
                result = subprocess.run(
                    ['/usr/bin/systemctl', 'is-active', service],
                    capture_output=True, text=True, timeout=5
                )
                status = result.stdout.strip()
                service_statuses[service] = 'ok' if status == 'active' else 'down'
            except Exception as e:
                print(f"Error checking service {service}: {e}")
                service_statuses[service] = 'unknown'
        
        # Check timers
        for timer in all_timers:
            try:
                result = subprocess.run(
                    ['/usr/bin/systemctl', 'is-active', f'{timer}.timer'],
                    capture_output=True, text=True, timeout=5
                )
                status = result.stdout.strip()
                service_statuses[timer] = 'ok' if status == 'active' else 'down'
            except Exception as e:
                print(f"Error checking timer {timer}: {e}")
                service_statuses[timer] = 'unknown'
                
    except Exception as e:
        print(f"Error loading services config: {e}")
    
    return service_statuses

def get_service_status():
    """Get combined status of all services"""
    docker_status = get_docker_status()
    systemd_status = get_systemd_status()
    
    # Combine both status dictionaries
    all_status = {**docker_status, **systemd_status}
    
    return all_status

def register_routes(app):
    """Register services API routes with Flask app"""
    
    @app.route("/api/services/status", methods=["GET"])
    def api_services_status():
        status = get_service_status()
        return app.response_class(
            response=json.dumps(status),
            status=200,
            mimetype='application/json'
        )