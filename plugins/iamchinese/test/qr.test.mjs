/**
 * 二维码编码器的结构测试。
 *
 * 这里验的是「有没有按规范画」，不验「扫描器认不认」——后者 node 里没真解码器，
 * 由 `scripts/verify-qr.py` 用 OpenCV 验（12 条边界用例：6 版本 × M/Q，正好塞满容量）。
 * 分工的道理：结构错了必然扫不出，结构对了还需要真解码器背书。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { encode, QR_MAX_VERSION, toPng, toText } from '../scripts/lib/qr.js'

/** 读格式信息的两份拷贝（规范要求两份一致，这是最容易被写错的地方）。 */
function formatCopies(modules) {
  const size = modules.length
  const copy1 = []
  for (let i = 0; i <= 5; i++) copy1.push(modules[i][8])
  copy1.push(modules[7][8], modules[8][8], modules[8][7])
  for (let i = 9; i < 15; i++) copy1.push(modules[8][14 - i])

  const copy2 = []
  for (let i = 0; i < 8; i++) copy2.push(modules[8][size - 1 - i])
  for (let i = 8; i < 15; i++) copy2.push(modules[size - 15 + i][8])
  return { copy1, copy2 }
}

test('尺寸与版本对得上：size = 17 + 4 × version', () => {
  for (const version of [1, 2, 3, 6]) {
    const qr = encode('a', { version })
    assert.equal(qr.version, version)
    assert.equal(qr.size, 17 + 4 * version)
  }
})

test('内容变长会自动升版本，短内容落在 1–2 版', () => {
  const short = encode('a')
  const long = encode('https://example.com/' + 'p'.repeat(40)) // 60 字节，Q 级 5 版正好够
  assert.ok(short.version <= 2)
  assert.ok(long.version > short.version)
  assert.ok(long.version <= QR_MAX_VERSION)
})

test('三个定位图案按 7×7 环距画，外圈白边是白的', () => {
  const qr = encode('https://ex.com/', { version: 2 })
  const { modules, size } = qr
  const origins = [[0, 0], [size - 7, 0], [0, size - 7]]
  for (const [ox, oy] of origins) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3))
        assert.equal(modules[oy + dy][ox + dx], ring === 3 || ring <= 1, `定位图案 ${ox},${oy} 的 (${dx},${dy}) 画错了`)
      }
    }
  }
  // 定位图案外侧那一圈必须是白的，否则扫不出来
  assert.equal(modules[7][0], false)
  assert.equal(modules[0][7], false)
  assert.equal(modules[size - 8][0], false)
})

test('定时图案在第 6 行 / 第 6 列交替', () => {
  const { modules, size } = encode('https://ex.com/', { version: 4 })
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modules[6][i], i % 2 === 0)
    assert.equal(modules[i][6], i % 2 === 0)
  }
})

test('固定黑点在第 8 列、倒数第 8 行', () => {
  for (const version of [1, 3, 5]) {
    const { modules, size } = encode('a', { version })
    assert.equal(modules[size - 8][8], true)
  }
})

test('两份格式信息必须一致', () => {
  for (const ecc of ['M', 'Q']) {
    for (const version of [1, 4, 6]) {
      const qr = encode('a', { ecc, version })
      const { copy1, copy2 } = formatCopies(qr.modules)
      assert.deepEqual(copy1, copy2, `${ecc} v${version} 的两份格式信息不一致`)
    }
  }
})

test('同一输入完全可复现，不同输入不撞', () => {
  const one = encode('https://a.example/')
  const again = encode('https://a.example/')
  const other = encode('https://b.example/')
  assert.deepEqual(one.modules, again.modules)
  assert.notDeepEqual(one.modules, other.modules)
})

test('正好塞满能吃下，多一字节就明确报错', () => {
  const limit = 74 // Q 级 6 版
  assert.doesNotThrow(() => encode('x'.repeat(limit), { ecc: 'Q', version: 6 }))
  assert.throws(() => encode('x'.repeat(limit + 1), { ecc: 'Q', version: 6 }), /放不下/)
  assert.throws(() => encode('y'.repeat(200), { ecc: 'Q' }), /内容太长/)
})

test('版本越界、内容为空、非字符串都报错', () => {
  assert.throws(() => encode(''), /内容为空/)
  assert.throws(() => encode(42), TypeError)
  assert.throws(() => encode('abc', { version: 7 }), /版本/)
  assert.throws(() => encode('abc', { version: 0 }), /版本/)
  assert.throws(() => encode('abc', { ecc: 'H' }), /纠错等级/)
})

test('中文按 UTF-8 字节数算容量', () => {
  // 每个汉字 3 字节：Q 级 1 版 11 字节装不下 4 个汉字
  assert.throws(() => encode('一二三四', { ecc: 'Q', version: 1 }), /放不下/)
  const qr = encode('中国', { ecc: 'Q', version: 1 })
  assert.equal(qr.version, 1)
})

test('toPng 出的是合法 PNG，边长按模块数 × 缩放算', () => {
  const qr = encode('https://ex.com/', { version: 2 })
  const png = toPng(qr, { scale: 5, quiet: 4 })
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  assert.equal(png.toString('ascii', 12, 16), 'IHDR')
  const expected = (qr.size + 8) * 5
  assert.equal(png.readUInt32BE(16), expected)
  assert.equal(png.readUInt32BE(20), expected)
})

test('toText 的宽高与模块数一致', () => {
  const qr = encode('a', { version: 1 })
  const lines = toText(qr).split('\n')
  assert.equal(lines.length, qr.size + 2)
  assert.equal(lines[1].length, (qr.size + 2) * 2)
})
