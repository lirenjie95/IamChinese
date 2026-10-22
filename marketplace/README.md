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
   - `plugins/iamchinese/package.json` 里有 `dsh.bundle.patch` —— 有（CI 第一道就查这个，只有 `dsh.client`
     会被拒）。
   - 仓库创建满 1 天 —— CI 自动查。刚建好就提会被拦，隔天再提即可。
   - 仓库打了 `dsh-plugin` topic —— 见下面 gh 命令。

```powershell
# 给仓库打 topic（CI 之外，维护者也会看）
gh repo edit lirenjie95/IamChinese --add-topic dsh-plugin --add-topic claude-code-plugin
```

他们推荐把包发到 npm 或挂一个 GitHub Release 的 `.tgz`，这样市场里给的是一行安装命令而不是
源码构建。v0.2.0 的 Release 已经建好（见第三节），条目里的 `tarball:` 就指向它——钉住 tag，
不用 `latest/download/`，因为后者只解析 `latest`、文件名却照字面取，下次发版就 404。

一个 PR 最多 3 条，描述必须与代码对得上（「五个工具、六项校验」就是他们核对的数字）。

## 二、Claude Code 插件市场

仓库根有 `.claude-plugin/marketplace.json`，所以这个仓库本身就是一个市场：

```text
/plugin marketplace add lirenjie95/IamChinese
/plugin install iamchinese@iamchinese
```

插件本体在 `plugins/iamchinese/`，清单在 `plugins/iamchinese/.claude-plugin/plugin.json`，skills 在
`plugins/iamchinese/skills/iamchinese/`，slash 命令在 `plugins/iamchinese/commands/`，SessionStart hook 在
`plugins/iamchinese/hooks/hooks.json`。不装市场也能单独用：`plugins/iamchinese/` 目录本身就是插件目录。

本地校验（需要本机有 `claude` 命令，这台机器上没有，装好再跑）：

```powershell
claude plugin validate .
```

官方目录不收 PR：`anthropics/claude-plugins-community` 是只读镜像，直接提的 PR 会被自动关掉，入口只有表单
<https://clau.de/plugin-directory-submission>（claude.ai 账号登录 → 自动安全扫描 → 人工审核 → 夜间同步）。
表单要填的每一项、以及安全扫描会问的三个问题，已经写好放在 [`claude-submission.md`](claude-submission.md)。

## 三、GitHub Release（两边的分发件）

`npm run dist` 产出的东西直接当 release 资产：

```powershell
cd plugins/iamchinese
npm run dist
cd ..
gh release create v0.2.0 `
  plugins/iamchinese/dist/iamchinese-0.2.0.tgz `
  plugins/iamchinese/dist/iamchinese-claude.zip `
  plugins/iamchinese/dist/install.ps1 `
  plugins/iamchinese/dist/install.sh `
  --title "v0.2.0" --notes-file marketplace/release-notes.md
```

## 四、npm（可选；国内网络下最容易卡的一步）

`plugins/iamchinese/package.json` 里 `publishConfig` 已经钉死官方源
（`registry: https://registry.npmjs.org/`、`access: public`），所以本机全局 registry 指向淘宝镜像也能发。
卡人的地方全在“拿登录态”：

1. **注册只能网页**：`registry.npmjs.org` 的 `/-/user/...` 接口不接受自助注册（实测 PUT 返回
   `401 username or password was invalid`），账号必须在 `www.npmjs.com/signup` 建。而该站对机房 IP
   一律返回 `403 cf-mitigated: challenge`，云主机节点会无限转圈——用家宽或手机热点。
2. **登录不必过网页**：`npm login --auth-type=legacy`（npm 11 支持）直接对 registry 做 CouchDB 认证，
   不碰 `www.npmjs.com` 的挑战页。
3. **本机死活过不去就交给 CI**：[`.github/workflows/npm-publish.yml`](../.github/workflows/npm-publish.yml)
   在推 `v*` tag 时发布，runner 走 registry API，没有挑战页。先在网页建一个 Granular Access Token
   （publish 权限 + bypass 2FA），存成仓库 secret `NPM_TOKEN`；没配 secret 时这条流水线只跑测试、跳过发布。

```powershell
npm publish --registry https://registry.npmjs.org/ --access public
```

发完之后不用改 `data/plugins/*.yml`——`npm:` 字段由市场从 registry 自动采集。

## 已知的坑

- 别在 yml 里手写 `npm:` 字段 —— 会被校验拒绝，npm 映射由他们从 registry 自动采集。
- 描述里有 `: `（冒号加空格）必须加引号，否则 YAML 当成嵌套键。我们这份已经加了。
- 截图想控制顺序就放 `plugins/iamchinese/screenshots.json`（1–8 张，相对路径不许出插件目录）；不声明也
  可以，市场会从 README 里抽图。
