#!/usr/bin/env python3
import hmac
import logging
from flask import request, jsonify
from flask_httpauth import HTTPTokenAuth

try:
    from .config import config
except ImportError:
    from config import config

logger = logging.getLogger(__name__)

auth = HTTPTokenAuth(scheme="Bearer")


def get_api_key():
    try:
        return config["auth"]["api_key"].get(str)
    except Exception:
        return None


@auth.verify_token
def verify_token(token):
    api_key = get_api_key()
    if not api_key:
        return True
    if not token:
        return False
    return hmac.compare_digest(token, api_key)


@auth.error_handler
def auth_error(status):
    logger.warning("Authentication failed from %s", request.remote_addr)
    return jsonify({"error": "Unauthorized"}), 401


def require_auth_for_api(application):
    """Register before_request handler to protect /api/* routes."""

    @application.before_request
    def check_api_auth():
        if not request.path.startswith("/api/"):
            return None

        api_key = get_api_key()
        if not api_key:
            return None

        token = None
        auth_header = request.headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
        elif "X-API-Key" in request.headers:
            token = request.headers.get("X-API-Key")

        if not token or not hmac.compare_digest(token, api_key):
            logger.warning("API authentication failed from %s", request.remote_addr)
            return jsonify({"error": "Unauthorized"}), 401

        return None
