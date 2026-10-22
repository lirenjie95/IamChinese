---
description: 造一份内部自洽的中国用户人设（姓名/身份证/号段/区划/locale/时区互相对得上）
argument-hint: [种子，可选]
allowed-tools: Bash(node:*)
---

用户想要一份「中国用户」人设，用于本地开发和测试。$ARGUMENTS 里如果有纯数字，当作 `--seed`；
没有就用默认种子 `20261019`（同一 seed 完全可复现）。

执行：

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/iamchinese.mjs" persona --json
```

拿到 JSON 之后，按这个顺序讲给他听：

1. 先给**六项自洽**的结论（`checks` 全绿才算一份能用的样例），哪项红了就把 `note` 原样念出来；
2. 再给人读得懂的那几项：姓名、性别、生日、手机号 + 运营商、身份证（前 6 位是区划码）、
   省市区地址、邮箱、职业与单位、ASN 与机构；
3. 最后一句必须点明：`egressIp` 落在 RFC 5737 的 `203.0.113.0/24`，是文档段样例地址，
   不是真的中国出口；要站点看到中国出口只能是真实线路。

不要顺手去改这台机器的 locale 或时区——那是用户自己点头的动作。要落地就提醒他跑
`/iamchinese:plan`，再看 `env.ps1` / `env.sh` 里那几行是真改系统设置。
