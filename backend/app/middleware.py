from __future__ import annotations

import ipaddress
from typing import Iterable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import settings


class BlockListMiddleware(BaseHTTPMiddleware):
    """Deny access for configured IP ranges."""

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        runtime_state = getattr(request.app.state, "runtime_state", None)
        networks: Iterable[ipaddress._BaseNetwork]
        if runtime_state is not None:
            networks = runtime_state.block_networks
        else:
            networks = settings.block_networks
        if not networks:
            return await call_next(request)
        client_ip = self._extract_client_ip(request)
        if client_ip and self._is_blocked(client_ip, networks):
            return JSONResponse({"detail": "Access denied"}, status_code=403)
        return await call_next(request)

    def _extract_client_ip(self, request: Request) -> str | None:
        if settings.behind_proxy:
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                return forwarded.split(",")[0].strip()
        if request.client:
            host = request.client.host or "127.0.0.1"
        else:
            host = "127.0.0.1"
        if host in {"testclient", "localhost", "testserver"}:
            return "127.0.0.1"
        return host

    def _is_blocked(self, ip_str: str, networks: Iterable[ipaddress._BaseNetwork]) -> bool:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            if ip_str in {"testclient", "localhost", "testserver"}:
                return False
            return True
        for network in networks:
            if ip in network:
                return True
        return False
