"""Static invariants: the package must stay physically incapable of the things
the design doc rules out.

These are source-level assertions, so a future edit that quietly reintroduces
a proxy launcher, a registry write, or a second module that touches the disk
fails the suite before it ships.

The two allowlists below are deliberately single-entry-ish: adding a module to
either one should be a conscious, reviewable decision, not a drive-by import.
"""

from __future__ import annotations

import dataclasses
import re
import unittest
from pathlib import Path

PACKAGE = Path(__file__).resolve().parent.parent / "regiongate"

FORBIDDEN_TOKENS = (
    "subprocess",
    "winreg",
    "win32api",
    "ctypes",
    "shutil",
    "os.system",
    "socket",
    "requests",
    "pycurl",
)

# Only this module may open a file for writing.
WRITE_ALLOWED = {"storage.py"}

# Only these modules may reach the network, and only when a caller opts in.
NETWORK_ALLOWED = {"preflight.py", "update.py"}

WRITE_PATTERN = re.compile(r"open\s*\([^)]*[\"'][wax+]")
DYNAMIC_CODE_PATTERN = re.compile(r"\b(eval|exec)\s*\(")


def package_sources():
    return sorted(PACKAGE.glob("*.py"))


class TestNoDangerousPrimitives(unittest.TestCase):
    def test_package_has_sources(self):
        self.assertTrue(package_sources(), "package sources not found")

    def test_no_process_spawn_or_registry(self):
        for path in package_sources():
            text = path.read_text(encoding="utf-8")
            for token in FORBIDDEN_TOKENS:
                self.assertNotIn(token, text, f"{path.name} contains {token!r}")

    def test_no_dynamic_code_execution(self):
        for path in package_sources():
            text = path.read_text(encoding="utf-8")
            self.assertIsNone(
                DYNAMIC_CODE_PATTERN.search(text), f"{path.name} evaluates code"
            )


class TestWriteConfinement(unittest.TestCase):
    def test_only_storage_writes(self):
        offenders = []
        for path in package_sources():
            text = path.read_text(encoding="utf-8")
            if WRITE_PATTERN.search(text) and path.name not in WRITE_ALLOWED:
                offenders.append(path.name)
        self.assertEqual(offenders, [])

    def test_allowlist_stays_explicit(self):
        self.assertEqual(WRITE_ALLOWED, {"storage.py"})

    def test_storage_itself_is_clean(self):
        text = (PACKAGE / "storage.py").read_text(encoding="utf-8")
        for token in ("subprocess", "socket", "urllib", "shutil.rmtree"):
            self.assertNotIn(token, text)


class TestNetworkConfinement(unittest.TestCase):
    def test_network_import_confined_to_two_modules(self):
        offenders = []
        for path in package_sources():
            text = path.read_text(encoding="utf-8")
            if "urllib" in text and path.name not in NETWORK_ALLOWED:
                offenders.append(path.name)
        self.assertEqual(offenders, [])

    def test_allowlist_stays_explicit(self):
        self.assertEqual(NETWORK_ALLOWED, {"preflight.py", "update.py"})


class TestFrozenModels(unittest.TestCase):
    def test_decisions_cannot_be_mutated(self):
        from regiongate.models import RegionDecision

        decision = RegionDecision(status="allowed", reason_code="OK")
        with self.assertRaises(dataclasses.FrozenInstanceError):
            decision.status = "not_supported"  # type: ignore[misc]

    def test_snapshots_cannot_be_mutated(self):
        from regiongate.models import EnvironmentSnapshot

        snap = EnvironmentSnapshot(
            os_name="Windows 11",
            os_version="1",
            locale="zh-Hans-CN",
            timezone="Asia/Shanghai",
            ui_language="zh-Hans-CN",
            region_format="Chinese (Simplified)_China.936",
        )
        with self.assertRaises(dataclasses.FrozenInstanceError):
            snap.egress_country = "CN"  # type: ignore[misc]

    def test_invalid_decision_rejected(self):
        from regiongate.models import RegionDecision

        with self.assertRaises(ValueError):
            RegionDecision(status="maybe", reason_code="OK")
        with self.assertRaises(ValueError):
            RegionDecision(status="allowed", reason_code="OK", confidence="certain")


if __name__ == "__main__":
    unittest.main()
