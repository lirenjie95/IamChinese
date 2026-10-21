"""Stage 3'：把判定变成人看得懂、点得动的东西。

这个模块强制的三条规则：

1. 审核方给不了的东西，界面上不出现。地区被政策排除时，“提交复核申请”
   这个按钮根本不存在。
2. 按钮是算出来的集合，不是照着 ``next_actions`` 抄下来的清单。
3. 硬阻断时不给"继续"按钮，但永远保留"退出"。
4. 文案顺序固定：先说结论，再说依据，最后说下一步。
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Sequence, Tuple

from .evaluate import explain_evidence
from .models import RegionDecision
from .policy import BUNDLED_POLICY, RegionPolicy

ACTION_LABELS: Dict[str, str] = {
    "install": "继续安装",
    "retry": "重新检测",
    "read_docs": "阅读支持地区说明",
    "appeal": "提交复核申请",
    "local_only": "仅本地模式继续",
    "exit": "退出安装",
}

ACTION_KIND: Dict[str, str] = {
    "install": "primary",
    "retry": "primary",
    "appeal": "primary",
    "local_only": "secondary",
    "read_docs": "secondary",
    "exit": "secondary",
}

ACTION_ORDER: Tuple[str, ...] = (
    "install",
    "retry",
    "local_only",
    "appeal",
    "read_docs",
    "exit",
)

TITLES: Dict[str, str] = {
    "OK": "可以继续安装",
    "OK_WITH_WARNINGS": "可以继续安装",
    "OK_UNLISTED": "可以继续安装",
    "W_REGION_UNLISTED": "暂时无法确认该地区是否可用",
    "E_REGION_UNLISTED": "该地区不在支持清单内",
    "E_REGION_RESTRICTED": "该服务目前不在你所在地区提供",
    "E_NO_NETWORK_DATA": "无法确定当前地区",
}

BODIES: Dict[str, str] = {
    "OK": "你的网络出口位于受支持地区（{country}）。",
    "OK_WITH_WARNINGS": (
        "你的网络出口位于受支持地区（{country}）。"
        "不过环境中有几项信号不自洽，通常不影响使用；若后续遇到验证问题，可参考自查清单。"
    ),
    "OK_UNLISTED": (
        "该地区（{country}）未列入支持清单，但当前策略允许继续，因此不阻止安装。"
    ),
    "W_REGION_UNLISTED": (
        "该地区（{country}）未列入支持清单，我们无法提前确认可用性。"
        "这不代表你不能使用，但后续可能遇到地区校验。"
    ),
    "E_REGION_UNLISTED": (
        "该地区（{country}）未列入支持清单，当前策略不允许继续。"
        "如果你认为这是误判，可以提交复核。"
    ),
    "E_REGION_RESTRICTED": (
        "你的网络出口位于 {country}，该地区不在服务支持范围内。"
        "这是服务提供方的地区政策，与你的账号状态无关，"
        "提交复核不会改变结果。"
    ),
    "E_NO_NETWORK_DATA": (
        "我们没有获取到网络出口信息（可能未联网，或网络受限）。"
        "这不代表你不能使用，但我们无法提前确认可用性。"
    ),
}


@dataclass(frozen=True)
class GateAction:
    key: str
    label: str
    kind: str
    url: Optional[str] = None
    enabled: bool = True


@dataclass(frozen=True)
class GateView:
    title: str
    body: str
    bullets: Tuple[str, ...]
    actions: Tuple[GateAction, ...]
    show_diagnostics: bool = True


def _country(decision: RegionDecision) -> str:
    for token in decision.evidence:
        if token.startswith("egress_country="):
            return token.split("=", 1)[1]
    return "未知地区"


def _bullets(decision: RegionDecision) -> Tuple[str, ...]:
    seen = set()
    ordered = []
    for token in decision.evidence:
        if token in seen:
            continue
        seen.add(token)
        text = explain_evidence(token)
        if text and text not in ordered:
            ordered.append(text)
    return tuple(ordered)


def _resolve_url(key: str, policy: RegionPolicy) -> Optional[str]:
    if key == "appeal":
        return policy.appeal_url
    if key == "read_docs":
        return policy.docs_url
    return None


def build_gate(
    decision: RegionDecision, policy: Optional[RegionPolicy] = None
) -> GateView:
    """Assemble the Stage 3' screen. Pure; safe to call repeatedly."""
    active = policy or BUNDLED_POLICY
    country = _country(decision)
    title = TITLES.get(decision.reason_code, "安装可以继续")
    body = BODIES.get(decision.reason_code, "").format(country=country)

    available = set(decision.next_actions)

    # An appeal is only offered when a human could actually grant it.
    if not decision.is_appealable or not active.appeal_url:
        available.discard("appeal")
    if not active.docs_url:
        available.discard("read_docs")
    if decision.status == "not_supported":
        available.discard("install")
    if not available:
        available.add("exit")

    ordered = sorted(available, key=ACTION_ORDER.index)
    actions = tuple(
        GateAction(
            key=key,
            label=ACTION_LABELS.get(key, key),
            kind=ACTION_KIND.get(key, "secondary"),
            url=_resolve_url(key, active),
        )
        for key in ordered
    )

    return GateView(
        title=title,
        body=body,
        bullets=_bullets(decision),
        actions=actions,
        show_diagnostics=True,
    )


def render_text(view: GateView) -> str:
    """Plain-text rendering, for terminals, logs, and tests."""
    lines = [view.title, ""]
    if view.body:
        lines.extend([view.body, ""])
    for bullet in view.bullets:
        lines.append(f"  · {bullet}")
    if view.bullets:
        lines.append("")
    lines.append("  ".join(f"[{action.label}]" for action in view.actions))
    if view.show_diagnostics:
        lines.extend(["", "（如有需要，可生成脱敏诊断包；安装器不会自动上传）"])
    return "\n".join(lines)
