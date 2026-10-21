"""Shared test scaffolding.

Temp directories are created **inside the workspace**, not under the platform
temp root: in this sandbox, creating files under ``%TEMP%`` blocks on an
approval that never resolves, which hangs the whole suite. Keeping artifacts
next to the tests is also easier to inspect when something fails.
"""

from __future__ import annotations

import shutil
import unittest
import uuid
from pathlib import Path

WORKSPACE = Path(__file__).resolve().parent.parent
TMP_ROOT = WORKSPACE / ".testtmp"


class WorkspaceTestCase(unittest.TestCase):
    """Gives each test a fresh directory under ``<workspace>/.testtmp``."""

    def setUp(self) -> None:
        self._tmp_dirs = []
        self.tmp = self.make_tmp()

    def make_tmp(self) -> Path:
        TMP_ROOT.mkdir(parents=True, exist_ok=True)
        directory = TMP_ROOT / uuid.uuid4().hex
        directory.mkdir()
        self._tmp_dirs.append(directory)
        return directory

    def tearDown(self) -> None:
        for directory in self._tmp_dirs:
            shutil.rmtree(directory, ignore_errors=True)
