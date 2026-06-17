"""Path-safety helpers.

Dataset and adapter ids arrive from the URL and are concatenated onto a
storage directory to build a filesystem path. Without validation a crafted id
like ``..%5C..%5Cmodels`` decodes (on Windows) to ``..\\..\\models`` and lets a
request escape the storage root. Every id is a single path segment, so we
reject anything that is not (separators, drive letters, traversal tokens).
"""

from __future__ import annotations

import re

# Letters, digits, dot, underscore, hyphen. uuid4().hex ids pass; anything
# containing a slash, backslash, colon, or whitespace does not.
_VALID_SEGMENT = re.compile(r"^[A-Za-z0-9._-]+$")


def validate_segment(value: str, *, kind: str = "identifier") -> str:
    """Return *value* unchanged if it is a safe single path segment.

    Raises ``ValueError`` (mapped to HTTP 422 by the global handler) for empty
    values, traversal tokens (``.``/``..``), or any character that could break
    out of a directory.
    """

    if not value or value in (".", "..") or not _VALID_SEGMENT.match(value):
        raise ValueError(f"Invalid {kind}.")
    return value


__all__ = ["validate_segment"]
