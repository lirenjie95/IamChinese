"""地区清单：这个版本服务哪些地区，其余地区怎么处理。

``BUNDLED_POLICY`` 是**样例数据**，只为跑通代码路径。它是一份 China-first 的清单——
大陆与周边可用，北美与西欧不在服务范围内——不是任何厂商真实清单的拷贝。

为什么默认 China-first：这套代码服务的用户**就在国内**，他的环境（locale / 时区 /
区域格式 / 出口）应当被读成「自洽」，而不是被读成「异常」。上一版文件正好是镜像：
``CN`` 坐在 ``restricted`` 里，样例快照是加州的一条 Comcast 家宽。
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

UNKNOWN_ACTIONS = ("allow", "warn", "block")


@dataclass(frozen=True)
class RegionPolicy:
    policy_version: str
    source: str = "bundled"
    supported: Tuple[str, ...] = ()
    restricted: Tuple[str, ...] = ()
    unknown_action: str = "warn"
    appeal_url: Optional[str] = None
    docs_url: Optional[str] = None
    notes: str = ""

    def __post_init__(self) -> None:
        if self.unknown_action not in UNKNOWN_ACTIONS:
            raise ValueError(
                f"unknown_action must be one of {UNKNOWN_ACTIONS}, "
                f"got {self.unknown_action!r}"
            )
        object.__setattr__(
            self, "supported", tuple(c.strip().upper() for c in self.supported)
        )
        object.__setattr__(
            self, "restricted", tuple(c.strip().upper() for c in self.restricted)
        )
        overlap = set(self.supported) & set(self.restricted)
        if overlap:
            raise ValueError(f"country in both lists: {sorted(overlap)}")

    def is_stale(self, today: Optional[date] = None, max_age_days: int = 180) -> bool:
        """True when the snapshot is older than ``max_age_days``.

        An unparseable version is treated as not-stale: we cannot prove decay,
        and silently blocking on a malformed date would be worse.
        """
        try:
            stamp = date.fromisoformat(self.policy_version)
        except (TypeError, ValueError):
            return False
        now = today or date.today()
        return (now - stamp).days > max_age_days

    def as_dict(self) -> Dict[str, Any]:
        return {
            "policy_version": self.policy_version,
            "source": self.source,
            "supported": list(self.supported),
            "restricted": list(self.restricted),
            "unknown_action": self.unknown_action,
            "appeal_url": self.appeal_url,
            "docs_url": self.docs_url,
            "notes": self.notes,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "RegionPolicy":
        return cls(
            policy_version=str(data.get("policy_version", "")),
            source=str(data.get("source", "remote")),
            supported=tuple(data.get("supported", ())),
            restricted=tuple(data.get("restricted", ())),
            unknown_action=str(data.get("unknown_action", "warn")),
            appeal_url=data.get("appeal_url"),
            docs_url=data.get("docs_url"),
            notes=str(data.get("notes", "")),
        )

    @classmethod
    def load(cls, path: Path) -> "RegionPolicy":
        with open(path, "r", encoding="utf-8") as handle:
            return cls.from_dict(json.load(handle))


# SAMPLE DATA — replace with your own audited snapshot before shipping.
#
# 口径：本构建面向中文用户，服务范围是「大陆 + 港澳 + 东南亚 + 日韩」。
# 北美与西欧在这一版里是明确排除的（restricted），不是因为它们「不安全」，
# 而是因为这一版的牌照与结算通道只覆盖上面那段。这属于政策结论，
# 复核也无法推翻 —— evaluate.py 据此不给 appeal 按钮。
BUNDLED_POLICY = RegionPolicy(
    policy_version="2026-10-19",
    source="bundled",
    supported=(
        "CN",
        "HK",
        "MO",
        "SG",
        "MY",
        "TH",
        "VN",
        "ID",
        "PH",
        "BN",
        "KH",
        "LA",
        "MM",
        "MN",
        "JP",
        "KR",
    ),
    restricted=(
        "US",
        "CA",
        "GB",
        "IE",
        "DE",
        "FR",
        "NL",
        "BE",
        "LU",
        "ES",
        "IT",
        "PT",
        "CH",
        "AT",
        "SE",
        "NO",
        "DK",
        "FI",
        "PL",
        "CZ",
        "AU",
        "NZ",
        "BR",
        "MX",
        "AR",
        "CL",
        "ZA",
        "IL",
        "AE",
        "IN",
    ),
    unknown_action="warn",
    appeal_url="https://example.invalid/appeal",
    docs_url="https://example.invalid/supported-regions",
    notes=(
        "中国优先的样例地区清单，仅用于本地跑通代码路径，"
        "不是任何厂商的真实地区列表；上线前必须替换为经过审计的快照。"
    ),
)
