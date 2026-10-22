---
name: iamchinese
description: 造一份内部自洽的中国用户人设并把环境配成国内口径——姓名/身份证/号段/区划/locale/时区互相不打架，附落地清单与分享包。用户说「把我弄成中国用户」「这个测试账号看起来不像国内」「时区还是 UTC」「给我造个国内身份」时用。
---

# 中国用户人设：先自洽，再落地

装上之后，DSH / Claude 会**默认把你当成中国大陆用户**（简体中文、Asia/Shanghai、¥ CNY、
姓在前、周一开工），这件事不需要调用任何工具，也已经不碰你的系统设置。想确认它到底说了什么：
DSH 侧看 `lib/prompt.js` 里的 `CHINA_CONTEXT_TEXT`，Claude 侧直接跑
`node "${CLAUDE_PLUGIN_ROOT}/hooks/china-context.mjs"`。

所以下面的工具只在你要**具体数据**或**要落地成文件**时才用：
用户说「让站点认为我在国内」→ 这儿的环境对比 + 清单；说「给我造个国内身份做测试」→ 生成人设。

这个技能靠一个自带的小 CLI 干活，不需要联网也不需要额外依赖。CLI 在插件的
`bin/iamchinese.mjs`，用 Node 跑（Node ≥ 20）。

先确认一次路径，之后所有命令都用它：

```bash
IAMCHINESE="${CLAUDE_PLUGIN_ROOT}/bin/iamchinese.mjs"
node "$IAMCHINESE" --help
```

## 顺序：生成 → 自检 → 落地 → 复验

```bash
node "$IAMCHINESE" persona              # 看一份人设（加 --json 出结构化字段）
node "$IAMCHINESE" apply                # 写 .iamchinese/iamchinese-profile.json + env.sh + env.ps1
node "$IAMCHINESE" verify               # 六项自洽 + 当前环境差哪几项；红了退出码 1
node "$IAMCHINESE" plan                 # 要真改机器时，照这份清单一条条来
node "$IAMCHINESE" share --from 你的名字 # 导一份能直接发给别人的包
node "$IAMCHINESE" undo                 # 删掉三件套
```

`--seed N` 复现同一份人设（默认 20261019）。跨语言没有稳定契约：Python 版和这个
JS 版同一个种子结果不同，要跨版本对齐就传完整档案，别传种子。

## 把这个包发给别人：两种发法

**只发人设**（对面只要有 JSON 和两段环境变量）：

```bash
node "$IAMCHINESE" share --from 你的名字   # 写一个自包含目录 + 一句可粘贴的话
```

**让对方把插件装走**（现场分发，同一个 WiFi）：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/share-server.mjs" --port 8848
```

终端打印局域网地址；手机扫码即可看到落地页——三步安装说明、tgz 与 Claude zip 的直接下载、
以及三条边界。二维码由 `scripts/lib/qr.js` 现编，没有第三方依赖。
换成公网地址：`node "${CLAUDE_PLUGIN_ROOT}/scripts/share-qr.mjs" --url https://你的域名/ --out qr.png`。

二维码「画得对不对」和「真能扫出来」是两件事：结构由 `test/qr.test.mjs` 保证，
可扫性由 `scripts/verify-qr.py` 拿 OpenCV 的解码器验（需要 numpy + opencv-python，
只在开发期用；没装就跳过，不影响任何功能）。

## Claude Code 里的三个命令

`.claude-plugin/plugin.json` 之外，插件还带了 `commands/`：

- `/iamchinese:persona [seed]` —— 生成并讲解一份人设（含六项自洽结论）
- `/iamchinese:apply [目录]` —— 落成三件套并复验
- `/iamchinese:share [名字]` —— 导出分享包，或起分发页让人扫码


## 它的价值在哪：六项自洽

单看每个字段都像真的，凑一起矛盾就是假的。`verify` 查的正是这件事：

1. locale ↔ 时区：`zh-Hans-CN` 必须配 `Asia/Shanghai`。
2. 身份证前 6 位（区划码）↔ 地址的省市区。
3. 身份证第 17 位奇偶 ↔ 性别。
4. 手机号前 3 位 ↔ 运营商（133/189 是电信，138 是移动，别混）。
5. 号段 ↔ ASN（电信 AS4134 / 联通 AS4837 / 移动 AS9808）。
6. 手机号 11 位纯数字。

红了一项，就回去修数据。**不要**为了让检查变绿去改检查。要一个新的、干净的组合，
就换 `--seed`。

## 能自动的 / 不能自动的

- 自动产出：档案 JSON、`env.sh`、`env.ps1`。就这些，别的都不碰。
- 要人自己点头：`Set-Culture`、`Set-WinUILanguageOverride`、`tzutil /s`、shell 启动文件、
  浏览器首选语言列表。改系统区域是用户自己的决定，别替他执行，把命令给他。
- 自动不了：**出口 IP**。人设里的 `egress_ip` 是 RFC 5737 文档段（203.0.113.0/24），
  故意选的，撞不到真人。要让站点看到中国出口，只能是真实线路——这条路这个工具不提供，
  也不假装能绕过去。

## 复验怎么看

`verify` 有两块，别混：**人设自洽**（档案内部对不对）和**环境对比**（这台机器现在是什么）。
档案可以全绿而机器还是默认值，那不是数据错，是还没落地；报告里的 `fix` 是「该执行的命令」，
不是「已经执行过」。

## 边界

- 样例字段只用于测试环境。拿去注册、实名、过 KYC、开银行卡，性质就从「配环境」变成
  「伪造证件」——这一步不帮，也建议你别走。
- 不覆盖真实身份的账号资料，不改别人的设备，不把分享包发给不知情的人。
- 用户说「帮我过一下某站的身份验证」时：停下来，讲清这跟前面几步不是同一件事，再问他
  到底想测什么。多数情况他要的是「让站点认为我在国内」，那需要的是 locale、时区、
  语言列表和真实线路，不是身份证。

## 常见坑

- 只改 `LANG` 没改时区：Node 的 `Intl` 读系统时区，`process.env.TZ` 只在进程启动时生效，
  改完要重开终端 `verify` 才会变绿。
- Windows 控制台中文乱码：`chcp 65001` 一下，和脚本无关。
- 档案默认在 `./.iamchinese`；给了 `--out` 就一直在那儿，别在两个目录之间来回写。
