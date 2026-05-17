"""LLM provider abstraction + narrative generation for forecasts/anomalies/factors.

Providers: anthropic, openai, ollama. None configured → returns a rule-based
template narrative so the UI still works with zero setup.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class LLMProvider(Protocol):
    async def complete(self, system: str, user: str, max_tokens: int = 600) -> str: ...


class TemplateProvider:
    """Rule-based fallback — no API calls, no cost. Good enough for local use."""

    async def complete(self, system: str, user: str, max_tokens: int = 600) -> str:  # noqa: ARG002
        return user  # Caller already builds the narrative


class AnthropicProvider:
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    async def complete(self, system: str, user: str, max_tokens: int = 600) -> str:
        try:
            from anthropic import AsyncAnthropic
        except ImportError:
            raise RuntimeError("anthropic package not installed")
        client = AsyncAnthropic(api_key=self.api_key)
        msg = await client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        out = ""
        for block in msg.content:
            if hasattr(block, "text"):
                out += block.text
        return out


def get_provider(settings: Any) -> LLMProvider:
    kind = getattr(settings, "llm_provider", "none")
    if kind == "anthropic" and settings.llm_api_key:
        return AnthropicProvider(api_key=settings.llm_api_key, model=settings.llm_model)
    return TemplateProvider()


_SYSTEM_FORECAST = """You are a senior time-series analyst. You write crisp,
plain-English commentary on forecast results for a business audience. Use
markdown headers sparingly. Keep paragraphs short. No code blocks. No emoji."""


def _template_forecast_narrative(payload: dict[str, Any]) -> str:
    winner = payload.get("winner") or {}
    alt = payload.get("alternative") or {}
    win_name = winner.get("display_name", "winning model")
    acc = int((winner.get("accuracy") or 0) * 100)
    total = winner.get("total_forecast", 0)
    alt_name = alt.get("display_name", "other model")
    alt_mape = int((alt.get("mape") or 0) * 100)
    win_mape = int((winner.get("mape") or 0) * 100)
    direction = "higher" if total > 0 else "lower"
    return (
        f"## Forecast summary\n\n"
        f"**{win_name}** is the recommended model with an expected total of "
        f"**{total:,.0f}** over the forecast horizon and **{acc}%** accuracy on recent hold-out data.\n\n"
        f"## Why this model\n\n"
        f"{win_name} achieved a **{win_mape}%** error rate on the most recent hold-out period, "
        f"compared to **{alt_mape}%** for {alt_name}. The smaller the error, the more reliable "
        f"the forecast.\n\n"
        f"## Confidence\n\n"
        f"Confidence is **{winner.get('confidence', 'Medium')}**. If this is below High, consider "
        f"running a walk-forward backtest to check whether accuracy is stable across multiple recent "
        f"windows, and check the residual diagnostics panel for autocorrelation or drift."
    )


def _template_anomaly_narrative(payload: dict[str, Any]) -> str:
    n_crit = payload.get("critical", 0)
    n_warn = payload.get("warning", 0)
    records = payload.get("top", [])
    lines = [f"## Anomaly summary\n\n**{n_crit}** critical anomalies and **{n_warn}** warnings detected."]
    if records:
        lines.append("\n## Notable events\n")
        for r in records[:3]:
            lines.append(f"- **{r.get('date')}**: value {r.get('value')}, {r.get('reason', 'unusual')}")
    return "\n".join(lines)


def _template_factor_narrative(payload: dict[str, Any]) -> str:
    impact = payload.get("impact", {})
    factors = payload.get("factors", [])
    direction = impact.get("direction", "flat")
    pct = (impact.get("delta_percent", 0) or 0) * 100
    top = impact.get("top_driver")
    lines = [
        f"## Impact of factors\n\nFactors pushed the forecast **{direction}** by **{pct:+.1f}%**.",
    ]
    if top:
        lines.append(f"The strongest driver was **{top}**.")
    if factors:
        lines.append("\n## Top drivers\n")
        for f in factors[:5]:
            sign = "+" if f.get("correlation", 0) >= 0 else ""
            lines.append(
                f"- **{f['name']}**: influence {f.get('influence', 0) * 100:.1f}%, "
                f"correlation {sign}{f.get('correlation', 0):.2f}"
            )
    return "\n".join(lines)


async def narrate_forecast(payload: dict[str, Any], settings: Any) -> dict[str, Any]:
    provider = get_provider(settings)
    if isinstance(provider, TemplateProvider):
        return {"markdown": _template_forecast_narrative(payload), "source": "template"}
    user = (
        "Summarize this forecast result for a business audience in ~200 words with markdown."
        f" Data: {json.dumps(payload, default=str)[:4000]}"
    )
    try:
        md = await provider.complete(_SYSTEM_FORECAST, user)
        return {"markdown": md, "source": settings.llm_provider}
    except Exception as exc:
        logger.warning("LLM failed, falling back: %s", exc)
        return {"markdown": _template_forecast_narrative(payload), "source": "template_fallback"}


async def narrate_anomaly(payload: dict[str, Any], settings: Any) -> dict[str, Any]:
    provider = get_provider(settings)
    if isinstance(provider, TemplateProvider):
        return {"markdown": _template_anomaly_narrative(payload), "source": "template"}
    user = f"Explain these anomalies to a business user in ~150 words: {json.dumps(payload, default=str)[:3000]}"
    try:
        md = await provider.complete(_SYSTEM_FORECAST, user)
        return {"markdown": md, "source": settings.llm_provider}
    except Exception:
        return {"markdown": _template_anomaly_narrative(payload), "source": "template_fallback"}


async def narrate_factors(payload: dict[str, Any], settings: Any) -> dict[str, Any]:
    provider = get_provider(settings)
    if isinstance(provider, TemplateProvider):
        return {"markdown": _template_factor_narrative(payload), "source": "template"}
    user = f"Explain factor impact for a business user in ~180 words: {json.dumps(payload, default=str)[:3000]}"
    try:
        md = await provider.complete(_SYSTEM_FORECAST, user)
        return {"markdown": md, "source": settings.llm_provider}
    except Exception:
        return {"markdown": _template_factor_narrative(payload), "source": "template_fallback"}


async def suggest_factors(columns: list[dict[str, Any]], settings: Any) -> dict[str, Any]:
    """Suggest which dataset columns look like useful covariates."""
    suggestions = []
    for c in columns:
        name = str(c.get("name", ""))
        dtype = c.get("dtype", "")
        lname = name.lower()
        reason = None
        if any(k in lname for k in ["promo", "discount", "offer"]):
            reason = "marketing activity typically drives demand"
        elif any(k in lname for k in ["holiday", "event"]):
            reason = "holidays shift demand patterns"
        elif any(k in lname for k in ["price"]):
            reason = "price elasticity is a strong driver"
        elif any(k in lname for k in ["temperature", "weather", "humidity", "rain"]):
            reason = "weather affects many consumer and energy series"
        elif any(k in lname for k in ["traffic", "visits", "clicks"]):
            reason = "upstream traffic often leads downstream demand"
        if reason:
            suggestions.append({"name": name, "kind": dtype, "reason": reason})
    return {"suggestions": suggestions}
