"""Tests for project artifact paths, fingerprints, and atomic writes."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from foreko.services.project_artifacts import (
    atomic_write_json,
    dataset_fingerprint,
    derived_dir,
    project_dir,
    read_json,
    recipe_hash,
    remove_project_dir,
    run_dir,
)


@pytest.mark.unit
@pytest.mark.parametrize(
    "hostile",
    [
        "..",
        ".",
        "../evil",
        "..\\evil",
        "a/b",
        "a\\b",
        "C:evil",
        "",
        "with space",
    ],
)
def test_project_paths_reject_traversal(tmp_path: Path, hostile: str) -> None:
    # These ids arrive from the URL and are concatenated onto storage_dir.
    with pytest.raises(ValueError):
        project_dir(tmp_path, hostile)


@pytest.mark.unit
def test_run_dir_validates_the_run_id_too(tmp_path: Path) -> None:
    with pytest.raises(ValueError):
        run_dir(tmp_path, "abc123", "../../escape")


@pytest.mark.unit
def test_project_paths_stay_inside_storage(tmp_path: Path) -> None:
    target = derived_dir(tmp_path, "abc123")
    assert tmp_path in target.parents
    assert target == tmp_path / "projects" / "abc123" / "derived"


@pytest.mark.unit
def test_dataset_fingerprint_tracks_content(tmp_path: Path) -> None:
    a = tmp_path / "a.csv"
    b = tmp_path / "b.csv"
    a.write_text("date,value\n2026-01-01,1\n", encoding="utf-8")
    b.write_text("date,value\n2026-01-01,1\n", encoding="utf-8")
    assert dataset_fingerprint(a) == dataset_fingerprint(b)

    b.write_text("date,value\n2026-01-01,2\n", encoding="utf-8")
    assert dataset_fingerprint(a) != dataset_fingerprint(b)


@pytest.mark.unit
def test_recipe_hash_changes_with_recipe_and_source() -> None:
    recipe = [{"kind": "log"}]
    other = [{"kind": "diff"}]
    assert recipe_hash("fp1", recipe) == recipe_hash("fp1", recipe)
    assert recipe_hash("fp1", recipe) != recipe_hash("fp1", other)
    assert recipe_hash("fp1", recipe) != recipe_hash("fp2", recipe)


@pytest.mark.unit
def test_recipe_hash_is_insensitive_to_key_order() -> None:
    assert recipe_hash("fp", {"a": 1, "b": 2}) == recipe_hash("fp", {"b": 2, "a": 1})


@pytest.mark.unit
def test_atomic_write_leaves_no_temp_file(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "manifest.json"
    atomic_write_json(target, {"b": 2, "a": 1})

    assert read_json(target) == {"a": 1, "b": 2}
    assert list(tmp_path.rglob("*.tmp")) == []


@pytest.mark.unit
def test_atomic_write_replaces_previous_content(tmp_path: Path) -> None:
    target = tmp_path / "manifest.json"
    atomic_write_json(target, {"version": 1})
    atomic_write_json(target, {"version": 2})
    assert json.loads(target.read_text(encoding="utf-8")) == {"version": 2}


@pytest.mark.unit
def test_remove_project_dir_is_idempotent(tmp_path: Path) -> None:
    atomic_write_json(derived_dir(tmp_path, "abc123") / "x.json", {"a": 1})
    assert remove_project_dir(tmp_path, "abc123") is True
    assert remove_project_dir(tmp_path, "abc123") is False
