/**
 * 分发页的测试：起真服务、真发 HTTP 请求。
 *
 * 这些用例跑在 node 自带的 http 上，端口传 0 让系统分配，所以不会跟别的进程抢端口。
 * 二维码「能不能被扫出来」node 里验不了，那是 `scripts/verify-qr.py` 用 OpenCV 干的事；
 * 这里只确认 /qr.png 是一张合法的 PNG，且内容随 ?url= 变化。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { landingPage, startShareServer } from '../scripts/share-server.mjs'

/** 包名里的版本号跟着 package.json 走，发版时不改测试。 */
const { version: VERSION } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const TARBALL = `iamchinese-${VERSION}.tgz`

/** 建一个假 dist：文件名必须和 listFiles 的白名单对上。 */
async function fakeDist() {
  const dir = await mkdtemp(join(tmpdir(), 'iamchinese-share-'))
  await writeFile(join(dir, TARBALL), Buffer.from('fake tgz'))
  await writeFile(join(dir, 'install.ps1'), 'Write-Host hi\n')
  await writeFile(join(dir, 'secret.txt'), '不该被发出去\n')
  return dir
}

test('页面里有二维码、有包、有三条边界', () => {
  const html = landingPage({
    baseUrl: 'http://192.0.2.10:8848/',
    files: [{ name: TARBALL, size: 26239 }],
  })
  assert.match(html, /<img src="\/qr\.png"/)
  assert.match(html, /http:\/\/192\.0\.2\.10:8848\//)
  assert.ok(html.includes(TARBALL), `页面里应有 ${TARBALL}`)
  assert.match(html, /26 KB/)
  assert.match(html, /实名认证/)
  assert.match(html, /RFC 5737/)
})

test('页面把文件名转义，不拼进 HTML', () => {
  const html = landingPage({ baseUrl: 'http://a/', files: [{ name: '<img onerror=alert(1)>.tgz', size: 1 }] })
  assert.doesNotMatch(html, /<img onerror/)
  assert.match(html, /&lt;img onerror/)
})

test('有 logo 时页面挂头图与站点图标，没有就不挂', () => {
  const files = [{ name: TARBALL, size: 1 }]
  const withBrand = landingPage({ baseUrl: 'http://a/', files, brand: { logo: '/x/logo.png', icon: '/x/favicon.ico' } })
  assert.match(withBrand, /<img class="mark" src="\/logo\.png"/)
  assert.match(withBrand, /<link rel="icon" href="\/favicon\.ico">/)
  assert.match(withBrand, /我爱国无罪/)

  const bare = landingPage({ baseUrl: 'http://a/', files })
  assert.doesNotMatch(bare, /class="mark"/)
  assert.doesNotMatch(bare, /rel="icon"/)
})

test('投放目录里的 logo.png / favicon.ico 能取到，且不进下载列表', async () => {
  const dir = await fakeDist()
  await writeFile(join(dir, 'logo.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  await writeFile(join(dir, 'favicon.ico'), Buffer.from([0, 0, 1, 0]))

  const started = await startShareServer({ port: 0, dir })
  try {
    const page = await fetch(started.baseUrl)
    assert.match(await page.text(), /class="mark"/)

    const logo = await fetch(new URL('logo.png', started.baseUrl))
    assert.equal(logo.status, 200)
    assert.equal(logo.headers.get('content-type'), 'image/png')

    const icon = await fetch(new URL('favicon.ico', started.baseUrl))
    assert.equal(icon.status, 200)

    // 头图不是发给别人的文件，不该出现在下载列表里
    assert.equal(started.files.some(file => file.name === 'logo.png'), false)
  } finally {
    await started.close()
    await rm(dir, { recursive: true, force: true })
  }
})

test('起服务：首页 200、包能下、qr.png 是 PNG、别的路径 404', async () => {
  const dir = await fakeDist()
  const started = await startShareServer({ port: 0, dir })
  try {
    const page = await fetch(started.baseUrl)
    assert.equal(page.status, 200)
    assert.match(await page.text(), /iamchinese/)

    const file = await fetch(new URL(TARBALL, started.baseUrl))
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
  const dir = await mkdtemp(join(tmpdir(), 'iamchinese-empty-'))
  await assert.rejects(() => startShareServer({ port: 0, dir }), /先跑 npm run dist/)
  await rm(dir, { recursive: true, force: true })
})
