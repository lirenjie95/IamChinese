- [x] I added **one file** at `data/plugins/<owner>__<repo>.yml` — that single file is the whole submission. The READMEs are regenerated on `main` after merge: don't edit them by hand, and you don't need to commit them either / 我新增了一个 `data/plugins/<owner>__<repo>.yml` 文件——**这一个文件就是全部投稿**。README 会在合并后由 `main` 自动重新生成：不要手工编辑，也不需要提交
- [x] My repo's `package.json` declares **`dsh.bundle`** (not just `dsh.client`) — [example](../blob/main/contributing.md) / 仓库 `package.json` 已声明 `dsh.bundle`（只有 `dsh.client` 无法安装）
- [x] My repo is at least **1 day old** / 仓库创建满 1 天
- [x] `category` is one of `agi ui usage theme model identity session memory tools wsl browser vision voice docs skill workflow git notify dev security remote market fun` ([full list with descriptions](../blob/main/contributing.md)), and themes/skins go under `theme` / `category` 取值正确（完整清单见 contributing.md），主题/皮肤类请用 `theme`
- [x] Description states what the plugin does, no superlatives / 描述只说功能，不带营销词
- [x] My repo has the `dsh-plugin` topic / 仓库已打 `dsh-plugin` topic

**Recommended (not required) / 推荐但不强制：**

- 📦 Publish to npm — npm installs are prebuilt and skip the `allowBuilds` approval, so users get a one-command install / 发布 npm 包：预构建产物免 `allowBuilds` 授权，用户一条命令装好
- 🔗 Declare official `@deepseek-ai/*` packages as `peerDependencies` (not `dependencies`) — avoids duplicate runtimes inside the profile / 官方 `@deepseek-ai/*` 包用 `peerDependencies` 声明（而非 `dependencies`），避免 profile 里出现重复运行时
- 🖼️ Screenshots go in **your own repository** now: a `screenshots.json` beside your `package.json`, listing image paths. Nothing to add here, and you can change them later without another pull request ([how](../blob/main/contributing.md#screenshots--截图optional-recommended--可选推荐)) / 截图现在放在**你自己的仓库**里：在 `package.json` 旁边放一个 `screenshots.json`，列出图片路径。这个 PR 里不用加任何东西，以后想换也不必再提 PR（[说明](../blob/main/contributing.md#screenshots--截图optional-recommended--可选推荐)）

---

The entry points at `plugins/iamchinese/`, the subdirectory that holds the `package.json` with `dsh.bundle`. The repository root is the Python side of the same tool and has no `package.json`.

What the plugin adds to a session: one system-prompt section describing the session's locale, timezone and formatting conventions (`zh-Hans-CN`, `Asia/Shanghai`, ISO dates, CNY), five tools (`iamchinese`, `iamchinese_plan`, `iamchinese_apply`, `iamchinese_check`, `iamchinese_share`) that generate and write a self-consistent mainland-China test persona, and one bundled skill. It reads no network, writes only the files it is asked for, and changes no system settings.

`package.json` has no runtime dependencies — official `@deepseek-ai/*` packages are not imported, so there is nothing to declare as `peerDependencies`. Installing from git runs no build step: `cordis.patch.yml` declares the loader entry and `lib/` ships as plain ESM.

Also on npm as `iamchinese`. A prebuilt tarball is attached to the release under a version-free asset name, so the `tarball` field keeps resolving across releases.
