"""Data model for the transparent region-aware installer.

Pure data + redaction helpers. No I/O, no network, no host mutation.
All dataclasses are frozen: a decision, once made, cannot be edited in place.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, Optional, Tuple

from .signals import mask_ip

APP_VERSION = "0.1.0"

STATUS_ALLOWED = "allowed"
STATUS_NOT_SUPPORTED = "not_supported"
STATUS_UNKNOWN = "unknown"
STATUSES = (STATUS_ALLOWED, STATUS_NOT_SUPPORTED, STATUS_UNKNOWN)

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"
CONFIDENCES = (CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, CONFIDENCE_LOW)


@dataclass(frozen=True)
class EnvironmentSnapshot:
    """Everything the installer knows about the host, collected read-only."""

    # --- system facts ---
    os_name: str
    os_version: str
    locale: str
    timezone: str
    ui_language: str
    region_format: str

    # --- network facts (only when the user consented) ---
    egress_ip: Optional[str] = None
    egress_country: Optional[str] = None
    egress_asn: Optional[str] = None
    asn_type: str = "unknown"
    proxy_hint: str = "unknown"

    # --- locally derived consistency flags; None means "could not determine" ---
    locale_tz_consistent: Optional[bool] = None
    ip_locale_consistent: Optional[bool] = None

    # --- provenance ---
    collected_at: str = ""
    consent: Dict[str, bool] = field(default_factory=dict)
    redactions: Tuple[str, ...] = ()

    @property
    def has_network_data(self) -> bool:
        return bool(self.egress_country)

    def as_redacted_dict(self) -> Dict[str, Any]:
        """Serialise for a diagnostic bundle. IP is always masked."""
        data = asdict(self)
        data["egress_ip"] = mask_ip(self.egress_ip)
        data["redactions"] = list(self.redactions)
        return data


@dataclass(frozen=True)
class RegionDecision:
    """The outcome of evaluating a snapshot against a policy."""

    status: str
    reason_code: str
    evidence: Tuple[str, ...] = ()
    confidence: str = CONFIDENCE_LOW
    user_message_key: str = ""
    next_actions: Tuple[str, ...] = ()
    policy_version: str = ""
    policy_stale: bool = False
    warnings: Tuple[str, ...] = ()

    def __post_init__(self) -> None:
        if self.status not in STATUSES:
            raise ValueError(f"invalid status: {self.status!r}")
        if self.confidence not in CONFIDENCES:
            raise ValueError(f"invalid confidence: {self.confidence!r}")

    @property
    def is_appealable(self) -> bool:
        from .reasons import REASONS

        spec = REASONS.get(self.reason_code)
        return bool(spec and spec.appealable)

    def as_dict(self) -> Dict[str, Any]:
        data = asdict(self)
        data["evidence"] = list(self.evidence)
        data["next_actions"] = list(self.next_actions)
        data["warnings"] = list(self.warnings)
        data["is_appealable"] = self.is_appealable
        return data
