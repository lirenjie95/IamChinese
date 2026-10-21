"""决策表：支持 / 排除 / 未列入 / 无数据四条路径，外加几处边界。

基线机器是「杭州电信家宽 + zh_CN.UTF-8 + Asia/Shanghai」。上一版基线是
Comcast + en-US，这里刻意换掉 —— 测试基线就是这套代码的价值观。
"""

from __future__ import annotations

import unittest
from datetime import date

from regiongate.evaluate import evaluate_region, explain_evidence, is_blocking, is_unknown
from regiongate.models import (
    STATUS_ALLOWED,
    STATUS_NOT_SUPPORTED,
    STATUS_UNKNOWN,
)
from regiongate.policy import BUNDLED_POLICY, RegionPolicy
from regiongate.preflight import (
    EgressInfo,
    FixtureEgressProvider,
    NullEgressProvider,
    PreflightOptions,
    SystemInfo,
    preflight,
)
from regiongate.reasons import REASONS


def snapshot(
    country: str = "CN",
    locale: str = "zh_CN.UTF-8",
    tz: str = "Asia/Shanghai",
    org: str = "Chinanet",
    asn: str = "AS4134",
    ip: str = "203.0.113.42",
    offline: bool = False,
):
    info = SystemInfo(
        os_name="Windows 11 专业版",
        os_version="fixture",
        locale=locale,
        timezone=tz,
        region_format="Chinese (Simplified)_China.936",
    )
    provider = (
        NullEgressProvider()
        if offline
        else FixtureEgressProvider(EgressInfo(ip=ip, country=country, asn=asn, org=org))
    )
    return preflight(
        PreflightOptions(
            consent_network=not offline,
            system_info=info,
            egress_provider=provider,
        )
    )


class TestScenarioTable(unittest.TestCase):
    """支持地区内的五种情形。"""

    def test_1_supported_and_consistent(self):
        decision = evaluate_region(snapshot(), BUNDLED_POLICY)
        self.assertEqual(decision.reason_code, "OK")
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertEqual(decision.confidence, "high")
        self.assertFalse(decision.is_appealable)
        self.assertIn("install", decision.next_actions)
        self.assertEqual(decision.warnings, ())

    def test_2_supported_but_timezone_mismatch(self):
        # 语言是中文、时区却在美国：出差、留学、或者代理没关干净。
        decision = evaluate_region(
            snapshot(locale="zh-CN", tz="America/Los_Angeles"), BUNDLED_POLICY
        )
        self.assertEqual(decision.reason_code, "OK_WITH_WARNINGS")
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertIn("locale_timezone_mismatch", decision.warnings)
        self.assertIn("install", decision.next_actions)

    def test_3_restricted_is_policy_not_appeal(self):
        # 这一版里被排除的是北美：政策结论，复核也改不了。
        decision = evaluate_region(
            snapshot(country="US", locale="en-US", tz="America/Los_Angeles",
                     org="Comcast Cable", asn="AS7922"),
            BUNDLED_POLICY,
        )
        self.assertEqual(decision.reason_code, "E_REGION_RESTRICTED")
        self.assertEqual(decision.status, STATUS_NOT_SUPPORTED)
        self.assertEqual(decision.confidence, "high")
        self.assertFalse(decision.is_appealable)
        self.assertNotIn("appeal", decision.next_actions)
        self.assertIn("read_docs", decision.next_actions)

    def test_4_unlisted_warn(self):
        policy = RegionPolicy(
            policy_version="2026-10-01",
            supported=BUNDLED_POLICY.supported,
            restricted=BUNDLED_POLICY.restricted,
            unknown_action="warn",
        )
        decision = evaluate_region(
            snapshot(country="XX", locale="en-GB", tz="UTC"), policy
        )
        self.assertEqual(decision.reason_code, "W_REGION_UNLISTED")
        self.assertEqual(decision.status, STATUS_UNKNOWN)
        self.assertEqual(decision.confidence, "medium")
        self.assertTrue(decision.is_appealable)
        self.assertIn("appeal", decision.next_actions)

    def test_5_unlisted_block(self):
        policy = RegionPolicy(
            policy_version="2026-10-01",
            supported=BUNDLED_POLICY.supported,
            restricted=BUNDLED_POLICY.restricted,
            unknown_action="block",
        )
        decision = evaluate_region(
            snapshot(country="XX", locale="en-GB", tz="UTC"), policy
        )
        self.assertEqual(decision.reason_code, "E_REGION_UNLISTED")
        self.assertEqual(decision.status, STATUS_NOT_SUPPORTED)
        self.assertTrue(decision.is_appealable)


class TestChinaFirstOrientation(unittest.TestCase):
    """这一版的政策方向：CN 在最前面，北美在西欧之前被排除。"""

    def test_cn_is_supported(self):
        self.assertIn("CN", BUNDLED_POLICY.supported)
        self.assertNotIn("CN", BUNDLED_POLICY.restricted)

    def test_us_and_uk_are_restricted(self):
        self.assertIn("US", BUNDLED_POLICY.restricted)
        self.assertIn("GB", BUNDLED_POLICY.restricted)

    def test_greater_china_and_sea_supported(self):
        for code in ("HK", "MO", "SG", "MY", "JP", "KR"):
            self.assertIn(code, BUNDLED_POLICY.supported)

    def test_plain_chinese_household_is_allowed(self):
        decision = evaluate_region(snapshot(), BUNDLED_POLICY)
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertEqual(decision.warnings, ())


class TestUnknownPath(unittest.TestCase):
    """无网络数据必须报「不知道」，不能报成结论。"""

    def test_offline_yields_unknown(self):
        decision = evaluate_region(snapshot(offline=True), BUNDLED_POLICY)
        self.assertEqual(decision.reason_code, "E_NO_NETWORK_DATA")
        self.assertEqual(decision.status, STATUS_UNKNOWN)
        self.assertEqual(decision.confidence, "low")
        self.assertTrue(is_unknown(decision))
        self.assertFalse(is_blocking(decision))
        self.assertIn("local_only", decision.next_actions)

    def test_unknown_is_retryable(self):
        decision = evaluate_region(snapshot(offline=True), BUNDLED_POLICY)
        self.assertIn("retry", decision.next_actions)


class TestWarnings(unittest.TestCase):
    def test_datacenter_egress_is_flagged_but_not_blocked(self):
        decision = evaluate_region(
            snapshot(org="Aliyun Computing", asn="AS37963"), BUNDLED_POLICY
        )
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertIn("datacenter_egress", decision.warnings)
        self.assertIn("proxy_suspected", decision.warnings)

    def test_multiple_warnings_keep_ok_status(self):
        decision = evaluate_region(
            snapshot(locale="en-US", tz="Asia/Shanghai", org="Aliyun Computing"),
            BUNDLED_POLICY,
        )
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertGreaterEqual(len(decision.warnings), 2)

    def test_ip_locale_mismatch_when_egress_is_abroad(self):
        # 家宽在深圳，出口却落在新加坡：跨境办公，不算违规但要提示。
        decision = evaluate_region(
            snapshot(country="SG", org="Singtel", asn="AS7473"), BUNDLED_POLICY
        )
        self.assertEqual(decision.status, STATUS_ALLOWED)
        self.assertIn("ip_locale_mismatch", decision.warnings)


class TestStaleness(unittest.TestCase):
    def test_stale_policy_does_not_block(self):
        decision = evaluate_region(snapshot(), BUNDLED_POLICY, today=date(2030, 1, 1))
        self.assertTrue(decision.policy_stale)
        self.assertIn("policy_stale", decision.warnings)
        self.assertEqual(decision.status, STATUS_ALLOWED)

    def test_fresh_policy_is_not_stale(self):
        decision = evaluate_region(snapshot(), BUNDLED_POLICY, today=date(2026, 10, 20))
        self.assertFalse(decision.policy_stale)
        self.assertNotIn("policy_stale", decision.warnings)

    def test_unparseable_version_is_not_stale(self):
        policy = RegionPolicy(policy_version="unknown", supported=("CN",))
        self.assertFalse(policy.is_stale())


class TestInvariants(unittest.TestCase):
    def test_blocked_decisions_never_offer_appeal_for_policy(self):
        decision = evaluate_region(snapshot(country="US"), BUNDLED_POLICY)
        self.assertNotIn("appeal", decision.next_actions)

    def test_every_decision_code_is_known(self):
        samples = [
            snapshot(),
            snapshot(country="US"),
            snapshot(offline=True),
            snapshot(country="XX", locale="en-GB", tz="UTC"),
        ]
        for sample in samples:
            decision = evaluate_region(sample, BUNDLED_POLICY)
            self.assertIn(decision.reason_code, REASONS)

    def test_decision_status_matches_spec(self):
        for sample in (snapshot(), snapshot(country="US"), snapshot(offline=True)):
            decision = evaluate_region(sample, BUNDLED_POLICY)
            self.assertEqual(decision.status, REASONS[decision.reason_code].status)

    def test_evidence_is_explainable(self):
        decision = evaluate_region(
            snapshot(locale="zh-CN", tz="America/Los_Angeles")
        )
        for line in decision.evidence:
            self.assertTrue(explain_evidence(line))

    def test_explain_renders_chinese(self):
        self.assertEqual(explain_evidence("egress_country=CN"), "网络出口所在国：CN")
        self.assertIn("数据中心", explain_evidence("datacenter_egress"))

    def test_policy_rejects_overlap(self):
        with self.assertRaises(ValueError):
            RegionPolicy(
                policy_version="2026-10-01", supported=("CN",), restricted=("CN",)
            )

    def test_policy_rejects_bad_action(self):
        with self.assertRaises(ValueError):
            RegionPolicy(policy_version="2026-10-01", unknown_action="maybe")


if __name__ == "__main__":
    unittest.main()
