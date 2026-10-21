"""信号推导：把原始环境事实变成可判定的几个布尔/枚举。

只有纯函数：不读文件、不联网、不改宿主。任何一项判不出来时返回 ``None``，
强迫调用方区分「否」和「不知道」——这两者混在一起是误判的主要来源。

词汇表刻意做成中国形状：这个版本里，电信/联通/移动的出口配 ``zh-CN``
才是**自洽**的样子；反过来，一条 Comcast 家宽配 ``zh-CN`` 才是异常。
这正是上一版仓库的镜像。
"""

from __future__ import annotations

import re
from typing import Optional

# A deliberately small, curated subset. Unknown zones yield None (unknown),
# never a guessed country.
TIMEZONE_TO_COUNTRY = {
    "Asia/Shanghai": "CN",
    "Asia/Chongqing": "CN",
    "Asia/Urumqi": "CN",
    "Asia/Harbin": "CN",
    "Asia/Hong_Kong": "HK",
    "Asia/Macau": "MO",
    "Asia/Taipei": "TW",
    "Asia/Tokyo": "JP",
    "Asia/Seoul": "KR",
    "Asia/Pyongyang": "KP",
    "Asia/Singapore": "SG",
    "Asia/Kolkata": "IN",
    "Asia/Calcutta": "IN",
    "Asia/Dhaka": "BD",
    "Asia/Karachi": "PK",
    "Asia/Dubai": "AE",
    "Asia/Riyadh": "SA",
    "Asia/Bangkok": "TH",
    "Asia/Jakarta": "ID",
    "Asia/Manila": "PH",
    "Asia/Kuala_Lumpur": "MY",
    "Asia/Ho_Chi_Minh": "VN",
    "Asia/Saigon": "VN",
    "Asia/Phnom_Penh": "KH",
    "Asia/Vientiane": "LA",
    "Asia/Yangon": "MM",
    "Asia/Ulaanbaatar": "MN",
    "Asia/Jerusalem": "IL",
    "Europe/London": "GB",
    "Europe/Dublin": "IE",
    "Europe/Paris": "FR",
    "Europe/Berlin": "DE",
    "Europe/Madrid": "ES",
    "Europe/Rome": "IT",
    "Europe/Lisbon": "PT",
    "Europe/Amsterdam": "NL",
    "Europe/Brussels": "BE",
    "Europe/Zurich": "CH",
    "Europe/Vienna": "AT",
    "Europe/Stockholm": "SE",
    "Europe/Oslo": "NO",
    "Europe/Copenhagen": "DK",
    "Europe/Helsinki": "FI",
    "Europe/Warsaw": "PL",
    "Europe/Prague": "CZ",
    "Europe/Moscow": "RU",
    "Europe/Kyiv": "UA",
    "Europe/Kiev": "UA",
    "America/New_York": "US",
    "America/Chicago": "US",
    "America/Denver": "US",
    "America/Phoenix": "US",
    "America/Los_Angeles": "US",
    "America/Anchorage": "US",
    "Pacific/Honolulu": "US",
    "America/Toronto": "CA",
    "America/Vancouver": "CA",
    "America/Mexico_City": "MX",
    "America/Sao_Paulo": "BR",
    "America/Argentina/Buenos_Aires": "AR",
    "America/Santiago": "CL",
    "Australia/Sydney": "AU",
    "Australia/Melbourne": "AU",
    "Australia/Perth": "AU",
    "Pacific/Auckland": "NZ",
    "Africa/Johannesburg": "ZA",
    "Africa/Lagos": "NG",
    "Africa/Cairo": "EG",
    "Africa/Nairobi": "KE",
}

# 云厂商 / 机房。匹配顺序在移动与家宽之前：一间云同时卖 CDN 和宽带时，
# "这是机房" 是更强也更该被提示的结论。
_DATACENTER_HINTS = (
    "amazon", "aws", "google cloud", "google llc", "microsoft", "azure",
    "digitalocean", "linode", "akamai", "ovh", "hetzner", "vultr",
    "cloudflare", "leaseweb", "m247", "choopa", "contabo", "scaleway",
    "upcloud", "oracle cloud",
    # 中国境内的云与 IDC
    "aliyun", "alibaba", "阿里云", "阿里巴巴",
    "tencent", "tencent cloud", "腾讯云", "腾讯",
    "huawei cloud", "huaweicloud", "华为云", "华为技术",
    "baidu", "百度云", "百度",
    "jd cloud", "jdcloud", "京东云",
    "ucloud", "u cloud", "优刻得",
    "qingcloud", "青云",
    "kingsoft", "金山云",
    "volcengine", "火山引擎", "bytedance", "字节跳动",
    "chinacache", "网宿", "wangsu",
    "21vianet", "世纪互联",
    "sinet", "中国电信云计算",
)

# 移动网络
_MOBILE_HINTS = (
    "mobile", "cellular", "wireless", "gsm", "lte", "4g", "5g",
    "china mobile", "中国移动", "cmnet", "cmcc",
    "china unicom mobile", "中国联通移动",
    "china telecom mobile", "中国电信移动",
)

# 家宽 / 固网运营商
_RESIDENTIAL_HINTS = (
    "telecom", "unicom", "broadband", "cable", "fiber", "fibre",
    "comcast", "verizon", "at&t", "vodafone", "singnet", "starhub",
    "charter", "cox", "centurylink", "bt ", "orange", "deutsche telekom",
    # 中国大陆固网
    "china telecom", "中国电信", "chinanet", "chinatelecom",
    "china unicom", "中国联通", "cuii", "chinaunicom",
    "great wall broadband", "长城宽带", "gwbn",
    "dr.peng", "drpeng", "鹏博士",
    "tietong", "铁通",
    "china broadnet", "中国广电", "广电宽带",
    "cernet", "教育网",
    # 港澳台与周边
    "hkt", "hkbn", "pccw", "和记", "中华电信", "hinet", "cht ",
    "singtel", "m1 limited", "kddi", "ntt",
)

# BCP-47 里不是地区的子标签。不排掉它们，``zh-Hans-CN`` 会被读成 ``HA``。
_SCRIPT_SUBTAGS = frozenset(
    {"hans", "hant", "latn", "cyrl", "arab", "deva", "jpan", "kore"}
)

# Windows 上 ``locale.getlocale()[0]`` 返回的是显示名而不是 BCP-47，
# 例如 ``Chinese (Simplified)_China``。中文用户是这条路径的主要受害者：
# 拿不到地区码，一致性检查就永远返回 None。
_WINDOWS_DISPLAY_REGIONS = {
    "china": "CN",
    "chinese (simplified)_china": "CN",
    "chinese (simplified)_singapore": "SG",
    "chinese (traditional)_hong kong sar": "HK",
    "chinese (traditional)_macao sar": "MO",
    "chinese (traditional)_taiwan": "TW",
    "english_united states": "US",
    "english_united kingdom": "GB",
    "japanese_japan": "JP",
    "korean_korea": "KR",
    "german_germany": "DE",
    "french_france": "FR",
}


def mask_ip(ip: Optional[str]) -> Optional[str]:
    """Mask an address so it is safe to display or attach to a report.

    IPv4: last octet replaced with 0. IPv6: keep the first 64 bits.
    Anything unparseable becomes ``"***"`` — never echo the raw value.
    """
    if not ip:
        return None
    value = ip.strip()
    if not value:
        return None
    if ":" in value:
        groups = [g for g in value.split(":") if g]
        if len(groups) < 4:
            return "::"
        return ":".join(groups[:4]) + "::"
    parts = value.split(".")
    if len(parts) != 4:
        return "***"
    return ".".join(parts[:3]) + ".0"


def locale_region(locale: Optional[str]) -> Optional[str]:
    """Extract the region subtag from a locale string.

    ``"en-US"`` -> ``"US"``, ``"zh_CN.UTF-8"`` -> ``"CN"``,
    ``"zh-Hans-CN"`` -> ``"CN"``, ``"Chinese (Simplified)_China"`` -> ``"CN"``,
    ``"C"`` -> ``None``.
    """
    if not locale:
        return None
    raw = locale.split(".", 1)[0].strip()
    if not raw:
        return None
    if raw.upper() in {"C", "POSIX", "ROOT"}:
        return None

    windows_region = _WINDOWS_DISPLAY_REGIONS.get(raw.lower())
    if windows_region:
        return windows_region

    # Walk the subtags from the right so a script tag cannot shadow the region:
    # ``zh-Hans-CN`` -> ("zh", "Hans", "CN") -> "CN", never "HA".
    for tag in reversed(re.split(r"[-_]", raw)[1:]):
        if len(tag) == 2 and tag.isalpha() and tag.lower() not in _SCRIPT_SUBTAGS:
            return tag.upper()
        if len(tag) == 3 and tag.isdigit():
            # UN M.49 numeric region (e.g. ``es-419``); not in our curated map.
            return None
    return None


def country_for_timezone(timezone: Optional[str]) -> Optional[str]:
    """Map an IANA zone to an ISO-3166 alpha-2 code, or ``None`` if unknown."""
    if not timezone:
        return None
    return TIMEZONE_TO_COUNTRY.get(timezone.strip())


def is_locale_tz_consistent(
    locale: Optional[str], timezone: Optional[str]
) -> Optional[bool]:
    """Do the system locale and the system timezone point at the same country?"""
    region = locale_region(locale)
    country = country_for_timezone(timezone)
    if region is None or country is None:
        return None
    return region == country


def is_ip_locale_consistent(
    egress_country: Optional[str], locale: Optional[str]
) -> Optional[bool]:
    """Does the network egress country match the locale region?"""
    region = locale_region(locale)
    if not egress_country or region is None:
        return None
    return region == egress_country.strip().upper()


def classify_asn(asn: Optional[str], org: Optional[str] = None) -> str:
    """Classify a network as residential / mobile / datacenter / unknown.

    Only the operator name is inspected; we never probe the host.
    """
    haystack = " ".join(filter(None, [asn, org])).lower()
    if not haystack:
        return "unknown"
    if any(h in haystack for h in _DATACENTER_HINTS):
        return "datacenter"
    if any(h in haystack for h in _MOBILE_HINTS):
        return "mobile"
    if any(h in haystack for h in _RESIDENTIAL_HINTS):
        return "residential"
    return "unknown"


def detect_proxy_hint(asn_type: Optional[str]) -> str:
    """Coarse hint only. This never attempts to bypass anything."""
    if asn_type == "datacenter":
        return "suspected"
    if asn_type in {"residential", "mobile"}:
        return "none"
    return "unknown"
