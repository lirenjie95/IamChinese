"""Stage 1：同意、降级、脱敏，以及「不联网」这条底线。"""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timezone as dt_timezone

from regiongate.preflight import (
    EgressInfo,
    FixtureEgressProvider,
    HttpEgressProvider,
    NullEgressProvider,
    PreflightOptions,
    SystemInfo,
    preflight,
    read_system_info,
)


def system_info(
    locale: str = "zh-Hans-CN", tz: str = "Asia/Shanghai"
) -> SystemInfo:
    return SystemInfo(
        os_name="Windows 11 专业版",
        os_version="10.0.26100",
        locale=locale,
        timezone=tz,
        region_format="Chinese (Simplified)_China.936",
    )


CN_EGRESS = EgressInfo(
    ip="203.0.113.42",
    country="CN",
    asn="AS4134",
    org="Chinanet",
)


class TestConsent(unittest.TestCase):
    def test_no_consent_means_no_provider_call(self):
        provider = FixtureEgressProvider(CN_EGRESS)
        snap = preflight(
            PreflightOptions(
                consent_network=False,
                system_info=system_info(),
                egress_provider=provider,
            )
        )
        self.assertEqual(provider.calls, 0, "未同意时不得调用探针")
        self.assertIsNone(snap.egress_country)
        self.assertIsNone(snap.egress_ip)
        self.assertFalse(snap.has_network_data)

    def test_consent_without_provider_sends_nothing(self):
        snap = preflight(
            PreflightOptions(
                consent_network=True,
                system_info=system_info(),
                egress_provider=NullEgressProvider(),
            )
        )
        self.assertIsNone(snap.egress_country)
        self.assertFalse(snap.has_network_data)

    def test_default_options_are_offline(self):
        snap = preflight()
        self.assertFalse(snap.consent["network"])
        self.assertFalse(snap.consent["telemetry"])
        self.assertIsNone(snap.egress_country)


class TestDegradation(unittest.TestCase):
    def test_provider_exception_degrades_to_unknown(self):
        class Exploding:
            def fetch(self, timeout):
                raise TimeoutError("上游没有响应")

        snap = preflight(
            PreflightOptions(
                consent_network=True,
                system_info=system_info(),
                egress_provider=Exploding(),
            )
        )
        self.assertIsNone(snap.egress_country)
        self.assertEqual(snap.asn_type, "unknown")
        self.assertEqual(snap.proxy_hint, "unknown")

    def test_provider_returning_none(self):
        class Silent:
            def fetch(self, timeout):
                return None

        snap = preflight(
            PreflightOptions(consent_network=True, egress_provider=Silent())
        )
        self.assertFalse(snap.has_network_data)

    def test_http_provider_without_url_is_inert(self):
        provider = HttpEgressProvider(url=None)
        self.assertIsNone(provider.fetch(timeout=0.1))
        self.assertIsNone(provider.last_error)


class TestCollectedSnapshot(unittest.TestCase):
    def test_counts_and_masking(self):
        snap = preflight(
            PreflightOptions(
                consent_network=True,
                system_info=system_info(),
                egress_provider=FixtureEgressProvider(CN_EGRESS),
            )
        )
        self.assertTrue(snap.has_network_data)
        self.assertEqual(snap.egress_country, "CN")
        self.assertEqual(snap.egress_ip, "203.0.113.0")
        self.assertEqual(snap.asn_type, "residential")
        self.assertTrue(snap.locale_tz_consistent)
        self.assertTrue(snap.ip_locale_consistent)
        self.assertIn("egress_ip", snap.redactions)

    def test_windows_display_locale_is_understood(self):
        # 只有 region_format 是 Windows 显示名时，旧代码的一致性检查会永远 None。
        snap = preflight(
            PreflightOptions(
                consent_network=True,
                system_info=system_info(locale="Chinese (Simplified)_China.936"),
                egress_provider=FixtureEgressProvider(CN_EGRESS),
            )
        )
        self.assertTrue(snap.locale_tz_consistent)

    def test_redacted_dict_hides_full_address(self):
        snap = preflight(
            PreflightOptions(
                consent_network=True,
                system_info=system_info(),
                egress_provider=FixtureEgressProvider(CN_EGRESS),
            )
        )
        dumped = json.dumps(snap.as_redacted_dict())
        self.assertNotIn("203.0.113.42", dumped)
        self.assertIn("203.0.113.0", dumped)

    def test_timestamp_is_timezone_aware(self):
        snap = preflight(PreflightOptions(system_info=system_info()))
        parsed = datetime.fromisoformat(snap.collected_at)
        self.assertIsNotNone(parsed.tzinfo)
        self.assertEqual(parsed.utcoffset(), dt_timezone.utc.utcoffset(None))

    def test_clock_is_injectable(self):
        fixed = datetime(2026, 10, 19, 3, 0, tzinfo=dt_timezone.utc)
        snap = preflight(PreflightOptions(clock=lambda: fixed))
        self.assertTrue(snap.collected_at.startswith("2026-10-19T03:00"))


class TestReadSystemInfo(unittest.TestCase):
    def test_returns_usable_values(self):
        info = read_system_info()
        self.assertTrue(info.os_name)
        self.assertTrue(info.timezone)
        self.assertIsInstance(info.locale, str)


if __name__ == "__main__":
    unittest.main()
