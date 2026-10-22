/**
 * 二维码中心那张小图从哪来。
 *
 * 单独一个模块是为了让 `share-qr.mjs` 和 `share-server.mjs` 共用，又不制造循环 import
 * （share-qr 要用 share-server 的局域网地址，share-server 又要 logo）。
 *
 * 找的是「圆章」而不是带标题的方形 logo：方形图缩到 100px 上下时，底下那行中文会糊成
 * 一团黑边，贴在二维码中间反而更像个污点。
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { decodePng } from './qr.js'

const HERE = dirname(fileURLToPath(import.meta.url))

/** 圆章的候选位置：插件包内 → 仓库根 `assets/`。装成 npm 包后只有前者存在。 */
export const DEFAULT_LOGO_PATHS = [
  resolve(HERE, '..', '..', 'assets', 'logo-mark.png'),
  resolve(HERE, '..', '..', '..', '..', 'assets', 'logo-mark.png'),
]

/**
 * 读一张作为二维码中心的图；找不到就返回 null，调用方退回无 logo 的码。
 *
 * @param {string[]} [candidates] 自定义候选路径，按顺序取第一个存在的
 * @returns {Promise<{width: number, height: number, data: Buffer} | null>}
 */
export async function loadQrLogo(candidates = DEFAULT_LOGO_PATHS) {
  for (const path of candidates) {
    if (!existsSync(path)) continue
    return decodePng(await readFile(path))
  }
  return null
}
