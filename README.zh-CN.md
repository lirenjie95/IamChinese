# IamChinese

![我爱国无罪 · IamChinese](assets/logo-horizontal.png)

[**English**](README.md) | **简体中文**

[![tests](https://img.shields.io/badge/tests-137%20Python%20%C2%B7%2081%20JS-brightgreen)](#测试)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![python](https://img.shields.io/badge/python-3.10%2B-informational)](#快速开始)
[![node](https://img.shields.io/badge/node-%E2%89%A520-informational)](#两个外壳dsh-插件--claude-插件)
[![npm](https://img.shields.io/badge/npm-iamchinese-cb3837)](https://www.npmjs.com/package/iamchinese)

> 仓库、产品名写 **IamChinese**；npm 包、命令、目录一律小写 iamchinese（npm 只收小写包名）。

把 `regiongate` 的坐标轴整个翻过来：**默认用户是一个住在国内的普通人**——家宽或 4G 出口、
`zh-Hans-CN`、`Asia/Shanghai`；北美与西欧反而落在服务范围之外。

原来的版本默认用户在美国：Comcast 家宽、`America/Los_Angeles`、`en-US`，`CN` 挂在
`restricted` 里，界面文案是"你的网络出口位于 CN，该地区不在服务支持范围内"。

零第三方依赖，`unittest` 跑 137 个用例，断网可跑；`plugins/iamchinese/` 里另有一套零依赖的 JS 实现与 81 个用例，
能装进 DSH 或 Claude Code 当插件用。

装进 DSH / Claude 之后，**默认把你当成中国大陆用户**：会话里说简体中文，日期按
`2026-10-21`、金额按 `¥ CNY`、地址按「省 → 市 → 区 → 街道」、一周从周一算。这一步不改你的
系统 locale、不改注册表、不改任何工具的行为，也不假装出口 IP；DSH 侧设
`IAMCHINESE_NO_PROMPT=1` 就能关掉。想让它「生成一份具体的人设」，再走下面的工具。

---

## 快速开始

```bash
python -m unittest discover -s tests -t . -v      # 全部测试，约 0.4 秒

python -m regiongate persona                       # 打印一套人设 + 六项自洽检查
python -m regiongate plan                          # 打印手工落地清单，不写盘
python -m regiongate apply --out .\profile         # 写出 iamchinese-profile.json + env.sh + env.ps1
python -m regiongate verify --profile .\profile\iamchinese-profile.json
python -m regiongate undo --out .\profile          # 只删它自己写的三个文件

python -m regiongate check                         # 用人设跑一遍地区判定
python -m regiongate check --gate                  # Stage 3' 界面文案
python -m regiongate check --diag .\diag           # 脱敏诊断包（只落本地）
python -m regiongate check --json                  # 机器可读
```

从 GitHub 拿：

```bash
git clone https://github.com/lirenjie95/IamChinese.git
cd IamChinese
python -m unittest discover -s tests -t .          # 137 个用例，断网可跑
```

也可以直接扫码进仓库（码是 `assets/qr-repo.png`，见下文「两个外壳」）。

`--seed` 固定人设（默认 `20261019`），同一 seed 完全可复现。

Windows 控制台默认 GBK，`¥` 和中日韩字符会触发 `UnicodeEncodeError`；`__main__` 已对
stdout/stderr 强制 UTF-8，若仍异常先 `chcp 65001`。

`env.ps1` 里除 `$env:` 变量外还含 `Set-Culture` / `Set-WinUILanguageOverride` / `tzutil`
三行——**dot-source 它就是真的改系统设置了**。只想临时生效就只 `source ./profile/env.sh`。
`undo` 只删文件，不会把系统设置改回去。

---

## 两个外壳：DSH 插件 / Claude 插件

`plugins/iamchinese/` 是同一套人设逻辑的 JS 版，装到宿主里就能**在会话中直接调用**，也能打包发给朋友。

```bash
cd plugins/iamchinese
node --test                                      # 81 个用例，零依赖

# 装进 DSH（装完 dsh 会把包自动挂进 profile 的层栈，不用手改配置）
dsh plugin --profile web add D:\IamChinese\plugin
# 或用打好的包，朋友那边就是这条路
dsh plugin --profile web add .\dist\iamchinese-0.3.0.tgz

npm run dist                                     # 产出 tgz + zip + install.ps1 + 发给朋友.md + 两张码
npm run share                                    # 起本机分发页，手机扫码就能下包（默认 8848）
```

装好之后会话里多出五个工具：`iamchinese`（生成）、`iamchinese_plan`（清单）、
`iamchinese_apply`（写三件套）、`iamchinese_check`（六项自洽 + 环境对比）、
`iamchinese_share`（导出分享包），外加一份 `/iamchinese` 技能讲清它们之间的顺序。
Claude Code 用 `.claude-plugin/plugin.json` 认清单、`skills/iamchinese/SKILL.md` 讲顺序、`commands/` 给三个 slash 命令（persona/apply/share），CLI 是同一份。

二维码是这个包里自己编的（`scripts/lib/qr.js`，1–6 版、字节模式、纠错 M/Q，零依赖）。
默认指向仓库地址，发出去的那张码换台机器也有效：

<img src="assets/qr-repo.png" width="200" alt="指向本仓库的二维码">

`assets/qr-repo.png` 就是它，已入库；`npm run qr` 重画，`node scripts/share-qr.mjs --url https://你的域名/`
改指向。`npm run share` 起的局域网分发页有自己的码（指向当前网卡地址，`--lan` 能在命令行上
复现），当面传包用那张。能不能真扫出来由 `scripts/verify-qr.py` 拿 OpenCV 的解码器验：
6 个版本 × M/Q 两级共 12 条边界用例，全部解开且字节一致；`--png <文件> --expect <url>`
可单独验一张。

### 分发方式

| 途径 | 命令 |
|---|---|
| DSH 插件，走 npm | `dsh plugin --profile web add iamchinese` |
| DSH 插件，走 Release 资产 | `dsh plugin --profile web add https://github.com/lirenjie95/IamChinese/releases/latest/download/iamchinese-0.3.0.tgz` |
| DSH 插件，走本地 tgz | `dsh plugin --profile web add .\dist\iamchinese-0.3.0.tgz` |
| Claude Code，把本仓库当 marketplace | `claude plugin marketplace add lirenjie95/IamChinese`，再 `claude plugin install iamchinese@iamchinese` |
| Claude Code，会话里 | `/plugin marketplace add lirenjie95/IamChinese`，再 `/plugin install iamchinese@iamchinese` |
| 其他 | `plugins/iamchinese/dist/`：tgz、Claude zip、`install.ps1`、`发给朋友.md`、二维码 |

marketplace 清单在仓库根的 `.claude-plugin/marketplace.json`，条目指向 `./plugins/iamchinese`，那边另有
自己的 `.claude-plugin/plugin.json`。装了 Claude CLI 的话 `claude plugin validate .` 会把两份
清单一起校验。

上架两个市场要的东西在 `marketplace/`：给 [Awesome DSH Plugin]
(https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) 的条目 YAML（原样复制成对方仓库的
`data/plugins/lirenjie95__IamChinese--plugin.yml`，一个文件就是全部投稿）、release notes 模板，
以及提 PR 前要核对的几条规则。

`plugins/iamchinese/README.md` 里有安装、卸载、分享和「它不做什么」的完整说明。两个版本**不共享 seed
语义**：同一个种子在 Python 版和 JS 版结果不同，要跨版本对齐就传完整档案。

---

## 两件事被有意拆开

| 层 | 模块 | 回答什么 | 是否写宿主 |
|---|---|---|---|
| 内核 | `preflight` → `evaluate` → `gate` → `diagnostics` | 这台机器在服务方眼里属于哪个地区 | 否，全程只读 |
| 人设层 | `persona` + CLI | 让它看起来像一个中国用户，这一整套字段怎么凑齐 | 只写三份文本文件 |

五阶段流程：

```
Stage 1 只读采集 → Stage 2 套地区清单 → Stage 3 放行 / Stage 3' 说明与选项 → Stage 5 诊断包
```

Stage 1 与 Stage 2 分离（采集只管事实、判定只管规则，可分别测试）；Stage 2 必须本地可算，
远端清单只是更新不是依赖；Stage 3' 是一等公民，不是错误弹窗——按 reason_code 算出可用的按钮集合。

---

## 人设为什么不是随便编的

能骗过粗筛的不是"名字像中国人"，而是**六个字段互相咬合**：

| 检查项 | 为什么 | 实现 |
|---|---|---|
| locale ↔ 时区 | `zh-Hans-CN` 配 `America/Los_Angeles` 是最经典的破绽 | 常量 `LOCALE_BCP47` / `TIMEZONE` |
| 身份证区划 ↔ 收货地址 | 前 6 位区划码必须和省市对得上 | `_REGIONS`：28 条真实 省/市/区/区划码 |
| 顺序码 ↔ 性别 | 第 17 位奇偶表性别，写反整张证就错 | `make_id_card(..., male=…)` |
| 手机号段 ↔ 运营商 | 155 联通、139 移动，混了就对不上 | `CARRIERS` 各带真实号段 |
| 号段 ↔ ASN | 家宽出口 ASN 要和运营商一致 | 移动 AS9808 / 联通 AS4837 / 电信 AS4134 |
| 号码长度 | 11 位，少一位直接露馅 | `consistency()` |

第 18 位按 GB 11643 的 MOD 11-2 真算（`id_check_digit()`），单测拿官方样例
`11010519491231002X` 对过，并断言"任意一位改掉都会破坏校验"。出口 IP 用 TEST-NET-3
（`203.0.113.0/24`）文档段，不会被谁误当成真实地址去扫。

---

## 判定语义：三种"不行"必须分开

| 情形 | status | 可重试 | 可申诉 |
|---|---|---|---|
| 拿不到出口信息 | `unknown` | 是 | 否 |
| 未列入清单，策略=警告 | `unknown` | — | 是 |
| 未列入清单，策略=阻断 | `not_supported` | 否 | 是 |
| 明确排除地区（如 `US`） | `not_supported` | 否 | **否** |

把前两类混成"安装失败"，是现实中大量无效申诉的源头。错误码表在 `reasons.py`，是
status / confidence / 可否申诉 / 下一步动作的唯一真源：

`OK`、`OK_WITH_WARNINGS`、`OK_UNLISTED`、`W_REGION_UNLISTED`、`E_REGION_UNLISTED`、
`E_REGION_RESTRICTED`（政策结论，申诉无用）、`E_NO_NETWORK_DATA`（数据不足，可重试）、
`E_POLICY_STALE`（快照过期，不阻断）。

文案禁忌：不写"检测到你在使用 VPN"（推断不是事实）、不写"请关闭代理后重试"（等于教人绕过）、
不给具体阈值（"同一 IP 关联 3 个账号"这类）。

---

## 关键设计点

1. **默认不发任何请求**：`consent_network` 默认 `False`，且必须同时显式传入 provider；
   默认 provider 是 `NullEgressProvider`，什么都不做。
2. **网络失败只降级**：异常 / 超时 / 返回 `None` 一律落成 `egress_country=None`，
   走 `E_NO_NETWORK_DATA`，安装仍可 `local_only` 继续。
3. **IP 只以掩码形式存在**：采集时掩成 `203.0.113.0`；诊断包生成时再递归扫一遍，
   字符串里残留的 IPv4 也会被掩掉。
4. **按钮是算出来的**：不可申诉的判定没有"提交复核申请"；策略没配 `docs_url` /
   `appeal_url` 的按钮不出现；`not_supported` 没有"继续安装"；集合为空则至少给"退出"。
5. **诊断包只落本地**：`diagnostics.py` 里没有上传函数，`uploaded` 恒为 `False`；
   `_scrub()` 按 key 名丢弃 `fingerprint`/`hostname`/`token`/`cookie` 一类字段。
6. **策略更新永远有退路**：`新鲜缓存 → 远端 → 过期缓存 → 内置快照`，任何一环失败只记在
   `PolicyUpdate.error`。远端畸形数据（版本缺失、国家码非两位、supported 为空、
   与 restricted 重叠）一律**拒绝**而非合并——半对的清单比没有更新更危险。
7. **人设层不越界**：`persona.py` 纯函数，不读环境、不写文件、不联网；落盘只经
   `storage.py`（`atomic_write_json` / `atomic_write_text` / `remove_files`），
   且 `remove_files()` 只删指定文件不删目录。

---

## 静态不变量（`tests/test_invariants.py`）

源码级断言，不是普通单测：

- 包内不得出现 `subprocess` / `winreg` / `ctypes` / `socket` / `requests` / `shutil` / `os.system`
- 不得使用 `eval(` / `exec(`
- 写盘只允许 `storage.py`；联网只允许 `preflight.py` 与 `update.py`
- 两个白名单断言"必须恰好等于"——加模块得改测试，是故意的减速带
- 模型必须 frozen；非法 `status` / `confidence` / `unknown_action` 抛 `ValueError`

---

## 测试

| 套件 | 数量 | 命令 |
---|---|---|
| Python 内核 | 137 | `python -m unittest discover -s tests -t .` |
| JS 插件 | 81 | `cd plugins/iamchinese && node --test` |

JS 那套里有 4 条直接调宿主的真参数/输出校验器，2 条在真 cordis 上下文里挂载插件，
12 条覆盖二维码编码器，7 条走 CLI。

---

## 目录

```
README.md                英文说明（GitHub 默认展示）
README.zh-CN.md          简体中文说明
LICENSE                  MIT
.claude-plugin/
└── marketplace.json     Claude Code marketplace 清单（条目指向 ./plugins/iamchinese）
marketplace/
├── lirenjie95__IamChinese--plugin.yml   Awesome DSH Plugin 的条目（原样复制去提 PR）
├── release-notes.md                     GitHub Release 正文
└── README.md                            两个市场的上架步骤与规则
regiongate/
├── __init__.py          公开 API
├── __main__.py          CLI：persona / plan / apply / undo / check / verify
├── persona.py           人设生成：身份证、号段、区划、locale、时区
├── signals.py           纯函数：IP 掩码、locale 解析、时区→国家、ASN 分类
├── models.py            EnvironmentSnapshot / RegionDecision（frozen）
├── policy.py            RegionPolicy + 内置清单（CN-first，样例数据）
├── reasons.py           错误码唯一真源
├── preflight.py         Stage 1：只读采集 + 可注入出口查询
├── evaluate.py          Stage 2：判定 + evidence 解释
├── gate.py              Stage 3'：文案与按钮，含动作过滤
├── diagnostics.py       Stage 5：脱敏诊断包
├── storage.py           唯一允许写盘的模块（原子写）
└── update.py            远端策略 + 缓存 + 回退链

tests/                   137 个用例（含 persona 的 34 个、静态不变量）

assets/                  打好的成品 logo（不含源图，也不含生成脚本）
├── logo.png             512×512 主 logo
├── logo-mark.png        532×532 透明圆章（深色/浅色底都能放）
├── logo-horizontal.png  1200×360 横版，README 头图
├── social-preview.png   1280×640 社交预览图（仓库 Settings → Social preview 用）
├── qr-repo.png          指向本仓库的二维码
└── favicon.ico          16/24/32/48/64/128 多尺寸，整张脸打码、不放题字

> logo 借的是一张流传很广的梗图，眼部做了马赛克：梗还认得出，但不再是一张清晰人像
> 跟着仓库到处传。ico 整张脸都打码——16px 里塞不下五官，也没地方放题字。仓库里只留
> 打好的成品，源图和生成它的脚本都不收进来。
>
> `social-preview.png` 得手动上传：GitHub 没有给社交预览留 API，只能进
> Settings → Social preview 传这张图。除此之外它能到的地方都自己带上了——README 头图、
> 分发页头图与站点图标、Release 正文、npm 包里的 `assets/`。

plugins/                 JS 版；每个子目录都是可独立安装的插件
└── iamchinese/          DSH 插件 + Claude 插件，同一份逻辑两个外壳
    ├── lib/core/        纯逻辑（人设、静态表、PRNG、环境、档案），无 IO
    ├── lib/             宿主装配（index / mount / tools / skill / prompt）
    ├── bin/             CLI：persona / plan / apply / verify / share / undo
    ├── skills/          Claude 侧技能手册
    ├── commands/        Claude 侧三个 slash 命令
    ├── hooks/           Claude 侧 SessionStart hook（同一段身份说明）
    ├── .claude-plugin/  Claude 侧清单
    ├── test/            81 个用例（宿主真校验器 4 + 真 cordis 挂载 2 + 二维码 12 + 分发页 7 + CLI 7）
    └── scripts/         打包、局域网分发页、二维码编码与验证
```

---

## 边界与代价

不做：静默修改 locale / 时区 / 注册表，注入或改写 HTTP 头（`Accept-Language`、
`X-Forwarded-For`、`CF-IPCountry`），捆绑代理/隧道/DNS 改写，静默采集设备指纹，
多账号 / 代注册 / 共享账号池，针对具体平台的阈值逆向。

理由不是道德说教：这类做法把风险留在**使用它的人**身上——账号是你的，封的是你，工具
作者不承担后果。所以这里停在"生成文本 + 打印清单"：写不写进系统是你自己的动作，且留了
`undo` 与可审计的痕迹。

代价也说清：哪怕六项自洽，也只是**骗过粗筛**；有历史的平台看的是账号历史与行为序列，
换掉环境不会改变那部分。文档不把它包装成"安全无事"。

---

## 实现说明与已知限制

- `locale_tz_consistent` 是 `Optional[bool]`：时区无法映射到国家时（如 `UTC+08:00`）
  填 `False` 会造假警告，改用 `None` 表示"无法判定"。
- `RegionDecision` 比最小设计多了 `policy_version` / `policy_stale` / `warnings`，
  比 `hasattr` 兜底干净。
- 沙箱（DSH workspace-write）下在系统临时目录建文件会卡住：测试临时目录放工作区
  `tests/.testtmp/`，`atomic_write_*` 用同目录兄弟临时文件而非 `tempfile.mkstemp`；
  `REGIONGATE_DIAG_DIR` / `REGIONGATE_CACHE_DIR` 可改默认输出位置。
- 人设只覆盖简体中文 / 中国大陆；港澳台与海外华人场景的 locale 组合还没做。
- 没有 GUI（`GateView` 已是 UI 无关结构，目前只有 `render_text`）；出口查询的真实端点
  未接（`HttpEgressProvider` 注入点已留，无默认地址）；策略只做结构校验，未验签。

## 许可

MIT，见 [LICENSE](LICENSE)。logo 借的是一张网络梗图并经像素化处理；仓库里的人名、地址、
身份证号、手机号全部由固定种子生成，不对应任何真实个人。

---

`BUNDLED_POLICY` 是样例数据，不是任何厂商的真实清单，`appeal_url` / `docs_url` 指向
`example.invalid`；人名、地址、身份证、手机号全部由固定种子生成，不对应任何真实个人。
