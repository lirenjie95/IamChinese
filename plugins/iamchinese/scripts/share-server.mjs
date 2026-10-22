/**
 * 本机分发页：把 dist/ 里的安装包做成「扫码就能下」的页面。
 *
 * 场景很具体：你人在现场，朋友掏出手机，扫一下，页面上就有三步安装说明和
 * 两个包的直接下载链接。手机和电脑在同一个 WiFi 下就能用。
 *
 * 没有任何依赖：http 是 node 自带的，二维码是 scripts/lib/qr.js 自己编的，
 * 页面是一个模板字符串。想放到公网就整目录丢到任意静态托管，二维码里的
 * 地址换成你的域名即可——`--url` 参数就是干这个的。
 */
import { createServer } from 'node:http'
import { createReadStream, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'
import { networkInterfaces } from 'node:os'
import { extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { encode, toPng } from './lib/qr.js'
import { DEFAULT_LOGO_PATHS, loadQrLogo } from './lib/logo-asset.js'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const DEFAULT_DIR = resolve(HERE, '..', 'dist')
const DEFAULT_PORT = 8848

/** 版本号从 package.json 现读：页面文案与白名单都跟着走，发版时不用再改这里。 */
const { version: VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const TARBALL = `iamchinese-${VERSION}.tgz`

const CONTENT_TYPES = {
  '.tgz': 'application/gzip',
  '.zip': 'application/zip',
  '.ps1': 'text/plain; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.html': 'text/html; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

/** 局域网里手机能访问到的 IPv4 地址（跳过回环和虚拟网卡）。 */
export function lanAddresses() {
  const found = []
  for (const [name, entries] of Object.entries(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue
      if (/^169\.254\./.test(entry.address)) continue
      found.push({ name, address: entry.address })
    }
  }
  return found
}

const escapeHtml = value =>
  String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char])

/** 分发页本体。二维码单独走 /qr.png，所以这里只引用它。 */
export function landingPage({ baseUrl, files, brand = { logo: null, icon: null } }) {
  const items = files
    .map(
      file => `<li>
        <a class="file" href="/${encodeURIComponent(file.name)}" download>
          <span class="name">${escapeHtml(file.name)}</span>
          <span class="size">${(file.size / 1024).toFixed(0)} KB</span>
        </a>
      </li>`,
    )
    .join('\n')

  // 没打包进 logo 时页面照样能用，只是头图位置空着
  const mark = brand.logo ? '<img class="mark" src="/logo.png" alt="iamchinese" width="76" height="76">' : ''
  const icon = brand.icon ? '<link rel="icon" href="/favicon.ico">' : ''

  return `<!doctype html>
<html lang="zh-CN">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>iamchinese · 装到自己的机器上</title>
${icon}
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px 56px; background: #12100e; color: #f2ece4;
    font: 16px/1.7 "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
    max-width: 720px; margin-inline: auto;
  }
  header { display: flex; gap: 16px; align-items: center; margin: 0 0 14px; }
  .mark { border-radius: 50%; flex: 0 0 auto; }
  h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: .5px; }
  h2 { font-size: 17px; margin: 34px 0 10px; color: #ffd9a0; }
  p.lead { color: #b9ada0; margin: 0 0 22px; }
  .card { background: #1b1815; border: 1px solid #2e2823; border-radius: 12px; padding: 16px 18px; }
  .qr { display: flex; gap: 18px; align-items: center; flex-wrap: wrap; }
  .qr img { width: 168px; height: 168px; image-rendering: pixelated; background: #fff; padding: 8px; border-radius: 8px; }
  .qr .url { font-family: ui-monospace, Consolas, monospace; font-size: 14px; color: #9fe6b8; word-break: break-all; }
  ol { padding-left: 20px; }
  li { margin: 6px 0; }
  ul.files { list-style: none; padding: 0; margin: 0; }
  ul.files li { margin: 0 0 8px; }
  a.file { display: flex; justify-content: space-between; gap: 12px; text-decoration: none;
    color: #f2ece4; background: #1b1815; border: 1px solid #2e2823; border-radius: 10px; padding: 11px 14px; }
  a.file:hover { border-color: #c9a06a; }
  .size { color: #8d8377; font-variant-numeric: tabular-nums; }
  pre { background: #0d0b0a; border: 1px solid #2e2823; border-radius: 10px; padding: 12px 14px;
    overflow-x: auto; font-size: 13.5px; }
  code { font-family: ui-monospace, Consolas, monospace; }
  .warn { border-left: 3px solid #c9603a; padding-left: 12px; color: #d9c9bd; }
  footer { margin-top: 40px; color: #7d7469; font-size: 13px; }
</style>
<header>
  ${mark}
  <div>
    <h1>iamchinese</h1>
    <div style="color:#8d8377;font-size:13px">我爱国无罪 · IamChinese</div>
  </div>
</header>
<p class="lead">把开发/测试机配成「中国用户」口径的一套小工具：自洽的人设、落地清单、可发给别人的分享包。</p>

<div class="card qr">
  <img src="/qr.png" alt="二维码：打开本页">
  <div>
    <div style="color:#b9ada0;font-size:14px">手机扫这个，电脑就能从这个地址取包：</div>
    <div class="url">${escapeHtml(baseUrl)}</div>
    <div style="color:#8d8377;font-size:13px;margin-top:8px">手机和电脑要在同一个 WiFi 下。</div>
  </div>
</div>

<h2>装（三步）</h2>
<ol>
  <li>把 <code>${TARBALL}</code> 和 <code>install.ps1</code> 下到同一个文件夹。</li>
  <li>在那个文件夹里开 PowerShell：<pre><code>powershell -ExecutionPolicy Bypass -File install.ps1</code></pre></li>
  <li>重启 DeepSeek Harness。会话里会多出 <code>iamchinese</code> 这五个工具和一条 <code>iamchinese</code> 技能；命令行里 <code>iamchinese persona</code> 也能直接用。</li>
</ol>
<p>macOS / Linux 把最后一步换成 <code>sh install.sh</code>。用 Claude Code 就装 <code>iamchinese-claude.zip</code> 解出来的目录。</p>

<h2>文件</h2>
<ul class="files">
${items}
</ul>

<h2>三条边界</h2>
<p class="warn">身份证号、手机号都是按规则拼出来的<strong>样例</strong>，不能拿去注册账号、实名认证、过 KYC——那是伪造证件，跟配环境不是一回事。<br>
出口 IP 这个包管不了：人设里的地址故意落在 RFC 5737 文档段，要让站点看到中国出口，只能是真实线路。<br>
只在自己的测试环境用，不改别人的设备，不动真实身份的账号资料。</p>

<footer>iamchinese ${VERSION} · MIT · 本页由 <code>node scripts/share-server.mjs</code> 在本机临时起，关掉进程就没了。</footer>
</html>`
}

/** 目录里能让人下的文件：白名单 + 目录里现成的 *.tgz / *.zip，按名字排序。 */
async function listFiles(dir) {
  const names = [TARBALL, 'iamchinese-claude.zip', 'install.ps1', 'install.sh', '发给朋友.md']
  const files = []
  const seen = new Set()
  const add = async name => {
    if (seen.has(name)) return
    try {
      const info = await stat(join(dir, name))
      if (info.isFile()) {
        files.push({ name, size: info.size })
        seen.add(name)
      }
    } catch {
      // 没打的那个包就不列，页面照常能用。
    }
  }

  for (const name of names) await add(name)

  // Claude 侧只带 zip、没有 dist/：让它也能直接发别人放进目录里的包
  try {
    for (const entry of await readdir(dir)) {
      if (/\.(tgz|zip)$/i.test(entry)) await add(entry)
    }
  } catch {
    // 目录读不了就算了，白名单命中多少算多少
  }

  return files.sort((one, two) => one.name.localeCompare(two.name))
}

/**
 * 二维码中心的小圆章：优先投放目录里的 logo-mark.png，其次插件包的 assets/。
 * 找不到就返回 null，页面上的码退回无 logo 版本。
 */
async function findQrLogo(dir) {
  return loadQrLogo([join(dir, 'logo-mark.png'), ...DEFAULT_LOGO_PATHS])
}

/** 默认发哪个目录：有 dist/ 就发 dist/，没有就把插件目录本身当成投放点。 */
async function resolveDefaultDir() {
  try {
    const info = await stat(DEFAULT_DIR)
    if (info.isDirectory()) return DEFAULT_DIR
  } catch {
    // 没打过包，退到插件根目录
  }
  return resolve(HERE, '..')
}

/** 头图与站点图标：先在投放目录里找，再退到仓库根的 assets/（装成插件时那层可能不存在）。 */
function findBrand(dir) {
  const roots = [dir, resolve(HERE, '..', '..', '..', 'assets'), resolve(HERE, '..', 'assets')]
  const pick = name => {
    for (const root of roots) {
      const candidate = join(root, name)
      if (existsSync(candidate)) return candidate
    }
    return null
  }
  return { logo: pick('logo.png'), icon: pick('favicon.ico') }
}

/**
 * 起服务。返回的 close() 会等所有连接结束。
 *
 * @param {{port?: number, dir?: string, baseUrl?: string, host?: string}} options
 */
export async function startShareServer(options = {}) {
  const port = options.port ?? DEFAULT_PORT
  const dir = resolve(options.dir ?? (await resolveDefaultDir()))
  const host = options.host ?? '0.0.0.0'
  const addresses = lanAddresses()
  const autoBase = `http://${addresses[0]?.address ?? '127.0.0.1'}:${port}/`
  const baseUrl = options.baseUrl ?? autoBase
  const files = await listFiles(dir)
  const brand = findBrand(dir)
  const qrLogo = await findQrLogo(dir)

  if (files.length === 0) {
    throw new Error(`${dir} 里没有可发的文件：先跑 npm run dist，或用 --dir 指向放包的那个目录`)
  }

  const serveFile = (res, path, name) => {
    res.writeHead(200, {
      'Content-Type': CONTENT_TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    })
    createReadStream(path).pipe(res)
  }

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const path = decodeURIComponent(url.pathname)

    if (path === '/' || path === '/index.html') {
      const html = landingPage({ baseUrl, files, brand })
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(html)
      return
    }

    // 头图与站点图标：直接从磁盘读，不进下载白名单
    if (path === '/logo.png' || path === '/favicon.ico') {
      const target = path === '/logo.png' ? brand.logo : brand.icon
      if (target) {
        res.writeHead(200, {
          'Content-Type': path === '/logo.png' ? 'image/png' : 'image/x-icon',
          'Cache-Control': 'no-cache',
        })
        createReadStream(target).pipe(res)
        return
      }
    }

    if (path === '/qr.png') {
      const target = url.searchParams.get('url') ?? baseUrl
      const qr = encode(target, { ecc: qrLogo ? 'H' : 'Q' })
      const png = toPng(qr, { scale: 10, quiet: 4, logo: qrLogo })
      res.writeHead(200, {
        'Content-Type': 'image/png',
        'Content-Length': png.length,
        'Cache-Control': 'no-store',
      })
      res.end(png)
      return
    }

    // 只发白名单里的文件，别把 dist 变成目录遍历入口
    const name = path.replace(/^\/+/, '')
    if (files.some(file => file.name === name)) {
      serveFile(res, join(dir, name), name)
      return
    }

    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('没有这个文件\n')
  })

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(port, host, resolvePromise)
  })

  const actualPort = server.address().port
  return {
    server,
    port: actualPort,
    baseUrl: baseUrl.replace(`:${port}/`, `:${actualPort}/`),
    files,
    addresses,
    close: () => new Promise(resolvePromise => server.close(resolvePromise)),
  }
}

/** `node scripts/share-server.mjs [--port N] [--dir PATH] [--url URL]` */
async function main(argv) {
  const option = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 ? argv[at + 1] : fallback
  }

  const started = await startShareServer({
    port: Number(option('port', DEFAULT_PORT)),
    dir: option('dir', DEFAULT_DIR),
    baseUrl: option('url', undefined),
    host: option('host', '0.0.0.0'),
  })

  console.log(`分发页：${started.baseUrl}`)
  for (const { name, address } of started.addresses) {
    console.log(`  局域网（${name}）：http://${address}:${started.port}/`)
  }
  console.log(`二维码：${started.baseUrl}qr.png`)
  console.log(`文件：${started.files.map(file => file.name).join('、')}`)
  console.log('Ctrl+C 结束。')

  const shutdown = async () => {
    await started.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2))
}
