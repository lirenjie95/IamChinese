"""Stage 5: build a local, redacted diagnostic bundle.

Rules:

* Written locally only. Nothing is uploaded — there is no upload function here.
* The full egress address never enters the bundle, even if a caller passes a
  raw snapshot.
* Any key that smells like a device or credential identifier is dropped.
* Any IPv4 literal remaining in a string value is masked on the way out.
"""

from __future__ import annotations

import os
import re
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping, Optional, Tuple

from .models import APP_VERSION, EnvironmentSnapshot, RegionDecision
from .signals import mask_ip
from .storage import atomic_write_json

SCHEMA_VERSION = 1

_SENSITIVE_KEYS = (
    "fingerprint",
    "device_id",
    "machine_id",
    "mac_address",
    "serial",
    "hostname",
    "username",
    "email",
    "token",
    "cookie",
    "password",
    "session",
)

_IPV4 = re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b")

GUARANTEES: Tuple[str, ...] = (
    "full_ip_masked",
    "no_device_fingerprint",
    "no_credentials",
    "no_telemetry_identifiers",
    "not_uploaded",
)


@dataclass(frozen=True)
class DiagBundle:
    path: Path
    payload: Dict[str, Any]


def default_diag_dir() -> Path:
    override = os.environ.get("REGIONGATE_DIAG_DIR")
    if override:
        return Path(override)
    base = (
        os.environ.get("LOCALAPPDATA")
        or os.environ.get("XDG_CACHE_HOME")
        or tempfile.gettempdir()
    )
    return Path(base) / "regiongate" / "diag"


def _scrub(value: Any, key: str = "") -> Any:
    """Recursively drop sensitive keys and mask any residual IP literal."""
    if key and any(token in key.lower() for token in _SENSITIVE_KEYS):
        return "<redacted>"
    if isinstance(value, Mapping):
        return {str(k): _scrub(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_scrub(item) for item in value]
    if isinstance(value, str):
        if _IPV4.fullmatch(value.strip()):
            return mask_ip(value)
        return _IPV4.sub(lambda match: mask_ip(match.group(0)) or "<redacted>", value)
    return value


def build_payload(
    snapshot: EnvironmentSnapshot,
    decision: RegionDecision,
    verify: Optional[Mapping[str, Any]] = None,
    now: Optional[datetime] = None,
) -> Dict[str, Any]:
    created = now or datetime.now(timezone.utc)
    raw: Dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "app_version": APP_VERSION,
        "created_at": created.astimezone(timezone.utc).isoformat(),
        "policy": {
            "version": decision.policy_version,
            "stale": decision.policy_stale,
        },
        "consent": dict(snapshot.consent),
        "snapshot": snapshot.as_redacted_dict(),
        "decision": decision.as_dict(),
        "verify": dict(verify) if verify else None,
        "guarantees": list(GUARANTEES),
        "uploaded": False,
    }
    return _scrub(raw)


def write_diag_bundle(
    snapshot: EnvironmentSnapshot,
    decision: RegionDecision,
    verify: Optional[Mapping[str, Any]] = None,
    out_dir: Optional[Path] = None,
    now: Optional[datetime] = None,
) -> DiagBundle:
    """Write a bundle and return its path. Never raises for path collisions."""
    created = now or datetime.now(timezone.utc)
    directory = Path(out_dir) if out_dir else default_diag_dir()
    stamp = created.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = directory / f"diag-{stamp}.json"

    payload = build_payload(snapshot, decision, verify=verify, now=created)
    written = atomic_write_json(path, payload)
    return DiagBundle(path=written, payload=payload)


def render_summary(bundle: DiagBundle) -> str:
    """Short human-readable line for the UI."""
    return (
        f"诊断包已生成：{bundle.path}\n"
        f"已脱敏：完整 IP、设备指纹、凭证、遥测标识均不在包内。\n"
        f"是否提交由你决定 —— 安装器不会自动上传。"
    )
