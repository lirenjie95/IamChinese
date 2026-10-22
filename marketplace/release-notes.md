# v0.3.0

工具 id 统一到 `iamchinese`，故事没变：让 DSH 和 Claude Code 把会话当成中国大陆用户。

## 改名

插件、npm 包、CLI、目录、工具、档案文件名，现在全都叫 `iamchinese` / IamChinese：

| 旧 | 新 |
| --- | --- |
| `cn_persona` | `iamchinese` |
| `cn_persona_plan` / `_apply` / `_check` / `_share` | `iamchinese_plan` / `_apply` / `_check` / `_share` |
| `CN_PERSONA_NO_PROMPT` | `IAMCHINESE_NO_PROMPT` |
| `cn-profile.json` | `iamchinese-profile.json` |
| `cn-persona` / `dsh-cn-persona` | `iamchinese` |

v0.2.0 里工具 id 是故意留着的，这回不留了：一个包里两套前缀，看着就像没改干净。
`verify` 会在旧档案上直接报缺字段——重新 `iamchinese apply` 一次即可，人设种子相同，生成的内容一字不差。

## 装上会发生什么

- DSH：往系统提示里插一段（order 40）说明用户在中国大陆、界面语言简体中文、时区
  Asia/Shanghai、日期 ISO、货币人民币、周一为一周起始；再挂一个技能和五个工具。
- Claude Code：`SessionStart` hook 输出同一段文本，作为会话上下文附加给模型。
- 两边都不改系统的 locale、时区、注册表，也不碰浏览器 —— 撤掉插件即完全恢复。

## 装

DSH：

```powershell
dsh plugin --profile web add https://github.com/lirenjie95/IamChinese/releases/download/v0.3.0/iamchinese-0.3.0.tgz
```

Claude Code：

```text
/plugin marketplace add lirenjie95/IamChinese
/plugin install iamchinese@iamchinese
```

## 里面有什么

- 五个工具：`iamchinese` / `iamchinese_plan` / `iamchinese_apply` / `iamchinese_check` /
  `iamchinese_share`
- 一个技能 `iamchinese`
- 一个 CLI：`iamchinese persona|plan|apply|verify|share|undo`
- Python 内核（地区判定、文案、诊断包）+ 137 个用例；JS 插件 81 个用例

## 它不做什么

不改系统设置、不伪造证件、不提供真实出口 IP、不做注册/实名/KYC。生成的身份证是校验位自洽的
样例数据，用的是 RFC 5737 文档段地址。
