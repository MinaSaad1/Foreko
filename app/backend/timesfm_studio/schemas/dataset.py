"""Dataset ingestion and column-mapping schemas."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

ColumnDType = Literal["datetime", "numeric", "categorical", "string"]
Frequency = Literal["infer", "D", "W", "MS", "M", "H"]


class ColumnInfo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    dtype: ColumnDType
    example_values: list[str] = Field(default_factory=list)
    null_fraction: float = 0.0


class DatasetPreview(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    filename: str
    columns: list[ColumnInfo]
    row_count: int
    first_rows: list[dict[str, Any]]


class DateParts(BaseModel):
    """Compose a date from two columns (e.g. Year + Month like the repo's data.csv)."""

    model_config = ConfigDict(extra="forbid")

    year_col: str
    month_col: str
    day_col: str | None = None


class ColumnMapping(BaseModel):
    """User's mapping of CSV columns to TimesFM's expected inputs."""

    model_config = ConfigDict(extra="forbid")

    value_col: str = Field(description="Numeric column holding the time series values.")
    date_col: str | None = Field(
        default=None,
        description="Single date column. Either this or date_parts must be provided.",
    )
    date_parts: DateParts | None = Field(
        default=None,
        description="Compose the date from Year+Month (+Day) columns.",
    )
    series_id_col: str | None = Field(
        default=None,
        description="Optional column that groups rows into separate series.",
    )
    freq: Frequency = "infer"

    @model_validator(mode="after")
    def check_date_source(self) -> "ColumnMapping":
        if self.date_col is None and self.date_parts is None:
            raise ValueError("Either date_col or date_parts must be provided.")
        if self.date_col is not None and self.date_parts is not None:
            raise ValueError("Provide either date_col or date_parts, not both.")
        return self


class SeriesSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    length: int
    first_date: str | None = None
    last_date: str | None = None
    preview: list[float] = Field(default_factory=list)


class SeriesExtraction(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dataset_id: str
    inferred_freq: str | None
    series: list[SeriesSummary]


class DatasetSummary(BaseModel):
    """Lightweight summary of an uploaded dataset (for listing)."""

    model_config = ConfigDict(extra="forbid")

    id: str
    filename: str
    row_count: int
    uploaded_at: str  # ISO 8601 from meta.json
    size_bytes: int
