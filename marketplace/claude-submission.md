# 提交到 Claude Code 插件目录：填报材料

官方目录不收 PR——`anthropics/claude-plugins-community` 是只读镜像，直接提的 PR 会被自动关掉；
唯一入口是表单 <https://clau.de/plugin-directory-submission>（要 claude.ai 账号登录，
过自动安全扫描 + 人工审核）。所以这份文件只是把表单要填的东西先写好，复制粘贴即可。

## 仓库侧已经就绪的东西

| 项 | 值 |
| --- | --- |
| 插件目录 | `plugins/cn-persona/`（含 `.claude-plugin/plugin.json`、`skills/`、`commands/`、`hooks/`） |
| 市场清单 | 仓库根 `.claude-plugin/marketplace.json`，市场名 `iamchinese`，条目名 `cn-persona` |
| 本地验证 | `/plugin marketplace add lirenjie95/IamChinese` → `/plugin install cn-persona@iamchinese` |
| 许可证 | MIT（`LICENSE`） |
| 版本 | 0.1.0 |

卸载/回滚：`/plugin uninstall cn-persona@iamchinese`。

## 表单逐项

**Name**：`cn-persona`

**Display name**：`CN Persona`

**Repository URL**：`https://github.com/lirenjie95/IamChinese`

**Plugin subdirectory**：`plugins/cn-persona`

**Marketplace name**：`iamchinese`

**Short description**（≤ 160 字符）：
Treat the session as a mainland-China user — zh-Hans-CN, Asia/Shanghai, ISO dates, ¥ CNY — and generate a self-consistent test persona with a valid GB 11643 check digit.

**Long description**：

> Two layers, deliberately separate.
>
> The first is a session context: one system-prompt section (DSH) or one SessionStart hook line
> (Claude Code) that tells the model the user is in mainland China, uses Simplified Chinese,
> writes dates as YYYY-MM-DD, currency as ¥ CNY, addresses province → city → district → street,
> and starts the week on Monday. It changes no tool behaviour and never overrides an explicit
> instruction from the user.
>
> The second is a test fixture generator: five tools (`cn_persona`, `cn_persona_plan`,
> `cn_persona_apply`, `cn_persona_check`, `cn_persona_share`) and a matching CLI that produce a
> persona whose fields agree with each other — the GB 11643 ID card's region code matches the
> shipping address, the 17th digit matches the stated gender, the check digit is computed rather
> than invented, the phone prefix matches the carrier's ASN. Six cross-checks report any field
> that drifts.
>
> Everything is deterministic from a seed and runs offline. It reads no network, writes only the
> files it is asked for (`cn-profile.json`, `env.sh`, `env.ps1`), and changes no system setting:
> the "plan" output is a checklist a human follows, not an action.

**Category**：Developer tools（若表单给的是固定列表，选 `productivity` 或 `developer-tools` 里最接近的）

**Keywords**：`persona`, `zh-cn`, `locale`, `timezone`, `china`, `test-fixture`, `i18n`

**License**：MIT

**Author**：YG

## 安全扫描可能会问的三件事（先答）

1. **联网？** 没有。零第三方依赖，`lib/` 只有本地计算；`scripts/share-server.mjs` 是可选的本机分发页，
   要人手动 `npm run share` 才起，且只监听局域网、只发 `dist/` 里的成品文件。
2. **文件系统？** 只在用户指定的目录里写 `cn-profile.json`、`env.sh`、`env.ps1`（临时文件 + 原子替换），
   `undo` 只删这三个；不碰系统 locale / 时区 / 注册表 / 浏览器设置。
3. **会跑命令吗？** `hooks/china-context.mjs` 在 SessionStart 跑一次 `node`，只往 stdout 打一段中文说明
   （约 10 行），任何异常都 `exit 0`，不阻断会话。没有任何子进程、没有 shell 调用。

## 提交之后

- 通过审核后会被同步进 `anthropics/claude-plugins-community`（夜间同步），用户侧命令变成
  `claude plugin install cn-persona@claude-community`。
- 在那之前，任何人已经可以从本仓库直接装：`/plugin marketplace add lirenjie95/IamChinese`。
