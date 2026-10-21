"""Single source of truth for reason codes.

Keeping the status / confidence / appealability of every outcome in one table
prevents the classic bug where the UI offers an appeal for a policy-level
exclusion that no human reviewer can overturn.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Tuple

from .models import (
    CONFIDENCE_HIGH,
    CONFIDENCE_LOW,
    CONFIDENCE_MEDIUM,
    STATUS_ALLOWED,
    STATUS_NOT_SUPPORTED,
    STATUS_UNKNOWN,
)


@dataclass(frozen=True)
class ReasonSpec:
    code: str
    status: str
    confidence: str
    message_key: str
    next_actions: Tuple[str, ...]
    appealable: bool
    summary: str


REASONS: Dict[str, ReasonSpec] = {
    "OK": ReasonSpec(
        code="OK",
        status=STATUS_ALLOWED,
        confidence=CONFIDENCE_HIGH,
        message_key="region.allowed",
        next_actions=("install",),
        appealable=False,
        summary="Region is supported and the environment looks self-consistent.",
    ),
    "OK_WITH_WARNINGS": ReasonSpec(
        code="OK_WITH_WARNINGS",
        status=STATUS_ALLOWED,
        confidence=CONFIDENCE_HIGH,
        message_key="region.allowed_with_warnings",
        next_actions=("install", "read_docs"),
        appealable=False,
        summary="Region is supported, but some signals are inconsistent.",
    ),
    "OK_UNLISTED": ReasonSpec(
        code="OK_UNLISTED",
        status=STATUS_ALLOWED,
        confidence=CONFIDENCE_MEDIUM,
        message_key="region.unlisted",
        next_actions=("install", "read_docs"),
        appealable=False,
        summary="Region is not on any list; policy allows proceeding.",
    ),
    "W_REGION_UNLISTED": ReasonSpec(
        code="W_REGION_UNLISTED",
        status=STATUS_UNKNOWN,
        confidence=CONFIDENCE_MEDIUM,
        message_key="region.unlisted_unknown",
        next_actions=("read_docs", "appeal", "local_only"),
        appealable=True,
        summary="Region is not on any list; availability cannot be confirmed.",
    ),
    "E_REGION_UNLISTED": ReasonSpec(
        code="E_REGION_UNLISTED",
        status=STATUS_NOT_SUPPORTED,
        confidence=CONFIDENCE_MEDIUM,
        message_key="region.unlisted_blocked",
        next_actions=("read_docs", "appeal", "exit"),
        appealable=True,
        summary="Region is not on any list and policy blocks proceeding.",
    ),
    "E_REGION_RESTRICTED": ReasonSpec(
        code="E_REGION_RESTRICTED",
        status=STATUS_NOT_SUPPORTED,
        confidence=CONFIDENCE_HIGH,
        message_key="region.restricted",
        next_actions=("read_docs", "exit"),
        appealable=False,
        summary="Region is explicitly excluded. This is policy, not a mistake.",
    ),
    "E_NO_NETWORK_DATA": ReasonSpec(
        code="E_NO_NETWORK_DATA",
        status=STATUS_UNKNOWN,
        confidence=CONFIDENCE_LOW,
        message_key="region.unknown_no_net",
        next_actions=("retry", "read_docs", "local_only"),
        appealable=False,
        summary="Network egress could not be determined, so region is unknown.",
    ),
    "E_POLICY_STALE": ReasonSpec(
        code="E_POLICY_STALE",
        status=STATUS_UNKNOWN,
        confidence=CONFIDENCE_LOW,
        message_key="region.policy_stale",
        next_actions=("retry", "read_docs"),
        appealable=False,
        summary="The bundled policy snapshot is old; the verdict may be outdated.",
    ),
}

REASON_CODES = tuple(REASONS)
