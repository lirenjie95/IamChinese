"""信号推导：脱敏、locale 解析、一致性、ASN 归类。

口径是「中国用户」：``zh_CN.UTF-8`` + ``Asia/Shanghai`` + 电信/联通/移动出口
必须读成自洽；``en-US`` + 美国家宽在这个版本里才是那个「不对劲」的组合。
"""

from __future__ import annotations

import unittest

from regiongate.signals import (
    classify_asn,
    country_for_timezone,
    detect_proxy_hint,
    is_ip_locale_consistent,
    is_locale_tz_consistent,
    locale_region,
    mask_ip,
)


class TestMaskIp(unittest.TestCase):
    def test_ipv4_keeps_first_three_octets(self):
        self.assertEqual(mask_ip("203.0.113.42"), "203.0.113.0")

    def test_ipv6_keeps_first_64_bits(self):
        self.assertEqual(
            mask_ip("2001:db8:85a3:1234:5678:8a2e:370:7334"),
            "2001:db8:85a3:1234::",
        )

    def test_empty_and_garbage(self):
        self.assertIsNone(mask_ip(None))
        self.assertIsNone(mask_ip(""))
        self.assertIsNone(mask_ip("   "))
        self.assertEqual(mask_ip("not-an-ip"), "***")

    def test_masking_is_idempotent(self):
        once = mask_ip("203.0.113.42")
        self.assertEqual(mask_ip(once), once)


class TestLocaleRegion(unittest.TestCase):
    def test_chinese_forms(self):
        self.assertEqual(locale_region("zh_CN.UTF-8"), "CN")
        self.assertEqual(locale_region("zh-CN"), "CN")
        self.assertEqual(locale_region("zh-Hans-CN"), "CN")
        self.assertEqual(locale_region("zh_Hans_CN.UTF-8"), "CN")

    def test_windows_display_names(self):
        # 这条路径以前是黑洞：拿不到地区码，一致性检查永远返回 None。
        self.assertEqual(locale_region("Chinese (Simplified)_China.936"), "CN")
        self.assertEqual(locale_region("Chinese (Simplified)_Singapore"), "SG")
        self.assertEqual(locale_region("Chinese (Traditional)_Hong Kong SAR"), "HK")

    def test_script_subtag_does_not_shadow_region(self):
        self.assertEqual(locale_region("zh-Hant-TW"), "TW")
        self.assertNotEqual(locale_region("zh-Hans-CN"), "HA")

    def test_other_forms(self):
        self.assertEqual(locale_region("en-US"), "US")
        self.assertEqual(locale_region("ja-JP"), "JP")

    def test_unusable_forms(self):
        self.assertIsNone(locale_region(None))
        self.assertIsNone(locale_region(""))
        self.assertIsNone(locale_region("C"))
        self.assertIsNone(locale_region("POSIX"))
        self.assertIsNone(locale_region("zh"))
        self.assertIsNone(locale_region("es-419"))


class TestConsistency(unittest.TestCase):
    def test_locale_and_tz_agree(self):
        self.assertTrue(is_locale_tz_consistent("zh_CN.UTF-8", "Asia/Shanghai"))
        self.assertTrue(is_locale_tz_consistent("zh-Hans-CN", "Asia/Shanghai"))

    def test_locale_and_tz_disagree(self):
        self.assertFalse(is_locale_tz_consistent("en-US", "Asia/Shanghai"))
        self.assertFalse(is_locale_tz_consistent("zh-CN", "America/Los_Angeles"))

    def test_unknown_zone_is_unknown_not_false(self):
        self.assertIsNone(is_locale_tz_consistent("zh-CN", "UTC+08:00"))
        self.assertIsNone(is_locale_tz_consistent("zh-CN", "Mars/Olympus"))

    def test_ip_locale(self):
        self.assertTrue(is_ip_locale_consistent("CN", "zh-CN"))
        self.assertFalse(is_ip_locale_consistent("SG", "zh-CN"))
        self.assertIsNone(is_ip_locale_consistent(None, "zh-CN"))

    def test_timezone_lookup_is_exact(self):
        self.assertEqual(country_for_timezone("Asia/Shanghai"), "CN")
        self.assertEqual(country_for_timezone("Asia/Urumqi"), "CN")
        self.assertIsNone(country_for_timezone("Asia/Atlantis"))


class TestAsnClass(unittest.TestCase):
    def test_datacenter_wins_over_other_hints(self):
        self.assertEqual(classify_asn("AS16509", "Amazon.com AWS"), "datacenter")
        # 名字里同时有「电信」和「云」时，「这是机房」是更强的结论。
        self.assertEqual(classify_asn("AS4847", "中国电信云计算"), "datacenter")

    def test_chinese_residential(self):
        self.assertEqual(classify_asn("AS4134", "Chinanet"), "residential")
        self.assertEqual(classify_asn("AS4134", "中国电信"), "residential")
        self.assertEqual(classify_asn("AS4837", "China Unicom"), "residential")
        self.assertEqual(classify_asn("AS4808", "中国联通"), "residential")

    def test_chinese_mobile(self):
        self.assertEqual(classify_asn("AS9808", "China Mobile Communications Group"), "mobile")
        self.assertEqual(classify_asn("AS24400", "中国移动"), "mobile")

    def test_chinese_cloud(self):
        self.assertEqual(classify_asn("AS37963", "Aliyun Computing"), "datacenter")
        self.assertEqual(classify_asn("AS132203", "Tencent Cloud"), "datacenter")
        self.assertEqual(classify_asn("AS55990", "华为云"), "datacenter")

    def test_unknown(self):
        self.assertEqual(classify_asn(None, None), "unknown")
        self.assertEqual(classify_asn("AS99999", "Some Tiny ISP"), "unknown")

    def test_proxy_hint(self):
        self.assertEqual(detect_proxy_hint("datacenter"), "suspected")
        self.assertEqual(detect_proxy_hint("residential"), "none")
        self.assertEqual(detect_proxy_hint("mobile"), "none")
        self.assertEqual(detect_proxy_hint("unknown"), "unknown")


if __name__ == "__main__":
    unittest.main()
