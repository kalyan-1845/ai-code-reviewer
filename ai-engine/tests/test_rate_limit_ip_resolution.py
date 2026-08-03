"""
Regression tests for issue #3584: rate limiting must key on the socket peer, not
on the client-supplied X-Forwarded-For header.

A directly-connected client controls every X-Forwarded-For entry. If the header
were used for the rate-limit bucket key, an attacker could rotate a spoofed IP
per request and get a fresh bucket each time, bypassing the throttle entirely.
"""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from app import _rate_limit_store, _resolve_client_ip


def _make_request(client_host, xff=None):
    headers = {}
    if xff:
        headers["x-forwarded-for"] = xff
    return SimpleNamespace(
        client=SimpleNamespace(host=client_host) if client_host else None,
        headers=headers,
    )


class TestResolveClientIp:
    def test_uses_socket_peer_not_xff(self):
        request = _make_request(client_host="203.0.113.9", xff="1.2.3.4")
        assert _resolve_client_ip(request) == "203.0.113.9"

    def test_ignores_spoofed_xff_chain(self):
        request = _make_request(
            client_host="198.51.100.7",
            xff="203.0.113.200, 10.0.0.1, 6.6.6.6",
        )
        assert _resolve_client_ip(request) == "198.51.100.7"

    def test_xff_header_never_leaks_into_bucket_key(self):
        request = _make_request(client_host="203.0.113.9", xff="1.2.3.4")
        assert _resolve_client_ip(request) != "1.2.3.4"
        assert "1.2.3.4" not in _resolve_client_ip(request)

    def test_returns_unknown_when_no_peer(self):
        request = _make_request(client_host=None, xff="1.2.3.4")
        assert _resolve_client_ip(request) == "unknown"

    def test_returns_unknown_when_peer_is_not_an_ip(self):
        request = _make_request(client_host="not-an-ip", xff="1.2.3.4")
        assert _resolve_client_ip(request) == "unknown"


class TestRateLimitBucketUsesPeerKey:
    def test_bucket_keyed_on_peer_even_with_xff(self):
        _rate_limit_store.clear()
        call_next = AsyncMock(return_value=SimpleNamespace())
        request = _make_request(client_host="203.0.113.9", xff="1.2.3.4")

        import app as app_module

        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(app_module.rate_limit_middleware(request, call_next))
        finally:
            loop.close()

        try:
            assert "203.0.113.9" in _rate_limit_store
            assert "1.2.3.4" not in _rate_limit_store
        finally:
            _rate_limit_store.clear()
