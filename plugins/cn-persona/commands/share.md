---
description: 把包发给别人：导出人设分享包，或起本机分发页让别人扫码下载插件
argument-hint: [朋友的名字，可选]
allowed-tools: Bash(node:*), Bash(cd:*)
---

$ARGUMENTS 是收件人的称呼（比如「老张」）。没说就用 `朋友`。

## 情况一：只发一份人设档案

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/cn-persona.mjs" share --from "$ARGUMENTS"
```

产出一个自包含目录（`cn-profile.json` + `env.sh` + `env.ps1` + 说明），末尾有一句能直接
粘进微信的话。念给他听的时候顺带说明：包里只有按种子拼出来的样例，没有凭据、没有真实手机号。

## 情况二：让对方把插件本身装上（现场分发）

在插件目录下起分发页，手机扫同一个 WiFi 里的地址就能下包：

```bash
cd "${CLAUDE_PLUGIN_ROOT}" && node scripts/share-server.mjs --port 8848
```

终端会打印局域网地址和二维码路径。要么让对方扫屏幕上打开的 `/qr.png`，要么直接把
`dist/qr.png` 发过去。`Ctrl+C` 结束。

想把二维码换成公网地址（比如你把它放到了静态托管）：

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/share-qr.mjs" --url https://你的域名/ --out qr.png
```

**别做这两件事**：把 `--url` 填成你没真正部署过的地址（扫出来是打不开的页），
以及把分发页暴露到公网（它没有鉴权，只是给同一个 WiFi 下的设备用的）。
