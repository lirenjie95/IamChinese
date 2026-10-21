"""Remote policy refresh with a deterministic fallback chain.

Order: fresh cache -> remote -> stale cache -> bundled.

The point is that **every step can fail** and the installer still has a usable
policy. A malformed remote payload is rejected, never merged; a network error
downgrades to whatever was valid before.

Nothing here runs unless the caller supplies a URL.
"""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Dict, Optional

from .policy import BUNDLED_POLICY, UNKNOWN_ACTIONS, RegionPolicy
from .storage import atomic_write_json, read_json_or_none

DEFAULT_TIMEOUT_SECONDS = 3.0
DEFAULT_MAX_AGE_DAYS = 7

FetchFn = Callable[[str, float], Dict[str, Any]]


@dataclass(frozen=True)
class PolicyUpdate:
    policy: RegionPolicy
    source: str  # "remote" | "cache" | "bundled"
    error: Optional[str] = None

    @property
    def degraded(self) -> bool:
        return self.source != "remote"

    def as_dict(self) -> Dict[str, Any]:
        return {
            "policy_version": self.policy.policy_version,
            "source": self.source,
            "degraded": self.degraded,
            "error": self.error,
        }


def default_cache_path() -> Path:
    override = os.environ.get("REGIONGATE_CACHE_DIR")
    if override:
        return Path(override) / "policy.json"
    base = (
        os.environ.get("LOCALAPPDATA")
        or os.environ.get("XDG_CACHE_HOME")
        or tempfile.gettempdir()
    )
    return Path(base) / "regiongate" / "cache" / "policy.json"


def validate_payload(payload: Any) -> RegionPolicy:
    """Turn an untrusted payload into a policy, or raise ``ValueError``.

    Rejects anything ambiguous rather than guessing: a partially valid remote
    list is more dangerous than no update at all.
    """
    if not isinstance(payload, dict):
        raise ValueError("policy payload must be a JSON object")

    version = payload.get("policy_version")
    if not isinstance(version, str) or not version.strip():
        raise ValueError("policy_version must be a non-empty string")

    supported = payload.get("supported")
    if not isinstance(supported, (list, tuple)) or not supported:
        raise ValueError("supported must be a non-empty list")

    restricted = payload.get("restricted", [])
    if not isinstance(restricted, (list, tuple)):
        raise ValueError("restricted must be a list")

    for entry in list(supported) + list(restricted):
        if not isinstance(entry, str) or len(entry.strip()) != 2:
            raise ValueError(f"country code must be two letters, got {entry!r}")

    action = payload.get("unknown_action", "warn")
    if action not in UNKNOWN_ACTIONS:
        raise ValueError(f"unknown_action must be one of {UNKNOWN_ACTIONS}")

    # RegionPolicy performs the overlap check itself.
    return RegionPolicy(
        policy_version=version,
        source="remote",
        supported=tuple(supported),
        restricted=tuple(restricted),
        unknown_action=action,
        appeal_url=payload.get("appeal_url"),
        docs_url=payload.get("docs_url"),
        notes=str(payload.get("notes", "")),
    )


def _http_get_json(url: str, timeout: float) -> Dict[str, Any]:
    import json
    import urllib.request

    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


class PolicyUpdater:
    """Resolves the policy to use, with an injectable transport and clock."""

    def __init__(
        self,
        url: Optional[str] = None,
        cache_path: Optional[Path] = None,
        fetch: Optional[FetchFn] = None,
        timeout: float = DEFAULT_TIMEOUT_SECONDS,
        max_age_days: int = DEFAULT_MAX_AGE_DAYS,
        clock: Optional[Callable[[], datetime]] = None,
    ) -> None:
        self.url = url
        self.cache_path = Path(cache_path) if cache_path else default_cache_path()
        self._fetch = fetch or _http_get_json
        self.timeout = timeout
        self.max_age_days = max_age_days
        self._clock = clock or (lambda: datetime.now(timezone.utc))

    # -- cache ---------------------------------------------------------

    def _read_cache(self) -> Optional[Dict[str, Any]]:
        data = read_json_or_none(self.cache_path)
        if not data:
            return None
        payload = data.get("payload")
        fetched_at = data.get("fetched_at")
        if not isinstance(payload, dict) or not isinstance(fetched_at, str):
            return None
        try:
            stamped = datetime.fromisoformat(fetched_at)
        except ValueError:
            return None
        if stamped.tzinfo is None:
            stamped = stamped.replace(tzinfo=timezone.utc)
        return {"payload": payload, "fetched_at": stamped}

    def _is_fresh(self, cached: Dict[str, Any]) -> bool:
        age = self._clock() - cached["fetched_at"]
        return age.days <= self.max_age_days

    # -- public --------------------------------------------------------

    def load(self, bundled: Optional[RegionPolicy] = None) -> PolicyUpdate:
        base = bundled or BUNDLED_POLICY
        cached = self._read_cache()
        error: Optional[str] = None
        cached_policy: Optional[RegionPolicy] = None

        if cached:
            try:
                cached_policy = validate_payload(cached["payload"])
            except ValueError as exc:
                error = f"invalid cache: {exc}"
            else:
                if self._is_fresh(cached):
                    return PolicyUpdate(policy=cached_policy, source="cache")

        if self.url:
            try:
                policy = validate_payload(self._fetch(self.url, self.timeout))
            except Exception as exc:  # noqa: BLE001 - any failure falls back
                error = f"{type(exc).__name__}: {exc}"
            else:
                self._write_cache(policy)
                return PolicyUpdate(policy=policy, source="remote")

        if cached_policy is not None:
            return PolicyUpdate(policy=cached_policy, source="cache", error=error)

        return PolicyUpdate(policy=base, source="bundled", error=error)

    def _write_cache(self, policy: RegionPolicy) -> None:
        payload = {
            "fetched_at": self._clock().astimezone(timezone.utc).isoformat(),
            "payload": policy.as_dict(),
        }
        atomic_write_json(self.cache_path, payload)
