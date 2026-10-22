# v0.1.0

第一个版本：把「这台机器上的助手把你当成中国大陆用户」做成一个能装、能验、能发给别人的插件。

## 装上会发生什么

- DSH：往系统提示里插一段（order 40）说明用户在中国大陆、界面语言简体中文、时区
  Asia/Shanghai、日期 ISO、货币人民币、周一为一周起始；再挂一个技能和五个工具。
- Claude Code：`SessionStart` hook 输出同一段文本，作为会话上下文附加给模型。
- 两边都不改系统的 locale、时区、注册表，也不碰浏览器 —— 撤掉插件即完全恢复。

## 装

DSH：

```powershell
dsh plugin --profile web add https://github.com/lirenjie95/IamChinese/releases/download/v0.1.0/dsh-cn-persona-0.1.0.tgz
```

Claude Code：

```text
/plugin marketplace add lirenjie95/IamChinese
/plugin install cn-persona@iamchinese
```

## 里面有什么

- 五个工具：`cn_persona` / `cn_persona_plan` / `cn_persona_apply` / `cn_persona_check` /
  `cn_persona_share`
- 一个技能 `cn-persona`
- 一个 CLI：`cn-persona persona|plan|apply|verify|share|undo`
- Python 内核（地区判定、文案、诊断包）+ 137 个用例；JS 插件 80 个用例

## 它不做什么

不改系统设置、不伪造证件、不提供真实出口 IP、不做注册/实名/KYC。生成的身份证是校验位自洽的
样例数据，用的是 RFC 5737 文档段地址。
