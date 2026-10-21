"""Remote policy refresh: fallback chain, validation, cache lifecycle."""

from __future__ import annotations

import json
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from regiongate.policy import BUNDLED_POLICY
from regiongate.update import (
    PolicyUpdate,
    PolicyUpdater,
    validate_payload,
)

from .support import WorkspaceTestCase

NOW = datetime(2026, 10, 19, 3, 0, tzinfo=timezone.utc)

REMOTE_PAYLOAD = {
    "policy_version": "2026-10-10",
    "supported": ["CN", "SG"],
    "restricted": ["US"],
    "unknown_action": "warn",
    "appeal_url": "https://example.invalid/appeal",
    "docs_url": "https://example.invalid/docs",
}


def fixed_clock(moment: datetime = NOW):
    return lambda: moment


class Base(WorkspaceTestCase):
    def setUp(self):
        super().setUp()
        self.cache = self.tmp / "policy.json"

    def seed_cache(self, fetched_at: datetime, payload=None) -> None:
        data = {
            "fetched_at": fetched_at.isoformat(),
            "payload": payload or REMOTE_PAYLOAD,
        }
        self.cache.write_text(json.dumps(data), encoding="utf-8")


class TestRemote(Base):
    def test_remote_success_is_used_and_cached(self):
        calls = []

        def fetch(url, timeout):
            calls.append((url, timeout))
            return REMOTE_PAYLOAD

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
        )
        update = updater.load()

        self.assertEqual(update.source, "remote")
        self.assertEqual(update.policy.policy_version, "2026-10-10")
        self.assertFalse(update.degraded)
        self.assertIsNone(update.error)
        self.assertEqual(calls[0][0], "https://example.invalid/policy.json")
        self.assertTrue(self.cache.exists())

    def test_fresh_cache_short_circuits_the_network(self):
        self.seed_cache(NOW - timedelta(days=1))

        def fetch(url, timeout):
            raise AssertionError("network must not be consulted")

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
        )
        update = updater.load()
        self.assertEqual(update.source, "cache")
        self.assertEqual(update.policy.policy_version, "2026-10-10")

    def test_stale_cache_is_refreshed_first(self):
        self.seed_cache(NOW - timedelta(days=30))
        calls = []

        def fetch(url, timeout):
            calls.append(url)
            return REMOTE_PAYLOAD

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
        )
        updater.load()
        self.assertEqual(len(calls), 1)


class TestFallbacks(Base):
    def test_no_url_uses_bundled_policy(self):
        updater = PolicyUpdater(cache_path=self.cache, clock=fixed_clock())
        update = updater.load()
        self.assertEqual(update.source, "bundled")
        self.assertEqual(update.policy.policy_version, BUNDLED_POLICY.policy_version)
        self.assertTrue(update.degraded)
        self.assertFalse(self.cache.exists())

    def test_network_failure_without_cache_falls_back_to_bundled(self):
        def fetch(url, timeout):
            raise TimeoutError("no route")

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
        )
        update = updater.load()
        self.assertEqual(update.source, "bundled")
        self.assertEqual(update.policy.policy_version, BUNDLED_POLICY.policy_version)
        self.assertIn("TimeoutError", update.error)

    def test_network_failure_with_stale_cache_uses_cache(self):
        self.seed_cache(NOW - timedelta(days=30))

        def fetch(url, timeout):
            raise OSError("offline")

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
            max_age_days=7,
        )
        update = updater.load()
        self.assertEqual(update.source, "cache")
        self.assertEqual(update.policy.policy_version, "2026-10-10")
        self.assertIsNotNone(update.error)

    def test_invalid_remote_payload_is_rejected_not_merged(self):
        bad = dict(REMOTE_PAYLOAD)
        bad["restricted"] = ["CN"]  # 与 supported 重叠：整份拒绝

        def fetch(url, timeout):
            return bad

        updater = PolicyUpdater(
            url="https://example.invalid/policy.json",
            cache_path=self.cache,
            fetch=fetch,
            clock=fixed_clock(),
        )
        update = updater.load()
        self.assertEqual(update.source, "bundled")
        self.assertIn("ValueError", update.error)
        self.assertFalse(self.cache.exists())

    def test_corrupt_cache_is_ignored(self):
        self.cache.write_text("{not json", encoding="utf-8")
        updater = PolicyUpdater(cache_path=self.cache, clock=fixed_clock())
        update = updater.load()
        self.assertEqual(update.source, "bundled")


class TestValidatePayload(unittest.TestCase):
    def test_accepts_a_minimal_payload(self):
        policy = validate_payload(
            {"policy_version": "2026-10-10", "supported": ["CN"]}
        )
        self.assertEqual(policy.supported, ("CN",))
        self.assertEqual(policy.unknown_action, "warn")
        self.assertEqual(policy.source, "remote")

    def test_rejects_non_object(self):
        with self.assertRaises(ValueError):
            validate_payload(["CN"])

    def test_rejects_missing_version(self):
        with self.assertRaises(ValueError):
            validate_payload({"supported": ["CN"]})

    def test_rejects_empty_supported(self):
        with self.assertRaises(ValueError):
            validate_payload({"policy_version": "2026-10-10", "supported": []})

    def test_rejects_bad_country_code(self):
        with self.assertRaises(ValueError):
            validate_payload(
                {"policy_version": "2026-10-10", "supported": ["USA"]}
            )

    def test_rejects_bad_action(self):
        with self.assertRaises(ValueError):
            validate_payload(
                {
                    "policy_version": "2026-10-10",
                    "supported": ["CN"],
                    "unknown_action": "maybe",
                }
            )


class TestUpdateModel(WorkspaceTestCase):
    def test_degraded_flag(self):
        updater = PolicyUpdater(cache_path=self.tmp / "missing.json")
        update = updater.load()
        self.assertIsInstance(update, PolicyUpdate)
        self.assertTrue(update.degraded)
        self.assertEqual(update.as_dict()["source"], "bundled")


if __name__ == "__main__":
    unittest.main()
