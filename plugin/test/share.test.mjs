/**
 * 分发页的测试：起真服务、真发 HTTP 请求。
 *
 * 这些用例跑在 node 自带的 http 上，端口传 0 让系统分配，所以不会跟别的进程抢端口。
 * 二维码「能不能被扫出来」node 里验不了，那是 `scripts/verify-qr.py` 用 OpenCV 干的事；
 * 这里只确认 /qr.png 是一张合法的 PNG，且内容随 ?url= 变化。
 */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { landingPage, startShareServer } from '../scripts/share-server.mjs'

/** 建一个假 dist：文件名必须和 listFiles 的白名单对上。 */
async function fakeDist() {
  const dir = await mkdtemp(join(tmpdir(), 'cn-persona-share-'))
  await writeFile(join(dir, 'dsh-cn-persona-0.1.0.tgz'), Buffer.from('fake tgz'))
  await writeFile(join(dir, 'install.ps1'), 'Write-Host hi\n')
  await writeFile(join(dir, 'secret.txt'), '不该被发出去\n')
  return dir
}

test('页面里有二维码、有包、有三条边界', () => {
  const html = landingPage({
    baseUrl: 'http://192.0.2.10:8848/',
    files: [{ name: 'dsh-cn-persona-0.1.0.tgz', size: 26239 }],
  })
  assert.match(html, /<img src="\/qr\.png"/)
  assert.match(html, /http:\/\/192\.0\.2\.10:8848\//)
  assert.match(html, /dsh-cn-persona-0\.1\.0\.tgz/)
  assert.match(html, /26 KB/)
  assert.match(html, /实名认证/)
  assert.match(html, /RFC 5737/)
})

test('页面把文件名转义，不拼进 HTML', () => {
  const html = landingPage({ baseUrl: 'http://a/', files: [{ name: '<img onerror=alert(1)>.tgz', size: 1 }] })
  assert.doesNotMatch(html, /<img onerror/)
  assert.match(html, /&lt;img onerror/)
})

test('起服务：首页 200、包能下、qr.png 是 PNG、别的路径 404', async () => {
  const dir = await fakeDist()
  const started = await startShareServer({ port: 0, dir })
  try {
    const page = await fetch(started.baseUrl)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /cn-persona/)

    const file = await fetch(new URL('dsh-cn-persona-0.1.0.tgz', started.baseUrl))
    assert.equal(file.status, 200)
    assert.equal(await file.text(), 'fake tgz')

    const qr = await fetch(new URL('qr.png', started.baseUrl))
    assert.equal(qr.status, 200)
    const bytes = Buffer.from(await qr.arrayBuffer())
    assert.deepEqual([...bytes.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47])

    // 白名单外的东西一律不给
    assert.equal((await fetch(new URL('secret.txt', started.baseUrl))).status, 404)
    assert.equal((await fetch(new URL('../package.json', started.baseUrl))).status, 404)
  } finally {
    await started.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('qr.png 跟着 ?url= 变，不同地址出不同图', async () => {
  const dir = await fakeDist()
  const started = await startShareServer({ port: 0, dir })
  try {
    const one = Buffer.from(await (await fetch(new URL('qr.png?url=https://a.example/', started.baseUrl))).arrayBuffer())
    const two = Buffer.from(await (await fetch(new URL('qr.png?url=https://b.example/very/long/path', started.baseUrl))).arrayBuffer())
    assert.notDeepEqual(one, two)
  } finally {
    await started.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('目录里没有包时明确报错，而不是起一个空页面', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cn-persona-empty-'))
  await assert.rejects(() => startShareServer({ port: 0, dir }), /先跑 npm run dist/)
  await rm(dir, { recursive: true, force: true })
})
