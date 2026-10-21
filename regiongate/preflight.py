"""Stage 1：只读采集环境事实。

这里强制执行的几条设计规则：

* 不修改宿主上的任何东西——不改 locale、不改时区、不写注册表、不改请求头。
* 除非调用方**明确同意** *并且* 显式传入出口查询实现，否则不发出任何外部请求。
* 每次网络调用都有短超时，失败时降级成 ``None``，而不是让安装流程卡死或报错。
"""

from __future__ import annotations

import json
import os
import platform
import time
from dataclasses import dataclass
from datetime import datetime, timezone as dt_timezone
from typing import Any, Dict, Optional, Protocol, Tuple

from .models import APP_VERSION, EnvironmentSnapshot
from .signals import (
    classify_asn,
    detect_proxy_hint,
    is_ip_locale_consistent,
    is_locale_tz_consistent,
    mask_ip,
)

DEFAULT_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True)
class SystemInfo:
    os_name: str
    os_version: str
    locale: str
    timezone: str
    region_format: str


@dataclass(frozen=True)
class EgressInfo:
    ip: Optional[str]
    country: Optional[str]
    asn: Optional[str] = None
    org: Optional[str] = None


class EgressProvider(Protocol):
    """Anything that can report the public egress address."""

    def fetch(self, timeout: float) -> Optional[EgressInfo]: ...


class NullEgressProvider:
    """Default provider: reports nothing and sends nothing."""

    def fetch(self, timeout: float) -> Optional[EgressInfo]:
        return None


class FixtureEgressProvider:
    """Deterministic provider for tests and for ``--offline`` demos."""

    def __init__(self, info: Optional[EgressInfo] = None) -> None:
        self.info = info
        self.calls = 0

    def fetch(self, timeout: float) -> Optional[EgressInfo]:
        self.calls += 1
        return self.info


class HttpEgressProvider:
    """Opt-in provider that queries a caller-supplied geo endpoint.

    Disabled by default (``url=None``). The endpoint is chosen by the
    integrator; no vendor default is baked in.
    """

    FIELD_MAP: Dict[str, Tuple[str, ...]] = {
        "ip": ("ip", "query"),
        "country": ("country", "country_code"),
        "asn": ("asn",),
        "org": ("org", "isp", "as"),
    }

    def __init__(self, url: Optional[str] = None) -> None:
        self.url = url
        self.last_error: Optional[str] = None

    def fetch(self, timeout: float) -> Optional[EgressInfo]:
        if not self.url:
            return None
        try:
            import urllib.request

            request = urllib.request.Request(
                self.url,
                headers={"User-Agent": f"regiongate/{APP_VERSION}"},
            )
            with urllib.request.urlopen(request, timeout=timeout) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except Exception as exc:  # noqa: BLE001 - degrade, never abort
            self.last_error = f"{type(exc).__name__}: {exc}"
            return None

        def pick(key: str) -> Optional[str]:
            for candidate in self.FIELD_MAP.get(key, ()):
                value = payload.get(candidate)
                if value:
                    return str(value)
            return None

        return EgressInfo(
            ip=pick("ip"),
            country=pick("country"),
            asn=pick("asn"),
            org=pick("org"),
        )


@dataclass
class PreflightOptions:
    consent_network: bool = False
    consent_telemetry: bool = False
    ui_language: str = "en"
    timeout: float = DEFAULT_TIMEOUT_SECONDS
    system_info: Optional[SystemInfo] = None
    egress_provider: Optional[EgressProvider] = None
    clock: Optional[Any] = None


def read_system_info() -> SystemInfo:
    """Read system facts without changing them."""
    import locale as locale_module

    try:
        raw_locale = locale_module.getlocale()[0] or ""
    except Exception:  # noqa: BLE001 - locale probing must never crash
        raw_locale = ""

    return SystemInfo(
        os_name=platform.system() or "unknown",
        os_version=platform.version() or "unknown",
        locale=raw_locale,
        timezone=_detect_timezone(),
        region_format=raw_locale,
    )


def _detect_timezone() -> str:
    try:
        from tzlocal import get_localzone  # type: ignore

        return str(get_localzone())
    except Exception:  # noqa: BLE001 - optional dependency
        pass

    env_tz = os.environ.get("TZ")
    if env_tz:
        return env_tz

    # Last resort: a fixed-offset label. It is deliberately not mapped to a
    # country, so consistency checks return None instead of guessing.
    offset_seconds = -time.timezone
    sign = "+" if offset_seconds >= 0 else "-"
    hours, remainder = divmod(abs(offset_seconds), 3600)
    minutes = remainder // 60
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def preflight(options: Optional[PreflightOptions] = None) -> EnvironmentSnapshot:
    """Collect an :class:`EnvironmentSnapshot`. Pure read, safe to retry."""
    opts = options or PreflightOptions()
    info = opts.system_info or read_system_info()

    egress: Optional[EgressInfo] = None
    if opts.consent_network:
        provider = opts.egress_provider
        if provider is not None:
            try:
                egress = provider.fetch(opts.timeout)
            except Exception:  # noqa: BLE001 - a failed probe is not fatal
                egress = None

    asn_type = classify_asn(egress.asn, egress.org) if egress else "unknown"
    country = egress.country.upper() if egress and egress.country else None

    clock = opts.clock or (lambda: datetime.now(dt_timezone.utc))
    collected_at = clock().astimezone(dt_timezone.utc).isoformat()

    return EnvironmentSnapshot(
        os_name=info.os_name,
        os_version=info.os_version,
        locale=info.locale,
        timezone=info.timezone,
        ui_language=opts.ui_language,
        region_format=info.region_format,
        egress_ip=mask_ip(egress.ip) if egress else None,
        egress_country=country,
        egress_asn=egress.asn if egress else None,
        asn_type=asn_type,
        proxy_hint=detect_proxy_hint(asn_type) if egress else "unknown",
        locale_tz_consistent=is_locale_tz_consistent(info.locale, info.timezone),
        ip_locale_consistent=is_ip_locale_consistent(country, info.locale),
        collected_at=collected_at,
        consent={
            "network": opts.consent_network,
            "telemetry": opts.consent_telemetry,
        },
        redactions=("egress_ip",),
    )
