"""Shared outbound HTTP client lifecycle for provider adapters.

Every provider adapter (`weather`, `air_quality`, `cpcb`, `sachet`, `assistant`)
talks to a fixed upstream host. Opening a new ``httpx.Client`` per request
throws away connection pooling and DNS/TLS state, so a 15-region fan-out pays
15 handshakes. These helpers let adapters build one pooled client and reuse it,
while still honouring the small ``transport=`` injection point the tests rely on.

The adapters also accept per-phase timeout budgets (connect/read) so the total
time a single request can occupy a worker is bounded and explicit.
"""

from __future__ import annotations

from typing import Any

import httpx

# Connect fast (a stalled TCP/TLS handshake should not eat the read budget) and
# give the body the remaining time. Scaled from the configured timeout so
# existing timeout settings keep their meaning.
CONNECT_TIMEOUT_FRACTION = 0.4
MAX_CONNECT_TIMEOUT_SECONDS = 5.0


def build_timeout(timeout_seconds: float) -> httpx.Timeout:
    connect = min(MAX_CONNECT_TIMEOUT_SECONDS, max(1.0, timeout_seconds * CONNECT_TIMEOUT_FRACTION))
    return httpx.Timeout(timeout_seconds, connect=connect)


def build_client(
    base_url: str = "",
    *,
    timeout_seconds: float = 10,
    transport: httpx.BaseTransport | None = None,
    follow_redirects: bool = True,
    **kwargs: Any,
) -> httpx.Client:
    return httpx.Client(
        base_url=base_url,
        timeout=build_timeout(timeout_seconds),
        transport=transport,
        follow_redirects=follow_redirects,
        **kwargs,
    )


def ensure_client(
    current: httpx.Client | None,
    base_url: str = "",
    *,
    timeout_seconds: float = 10,
    transport: httpx.BaseTransport | None = None,
    follow_redirects: bool = True,
) -> httpx.Client:
    if current is None:
        return build_client(
            base_url, timeout_seconds=timeout_seconds, transport=transport, follow_redirects=follow_redirects,
        )
    return current


class _ClientProvider:
    """Mixin giving a provider adapter one lazily-created, reusable client."""

    _client: httpx.Client | None = None
    base_url: str = ""
    timeout_seconds: float = 10
    _follow_redirects: bool = True

    def _get_client(self) -> httpx.Client:
        self._client = ensure_client(
            self._client,
            self.base_url,
            timeout_seconds=self.timeout_seconds,
            transport=getattr(self, "transport", None),
            follow_redirects=self._follow_redirects,
        )
        return self._client

    def close(self) -> None:
        """Release pooled connections; safe to call on a never-used adapter."""
        client, self._client = self._client, None
        if client is not None:
            client.close()
