"""Stage 3'：界面上不允许出现一个按了也没用的按钮。"""

from __future__ import annotations

import unittest

from regiongate.gate import (
    ACTION_LABELS,
    build_gate,
    render_text,
)
from regiongate.models import RegionDecision
from regiongate.policy import BUNDLED_POLICY, RegionPolicy


def decision(**overrides) -> RegionDecision:
    base = dict(
        status="allowed",
        reason_code="OK",
        evidence=("egress_country=CN",),
        confidence="high",
        user_message_key="region.allowed",
        next_actions=("install",),
        policy_version="2026-10-19",
    )
    base.update(overrides)
    return RegionDecision(**base)


def unlisted_policy(**overrides) -> RegionPolicy:
    kwargs = dict(
        policy_version="2026-10-19",
        supported=("CN", "SG"),
        restricted=("US", "GB"),
        unknown_action="warn",
        appeal_url="https://example.invalid/appeal",
        docs_url="https://example.invalid/docs",
    )
    kwargs.update(overrides)
    return RegionPolicy(**kwargs)


def keys(view) -> list:
    return [action.key for action in view.actions]


class TestAllowed(unittest.TestCase):
    def test_install_is_the_primary_action(self):
        view = build_gate(decision(), BUNDLED_POLICY)
        self.assertEqual(view.title, "可以继续安装")
        self.assertEqual(keys(view), ["install"])
        self.assertEqual(view.actions[0].kind, "primary")

    def test_warnings_become_bullets(self):
        view = build_gate(
            decision(
                reason_code="OK_WITH_WARNINGS",
                evidence=("egress_country=CN", "locale_timezone_mismatch"),
                next_actions=("install", "read_docs"),
            ),
            BUNDLED_POLICY,
        )
        self.assertTrue(any("系统语言与系统时区" in bullet for bullet in view.bullets))
        self.assertIn("read_docs", keys(view))


class TestRestricted(unittest.TestCase):
    def test_no_appeal_no_install(self):
        view = build_gate(
            decision(
                status="not_supported",
                reason_code="E_REGION_RESTRICTED",
                evidence=("egress_country=US",),
                confidence="high",
                next_actions=("read_docs", "exit"),
            ),
            BUNDLED_POLICY,
        )
        self.assertEqual(view.title, "该服务目前不在你所在地区提供")
        self.assertNotIn("appeal", keys(view))
        self.assertNotIn("install", keys(view))
        self.assertIn("exit", keys(view))
        self.assertIn("提交复核不会改变结果", view.body)
        self.assertIn("US", view.body)

    def test_appeal_is_dropped_even_if_the_decision_lists_it(self):
        view = build_gate(
            decision(
                status="not_supported",
                reason_code="E_REGION_RESTRICTED",
                evidence=("egress_country=US",),
                next_actions=("appeal", "read_docs", "exit"),
            ),
            BUNDLED_POLICY,
        )
        self.assertNotIn("appeal", keys(view))


class TestUnknown(unittest.TestCase):
    def test_offline_offers_retry_and_local_mode(self):
        view = build_gate(
            decision(
                status="unknown",
                reason_code="E_NO_NETWORK_DATA",
                evidence=(),
                confidence="low",
                next_actions=("retry", "read_docs", "local_only"),
            ),
            BUNDLED_POLICY,
        )
        self.assertIn("retry", keys(view))
        self.assertIn("local_only", keys(view))
        self.assertNotIn("install", keys(view))
        self.assertEqual(view.actions[0].key, "retry")

    def test_unlisted_offers_appeal_with_url(self):
        view = build_gate(
            decision(
                status="unknown",
                reason_code="W_REGION_UNLISTED",
                evidence=("egress_country=XX",),
                confidence="medium",
                next_actions=("read_docs", "appeal", "local_only"),
            ),
            unlisted_policy(),
        )
        appeal = [a for a in view.actions if a.key == "appeal"]
        self.assertEqual(len(appeal), 1)
        self.assertEqual(appeal[0].url, "https://example.invalid/appeal")


class TestActionFiltering(unittest.TestCase):
    def test_missing_urls_remove_their_buttons(self):
        policy = unlisted_policy(appeal_url=None, docs_url=None)
        view = build_gate(
            decision(
                status="unknown",
                reason_code="W_REGION_UNLISTED",
                evidence=("egress_country=XX",),
                next_actions=("read_docs", "appeal", "local_only"),
            ),
            policy,
        )
        self.assertEqual(keys(view), ["local_only"])

    def test_always_offers_an_exit(self):
        policy = unlisted_policy(appeal_url=None, docs_url=None)
        view = build_gate(
            decision(
                status="unknown",
                reason_code="W_REGION_UNLISTED",
                evidence=(),
                next_actions=(),
            ),
            policy,
        )
        self.assertEqual(keys(view), ["exit"])

    def test_every_action_has_a_label(self):
        view = build_gate(
            decision(next_actions=("install", "retry", "local_only", "read_docs", "exit")),
            BUNDLED_POLICY,
        )
        for action in view.actions:
            self.assertEqual(ACTION_LABELS[action.key], action.label)


class TestRender(unittest.TestCase):
    def test_text_contains_title_body_and_buttons(self):
        view = build_gate(decision(), BUNDLED_POLICY)
        rendered = render_text(view)
        self.assertIn("可以继续安装", rendered)
        self.assertIn("[继续安装]", rendered)
        self.assertIn("诊断包", rendered)

    def test_render_of_blocked_view_has_no_appeal_button(self):
        view = build_gate(
            decision(
                status="not_supported",
                reason_code="E_REGION_RESTRICTED",
                evidence=("egress_country=US",),
                next_actions=("read_docs", "exit"),
            ),
            BUNDLED_POLICY,
        )
        self.assertNotIn("[提交复核申请]", render_text(view))


if __name__ == "__main__":
    unittest.main()
