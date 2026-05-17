"""Natural-language query over result tables.

Guardrailed pandas filter: accepts a result table + a plain-English query,
returns a filtered table. Uses a deterministic regex parser (no LLM required)
for common shapes like "show me days in June" or "sales > 2000".
"""

from __future__ import annotations

import re
from typing import Any

import pandas as pd


_MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_DAYS = {
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
    "mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6,
}
_COMPARATORS = [
    (r">=", ">="),
    (r"<=", "<="),
    (r">", ">"),
    (r"<", "<"),
    (r"(?:equals|==)", "=="),
    (r"(?:greater than|above|over|more than)", ">"),
    (r"(?:less than|below|under)", "<"),
]


def parse_query(query: str) -> list[dict[str, Any]]:
    """Parse a natural-language query into a list of filter specs."""
    q = query.lower().strip()
    filters: list[dict[str, Any]] = []

    for name, num in _MONTHS.items():
        if re.search(rf"\b(?:in |during )?{name}\b", q):
            filters.append({"kind": "month", "value": num})
    for name, dow in _DAYS.items():
        if re.search(rf"\b{name}s?\b", q):
            filters.append({"kind": "dayofweek", "value": dow})

    for pat, op in _COMPARATORS:
        m = re.search(rf"([a-zA-Z_][a-zA-Z_0-9]*)\s*{pat}\s*([\-\d\.]+)", q)
        if m:
            filters.append({"kind": "numeric", "column": m.group(1), "op": op, "value": float(m.group(2))})
            break

    m = re.search(r"top\s+(\d+)", q)
    if m:
        filters.append({"kind": "top", "n": int(m.group(1))})

    m = re.search(r"(?:year|in)\s+(\d{4})", q)
    if m:
        filters.append({"kind": "year", "value": int(m.group(1))})

    return filters


def apply_query(records: list[dict[str, Any]], query: str, date_field: str = "date") -> dict[str, Any]:
    if not records:
        return {"results": [], "count": 0, "filters": []}
    df = pd.DataFrame(records)
    if date_field in df.columns:
        df["_dt"] = pd.to_datetime(df[date_field], errors="coerce")

    filters = parse_query(query)

    for f in filters:
        if f["kind"] == "month" and "_dt" in df.columns:
            df = df[df["_dt"].dt.month == f["value"]]
        elif f["kind"] == "dayofweek" and "_dt" in df.columns:
            df = df[df["_dt"].dt.dayofweek == f["value"]]
        elif f["kind"] == "year" and "_dt" in df.columns:
            df = df[df["_dt"].dt.year == f["value"]]
        elif f["kind"] == "numeric":
            col = f["column"]
            if col not in df.columns:
                continue
            series = pd.to_numeric(df[col], errors="coerce")
            op = f["op"]
            v = f["value"]
            if op == ">":
                df = df[series > v]
            elif op == ">=":
                df = df[series >= v]
            elif op == "<":
                df = df[series < v]
            elif op == "<=":
                df = df[series <= v]
            elif op == "==":
                df = df[series == v]
        elif f["kind"] == "top":
            # sort by the first numeric column, descending
            num_cols = [c for c in df.columns if c != "_dt" and pd.api.types.is_numeric_dtype(df[c])]
            if num_cols:
                df = df.sort_values(num_cols[0], ascending=False).head(f["n"])

    if "_dt" in df.columns:
        df = df.drop(columns=["_dt"])

    return {
        "results": df.to_dict(orient="records"),
        "count": int(len(df)),
        "filters": filters,
    }
