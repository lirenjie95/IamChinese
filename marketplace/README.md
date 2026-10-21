# 上架两个市场

仓库里已经放好了两家市场要的东西，剩下的动作需要在你自己的账号下完成（提 PR、建 release、
发 npm），我这边只能准备文件、跑校验。

## 一、Awesome DSH Plugin（dsh 插件目录）

这是 dsh 生态的插件目录，也是 dsh-market 这类市场的上游数据源。收录规则（[contributing.md]
(https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md)）是
**一个插件一个 YAML 文件**，README 由他们的脚本生成，不许手改。

1. `marketplace/lirenjie95__IamChinese--plugin.yml` 就是全部投稿内容，原样复制到对方仓库的
   `data/plugins/lirenjie95__IamChinese--plugin.yml`。
2. 给对方仓库提一个 PR，只加这一个文件。
3. PR 前确认三件事：
   - `plugin/package.json` 里有 `dsh.bundle.patch` —— 有（CI 第一道就查这个，只有 `dsh.client`
     会被拒）。
   - 仓库创建满 1 天 —— CI 自动查。刚建好就提会被拦，隔天再提即可。
   - 仓库打了 `dsh-plugin` topic —— 见下面 gh 命令。

```powershell
# 给仓库打 topic（CI 之外，维护者也会看）
gh repo edit lirenjie95/IamChinese --add-topic dsh-plugin --add-topic claude-code-plugin
```

他们推荐把包发到 npm 或挂一个 GitHub Release 的 `.tgz`，这样市场里给的是一行安装命令而不是
源码构建。我们挂了 Release（见第三节），要让它生效就在 YAML 里补一行（`latest/download/`
只在请求时解析 `latest`，文件名带版本号会随下次发版烂掉，所以要钉住 tag）：

```yaml
tarball: https://github.com/lirenjie95/IamChinese/releases/download/v0.1.0/dsh-cn-persona-0.1.0.tgz
```

一个 PR 最多 3 条，描述必须与代码对得上（「五个工具、六项校验」就是他们核对的数字）。

## 二、Claude Code 插件市场

仓库根有 `.claude-plugin/marketplace.json`，所以这个仓库本身就是一个市场：

```text
/plugin marketplace add lirenjie95/IamChinese
/plugin install cn-persona@iamchinese
```

插件本体在 `plugin/`，清单在 `plugin/.claude-plugin/plugin.json`，skills 在
`plugin/skills/cn-persona/`，slash 命令在 `plugin/commands/`，SessionStart hook 在
`plugin/hooks/hooks.json`。不装市场也能单独用：`plugin/` 目录本身就是插件目录。

本地校验（需要本机有 `claude` 命令，这台机器上没有，装好再跑）：

```powershell
claude plugin validate .
```

## 三、GitHub Release（两边的分发件）

`npm run dist` 产出的东西直接当 release 资产：

```powershell
cd plugin
npm run dist
cd ..
gh release create v0.1.0 `
  plugin/dist/dsh-cn-persona-0.1.0.tgz `
  plugin/dist/cn-persona-claude.zip `
  plugin/dist/install.ps1 `
  plugin/dist/install.sh `
  --title "v0.1.0" --notes-file marketplace/release-notes.md
```

## 已知的坑

- 别在 yml 里手写 `npm:` 字段 —— 会被校验拒绝，npm 映射由他们从 registry 自动采集。
- 描述里有 `: `（冒号加空格）必须加引号，否则 YAML 当成嵌套键。我们这份已经加了。
- 截图想控制顺序就放 `plugin/screenshots.json`（1–8 张，相对路径不许出插件目录）；不声明也
  可以，市场会从 README 里抽图。
