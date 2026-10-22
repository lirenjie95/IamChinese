---
description: 把这个人设落成文件：cn-profile.json + env.sh + env.ps1，并复验
argument-hint: [输出目录，可选]
allowed-tools: Bash(node:*)
---

输出目录：`$ARGUMENTS` 给了就用它，没给就用默认的 `.iamchinese`。写到哪个目录就一直在那儿，别来回换。

执行顺序固定：写 → 读回来验 → 报差项。假设目录是 `OUT`：

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/iamchinese.mjs" apply --out OUT
node "${CLAUDE_PLUGIN_ROOT}/bin/iamchinese.mjs" verify --profile OUT/cn-profile.json
```

`verify` 有两块，别混着念：

- **人设自检**（档案内部六项自洽）：这里红是真数据问题，回去换 seed 重新生成，不要改检查。
- **环境对比**（这台机器现在的 locale / 时区 / LANG / TZ）：这里红不是数据错，是还没落地。
  报告里的 `fix` 是「该执行的命令」，不是「已经执行过」。

要不要真改机器由用户决定。`env.ps1` 里的 `Set-Culture` / `Set-WinUILanguageOverride` /
`tzutil` 会改系统设置，`undo` 只删文件、不还原系统——把这句话说出来再问他要不要执行。
只想当前终端生效，就只 source `env.sh`。
