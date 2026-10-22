/**
 * 二维码编码器：字节模式，版本 1–6，纠错等级 M / Q，纯 stdlib。
 *
 * 为什么自己写：这个包里一个依赖都没有，`npm install qrcode` 会把「克隆下来就能跑」
 * 变成「先联网就能跑」。二维码本身是公开规范（ISO/IEC 18004），固定 1–6 版之后
 * 只剩查表和 GF(256) 的 RS 编码，两百多行能写完。
 *
 * 只做到 6 版是有意的：7 版起要额外写版本信息块，而一个 URL 在 Q 级下 6 版已经
 * 能放 74 字节，够用了。超长就是明确报错，不偷偷降级。
 *
 * 正确性由 `test/qr.test.mjs` 保证，真正能不能扫出来由 `scripts/verify-qr.py`
 * 用 OpenCV 的真解码器验（见 README）。
 */
import { deflateSync } from 'node:zlib'

const MAX_VERSION = 6

/** 各版本在 M / Q 下能放的「字节数」（不是码字数）。 */
const BYTE_CAPACITY = {
  M: [0, 14, 26, 42, 62, 84, 106],
  Q: [0, 11, 20, 32, 46, 60, 74],
}

/** 版本 → 总码字数。 */
const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172]

/** 版本 → 每块纠错码字数。 */
const ECC_PER_BLOCK = {
  M: [0, 10, 16, 26, 18, 24, 16],
  Q: [0, 13, 22, 18, 26, 18, 24],
}

/** 版本 → 分块方式：[块数, 每块数据码字数] 的正数对。 */
const BLOCKS = {
  M: [null, [1, 16], [1, 28], [1, 44], [2, 32], [2, 43], [4, 27]],
  Q: [null, [1, 13], [1, 22], [2, 17], [2, 24], [2, 15, 2, 16], [4, 19]],
}

/** 版本 → 对齐图案的圆心坐标（1 版没有）。 */
const ALIGNMENT = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34]]

/** 版本 → 码字之后还要补的 0 位（1 版是 0，2–6 版都是 7）。 */
const REMAINDER_BITS = [0, 0, 7, 7, 7, 7, 7]

const ECC_FORMAT_BITS = { L: 1, M: 0, Q: 3, H: 2 }

/* ─────────────────────────── GF(256) 与 RS ─────────────────────────── */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)

;(() => {
  let x = 1
  for (let i = 0; i < 255; i++) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]
})()

const gfMul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]])

/** 生成多项式 ∏(x - α^i)，返回值是降幂系数，最高次项固定为 1。 */
function generatorPoly(degree) {
  let poly = [1]
  for (let i = 0; i < degree; i++) {
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], EXP[i])
    }
    poly = next
  }
  return poly
}

/** 一个数据块算出的纠错码字。 */
function ecCodewords(data, count) {
  const gen = generatorPoly(count)
  const remainder = new Array(count).fill(0)
  for (const byte of data) {
    const factor = byte ^ remainder[0]
    remainder.shift()
    remainder.push(0)
    for (let i = 0; i < count; i++) remainder[i] ^= gfMul(gen[i + 1], factor)
  }
  return remainder
}

/* ─────────────────────────── 码字层 ─────────────────────────── */

function pickVersion(byteLength, ecc) {
  for (let version = 1; version <= MAX_VERSION; version++) {
    if (BYTE_CAPACITY[ecc][version] >= byteLength) return version
  }
  throw new Error(
    `内容太长：${byteLength} 字节，${ecc} 级在 ${MAX_VERSION} 版内最多 ${BYTE_CAPACITY[ecc][MAX_VERSION]} 字节`,
  )
}

/** 数据码字：模式 + 长度 + 有效载荷 + 终止符 + 补位。 */
function dataCodewords(bytes, version, dataCodewordCount) {
  const bits = []
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1)
  }
  push(0b0100, 4) // 字节模式
  push(bytes.length, 8) // 1–9 版字节模式的长度字段是 8 位
  for (const byte of bytes) push(byte, 8)

  const capacityBits = dataCodewordCount * 8
  for (let i = 0; i < 4 && bits.length < capacityBits; i++) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const codewords = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j]
    codewords.push(byte)
  }
  for (let pad = 0; codewords.length < dataCodewordCount; pad++) {
    codewords.push(pad % 2 === 0 ? 0xec : 0x11)
  }
  return codewords
}

/** 按块切分、各自算 RS、再按规范交错。 */
function interleave(data, version, ecc) {
  const [count, size] = BLOCKS[ecc][version]
  const blockSizes = []
  for (let i = 0; i < count; i++) blockSizes.push(size)
  // 末尾可能还有一组每块多一个码字的块（如 Q 级 5 版）
  for (let i = 2; i < BLOCKS[ecc][version].length; i += 2) {
    for (let j = 0; j < BLOCKS[ecc][version][i]; j++) blockSizes.push(BLOCKS[ecc][version][i + 1])
  }

  const blocks = []
  let at = 0
  for (const blockSize of blockSizes) {
    blocks.push(data.slice(at, at + blockSize))
    at += blockSize
  }
  const ecPerBlock = ECC_PER_BLOCK[ecc][version]
  const ecBlocks = blocks.map(block => ecCodewords(block, ecPerBlock))

  const out = []
  const longest = Math.max(...blocks.map(block => block.length))
  for (let i = 0; i < longest; i++) {
    for (const block of blocks) if (i < block.length) out.push(block[i])
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (const block of ecBlocks) out.push(block[i])
  }
  return out
}

/* ─────────────────────────── 矩阵层 ─────────────────────────── */

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x, y) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

function formatBits(ecc, mask) {
  const data = (ECC_FORMAT_BITS[ecc] << 3) | mask
  let remainder = data << 10
  for (let i = 14; i >= 10; i--) {
    if ((remainder >>> i) & 1) remainder ^= 0x537 << (i - 10)
  }
  return ((data << 10) | remainder) ^ 0x5412
}

function buildMatrix(version, ecc, mask, codewords) {
  const size = 17 + 4 * version
  const modules = Array.from({ length: size }, () => new Array(size).fill(null))
  const set = (x, y, dark) => {
    modules[y][x] = dark
  }

  // 三个定位图案（含 1 像素白边）
  const finder = (originX, originY) => {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const x = originX + dx
        const y = originY + dy
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        // 环距 3 是外圈黑框，环距 1 以内是中间 3×3 黑块，环距 2 是中间的白圈，
        // 环距 4 是那圈 1 像素白边——白边必须是白的，否则整张码扫不出来。
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
        set(x, y, ring === 3 || ring <= 1)
      }
    }
  }
  finder(0, 0)
  finder(size - 7, 0)
  finder(0, size - 7)

  // 定时图案
  for (let i = 8; i < size - 8; i++) {
    set(i, 6, i % 2 === 0)
    set(6, i, i % 2 === 0)
  }

  // 对齐图案
  const centers = ALIGNMENT[version]
  for (const cy of centers) {
    for (const cx of centers) {
      const nearFinder =
        (cx === 6 && cy === 6) ||
        (cx === 6 && cy === size - 7) ||
        (cx === size - 7 && cy === 6)
      if (nearFinder) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const ring = Math.max(Math.abs(dx), Math.abs(dy))
          set(cx + dx, cy + dy, ring !== 1)
        }
      }
    }
  }

  // 预留格式信息区域（先占位，最后写）
  const reserveFormat = () => {
    for (let i = 0; i <= 8; i++) {
      if (modules[8][i] === null) set(i, 8, false)
      if (modules[i][8] === null) set(8, i, false)
    }
    for (let i = 0; i < 8; i++) {
      if (modules[8][size - 1 - i] === null) set(size - 1 - i, 8, false)
      if (modules[size - 1 - i][8] === null) set(8, size - 1 - i, false)
    }
    set(8, size - 8, true) // 固定黑点
  }
  reserveFormat()
  // 上面 reserveFormat 之后才放数据，因此记下「功能性模块」的坐标
  const reserved = modules.map(row => row.map(value => value !== null))

  // 数据位按之字形填
  const bits = []
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i--) bits.push((codeword >>> i) & 1)
  }
  for (let i = 0; i < REMAINDER_BITS[version]; i++) bits.push(0)

  const maskFn = MASKS[mask]
  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (reserved[y][x]) continue
        const bit = bitIndex < bits.length ? bits[bitIndex] === 1 : false
        bitIndex++
        set(x, y, maskFn(x, y) ? !bit : bit)
      }
    }
  }

  // 写格式信息（两处）
  const format = formatBits(ecc, mask)
  const bitOf = index => ((format >>> index) & 1) === 1
  for (let i = 0; i <= 5; i++) set(8, i, bitOf(i))
  set(8, 7, bitOf(6))
  set(8, 8, bitOf(7))
  set(7, 8, bitOf(8))
  for (let i = 9; i < 15; i++) set(14 - i, 8, bitOf(i))
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bitOf(i))
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bitOf(i))
  set(8, size - 8, true)

  return modules
}

/** 四个罚分规则里最少的那个掩码就是它选的。 */
function penalty(modules) {
  const size = modules.length
  let score = 0

  const runs = lines => {
    for (const line of lines) {
      let run = 1
      for (let i = 1; i < line.length; i++) {
        if (line[i] === line[i - 1]) {
          run++
          if (run === 5) score += 3
          else if (run > 5) score += 1
        } else run = 1
      }
    }
  }
  const rows = modules.map(row => row.map(Boolean))
  const columns = Array.from({ length: size }, (_, x) => modules.map(row => Boolean(row[x])))
  runs(rows)
  runs(columns)

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x]
      if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) {
        score += 3
      }
    }
  }

  const pattern = [true, false, true, true, true, false, true, false, false, false, false]
  const reversed = [...pattern].reverse()
  const matches = line => {
    for (let i = 0; i + pattern.length <= line.length; i++) {
      const window = line.slice(i, i + pattern.length)
      if (window.every((value, at) => value === pattern[at])) score += 40
      if (window.every((value, at) => value === reversed[at])) score += 40
    }
  }
  matches(rows)
  matches(columns)

  const dark = modules.reduce((sum, row) => sum + row.filter(Boolean).length, 0)
  const ratio = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(ratio - 50) / 5) * 10

  return score
}

/* ─────────────────────────── 对外接口 ─────────────────────────── */

/**
 * 把文本编成二维码模块矩阵（true = 深色）。
 *
 * @param {string} text 任意 UTF-8 文本
 * @param {{ecc?: 'M'|'Q', version?: number}} options
 * @returns {{ size: number, version: number, ecc: string, mask: number, modules: boolean[][] }}
 */
export function encode(text, options = {}) {
  if (typeof text !== 'string') throw new TypeError('encode 只接受字符串')
  if (text.length === 0) throw new Error('内容为空')

  const ecc = options.ecc ?? 'Q'
  if (!(ecc in BYTE_CAPACITY)) throw new Error(`不支持的纠错等级：${ecc}`)

  const bytes = [...Buffer.from(text, 'utf8')]
  const version = options.version ?? pickVersion(bytes.length, ecc)
  if (!Number.isInteger(version) || version < 1 || version > MAX_VERSION) {
    throw new Error(`版本必须是 1–${MAX_VERSION} 的整数`)
  }
  if (bytes.length > BYTE_CAPACITY[ecc][version]) {
    throw new Error(`${ecc} 级 ${version} 版放不下 ${bytes.length} 字节`)
  }

  const dataCount = TOTAL_CODEWORDS[version] - ECC_PER_BLOCK[ecc][version] *
    BLOCKS[ecc][version].reduce((sum, value, at) => sum + (at % 2 === 0 ? value : 0), 0)
  const codewords = interleave(dataCodewords(bytes, version, dataCount), version, ecc)

  let best = null
  for (let mask = 0; mask < 8; mask++) {
    const modules = buildMatrix(version, ecc, mask, codewords)
    const score = penalty(modules)
    if (!best || score < best.score) best = { modules, mask, score }
  }

  return {
    size: best.modules.length,
    version,
    ecc,
    mask: best.mask,
    modules: best.modules,
  }
}

/* ─────────────────────────── 出图 ─────────────────────────── */

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let crc = -1
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * 生成 8 位灰度 PNG（零依赖：deflate 用 zlib，块结构自己拼）。
 *
 * @param {ReturnType<typeof encode>} qr
 * @param {{scale?: number, quiet?: number}} options scale=每个模块的像素，quiet=四周留白模块数
 */
export function toPng(qr, options = {}) {
  const scale = options.scale ?? 8
  const quiet = options.quiet ?? 4
  const dimension = qr.size + quiet * 2
  const pixels = dimension * scale

  const raw = Buffer.alloc(pixels * (pixels + 1))
  for (let y = 0; y < pixels; y++) {
    const rowStart = y * (pixels + 1)
    raw[rowStart] = 0 // 过滤器：None
    for (let x = 0; x < pixels; x++) {
      const moduleX = Math.floor(x / scale) - quiet
      const moduleY = Math.floor(y / scale) - quiet
      const inside = moduleX >= 0 && moduleY >= 0 && moduleX < qr.size && moduleY < qr.size
      const dark = inside && qr.modules[moduleY][moduleX]
      raw[rowStart + 1 + x] = dark ? 0 : 255
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(pixels, 0)
  ihdr.writeUInt32BE(pixels, 4)
  ihdr[8] = 8 // 位深
  ihdr[9] = 0 // 灰度
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** 文本形式的二维码，终端里也能看（深色用两个字符，扫不出但便于核对形状）。 */
export function toText(qr, { quiet = 1 } = {}) {
  const lines = []
  // 每个模块两个字符宽，所以留白也要按两倍补齐，否则边框比内容窄，看起来是歪的
  const border = ' '.repeat((qr.size + quiet * 2) * 2)
  for (let i = 0; i < quiet; i++) lines.push(border)
  for (const row of qr.modules) {
    let line = ' '.repeat(quiet * 2)
    for (const dark of row) line += dark ? '██' : '  '
    lines.push(line + ' '.repeat(quiet * 2))
  }
  for (let i = 0; i < quiet; i++) lines.push(border)
  return lines.join('\n')
}

export const QR_MAX_VERSION = MAX_VERSION
