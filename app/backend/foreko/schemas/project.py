"""Wire types for Forecast Projects.

A Forecast Project is the durable root object of the V2 workflow: it owns an
immutable history of revisions, the runs produced from them, the forecast the
user issued, and the actuals scored against it.

Every mutation model sets ``extra="forbid"`` so an unknown field is a 422 rather
than a silently dropped value.
"""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .dataset import ColumnMapping


SCHEMA_VERSION = 1

ProjectStage = Literal["prepare", "validate", "forecast", "plan", "review"]

# Archived state is derived from ``archived_at``, never stored here, so the two
# cannot disagree.
ProjectStatus = Literal["draft", "ready"]

RunStatus = Literal["queued", "running", "done", "error", "cancelled"]

ModelId = Literal["timesfm", "lightgbm", "ets", "seasonal_naive", "arima", "prophet"]

PrimaryMetric = Literal["mase", "wape", "smape"]

PreparationKind = Literal[
    "aggregate_duplicates",
    "insert_missing_periods",
    "impute",
    "winsorize",
    "log",
    "box_cox",
    "diff",
    "seasonal_diff",
]

CovariateRole = Literal[
    "historical_only",
    "known_future_numerical",
    "known_future_categorical",
    "calendar_generated",
    "static_numerical",
    "static_categorical",
    "scenario_controlled",
]


class PreparationStep(BaseModel):
    """One reversible step in a preparation recipe.

    Execution lives in ``services.preparation``; this is only the wire shape, so
    that a revision never stores an untyped step.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    kind: PreparationKind
    method: str | None = None
    period: int | None = Field(default=None, ge=1, le=366)
    lower_quantile: float | None = Field(default=None, ge=0, le=1)
    upper_quantile: float | None = Field(default=None, ge=0, le=1)


class ProjectCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = Field(min_length=1, max_length=120)
    dataset_id: str = Field(min_length=1)
    description: str = Field(default="", max_length=500)


class ProjectPatch(BaseModel):
    """Metadata change, archive, or reopen. Every field is optional."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=500)
    archived: bool | None = None


class ProjectRevisionCreate(BaseModel):
    """The full configuration that produced a run.

    A revision is immutable once created. Changing any of this creates a new
    revision, which is what lets a completed run stay linked to the exact
    configuration that produced it.
    """

    model_config = ConfigDict(extra="forbid", frozen=True)

    mapping: ColumnMapping
    frequency: str = Field(min_length=1)
    horizon: int = Field(ge=1, le=1000)
    preparation_steps: list[PreparationStep] = Field(default_factory=list)
    candidate_models: list[ModelId] = Field(min_length=1)
    folds: int = Field(default=5, ge=2, le=10)
    primary_metric: PrimaryMetric = "mase"
    covariate_roles: dict[str, CovariateRole] = Field(default_factory=dict)
    champion_override: dict[str, str] = Field(default_factory=dict)


class ProjectSummary(BaseModel):
    """List-view projection. The library renders many of these."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    id: str
    name: str
    description: str
    dataset_id: str
    status: ProjectStatus
    current_revision: int
    created_at: str
    updated_at: str
    archived_at: str | None = None
    is_archived: bool = False


class ProjectDetail(ProjectSummary):
    """Single-project view. Adds the revision configuration when one exists."""

    config: ProjectRevisionCreate | None = None


class ProjectRevision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    id: str
    project_id: str
    revision_no: int
    created_at: str
    config: ProjectRevisionCreate


class ProjectRunCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    project_id: str
    revision_no: int = Field(ge=1)
    stage: ProjectStage
    job_id: str | None = None


class ProjectRun(BaseModel):
    """Immutable once it reaches a terminal status."""

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    id: str
    project_id: str
    revision_no: int
    stage: ProjectStage
    status: RunStatus
    job_id: str | None = None
    started_at: str
    completed_at: str | None = None
    artifact_path: str | None = None
    summary: dict[str, Any] = Field(default_factory=dict)
    error: str | None = None


class IssuedForecast(BaseModel):
    """A forecast frozen at the moment it was issued.

    Immutable by construction: the values are copied out of the run, so a later
    revision or rerun cannot change what was predicted. Accuracy is always
    scored against this, never against the latest run.
    """

    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    id: str
    project_id: str
    run_id: str
    revision_no: int
    issued_at: str
    forecast: dict[str, Any]
    assumptions: dict[str, Any] = Field(default_factory=dict)
    manifest: dict[str, Any] = Field(default_factory=dict)


class ActualRow(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    series_id: str
    date: str
    value: float


class AccuracyMetrics(BaseModel):
    """Post-issue accuracy. Deliberately named apart from backtest metrics.

    Design 14: post-issue metrics must not be confusable with backtest metrics
    in labels or API fields. A metric that cannot be computed is None with a
    reason, never zero.
    """

    model_config = ConfigDict(extra="forbid")

    mase: float | None = None
    wape: float | None = None
    smape: float | None = None
    rmse: float | None = None
    bias_pct: float | None = None
    pinball_loss: float | None = None
    coverage_p10_p90: float | None = None


class SeriesAccuracy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    series_id: str
    matched_points: int
    metrics: AccuracyMetrics
    metric_warnings: list[str] = Field(default_factory=list)


class AccuracyResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = SCHEMA_VERSION
    issued_id: str | None = None
    issued_at: str | None = None
    matched_points: int = 0
    unmatched_periods: int = 0
    series: list[SeriesAccuracy] = Field(default_factory=list)
    metrics: AccuracyMetrics = Field(default_factory=AccuracyMetrics)
    metric_warnings: list[str] = Field(default_factory=list)


__all__ = [
    "SCHEMA_VERSION",
    "AccuracyMetrics",
    "AccuracyResult",
    "ActualRow",
    "IssuedForecast",
    "SeriesAccuracy",
    "CovariateRole",
    "ModelId",
    "PreparationKind",
    "PreparationStep",
    "PrimaryMetric",
    "ProjectCreate",
    "ProjectDetail",
    "ProjectPatch",
    "ProjectRevision",
    "ProjectRevisionCreate",
    "ProjectRun",
    "ProjectRunCreate",
    "ProjectStage",
    "ProjectStatus",
    "ProjectSummary",
    "RunStatus",
]
