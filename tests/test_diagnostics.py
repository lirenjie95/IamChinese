"""Diagnostic bundle: redaction, schema, atomicity, no leftovers."""

from __future__ import annotations

import json
import unittest
from dataclasses import replace
from datetime import datetime, timezone
from pathlib import Path

from regiongate.diagnostics import (
    GUARANTEES,
    SCHEMA_VERSION,
    build_payload,
    default_diag_dir,
    render_summary,
    write_diag_bundle,
)
from regiongate.models import EnvironmentSnapshot, RegionDecision
from regiongate.signals import mask_ip

from .support import WorkspaceTestCase


def snapshot(ip: str = "203.0.113.42", country: str = "CN") -> EnvironmentSnapshot:
    return EnvironmentSnapshot(
        os_name="Windows 11 专业版",
        os_version="10.0.26100",
        locale="zh-Hans-CN",
        timezone="Asia/Shanghai",
        ui_language="zh-Hans-CN",
        region_format="Chinese (Simplified)_China.936",
        egress_ip=ip,
        egress_country=country,
        egress_asn="AS4134",
        asn_type="residential",
        proxy_hint="none",
        locale_tz_consistent=True,
        ip_locale_consistent=True,
        collected_at="2026-10-19T03:00:00+00:00",
        consent={"network": True, "telemetry": False},
        redactions=("egress_ip",),
    )


def decision() -> RegionDecision:
    return RegionDecision(
        status="allowed",
        reason_code="OK",
        evidence=("egress_country=CN",),
        confidence="high",
        user_message_key="region.allowed",
        next_actions=("install",),
        policy_version="2026-10-19",
    )


class TestDiagBundle(WorkspaceTestCase):
    def setUp(self):
        super().setUp()
        self.directory = self.tmp

    def test_writes_a_file_that_parses(self):
        bundle = write_diag_bundle(snapshot(), decision(), out_dir=self.directory)
        self.assertTrue(bundle.path.exists())
        loaded = json.loads(bundle.path.read_text(encoding="utf-8"))
        self.assertEqual(loaded["schema_version"], SCHEMA_VERSION)

    def test_full_ip_never_appears_on_disk(self):
        write_diag_bundle(snapshot(ip="203.0.113.42"), decision(), out_dir=self.directory)
        raw = "\n".join(
            path.read_text(encoding="utf-8") for path in self.directory.iterdir()
        )
        self.assertNotIn("203.0.113.42", raw)
        self.assertIn("203.0.113.0", raw)

    def test_ip_masked_even_if_snapshot_was_built_by_hand(self):
        payload = build_payload(snapshot(ip="198.51.100.77"), decision())
        self.assertEqual(payload["snapshot"]["egress_ip"], mask_ip("198.51.100.77"))

    def test_guarantees_are_recorded(self):
        payload = build_payload(snapshot(), decision())
        self.assertEqual(tuple(payload["guarantees"]), GUARANTEES)
        self.assertFalse(payload["uploaded"])

    def test_verify_section_round_trips(self):
        bundle = write_diag_bundle(
            snapshot(),
            decision(),
            verify={"ok": True, "checks": [{"name": "files", "ok": True}]},
            out_dir=self.directory,
        )
        self.assertTrue(bundle.payload["verify"]["ok"])

    def test_no_temp_files_left_behind(self):
        write_diag_bundle(snapshot(), decision(), out_dir=self.directory)
        leftovers = [p.name for p in self.directory.iterdir() if p.suffix == ".tmp"]
        self.assertEqual(leftovers, [])

    def test_residual_ip_inside_a_string_is_masked(self):
        snap = replace(snapshot(ip="203.0.113.42"), os_version="build 203.0.113.9")
        payload = build_payload(snap, decision())
        self.assertNotIn("203.0.113.9", json.dumps(payload))
        self.assertIn("203.0.113.0", payload["snapshot"]["os_version"])

    def test_timestamp_is_utc_and_stable(self):
        fixed = datetime(2026, 10, 19, 3, 0, tzinfo=timezone.utc)
        payload = build_payload(snapshot(), decision(), now=fixed)
        self.assertEqual(payload["created_at"], "2026-10-19T03:00:00+00:00")

    def test_render_summary_mentions_the_path(self):
        bundle = write_diag_bundle(snapshot(), decision(), out_dir=self.directory)
        self.assertIn(str(bundle.path), render_summary(bundle))

    def test_default_dir_is_under_a_temp_or_cache_root(self):
        self.assertIn("regiongate", str(default_diag_dir()))


if __name__ == "__main__":
    unittest.main()
