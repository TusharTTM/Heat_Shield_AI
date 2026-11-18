"""OpenAI-compatible chat-completions client for the AI assistant endpoint.

The provider key stays server-side (``assistant_api_key``). Requests carry only
the city-level conditions the frontend already displays; the request schemas
use ``extra="forbid"`` so profile names, emails, or precise coordinates cannot
be accepted, and the fixed system prompt keeps answers inside the app's data.
"""

from typing import Any

import httpx

PROVIDER_NAME = "OpenAI-compatible chat completions"

DISCLAIMER = (
    "Modelled weather and air quality are model estimates, not official warnings. "
    "Official alerts come only from government feeds. This is general safety "
    "information, not medical advice."
)

DATA_POLICY = (
    "Messages and the selected city's conditions are sent to the configured "
    "assistant service. Profile name, email, and device location are never included."
)

MODEL_LABELS = {
    "weather-model": "MODEL ESTIMATE (weather model)",
    "air-quality-model": "MODEL ESTIMATE (air quality model)",
    "official-warning": "OFFICIAL WARNING (government feed)",
    "app-state": "APP STATUS",
}

FRESHNESS_LABELS = {"current": "data current", "stale": "DATA STALE", "unknown": "freshness unknown"}

SYSTEM_PROMPT = """You are Heat Shield AI, a heat and air-quality safety screening assistant for cities in India.

Rules — these are strict:
1. Answer only from the conditions block the app provides. If the block lacks the data needed, say that the app does not have that data right now; never invent readings, forecasts, or warning statuses.
2. Keep model estimates and official warnings clearly separate. Never present a model estimate as an official alert or government warning. The conditions block labels every item; repeat those labels when citing values.
3. Never claim or imply an all-clear. If data is missing or stale, say so plainly — absence of an official warning is not proof of safety.
4. Give general safety guidance only. Never give medical diagnoses or treatment plans. For symptoms of heat illness or any emergency, advise contacting local emergency services or a qualified medical professional.
5. When citing a value, include its source name and data time from the block.
6. Keep answers concise and practical, focused on heat, air quality, weather, and preparedness for the selected city. Politely steer unrelated questions back to that scope.
7. Reply in the language the user writes in.
8. The user's profile name, email, and precise location are never shared with you. Do not ask for them."""


class AssistantProviderError(RuntimeError):
    pass


def render_context_block(region_name: str, region_state: str, context: list[dict[str, Any]]) -> str:
    """Render the app's conditions as an explicitly labelled block.

    Every line carries its evidence type, source and data time so the model can
    attribute values and the reply can name its sources.
    """
    lines = [
        "## Selected city (city level only)",
        f"{region_name}, {region_state}",
        "",
        "## Conditions available to the app",
    ]
    for item in context:
        label = MODEL_LABELS.get(item["evidence_type"], "APP STATUS")
        freshness = FRESHNESS_LABELS.get(item.get("freshness", "unknown"), "freshness unknown")
        observed = f", data time {item['observed_at']}" if item.get("observed_at") else ""
        lines.append(f"- [{label}] {item['label']}: {item['value']} — source: {item['source']} ({freshness}){observed}")
    return "\n".join(lines)


def build_provider_messages(payload: dict[str, Any]) -> list[dict[str, str]]:
    block = render_context_block(
        payload["region"]["name"], payload["region"]["state"], payload["context"],
    )
    messages = [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "system", "content": block}]
    messages.extend({"role": message["role"], "content": message["content"]} for message in payload["messages"])
    return messages


class AssistantClient:
    """Minimal OpenAI-compatible chat-completions caller with injectable transport."""

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
        timeout_seconds: float = 30,
        max_output_tokens: int = 700,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.model = model
        self.api_key = api_key
        self.max_output_tokens = max_output_tokens
        self._client = httpx.Client(
            base_url=base_url.rstrip("/"), timeout=timeout_seconds, transport=transport,
        )

    def chat(self, payload: dict[str, Any]) -> str:
        body = {
            "model": self.model,
            "messages": build_provider_messages(payload),
            "max_tokens": self.max_output_tokens,
            "temperature": 0.2,
        }
        try:
            response = self._client.post(
                "/chat/completions",
                json=body,
                headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"},
            )
        except httpx.HTTPError as exc:
            raise AssistantProviderError(f"Assistant provider request failed: {type(exc).__name__}") from exc
        if response.status_code != 200:
            raise AssistantProviderError(f"Assistant provider returned HTTP {response.status_code}")
        try:
            content = response.json()["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as exc:
            raise AssistantProviderError("Assistant provider returned an invalid completion") from exc
        if not isinstance(content, str) or not content.strip():
            raise AssistantProviderError("Assistant provider returned an empty completion")
        return content.strip()
