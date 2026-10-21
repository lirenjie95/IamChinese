"""The only module in the package allowed to touch the disk.

Keeping every write in one place makes the static invariant in
``tests/test_invariants.py`` meaningful: one audited module instead of write
calls scattered across the codebase.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, Iterable, Optional, Tuple, Union

PathLike = Union[str, Path]


def read_json(path: PathLike) -> Dict[str, Any]:
    """Read a JSON object. Raises on malformed input; callers decide policy."""
    with open(Path(path), "r", encoding="utf-8") as handle:
        data = json.load(handle)
    if not isinstance(data, dict):
        raise ValueError(f"expected a JSON object in {path}")
    return data


def atomic_write_json(path: PathLike, payload: Dict[str, Any]) -> Path:
    """Write JSON so a crash can never leave a half-written file.

    Writes to a sibling temp file, fsyncs, then ``os.replace`` (atomic on both
    POSIX and Windows). No directory tree is deleted, ever.

    The temp file is a sibling rather than a system-temp entry on purpose:
    ``os.replace`` across volumes is not atomic, and some sandboxed
    environments make file creation under the system temp root expensive.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)

    temp_path = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, target)
    except BaseException:
        _silent_unlink(str(temp_path))
        raise
    return target


def atomic_write_text(path: PathLike, text: str) -> Path:
    """Write UTF-8 text with the same crash-safety as :func:`atomic_write_json`."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)

    temp_path = target.with_name(f".{target.name}.{os.getpid()}.tmp")
    try:
        with open(temp_path, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_path, target)
    except BaseException:
        _silent_unlink(str(temp_path))
        raise
    return target


def remove_files(paths: Iterable[PathLike]) -> Tuple[str, ...]:
    """Delete exactly the files named, never a tree. Returns what was removed."""
    removed = []
    for item in paths:
        candidate = Path(item)
        try:
            if candidate.is_file():
                os.unlink(candidate)
                removed.append(str(candidate))
        except OSError:
            continue
    return tuple(removed)


def read_json_or_none(path: Optional[PathLike]) -> Optional[Dict[str, Any]]:
    """Read JSON, returning ``None`` for missing or unreadable files."""
    if not path:
        return None
    try:
        return read_json(path)
    except (OSError, ValueError):
        return None


def _silent_unlink(path: str) -> None:
    try:
        os.unlink(path)
    except OSError:
        pass
