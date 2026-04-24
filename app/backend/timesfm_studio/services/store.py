"""SQLite-backed persistence for analyses, scenarios, history, and more.

Uses stdlib sqlite3 with WAL mode. No ORM. Tables are created lazily on
startup via :func:`init_db`. All methods are thread-safe via a single
connection per call pattern and SQLite's own locking.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator


_SCHEMA = """
CREATE TABLE IF NOT EXISTS analyses (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  params_hash TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  UNIQUE(dataset_id, kind, params_hash)
);
CREATE INDEX IF NOT EXISTS idx_analyses_dataset ON analyses(dataset_id);

CREATE TABLE IF NOT EXISTS scenarios (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  label       TEXT NOT NULL,
  config_json TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scenarios_dataset ON scenarios(dataset_id);

CREATE TABLE IF NOT EXISTS forecast_history (
  id            TEXT PRIMARY KEY,
  dataset_id    TEXT NOT NULL,
  model         TEXT NOT NULL,
  run_at        TEXT NOT NULL,
  horizon       INTEGER NOT NULL,
  forecast_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fhistory_dataset ON forecast_history(dataset_id);

CREATE TABLE IF NOT EXISTS schedules (
  id            TEXT PRIMARY KEY,
  dataset_id    TEXT NOT NULL,
  cron          TEXT NOT NULL,
  action_json   TEXT NOT NULL,
  last_run_at   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS alert_rules (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  config_json TEXT NOT NULL,
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS annotations (
  id          TEXT PRIMARY KEY,
  dataset_id  TEXT NOT NULL,
  date        TEXT NOT NULL,
  label       TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_annot_dataset ON annotations(dataset_id);

CREATE TABLE IF NOT EXISTS share_tokens (
  token       TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  expires_at  TEXT
);
"""


_db_lock = threading.Lock()


def _now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _gen_id() -> str:
    return uuid.uuid4().hex


def hash_params(params: dict[str, Any]) -> str:
    """Stable hash of a parameter dict for cache keys."""
    blob = json.dumps(params, sort_keys=True, default=str).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:32]


class Store:
    """Thin wrapper around a sqlite3 connection."""

    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_schema()

    @contextmanager
    def _conn(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self.db_path, timeout=10.0, isolation_level=None)
        try:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.execute("PRAGMA foreign_keys=ON")
            conn.row_factory = sqlite3.Row
            yield conn
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with _db_lock, self._conn() as c:
            c.executescript(_SCHEMA)

    # ---------- analyses cache ----------

    def cache_get(self, dataset_id: str, kind: str, params_hash: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT id, result_json, created_at FROM analyses "
                "WHERE dataset_id=? AND kind=? AND params_hash=?",
                (dataset_id, kind, params_hash),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "result": json.loads(row["result_json"]),
            "created_at": row["created_at"],
        }

    def cache_put(
        self,
        dataset_id: str,
        kind: str,
        params_hash: str,
        result: dict[str, Any],
    ) -> str:
        analysis_id = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT OR REPLACE INTO analyses "
                "(id, dataset_id, kind, params_hash, result_json, created_at) "
                "VALUES (?,?,?,?,?,?)",
                (
                    analysis_id,
                    dataset_id,
                    kind,
                    params_hash,
                    json.dumps(result, default=str),
                    _now(),
                ),
            )
        return analysis_id

    def analyses_list(self, dataset_id: str) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, kind, created_at FROM analyses "
                "WHERE dataset_id=? ORDER BY created_at DESC",
                (dataset_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def analyses_get(self, analysis_id: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT id, dataset_id, kind, params_hash, result_json, created_at "
                "FROM analyses WHERE id=?",
                (analysis_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "dataset_id": row["dataset_id"],
            "kind": row["kind"],
            "params_hash": row["params_hash"],
            "result": json.loads(row["result_json"]),
            "created_at": row["created_at"],
        }

    def analyses_delete(self, analysis_id: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM analyses WHERE id=?", (analysis_id,))
            return cur.rowcount > 0

    # ---------- scenarios ----------

    def scenario_create(self, dataset_id: str, label: str, config: dict[str, Any]) -> str:
        sid = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO scenarios (id, dataset_id, label, config_json, created_at) VALUES (?,?,?,?,?)",
                (sid, dataset_id, label, json.dumps(config, default=str), _now()),
            )
        return sid

    def scenario_list(self, dataset_id: str) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, label, created_at FROM scenarios WHERE dataset_id=? ORDER BY created_at DESC",
                (dataset_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def scenario_get(self, sid: str) -> dict[str, Any] | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT id, dataset_id, label, config_json, created_at FROM scenarios WHERE id=?",
                (sid,),
            ).fetchone()
        if not row:
            return None
        return {
            "id": row["id"],
            "dataset_id": row["dataset_id"],
            "label": row["label"],
            "config": json.loads(row["config_json"]),
            "created_at": row["created_at"],
        }

    def scenario_delete(self, sid: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM scenarios WHERE id=?", (sid,))
            return cur.rowcount > 0

    # ---------- forecast history ----------

    def history_append(
        self,
        dataset_id: str,
        model: str,
        horizon: int,
        forecast: dict[str, Any],
    ) -> str:
        hid = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO forecast_history (id, dataset_id, model, run_at, horizon, forecast_json) "
                "VALUES (?,?,?,?,?,?)",
                (hid, dataset_id, model, _now(), horizon, json.dumps(forecast, default=str)),
            )
        return hid

    def history_list(self, dataset_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, model, run_at, horizon, forecast_json FROM forecast_history "
                "WHERE dataset_id=? ORDER BY run_at DESC LIMIT ?",
                (dataset_id, limit),
            ).fetchall()
        return [
            {
                "id": r["id"],
                "model": r["model"],
                "run_at": r["run_at"],
                "horizon": r["horizon"],
                "forecast": json.loads(r["forecast_json"]),
            }
            for r in rows
        ]

    # ---------- annotations ----------

    def annotation_create(self, dataset_id: str, date: str, label: str, note: str | None = None) -> str:
        aid = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO annotations (id, dataset_id, date, label, note, created_at) VALUES (?,?,?,?,?,?)",
                (aid, dataset_id, date, label, note, _now()),
            )
        return aid

    def annotation_list(self, dataset_id: str) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, date, label, note, created_at FROM annotations "
                "WHERE dataset_id=? ORDER BY date ASC",
                (dataset_id,),
            ).fetchall()
        return [dict(r) for r in rows]

    def annotation_delete(self, aid: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM annotations WHERE id=?", (aid,))
            return cur.rowcount > 0

    # ---------- schedules ----------

    def schedule_create(self, dataset_id: str, cron: str, action: dict[str, Any]) -> str:
        sid = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO schedules (id, dataset_id, cron, action_json, active, created_at) "
                "VALUES (?,?,?,?,1,?)",
                (sid, dataset_id, cron, json.dumps(action, default=str), _now()),
            )
        return sid

    def schedule_list(self) -> list[dict[str, Any]]:
        with self._conn() as c:
            rows = c.execute(
                "SELECT id, dataset_id, cron, action_json, last_run_at, active, created_at FROM schedules"
            ).fetchall()
        return [
            {
                "id": r["id"],
                "dataset_id": r["dataset_id"],
                "cron": r["cron"],
                "action": json.loads(r["action_json"]),
                "last_run_at": r["last_run_at"],
                "active": bool(r["active"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def schedule_delete(self, sid: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM schedules WHERE id=?", (sid,))
            return cur.rowcount > 0

    def schedule_mark_run(self, sid: str) -> None:
        with _db_lock, self._conn() as c:
            c.execute("UPDATE schedules SET last_run_at=? WHERE id=?", (_now(), sid))

    # ---------- alert rules ----------

    def alert_rule_create(self, dataset_id: str, kind: str, config: dict[str, Any]) -> str:
        rid = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO alert_rules (id, dataset_id, kind, config_json, active, created_at) VALUES (?,?,?,?,1,?)",
                (rid, dataset_id, kind, json.dumps(config, default=str), _now()),
            )
        return rid

    def alert_rule_list(self, dataset_id: str | None = None) -> list[dict[str, Any]]:
        with self._conn() as c:
            if dataset_id:
                rows = c.execute(
                    "SELECT id, dataset_id, kind, config_json, active, created_at FROM alert_rules WHERE dataset_id=?",
                    (dataset_id,),
                ).fetchall()
            else:
                rows = c.execute(
                    "SELECT id, dataset_id, kind, config_json, active, created_at FROM alert_rules"
                ).fetchall()
        return [
            {
                "id": r["id"],
                "dataset_id": r["dataset_id"],
                "kind": r["kind"],
                "config": json.loads(r["config_json"]),
                "active": bool(r["active"]),
                "created_at": r["created_at"],
            }
            for r in rows
        ]

    def alert_rule_delete(self, rid: str) -> bool:
        with _db_lock, self._conn() as c:
            cur = c.execute("DELETE FROM alert_rules WHERE id=?", (rid,))
            return cur.rowcount > 0

    # ---------- share tokens ----------

    def share_mint(self, analysis_id: str, expires_at: str | None = None) -> str:
        token = _gen_id()
        with _db_lock, self._conn() as c:
            c.execute(
                "INSERT INTO share_tokens (token, analysis_id, created_at, expires_at) VALUES (?,?,?,?)",
                (token, analysis_id, _now(), expires_at),
            )
        return token

    def share_resolve(self, token: str) -> str | None:
        with self._conn() as c:
            row = c.execute(
                "SELECT analysis_id FROM share_tokens WHERE token=?",
                (token,),
            ).fetchone()
        return row["analysis_id"] if row else None


_singleton: Store | None = None


def get_store(db_path: Path) -> Store:
    global _singleton
    if _singleton is None:
        _singleton = Store(db_path)
    return _singleton
