"""Run manifests and forecast export packages.

An export is the artifact a user hands to someone else, so it has to carry
enough to reproduce and audit the number: what data, what recipe, what model,
what assumptions, and how it turned out. A CSV of point forecasts alone invites
the reader to trust a number with no way to check it.

Nothing here touches secrets. SQL passwords live in the OS keyring and never
reach a manifest (design 11).
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from typing import Any

from .. import __version__
from ..schemas.project import AccuracyResult, IssuedForecast, ProjectDetail, ProjectRun


MANIFEST_SCHEMA_VERSION = 1

# Never serialized into a manifest, whatever a caller passes in. A manifest is
# meant to be shared, and a leaked credential cannot be unshared.
_FORBIDDEN_KEYS = frozenset(
    {"password", "secret", "token", "api_key", "apikey", "credential", "dsn"}
)


def _scrub(value: Any) -> Any:
    """Drop anything that looks like a credential, at any depth."""
    if isinstance(value, dict):
        return {
            k: _scrub(v)
            for k, v in value.items()
            if k.lower() not in _FORBIDDEN_KEYS
        }
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def build_manifest(
    *,
    project: ProjectDetail,
    run: ProjectRun,
    issued: IssuedForecast | None = None,
    validation: dict[str, Any] | None = None,
    dataset_fingerprint: str | None = None,
) -> dict[str, Any]:
    """Everything needed to say where a number came from."""
    config = project.config
    policies = (validation or {}).get("series_policies") or {}

    manifest: dict[str, Any] = {
        "schema_version": MANIFEST_SCHEMA_VERSION,
        "foreko_version": __version__,
        "generated_at": run.completed_at or run.started_at,
        "project": {
            "id": project.id,
            "name": project.name,
            "dataset_id": project.dataset_id,
            "revision_no": run.revision_no,
        },
        "run": {
            "id": run.id,
            "stage": run.stage,
            "status": run.status,
            "started_at": run.started_at,
            "completed_at": run.completed_at,
            "artifact_path": run.artifact_path,
        },
        "data": {
            "dataset_fingerprint": dataset_fingerprint,
            "recipe_hash": run.summary.get("recipe_hash"),
            "preparation_steps": (
                [s.model_dump() for s in config.preparation_steps] if config else []
            ),
        },
        "policy": {
            "candidate_models": list(config.candidate_models) if config else [],
            "folds": config.folds if config else None,
            "primary_metric": config.primary_metric if config else None,
            "horizon": config.horizon if config else None,
            "frequency": config.frequency if config else None,
            "selected": {
                series_id: {
                    "champion": p.get("champion"),
                    "challenger": p.get("challenger"),
                    "ensemble_weights": p.get("ensemble_weights") or {},
                    "reason": p.get("reason"),
                }
                for series_id, p in policies.items()
            },
        },
        "assumptions": run.summary.get("assumptions") or {},
        "applied_fills": run.summary.get("applied_fills") or [],
        "warnings": run.summary.get("failures") or [],
    }

    if issued is not None:
        manifest["issued"] = {
            "id": issued.id,
            "issued_at": issued.issued_at,
            "run_id": issued.run_id,
            "revision_no": issued.revision_no,
        }

    return _scrub(manifest)


def forecast_csv(forecast: dict[str, Any]) -> str:
    """Machine-readable forecast values, one row per series and period."""
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")
    writer.writerow(["series_id", "date", "point", "p10", "p90", "model"])
    for series in forecast.get("series", []):
        for index, date in enumerate(series.get("dates", [])):
            writer.writerow(
                [
                    series["series_id"],
                    date,
                    series["point"][index],
                    series["p10"][index],
                    series["p90"][index],
                    series.get("model", ""),
                ]
            )
    return buffer.getvalue()


def build_package(
    *,
    project: ProjectDetail,
    run: ProjectRun,
    issued: IssuedForecast | None = None,
    validation: dict[str, Any] | None = None,
    accuracy: AccuracyResult | None = None,
    dataset_fingerprint: str | None = None,
) -> bytes:
    """A single zip carrying the forecast and everything behind it."""
    forecast = issued.forecast if issued is not None else run.summary
    manifest = build_manifest(
        project=project,
        run=run,
        issued=issued,
        validation=validation,
        dataset_fingerprint=dataset_fingerprint,
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, indent=2, default=str))
        archive.writestr("forecast.csv", forecast_csv(forecast))
        archive.writestr(
            "assumptions.json",
            json.dumps(
                {
                    "assumptions": _scrub(forecast.get("assumptions") or {}),
                    "applied_fills": forecast.get("applied_fills") or [],
                },
                indent=2,
                default=str,
            ),
        )
        archive.writestr(
            "validation-summary.json",
            json.dumps(_scrub(validation or {}), indent=2, default=str),
        )
        archive.writestr(
            "accuracy.json",
            json.dumps(
                accuracy.model_dump() if accuracy is not None else {},
                indent=2,
                default=str,
            ),
        )
    return buffer.getvalue()


__all__ = [
    "MANIFEST_SCHEMA_VERSION",
    "build_manifest",
    "build_package",
    "forecast_csv",
]
