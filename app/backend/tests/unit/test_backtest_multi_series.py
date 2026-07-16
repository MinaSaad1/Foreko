"""Multi-series fold scoring.

run_walk_forward reads values[0] and discards every other series. That is the V1
contract and stays that way. Per-series model selection (design 6.3) needs every
series, which is what run_multi_series_folds provides.
"""

from __future__ import annotations

import pytest

from foreko.schemas.dataset import ColumnMapping
from foreko.services import backtest as backtest_service
from foreko.services.loaders.csv import ingest_upload


def _multi_series_csv(rows: int = 48, regions=("egypt", "uae")) -> bytes:
    lines = ["month,sales,region"]
    for region_index, region in enumerate(regions):
        for i in range(rows):
            year = 2019 + i // 12
            month = (i % 12) + 1
            value = 100 + i * 2 + region_index * 50
            lines.append(f"{year}-{month:02d}-01,{value},{region}")
    return "\n".join(lines).encode("utf-8")


def _short_second_series_csv() -> bytes:
    lines = ["month,sales,region"]
    for i in range(48):
        year = 2019 + i // 12
        month = (i % 12) + 1
        lines.append(f"{year}-{month:02d}-01,{100 + i * 2},egypt")
    for i in range(4):  # far too short for folds at this horizon
        lines.append(f"2019-{i + 1:02d}-01,{50 + i},tiny")
    return "\n".join(lines).encode("utf-8")


@pytest.fixture()
def registry():
    from tests.conftest import FakeModelRegistry

    return FakeModelRegistry()


def _ingest(settings, content: bytes) -> str:
    return ingest_upload(
        filename="sales.csv", content=content, datasets_dir=settings.datasets_dir
    ).id


MAPPING = ColumnMapping(date_col="month", value_col="sales", series_id_col="region")


async def _folds(settings, registry, dataset_id, models=("seasonal_naive",)):
    return await backtest_service.run_multi_series_folds(
        dataset_id=dataset_id,
        mapping=MAPPING,
        horizon=3,
        folds=2,
        models=list(models),
        datasets_dir=settings.datasets_dir,
        registry=registry,
    )


@pytest.mark.unit
@pytest.mark.asyncio
async def test_every_series_is_scored_not_just_the_first(settings, registry) -> None:
    dataset_id = _ingest(settings, _multi_series_csv())
    predictions, failures = await _folds(settings, registry, dataset_id)

    assert failures == []
    scored = {p.series_id for p in predictions}
    # The V1 path would have produced egypt only.
    assert scored == {"egypt", "uae"}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_predictions_carry_the_rows_selection_needs(settings, registry) -> None:
    dataset_id = _ingest(settings, _multi_series_csv())
    predictions, _ = await _folds(settings, registry, dataset_id)

    first = predictions[0]
    assert first.series_id in {"egypt", "uae"}
    assert first.model == "seasonal_naive"
    assert first.fold in (1, 2)
    assert first.horizon_step in (1, 2, 3)
    for attr in ("actual", "point", "p10", "p90"):
        assert isinstance(getattr(first, attr), float)

    # 2 series x 2 folds x 3 horizon steps x 1 model
    assert len(predictions) == 12


@pytest.mark.unit
@pytest.mark.asyncio
async def test_each_series_gets_its_own_folds_for_every_model(settings, registry) -> None:
    dataset_id = _ingest(settings, _multi_series_csv())
    predictions, _ = await _folds(
        settings, registry, dataset_id, models=("seasonal_naive", "ets")
    )

    by_series_model: dict[tuple[str, str], set[int]] = {}
    for p in predictions:
        by_series_model.setdefault((p.series_id, p.model), set()).add(p.fold)

    assert set(by_series_model) == {
        ("egypt", "seasonal_naive"),
        ("egypt", "ets"),
        ("uae", "seasonal_naive"),
        ("uae", "ets"),
    }
    for folds in by_series_model.values():
        assert folds == {1, 2}


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_series_too_short_fails_alone_without_sinking_the_portfolio(
    settings, registry
) -> None:
    dataset_id = _ingest(settings, _short_second_series_csv())
    predictions, failures = await _folds(settings, registry, dataset_id)

    # The healthy series still produces evidence.
    assert {p.series_id for p in predictions} == {"egypt"}
    # The short one is reported rather than raising and losing everything.
    assert {f.series_id for f in failures} == {"tiny"}
    assert all("Not enough data" in f.reason for f in failures)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_a_model_failure_is_isolated_to_its_series(
    settings, registry, monkeypatch
) -> None:
    real = backtest_service._forecast_one_model
    seen: dict[str, int] = {}

    async def _fail_for_uae_only(*, model: str, history_values, **kwargs):
        # uae's values are offset by +50, which is how this picks it out.
        if float(history_values[0]) >= 150:
            seen["hit"] = seen.get("hit", 0) + 1
            raise RuntimeError("uae exploded")
        return await real(model=model, history_values=history_values, **kwargs)

    monkeypatch.setattr(backtest_service, "_forecast_one_model", _fail_for_uae_only)

    dataset_id = _ingest(settings, _multi_series_csv())
    predictions, failures = await _folds(settings, registry, dataset_id)

    assert {p.series_id for p in predictions} == {"egypt"}
    assert {f.series_id for f in failures} == {"uae"}
