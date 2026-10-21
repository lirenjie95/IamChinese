"""regiongate —— 面向中国大陆用户的地区判定内核，外加一套可选的人设生成器。

分层，互不越界：

* :func:`regiongate.preflight.preflight` —— 只读采集事实；除非调用方明确同意，
  否则不发起任何网络请求。
* :func:`regiongate.evaluate.evaluate_region` —— 用地区清单去判定这些事实。
* :func:`regiongate.gate.build_gate` —— 把结论变成文案和按钮（按了没用的一律不给）。
* :func:`regiongate.diagnostics.write_diag_bundle` —— 本地脱敏证据包。
* :func:`regiongate.update.PolicyUpdater.load` —— 可选的地区清单刷新。

另有 :func:`regiongate.persona.build_persona`：生成一套内部自洽的中国用户
人设（姓名、身份证、号段、区划、locale、时区），供 ``python -m regiongate``
的子命令落地成 profile / env 文件。它不写注册表、不改系统设置、不联网，
也不代替你去做系统配置——``plan`` 子命令打印的是给用户照做的手工清单。

一句话：这个包只负责「说清楚」和「算出一个人设」，不负责偷偷替换任何东西。
"""

from .diagnostics import (
    GUARANTEES as DIAG_GUARANTEES,
    build_payload,
    default_diag_dir,
    render_summary,
    write_diag_bundle,
)
from .evaluate import (
    EVIDENCE_TEXT,
    evaluate_region,
    explain_evidence,
    is_blocking,
    is_unknown,
)
from .gate import GateAction, GateView, build_gate, render_text
from .models import (
    APP_VERSION,
    EnvironmentSnapshot,
    RegionDecision,
    STATUS_ALLOWED,
    STATUS_NOT_SUPPORTED,
    STATUS_UNKNOWN,
)
from .persona import (
    LOCALE_BCP47,
    LOCALE_POSIX,
    LOCALE_WINDOWS,
    TIMEZONE,
    UTC_OFFSET_MINUTES,
    Persona,
    build_persona,
)
from .policy import BUNDLED_POLICY, RegionPolicy
from .preflight import (
    EgressInfo,
    FixtureEgressProvider,
    HttpEgressProvider,
    NullEgressProvider,
    PreflightOptions,
    SystemInfo,
    preflight,
    read_system_info,
)
from .reasons import REASON_CODES, REASONS, ReasonSpec
from .update import PolicyUpdate, PolicyUpdater, validate_payload

__all__ = [
    "APP_VERSION",
    "BUNDLED_POLICY",
    "DIAG_GUARANTEES",
    "EVIDENCE_TEXT",
    "EgressInfo",
    "EnvironmentSnapshot",
    "FixtureEgressProvider",
    "GateAction",
    "GateView",
    "HttpEgressProvider",
    "LOCALE_BCP47",
    "LOCALE_POSIX",
    "LOCALE_WINDOWS",
    "NullEgressProvider",
    "Persona",
    "PolicyUpdate",
    "PolicyUpdater",
    "PreflightOptions",
    "REASON_CODES",
    "REASONS",
    "ReasonSpec",
    "RegionDecision",
    "RegionPolicy",
    "STATUS_ALLOWED",
    "STATUS_NOT_SUPPORTED",
    "STATUS_UNKNOWN",
    "SystemInfo",
    "TIMEZONE",
    "UTC_OFFSET_MINUTES",
    "build_gate",
    "build_payload",
    "build_persona",
    "default_diag_dir",
    "evaluate_region",
    "explain_evidence",
    "is_blocking",
    "is_unknown",
    "preflight",
    "read_system_info",
    "render_summary",
    "render_text",
    "validate_payload",
    "write_diag_bundle",
]
