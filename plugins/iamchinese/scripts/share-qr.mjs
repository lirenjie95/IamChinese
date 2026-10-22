/**
 * 把任意地址画成二维码：`node scripts/share-qr.mjs --url <地址> --out qr.png`
 *
 * 用在两种场合：
 *   - 发出去的码要指向仓库（默认就是 `REPO_URL`），别人扫码照 README 装；
 *   - 当面传包时 `--lan` 指向本机 `npm run share` 起的那个页面。
 *
 * 换域名就 `--url https://你的域名/`，什么都不给就是仓库地址。
 */
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

import { encode, toPng, toText } from './lib/qr.js'
import { DEFAULT_LOGO_PATHS, loadQrLogo } from './lib/logo-asset.js'
import { lanAddresses } from './share-server.mjs'

export const DEFAULT_SHARE_PORT = 8848

/** 仓库地址：分发的码默认指向这里，扫码进仓库照 README 装。 */
export const REPO_URL = 'https://github.com/lirenjie95/IamChinese'

/**
 * 找二维码中心那张图：优先插件自带的圆章，退到仓库根目录的 logo-mark.png。
 *
 * @param {string|false} [explicit] 给路径就用它；给 false 表示不要 logo
 */
export async function loadLogo(explicit) {
  if (explicit === false) return null
  return loadQrLogo(explicit ? [resolve(explicit)] : DEFAULT_LOGO_PATHS)
}

/** 局域网地址：本机分发页（`npm run share`）里第一个可用 IPv4 + 端口。 */
export function guessUrl(port = DEFAULT_SHARE_PORT) {
  const [first] = lanAddresses()
  return `http://${first?.address ?? '127.0.0.1'}:${port}/`
}

/**
 * 生成二维码文件。
 *
 * 不给 `url` 时指向 `REPO_URL`——发出去的那张码要落在别人能打开的地方，
 * 局域网地址换台机器就废了。当面传包才用 `--lan`。
 *
 * @param {{url?: string, out?: string, scale?: number, text?: boolean}} options
 * @returns {Promise<{ url: string, out: string, version: number, ecc: string, mask: number, size: number, text?: string }>}
 */
export async function writeQr(options = {}) {
  const url = options.url ?? REPO_URL
  const out = resolve(options.out ?? 'qr.png')
  const logo = options.logo === false ? null : await loadLogo(options.logo)
  const qr = encode(url, { ecc: logo ? 'H' : 'Q' })
  await writeFile(
    out,
    toPng(qr, { scale: options.scale ?? 10, quiet: 4, logo, logoRatio: options.logoRatio }),
  )
  return {
    url,
    out,
    version: qr.version,
    ecc: qr.ecc,
    mask: qr.mask,
    size: qr.size,
    hasLogo: Boolean(logo),
    text: options.text ? toText(qr) : undefined,
  }
}

async function main(argv) {
  const option = (name, fallback) => {
    const at = argv.indexOf(`--${name}`)
    return at >= 0 ? argv[at + 1] : fallback
  }

  const explicit = option('url', undefined)
  const result = await writeQr({
    url: explicit ?? (argv.includes('--lan') ? guessUrl(Number(option('port', DEFAULT_SHARE_PORT))) : undefined),
    out: option('out', 'qr.png'),
    scale: Number(option('scale', 10)),
    logo: argv.includes('--no-logo') ? false : option('logo', undefined),
    logoRatio: option('logo-ratio', undefined) ? Number(option('logo-ratio', undefined)) : undefined,
    text: argv.includes('--text'),
  })

  console.log(`地址：${result.url}`)
  console.log(`文件：${result.out}`)
  console.log(`规格：${result.ecc} 级 / ${result.version} 版 / 掩码 ${result.mask} / ${result.size}×${result.size} 模块 / 中心 ${result.hasLogo ? '有 logo' : '无 logo'}`)
  if (result.text) console.log(result.text)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main(process.argv.slice(2))
}
