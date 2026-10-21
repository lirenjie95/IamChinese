/**
 * 打「发给朋友」的包。
 *
 * 产出（都在 dist/ 下）：
 *   dsh-cn-persona-<ver>.tgz   DSH 插件包，`dsh plugin add` 吃这个
 *   cn-persona-claude.zip      Claude Code 插件包（同一份 CLI，技能走 bash 调）
 *   install.ps1 / install.sh   一条命令装进指定 profile，装完提示重启
 *   发给朋友.md                直接复制粘贴的话术 + 三条命令 + 边界
 *   qr.png                    指向仓库的二维码，发出去让人扫
 *   qr-lan.png                指向本机分发页的二维码，当面传包用
 *
 * 没有花活：npm pack 负责打 npm 包，装的动作交给 dsh 自己（`dsh plugin --profile <p> add`
 * 装完会按 dsh.bundle 自动把插件挂进 profile 的层栈）。Windows 上没有可靠的 tar，
 * zip 用 PowerShell 的 Compress-Archive 生成，失败就只留目录——目录本身就能用。
 * @module dsh-cn-persona/scripts/dist
 */

import { execFileSync, execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { REPO_URL, guessUrl, writeQr } from './share-qr.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const dist = join(root, 'dist')
const isWindows = process.platform === 'win32'

const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const tgzName = `${pkg.name}-${pkg.version}.tgz`
const zipName = 'cn-persona-claude.zip'

/** Claude 侧要带走的文件：CLI 全套 + 清单 + 技能 + 命令 + 分发脚本 + 说明。 */
const CLAUDE_PARTS = [
  '.claude-plugin',
  'skills',
  'commands',
  'hooks',
  'bin',
  'lib',
  'scripts',
  'cordis.patch.yml',
  'README.md',
  'LICENSE',
  'package.json',
]

const INSTALL_PS1 = `# 装 ${pkg.name}。用法：
#   powershell -ExecutionPolicy Bypass -File install.ps1
#   powershell -ExecutionPolicy Bypass -File install.ps1 -ProfileName headless
#   powershell -ExecutionPolicy Bypass -File install.ps1 -DryRun
param(
  [string]$ProfileName = 'web',
  [string]$Tarball = '',
  [switch]$DryRun
)
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $Tarball) { $Tarball = Join-Path $here '${tgzName}' }
if (-not (Test-Path -LiteralPath $Tarball)) { throw "找不到安装包：$Tarball" }

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  throw '没找到 dsh 命令。先装 DeepSeek Harness：npm i -g @deepseek-ai/dsh'
}

$dshArgs = @('plugin', '--profile', $ProfileName, 'add', $Tarball)
Write-Host "即将执行： dsh $($dshArgs -join ' ')"
if ($DryRun) { Write-Host '（-DryRun，没有真装）'; exit 0 }

& dsh @dshArgs
if ($LASTEXITCODE -ne 0) { throw "安装失败，退出码 $LASTEXITCODE" }

Write-Host ''
Write-Host "装好了。重启 DSH（profile: $ProfileName）之后："
Write-Host '  - 会话里多出 5 个 cn_persona* 工具和 /cn-persona 技能'
Write-Host '  - 命令行里 cn-persona persona 也能直接用'
Write-Host "卸载： dsh plugin --profile $ProfileName remove ${pkg.name}"
`

const INSTALL_SH = `#!/usr/bin/env sh
# 装 ${pkg.name}。用法：
#   sh install.sh            # 装进 web profile
#   sh install.sh headless   # 装进别的 profile
set -eu
PROFILE="\${1:-web}"
HERE=$(cd "$(dirname "$0")" && pwd)
TARBALL="\$HERE/${tgzName}"

[ -f "$TARBALL" ] || { echo "找不到安装包：$TARBALL" >&2; exit 1; }
command -v dsh >/dev/null 2>&1 || { echo "没找到 dsh。先 npm i -g @deepseek-ai/dsh" >&2; exit 1; }

echo "即将执行： dsh plugin --profile $PROFILE add $TARBALL"
dsh plugin --profile "$PROFILE" add "$TARBALL"
echo
echo "装好了。重启 DSH（profile: $PROFILE）之后会话里会多出 cn_persona* 工具与 /cn-persona 技能。"
echo "卸载： dsh plugin --profile $PROFILE remove ${pkg.name}"
`

const FRIEND_NOTE = `# 发给朋友：${pkg.name} ${pkg.version}

## 这是什么

一套把开发/测试环境配成「中国用户」口径的小工具：生成一份内部不打架的人设
（身份证区划对得上地址、手机号段对得上运营商和 ASN、locale 对得上时区），
打印落地清单，写档案文件，还能把这份人设打包给下一个人。

装上之后**不改你任何设置**，只是让 DSH / Claude 在会话里把你当成中国大陆用户：
说简体中文，时间按 Asia/Shanghai，日期写 2026-10-21，金额写 ¥ CNY，地址从省写到街道。
不碰系统 locale、不碰注册表、不碰浏览器语言，也不改任何工具的行为。
嫌它多余：DSH 侧设 \`CN_PERSONA_NO_PROMPT=1\`，或者把插件删掉。

## 装（三步）

1. 把 \`${tgzName}\` 和 \`install.ps1\` 放到同一个文件夹
2. 在该文件夹打开 PowerShell，执行：

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File install.ps1
\`\`\`

3. 重启 DSH。会话里就有 \`cn_persona\` 这几个工具；命令行里 \`cn-persona persona\` 也能直接用。

macOS / Linux 用 \`sh install.sh\`，效果一样。

## Claude Code 的话

装 \`${zipName}\` 解出来的目录（\`claude plugin add <那个目录>\`）。里面已经带了
\`commands/\`（\`/cn-persona:persona\`、\`/cn-persona:apply\`、\`/cn-persona:share\`）、
\`hooks/\`（会话开始就把「这位用户在中国大陆」告诉模型）和 \`scripts/\`，
所以扫码、导出分享包在 Claude 那边一样能用，不用另装东西。

## 更省事的发法：让对面扫码

\`qr.png\` 指向仓库 ${REPO_URL} —— 扫码进仓库，照 README 装，不用你再传文件。
码是包里的编码器现画的（\`scripts/lib/qr.js\`，零依赖），不是哪个网站生成的。

想当面把包递过去（同一个 WiFi，不走公网）：

\`\`\`bash
npm run share          # 起本机分发页，默认 8848 端口
\`\`\`

终端会打印一个局域网地址，页面上有同样的三步说明和两个包的直接下载链接，
旁边那张码（\`qr-lan.png\`，或页面上的码）指向这台机器的地址。手机和电脑同一个 WiFi 即可，
不经过任何第三方服务器。

## 用

\`\`\`
cn-persona persona          # 看一份人设
cn-persona apply            # 写成 cn-profile.json + env.sh + env.ps1
cn-persona verify           # 自检：六项人设自洽 + 当前环境差哪几项
cn-persona plan             # 要真改机器时照这个清单来
cn-persona share            # 导一份能发给别人的分享包
\`\`\`

## 三条边界（别当耳旁风）

1. 身份证号、手机号都是按规则拼出来的样例，**不能**拿去注册账号、实名认证、过 KYC。
   那是伪造证件，跟配环境不是一回事。
2. 出口 IP 这个包管不了。人设里的地址落在 RFC 5737 文档段，故意选的，撞不到真人；
   要让站点看到中国出口，只能是真实线路。
3. 只在自己的测试环境用。不改别人的设备，不覆盖真实身份的账号资料。

## 不想要了

\`\`\`
dsh plugin --profile web remove ${pkg.name}
cn-persona undo        # 删掉 cn-profile.json / env.sh / env.ps1
\`\`\`
`

/**
 * 跑一条命令拿 stdout。
 * Windows 上 npm 是 .cmd，需要 shell；把整条命令拼成一个字符串传进去，避免
 * Node 报 DEP0190（args 数组 + shell 的组合）。
 */
function runNpm(args) {
  const line = `npm ${args.join(' ')}`
  if (isWindows) return execSync(line, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  return execFileSync('npm', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** 用 PowerShell 打 zip；拿不到就返回 false，调用方降级处理。 */
async function zipDirectory(sourceDir, zipPath) {
  const script = `Compress-Archive -LiteralPath '${sourceDir}' -DestinationPath '${zipPath}' -Force`
  try {
    execFileSync(
      isWindows ? 'powershell' : 'sh',
      isWindows ? ['-NoProfile', '-NonInteractive', '-Command', script] : ['-c', 'command -v zip >/dev/null && echo ok'],
      { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' },
    )
    await stat(zipPath)
    return true
  } catch {
    return false
  }
}

async function main() {
  await rm(dist, { recursive: true, force: true })
  await mkdir(dist, { recursive: true })

  // 1. DSH 插件包：npm pack 处理 files 白名单与忽略规则，别手搓 tar。
  const packed = runNpm(['pack', '--pack-destination', 'dist', '--silent']).trim().split(/\r?\n/).pop()
  process.stdout.write(`DSH 插件包：${packed}\n`)

  // 2. 安装脚本与话术。
  await writeFile(join(dist, 'install.ps1'), `\ufeff${INSTALL_PS1}`, 'utf8')
  await writeFile(join(dist, 'install.sh'), INSTALL_SH.replace(/\r\n/g, '\n'), 'utf8')
  await writeFile(join(dist, '发给朋友.md'), FRIEND_NOTE, 'utf8')

  // 3. Claude Code 侧：同一份 CLI，技能通过 bash 调；目录本身就能装，zip 只方便传输。
  const claudeDir = join(dist, 'claude-plugin')
  await mkdir(claudeDir, { recursive: true })
  for (const part of CLAUDE_PARTS) {
    await cp(join(root, part), join(claudeDir, part), { recursive: true })
  }
  const zipped = await zipDirectory(claudeDir, join(dist, zipName))

  // 4. 两张码：qr.png 指仓库（发出去的那张，换台机器也有效），
  //    qr-lan.png 指本机分发页（当面传包用）。
  const qr = await writeQr({ url: REPO_URL, out: join(dist, 'qr.png'), scale: 12 })
  const qrLan = await writeQr({ url: guessUrl(), out: join(dist, 'qr-lan.png'), scale: 10 })

  // 仓库里那张（README 引用它）单独落到 assets/，dist/ 整体不进版本库
  const assets = resolve(root, '..', 'assets')
  if (existsSync(assets)) {
    await writeQr({ url: REPO_URL, out: join(assets, 'qr-repo.png'), scale: 10 })
  }

  const files = [packed, 'install.ps1', 'install.sh', '发给朋友.md', zipped ? zipName : 'claude-plugin/', 'qr.png', 'qr-lan.png']
  process.stdout.write(`\n产物（${dist}）：\n${files.map(item => `  - ${item}`).join('\n')}\n`)
  if (!zipped) process.stdout.write('\n（没打成 zip，claude-plugin/ 目录可以直接装，不影响使用。）\n')
  process.stdout.write(`\nqr.png → ${qr.url}\nqr-lan.png → ${qrLan.url}\n`)
  process.stdout.write('现场分发：npm run share，让对面扫页面上的码或 dist/qr-lan.png。\n')
  process.stdout.write(`\n安装：powershell -ExecutionPolicy Bypass -File install.ps1\n`)
}

await main()
