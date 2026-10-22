"""regiongate —— 把一台「看起来在美国」的机器反过来，做成中国用户口径。

这个仓库原来假定用户在美国：Comcast 家宽、``America/Los_Angeles``、
``en-US``，``restricted`` 里写着 CN。本版本把坐标轴翻过来：默认人设是
一名住在国内的普通用户，家宽或 4G 出口、``zh-Hans-CN``、
``Asia/Shanghai``，北美与西欧反而不在服务范围内。

用法::

    python -m regiongate persona                 # 打印一套人设
    python -m regiongate persona --json          # 同上，JSON
    python -m regiongate plan                    # 落地清单（不写盘）
    python -m regiongate apply --out .\\profile   # 写出 profile / env 文件
    python -m regiongate check                   # 用人设跑一遍地区判定
    python -m regiongate check --gate --json     # 判定 + 界面文案
    python -m regiongate check --diag .\\diag     # 生成脱敏诊断包
    python -m regiongate verify --profile .\\profile\\iamchinese-profile.json
    python -m regiongate undo --out .\\profile    # 只删它自己写的那几个文件
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from .diagnostics import render_summary, write_diag_bundle
from .evaluate import evaluate_region, explain_evidence
from .gate import build_gate, render_text
from .models import EnvironmentSnapshot
from .persona import (
    DEFAULT_PERSONA_SEED,
    TIMEZONE,
    Persona,
    build_persona,
)
from .policy import BUNDLED_POLICY, RegionPolicy
from .preflight import (
    EgressInfo,
    FixtureEgressProvider,
    PreflightOptions,
    SystemInfo,
    preflight,
)
from .storage import atomic_write_json, atomic_write_text, read_json, remove_files
from .update import PolicyUpdater

PROFILE_NAME = "iamchinese-profile.json"
ENV_SH_NAME = "env.sh"
ENV_PS1_NAME = "env.ps1"

DEFAULT_OS_NAME = "Windows 11 专业版"


# --------------------------------------------------------------------------
# 小工具
# --------------------------------------------------------------------------

def _configure_stdio() -> None:
    """Windows 控制台默认 GBK，中文和 ``¥`` 会直接炸；强制 UTF-8。"""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except (AttributeError, ValueError):
            pass


def _persona(args: argparse.Namespace) -> Persona:
    return build_persona(getattr(args, "seed", DEFAULT_PERSONA_SEED))


def _artifact_paths(out_dir: Path) -> Dict[str, Path]:
    return {
        "profile": out_dir / PROFILE_NAME,
        "env_sh": out_dir / ENV_SH_NAME,
        "env_ps1": out_dir / ENV_PS1_NAME,
    }


def _snapshot(persona: Persona, os_name: str = DEFAULT_OS_NAME) -> EnvironmentSnapshot:
    """用一套人设造出一个「就像是真的」的环境快照。"""
    info = SystemInfo(
        os_name=os_name,
        os_version="fixture",
        locale=persona.locale_bcp47,
        timezone=persona.timezone,
        region_format=persona.locale_windows,
    )
    provider = FixtureEgressProvider(
        EgressInfo(
            ip=persona.egress_ip,
            country="CN",
            asn=persona.asn,
            org=persona.org,
        )
    )
    return preflight(
        PreflightOptions(
            consent_network=True,
            ui_language=persona.locale_bcp47,
            system_info=info,
            egress_provider=provider,
        )
    )


def _resolve_policy(args: argparse.Namespace) -> RegionPolicy:
    policy_path = getattr(args, "policy", None)
    policy_url = getattr(args, "policy_url", None)
    if policy_path:
        return RegionPolicy.load(Path(policy_path))
    if policy_url:
        update = PolicyUpdater(url=policy_url).load(BUNDLED_POLICY)
        note = f"（{update.error}）" if update.error else ""
        print(f"地区清单：{update.source}{note}", file=sys.stderr)
        return update.policy
    return BUNDLED_POLICY


# --------------------------------------------------------------------------
# plan：落地清单
# --------------------------------------------------------------------------

def _plan_text(persona: Persona, out_dir: Path) -> str:
    artifacts = _artifact_paths(out_dir)
    env_lines = "\n".join(f"  {k}={v}" for k, v in persona.env().items())
    files = "\n".join(f"  {path}" for path in artifacts.values())

    return "\n".join(
        (
            "一、先换掉系统的「坐标」",
            "",
            "  1) 区域格式 / 显示语言：设置 → 时间和语言 → 语言和区域",
            f"     区域格式选「中文(简体，中国)」，国家或地区选「中国」。",
            f"     Windows 上的等效写法：Set-Culture -CultureInfo \"{persona.locale_bcp47}\"",
            "",
            "  2) 时区：统一到 UTC+8，别让 locale 和时区分属两地",
            f"     tzutil /s \"{TIMEZONE}\"",
            "",
            "  3) 终端编码：LANG/LC_ALL 指向 zh_CN.UTF-8，否则中文全是乱码",
            env_lines,
            "",
            "二、网络出口要落在国内，并且是家宽或移动网络",
            "",
            f"  · 出口运营商：{persona.carrier}（{persona.asn} {persona.org}）",
            "  · 机房 / 云主机出口会命中 datacenter，结论会降级成「疑似代理」；",
            "    家宽和 4G/5G 出口才是「正常人」的样子。",
            "  · 关掉所有会把流量带出境外的全局代理、境外 DNS、境外分流规则。",
            "",
            "三、跑一遍自检",
            "",
            "  python -m regiongate check",
            "",
            "四、需要留下痕迹的话（可选）",
            "",
            f"  python -m regiongate apply --out {out_dir}",
            "  会写出下面这几个文件，不会动注册表、不会改系统设置、不会联网：",
            files,
            "",
            "五、别做的事",
            "",
            "  · 不要同时把 en-US 留作默认显示语言 —— 语言包并存是最常见的破绽。",
            "  · 不要让浏览器 Accept-Language 和系统 locale 打架。",
            "  · 不要用境外手机号/邮箱做这套人设的联系方式，号段和 ASN 会对不上。",
        )
    )


def cmd_plan(args: argparse.Namespace) -> int:
    persona = _persona(args)
    out_dir = Path(args.out)
    print(_plan_text(persona, out_dir))
    return 0


# --------------------------------------------------------------------------
# persona：打印人设
# --------------------------------------------------------------------------

def cmd_persona(args: argparse.Namespace) -> int:
    persona = _persona(args)
    if args.json:
        json.dump(persona.as_dict(), sys.stdout, ensure_ascii=False, indent=2)
        sys.stdout.write("\n")
        return 0
    print(persona.card())
    print()
    ok_all = True
    for label, passed, note in persona.consistency():
        ok_all = ok_all and passed
        print(f"  {'✓' if passed else '✗'} {label}：{note}")
    print()
    print("  自洽性：" + ("全部通过" if ok_all else "存在不自洽项，见上"))
    return 0


# --------------------------------------------------------------------------
# apply / undo：写盘与回滚
# --------------------------------------------------------------------------

def cmd_apply(args: argparse.Namespace) -> int:
    persona = _persona(args)
    out_dir = Path(args.out)
    artifacts = _artifact_paths(out_dir)

    payload = {
        "schema": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "policy_version": BUNDLED_POLICY.policy_version,
        "persona": persona.as_dict(),
    }
    written: List[Path] = [atomic_write_json(artifacts["profile"], payload)]
    written.append(atomic_write_text(artifacts["env_sh"], _shell_env(persona)))
    written.append(atomic_write_text(artifacts["env_ps1"], _powershell_env(persona)))

    print("已写出：")
    for path in written:
        print(f"  {path}")
    print()
    print("下一步：")
    print("  bash  : source ./profile/env.sh")
    print("  pwsh  : . ./profile/env.ps1")
    print("  自检  : python -m regiongate verify --profile ./profile/iamchinese-profile.json")
    return 0


def _shell_env(persona: Persona) -> str:
    lines = [
        "# 由 python -m regiongate apply 生成，可安全删除。",
        "# 只在当前 shell 生效，不改系统设置。",
        "",
    ]
    lines.extend(f'export {key}="{value}"' for key, value in persona.env().items())
    lines.append("")
    return "\n".join(lines)


def _powershell_env(persona: Persona) -> str:
    lines = [
        "# 由 python -m regiongate apply 生成，可安全删除。",
        "# Set-Culture / Set-WinUILanguageOverride 需要当前用户权限；tzutil 需要管理员。",
        "",
        persona.powershell(),
        "",
    ]
    return "\n".join(lines)


def cmd_undo(args: argparse.Namespace) -> int:
    out_dir = Path(args.out)
    removed = remove_files(_artifact_paths(out_dir).values())
    if not removed:
        print(f"没有可删的文件（{out_dir}）")
        return 0
    print("已删除：")
    for path in removed:
        print(f"  {path}")
    return 0


# --------------------------------------------------------------------------
# check / verify：判定与人设自检
# --------------------------------------------------------------------------

def cmd_check(args: argparse.Namespace) -> int:
    persona = _persona(args)
    policy = _resolve_policy(args)
    snapshot = _snapshot(persona, getattr(args, "os", DEFAULT_OS_NAME))
    decision = evaluate_region(snapshot, policy)

    if args.gate:
        print(render_text(build_gate(decision, policy)))
        return 0

    if args.diag:
        out_dir = None if args.diag == "default" else Path(args.diag)
        bundle = write_diag_bundle(snapshot, decision, out_dir=out_dir)
        print(render_summary(bundle))
        return 0

    if args.json:
        json.dump(
            {"persona": persona.as_dict(), "snapshot": snapshot.as_redacted_dict(),
             "decision": decision.as_dict()},
            sys.stdout,
            ensure_ascii=False,
            indent=2,
        )
        sys.stdout.write("\n")
        return 0

    print(f"结论        : {decision.status}")
    print(f"原因码      : {decision.reason_code}")
    print(f"置信度      : {decision.confidence}")
    print(f"可复核      : {'是' if decision.is_appealable else '否'}")
    print(f"地区清单    : {decision.policy_version or '-'}")
    print("依据        :")
    for line in decision.evidence or ("（无）",):
        print(f"  · {explain_evidence(line)}")
    if decision.warnings:
        print("提示        :")
        for warning in decision.warnings:
            print(f"  · {explain_evidence(warning)}")
    print(f"可做        : {', '.join(decision.next_actions) or '（无）'}")
    return 0


def _score(persona: Persona, snapshot: EnvironmentSnapshot) -> List[str]:
    """把「像不像一个中国用户」拆成可检查的几条，返回未通过项。"""
    problems: List[str] = []

    if not persona.locale_bcp47.endswith("-CN"):
        problems.append("locale 不是 zh-*-CN")
    if persona.timezone != TIMEZONE:
        problems.append("时区不是 Asia/Shanghai")
    if persona.locale_windows.lower().find("china") < 0:
        problems.append("Windows 显示名里没有 China")
    if snapshot.egress_country != "CN":
        problems.append("出口国家不是 CN")
    if snapshot.asn_type not in {"residential", "mobile"}:
        problems.append(f"出口类型是 {snapshot.asn_type}（机房出口一眼假）")
    if snapshot.locale_tz_consistent is not True:
        problems.append("locale 与系统时区不指向同一地区")
    if snapshot.ip_locale_consistent is not True:
        problems.append("出口国与 locale 地区不一致")
    if len(persona.phone) != 11:
        problems.append("手机号不是 11 位")
    for label, passed, note in persona.consistency():
        if not passed:
            problems.append(f"{label} 对不上：{note}")
    return problems


def cmd_verify(args: argparse.Namespace) -> int:
    profile_path = Path(args.profile)
    data = read_json(profile_path)
    raw = data.get("persona", data)
    persona = Persona.from_dict(raw)

    snapshot = _snapshot(persona)
    decision = evaluate_region(snapshot, _resolve_policy(args))
    problems = _score(persona, snapshot)

    print(f"人设文件    : {profile_path}")
    print(f"姓名 / 号码 : {persona.name} / {persona.phone}")
    print(f"地区判定    : {decision.status} ({decision.reason_code})")
    print()
    if problems:
        print("不像中国用户的地方：")
        for item in problems:
            print(f"  · {item}")
        return 1

    print("全部通过：locale、时区、出口国、出口类型、号段、地址区划互相自洽。")
    return 0


# --------------------------------------------------------------------------
# 入口
# --------------------------------------------------------------------------

def _add_common(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--seed", type=int, default=DEFAULT_PERSONA_SEED,
                        help="人设随机种子（默认固定，便于复现）")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="regiongate",
        description="把环境做成中国用户口径的工具集（全部本地、不联网、不改系统设置）",
    )
    sub = parser.add_subparsers(dest="command")

    p_persona = sub.add_parser("persona", help="打印一套人设")
    _add_common(p_persona)
    p_persona.add_argument("--json", action="store_true")
    p_persona.set_defaults(func=cmd_persona)

    p_plan = sub.add_parser("plan", help="打印落地清单（不写盘）")
    _add_common(p_plan)
    p_plan.add_argument("--out", default="./profile")
    p_plan.set_defaults(func=cmd_plan)

    p_apply = sub.add_parser("apply", help="写出 profile 与 env 文件")
    _add_common(p_apply)
    p_apply.add_argument("--out", default="./profile")
    p_apply.set_defaults(func=cmd_apply)

    p_undo = sub.add_parser("undo", help="删除 apply 写出的文件")
    p_undo.add_argument("--out", default="./profile")
    p_undo.set_defaults(func=cmd_undo)

    p_check = sub.add_parser("check", help="用人设跑一遍地区判定")
    _add_common(p_check)
    p_check.add_argument("--json", action="store_true")
    p_check.add_argument("--gate", action="store_true", help="输出 Stage 3' 界面文案")
    p_check.add_argument("--diag", nargs="?", const="default", default=None,
                         metavar="DIR", help="写脱敏诊断包")
    p_check.add_argument("--os", default=DEFAULT_OS_NAME)
    p_check.add_argument("--policy", default=None)
    p_check.add_argument("--policy-url", default=None)
    p_check.set_defaults(func=cmd_check)

    p_verify = sub.add_parser("verify", help="读回 profile 并自检")
    p_verify.add_argument("--profile", default=f"./profile/{PROFILE_NAME}")
    p_verify.add_argument("--policy", default=None)
    p_verify.add_argument("--policy-url", default=None)
    p_verify.set_defaults(func=cmd_verify)

    return parser


def main(argv: Optional[List[str]] = None) -> int:
    _configure_stdio()
    parser = build_parser()
    args = parser.parse_args(argv)
    if not getattr(args, "func", None):
        parser.print_help()
        return 2
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
