"""人设模块：号码算法、内部自洽、序列化，以及 CLI 的 persona/apply/verify/undo。"""

from __future__ import annotations

import contextlib
import io
import json
import unittest
from datetime import date
from pathlib import Path

from regiongate import __main__ as cli
from regiongate.persona import (
    DEFAULT_PERSONA_SEED,
    LOCALE_BCP47,
    LOCALE_POSIX,
    LOCALE_WINDOWS,
    TIMEZONE,
    UTC_OFFSET_MINUTES,
    Persona,
    build_persona,
    id_card_region,
    id_check_digit,
    make_id_card,
)

from tests.support import WorkspaceTestCase

# 官方样例：GB 11643-1999 的 MOD 11-2 校验位。
KNOWN_ID = "11010519491231002X"


def invoke(argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        code = cli.main(argv)
    return code, out.getvalue()


class TestCheckDigit(unittest.TestCase):
    def test_known_specimen(self):
        self.assertEqual(id_check_digit(KNOWN_ID[:17]), "X")
        self.assertEqual(len(KNOWN_ID), 18)

    def test_full_number_matches_its_check_digit(self):
        for seed in range(300):
            persona = build_persona(seed)
            body, shown = persona.id_card[:17], persona.id_card[17]
            self.assertEqual(id_check_digit(body), shown, persona.id_card)

    def test_rejects_bad_body(self):
        for bad in ("123", "abcdefghijklmnopq", "1234567890123456X"):
            with self.assertRaises(ValueError):
                id_check_digit(bad)

    def test_any_single_digit_flip_breaks_the_checksum(self):
        persona = build_persona(7)
        body = persona.id_card[:17]
        for index in range(17):
            digit = int(body[index])
            broken = body[:index] + str((digit + 1) % 10) + body[index + 1 :]
            self.assertNotEqual(id_check_digit(broken), persona.id_card[17])


class TestGeneration(unittest.TestCase):
    def test_sequence_encodes_gender(self):
        birth = date(1990, 5, 20)
        male = make_id_card("110105", birth, True, sequence=3)
        female = make_id_card("110105", birth, False, sequence=3)
        self.assertEqual(int(male[16]) % 2, 1)
        self.assertEqual(int(female[16]) % 2, 0)
        self.assertEqual(int(male[16]) - int(female[16]), 1)
        self.assertEqual(male[:14], female[:14])

    def test_sequence_is_stable(self):
        birth = date(1988, 3, 1)
        self.assertEqual(
            make_id_card("330106", birth, True, sequence=11),
            make_id_card("330106", birth, True, sequence=11),
        )

    def test_bad_region_code(self):
        with self.assertRaises(ValueError):
            make_id_card("3301", date(1990, 1, 1), True)

    def test_region_roundtrip(self):
        persona = build_persona(DEFAULT_PERSONA_SEED)
        self.assertEqual(id_card_region(persona.id_card), persona.region_code)
        self.assertIsNone(id_card_region("123"))
        self.assertIsNone(id_card_region("ABCDEF" + "0" * 12))


class TestPersona(unittest.TestCase):
    def test_locale_constants(self):
        self.assertEqual(LOCALE_BCP47, "zh-Hans-CN")
        self.assertEqual(LOCALE_POSIX, "zh_CN.UTF-8")
        self.assertEqual(LOCALE_WINDOWS, "Chinese (Simplified)_China.936")
        self.assertEqual(TIMEZONE, "Asia/Shanghai")
        self.assertEqual(UTC_OFFSET_MINUTES, 480)

    def test_seeded_generation_is_reproducible(self):
        self.assertEqual(build_persona(1), build_persona(1))
        self.assertNotEqual(build_persona(1), build_persona(2))

    def test_every_field_is_filled(self):
        persona = build_persona(DEFAULT_PERSONA_SEED)
        for name in (
            "name",
            "phone",
            "id_card",
            "province",
            "city",
            "district",
            "region_code",
            "address",
            "email",
            "occupation",
            "employer",
            "carrier",
            "asn",
            "org",
            "egress_ip",
        ):
            self.assertTrue(getattr(persona, name), name)

    def test_consistency_holds_for_many_seeds(self):
        for seed in range(500):
            persona = build_persona(seed)
            self.assertTrue(persona.is_consistent(), persona.consistency())

    def test_inconsistency_is_detected(self):
        persona = build_persona(3)
        broken = Persona(**{**persona.__dict__, "region_code": "110105"})
        self.assertFalse(broken.is_consistent())
        labels = [label for label, passed, _ in broken.consistency() if not passed]
        self.assertIn("身份证区划 ↔ 收货地址", labels)

    def test_env_mapping(self):
        env = build_persona(1).env()
        self.assertEqual(
            env,
            {
                "LANG": "zh_CN.UTF-8",
                "LC_ALL": "zh_CN.UTF-8",
                "LC_CTYPE": "zh_CN.UTF-8",
                "TZ": "Asia/Shanghai",
            },
        )

    def test_powershell_commands(self):
        text = build_persona(1).powershell()
        self.assertIn('Set-Culture -CultureInfo "zh-Hans-CN"', text)
        self.assertIn('tzutil /s "Asia/Shanghai"', text)
        self.assertIn("Set-WinUILanguageOverride", text)

    def test_env_file_format(self):
        text = build_persona(1).env_file()
        self.assertIn("LANG=zh_CN.UTF-8", text)
        self.assertTrue(text.endswith("\n"))

    def test_card_mentions_key_fields(self):
        persona = build_persona(1)
        card = persona.card()
        self.assertIn(persona.name, card)
        self.assertIn(persona.phone, card)
        self.assertIn(persona.id_card, card)
        self.assertIn("UTC+8", card)


class TestSerialization(unittest.TestCase):
    def test_roundtrip(self):
        persona = build_persona(DEFAULT_PERSONA_SEED)
        again = Persona.from_dict(persona.as_dict())
        self.assertEqual(persona, again)
        self.assertTrue(again.is_consistent())

    def test_json_roundtrip_survives_dumps(self):
        persona = build_persona(5)
        blob = json.dumps(persona.as_dict(), ensure_ascii=False)
        again = Persona.from_dict(json.loads(blob))
        self.assertEqual(persona, again)

    def test_bad_blocks_raise(self):
        data = build_persona(1).as_dict()
        for key in ("address", "network", "system"):
            broken = dict(data)
            broken[key] = "不是对象"
            with self.assertRaises(ValueError):
                Persona.from_dict(broken)

    def test_missing_field_raises(self):
        data = build_persona(1).as_dict()
        data.pop("phone")
        with self.assertRaises(KeyError):
            Persona.from_dict(data)


class TestCli(WorkspaceTestCase):
    def test_persona_text(self):
        code, text = invoke(["persona"])
        self.assertEqual(code, 0)
        self.assertIn("自洽性：全部通过", text)

    def test_persona_json(self):
        code, text = invoke(["persona", "--json", "--seed", "42"])
        self.assertEqual(code, 0)
        data = json.loads(text)
        self.assertEqual(data["system"]["locale_bcp47"], "zh-Hans-CN")
        self.assertEqual(data["network"]["asn"][:2], "AS")

    def test_plan_writes_nothing(self):
        out = self.tmp / "profile"
        code, text = invoke(["plan", "--out", str(out)])
        self.assertEqual(code, 0)
        self.assertIn("时区", text)
        self.assertFalse(out.exists(), "plan 不应创建目录")

    def test_apply_writes_three_files(self):
        out = self.tmp / "profile"
        code, _ = invoke(["apply", "--out", str(out)])
        self.assertEqual(code, 0)
        names = sorted(p.name for p in out.iterdir())
        self.assertEqual(names, ["cn-profile.json", "env.ps1", "env.sh"])

        profile = json.loads((out / "cn-profile.json").read_text(encoding="utf-8"))
        self.assertEqual(profile["schema"], 1)
        self.assertEqual(profile["policy_version"], "2026-10-19")
        self.assertIn("persona", profile)

        env_sh = (out / "env.sh").read_text(encoding="utf-8")
        self.assertIn('export TZ="Asia/Shanghai"', env_sh)

    def test_apply_then_verify(self):
        out = self.tmp / "profile"
        invoke(["apply", "--out", str(out)])
        code, text = invoke(["verify", "--profile", str(out / "cn-profile.json")])
        self.assertEqual(code, 0, text)
        self.assertIn("全部通过", text)

    def test_verify_rejects_tampered_region(self):
        out = self.tmp / "profile"
        invoke(["apply", "--out", str(out)])
        path = out / "cn-profile.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["persona"]["address"]["region_code"] = "110105"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        code, text = invoke(["verify", "--profile", str(path)])
        self.assertEqual(code, 1)
        self.assertIn("身份证区划", text)

    def test_verify_rejects_foreign_locale(self):
        out = self.tmp / "profile"
        invoke(["apply", "--out", str(out)])
        path = out / "cn-profile.json"
        data = json.loads(path.read_text(encoding="utf-8"))
        data["persona"]["system"]["locale_bcp47"] = "en-US"
        path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        code, text = invoke(["verify", "--profile", str(path)])
        self.assertEqual(code, 1)
        self.assertIn("locale 不是", text)

    def test_undo_removes_only_its_own_files(self):
        out = self.tmp / "profile"
        invoke(["apply", "--out", str(out)])
        keep = out / "notes.txt"
        keep.write_text("用户自己的文件", encoding="utf-8")

        code, text = invoke(["undo", "--out", str(out)])
        self.assertEqual(code, 0)
        self.assertIn("已删除", text)
        self.assertEqual([p.name for p in out.iterdir()], ["notes.txt"])

    def test_undo_without_artifacts(self):
        code, text = invoke(["undo", "--out", str(self.tmp / "empty")])
        self.assertEqual(code, 0)
        self.assertIn("没有可删的文件", text)

    def test_check_default_is_allowed(self):
        code, text = invoke(["check"])
        self.assertEqual(code, 0)
        self.assertIn("allowed", text)
        self.assertIn("CN", text)

    def test_check_gate_output(self):
        code, text = invoke(["check", "--gate"])
        self.assertEqual(code, 0)
        self.assertIn("可以继续安装", text)

    def test_check_diag_writes_bundle(self):
        out = self.tmp / "diag"
        code, text = invoke(["check", "--diag", str(out)])
        self.assertEqual(code, 0)
        self.assertTrue(list(out.rglob("*.json")), text)

    def test_no_subcommand_prints_help(self):
        code, text = invoke([])
        self.assertEqual(code, 2)
        self.assertIn("usage", text.lower())


if __name__ == "__main__":
    unittest.main()
