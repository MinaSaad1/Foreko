"""Alert evaluation + dispatch (webhook + SMTP)."""

from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText
from typing import Any

logger = logging.getLogger(__name__)


async def dispatch_webhook(url: str, payload: dict[str, Any]) -> bool:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json=payload)
            return 200 <= resp.status_code < 300
    except Exception as exc:
        logger.warning("webhook dispatch failed: %s", exc)
        return False


def dispatch_email(
    host: str,
    port: int,
    user: str,
    password: str,
    to_addr: str,
    subject: str,
    body: str,
) -> bool:
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = user
        msg["To"] = to_addr
        with smtplib.SMTP(host, port, timeout=10) as server:
            server.starttls()
            if user and password:
                server.login(user, password)
            server.send_message(msg)
        return True
    except Exception as exc:
        logger.warning("email dispatch failed: %s", exc)
        return False


def evaluate_anomaly_rule(rule_config: dict[str, Any], anomaly_result: dict[str, Any]) -> bool:
    """Return True if an alert should fire for this anomaly result."""
    min_critical = int(rule_config.get("min_critical", 1))
    n_critical = sum(1 for r in anomaly_result.get("records", []) if r.get("severity") == "CRITICAL")
    return n_critical >= min_critical


def evaluate_drift_rule(rule_config: dict[str, Any], previous: list[float], current: list[float]) -> bool:
    threshold = float(rule_config.get("threshold_pct", 0.1))
    if not previous or not current:
        return False
    import numpy as np
    a = np.asarray(previous, dtype=float).mean()
    b = np.asarray(current, dtype=float).mean()
    if abs(a) < 1e-9:
        return False
    drift = abs((b - a) / a)
    return drift > threshold
