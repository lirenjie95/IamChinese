"""Stage 2：把环境快照变成地区判定。

顺序本身就是这个模块的全部要点：

1. 没有网络数据 → ``unknown``（可重试，不是判决）
2. 明确列在 restricted 里 → ``not_supported``（政策结论，不可申诉）
3. Explicitly supported -> "allowed" (possibly with consistency warnings)
4. On neither list -> follow ``policy.unknown_action``

Collapsing steps 1 and 2 into a single "install failed" is the bug this
module exists to prevent.
"""

from __future__ import annotations

from datetime import date
from typing import Optional, Tuple

from .models import (
    STATUS_NOT_SUPPORTED,
    STATUS_UNKNOWN,
    EnvironmentSnapshot,
    RegionDecision,
)
from .policy import BUNDLED_POLICY, RegionPolicy
from .reasons import REASONS

EVIDENCE_TEXT = {
    "locale_timezone_mismatch": (
        "系统语言与系统时区指向不同地区（常见于出差、旅行或迁移中）"
    ),
    "ip_locale_mismatch": (
        "网络出口所在国与系统语言地区不一致（常见于使用代理或跨境办公）"
    ),
    "datacenter_egress": (
        "网络出口属于数据中心 ASN，而非住宅或移动网络"
    ),
    "proxy_suspected": (
        "检测到疑似代理出口（仅提示，不代表违规）"
    ),
    "policy_stale": (
        "内置地区清单快照已过期，结论可能不是最新"
    ),
}


def _building_warnings(snapshot: EnvironmentSnapshot) -> Tuple[str, ...]:
    warnings = []
    if snapshot.locale_tz_consistent is False:
        warnings.append("locale_timezone_mismatch")
    if snapshot.ip_locale_consistent is False:
        warnings.append("ip_locale_mismatch")
    if snapshot.asn_type == "datacenter":
        warnings.append("datacenter_egress")
    if snapshot.proxy_hint == "suspected":
        warnings.append("proxy_suspected")
    return tuple(warnings)


def _decision(
    code: str,
    evidence: Tuple[str, ...],
    policy: RegionPolicy,
    stale: bool,
    warnings: Tuple[str, ...] = (),
) -> RegionDecision:
    spec = REASONS[code]
    merged_warnings = tuple(warnings)
    if stale and "policy_stale" not in merged_warnings:
        merged_warnings = merged_warnings + ("policy_stale",)
    return RegionDecision(
        status=spec.status,
        reason_code=spec.code,
        evidence=evidence,
        confidence=spec.confidence,
        user_message_key=spec.message_key,
        next_actions=spec.next_actions,
        policy_version=policy.policy_version,
        policy_stale=stale,
        warnings=merged_warnings,
    )


def evaluate_region(
    snapshot: EnvironmentSnapshot,
    policy: Optional[RegionPolicy] = None,
    today: Optional[date] = None,
) -> RegionDecision:
    """Evaluate one snapshot against one policy. Pure, deterministic."""
    active = policy or BUNDLED_POLICY
    stale = active.is_stale(today)

    # 1) We genuinely do not know where this machine is.
    if not snapshot.has_network_data:
        return _decision(
            "E_NO_NETWORK_DATA",
            evidence=(),
            policy=active,
            stale=stale,
            warnings=(),
        )

    country = (snapshot.egress_country or "").upper()
    base = (f"egress_country={country}",)

    # 2) Policy-level exclusion: no reviewer can overturn this.
    if country in active.restricted:
        return _decision(
            "E_REGION_RESTRICTED",
            evidence=base,
            policy=active,
            stale=stale,
            warnings=(),
        )

    # 3) Supported: proceed, but surface inconsistency instead of hiding it.
    if country in active.supported:
        warnings = _building_warnings(snapshot)
        code = "OK_WITH_WARNINGS" if warnings else "OK"
        return _decision(
            code,
            evidence=base + warnings,
            policy=active,
            stale=stale,
            warnings=warnings,
        )

    # 4) Unlisted: follow the policy's stance for the grey zone.
    warnings = _building_warnings(snapshot)
    if active.unknown_action == "allow":
        code = "OK_UNLISTED"
    elif active.unknown_action == "warn":
        code = "W_REGION_UNLISTED"
    else:
        code = "E_REGION_UNLISTED"
    return _decision(
        code,
        evidence=base + warnings,
        policy=active,
        stale=stale,
        warnings=warnings,
    )


def explain_evidence(line: str) -> str:
    """Human-readable gloss for one evidence token."""
    if line.startswith("egress_country="):
        return f"网络出口所在国：{line.split('=', 1)[1]}"
    return EVIDENCE_TEXT.get(line, line)


def is_blocking(decision: RegionDecision) -> bool:
    """True when the installer must not proceed by default."""
    return decision.status == STATUS_NOT_SUPPORTED


def is_unknown(decision: RegionDecision) -> bool:
    """True when the outcome is inconclusive rather than a verdict."""
    return decision.status == STATUS_UNKNOWN
