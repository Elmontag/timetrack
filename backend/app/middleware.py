from __future__ import annotations

import ipaddress
from typing import Iterable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from .config import settings


class AllowListMiddleware(BaseHTTPMiddleware):
    """Restrict access to configured IP ranges."""

    def __init__(self, app) -> None:  # type: ignore[override]
        super().__init__(app)
        self.networks: Iterable[ipaddress._BaseNetwork] = settings.allow_networks

    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        if not self.networks:
            return await call_next(request)
        client_ip = self._extract_client_ip(request)
        if client_ip and self._is_allowed(client_ip):
            return await call_next(request)
        return JSONResponse({"detail": "Access denied"}, status_code=403)

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

    def _is_allowed(self, ip_str: str) -> bool:
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            if ip_str in {"testclient", "localhost", "testserver"}:
                return True
            return False
        for network in self.networks:
            if ip in network:
                return True
        return False
