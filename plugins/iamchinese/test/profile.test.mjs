import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import { buildPersona } from '../lib/core/persona.js'
import {
  ENV_PS1_NAME,
  ENV_SH_NAME,
  PROFILE_NAME,
  pathsFor,
  planText,
  readProfile,
  removeProfile,
  verifyText,
  writeProfile,
  writeShareBundle,
} from '../lib/core/profile.js'

async function tempDir(prefix = 'iamchinese-') {
  return mkdtemp(join(tmpdir(), prefix))
}

test('apply 写三个文件，profile 能读回', async () => {
  const dir = await tempDir()
  const persona = buildPersona(77)
  const written = await writeProfile(dir, persona)

  assert.equal(written.files.length, 3)
  const paths = pathsFor(dir)
  assert.deepEqual(written.files, [paths.profile, paths.envSh, paths.envPs1])

  const loaded = await readProfile(dir)
  assert.deepEqual(loaded.persona, persona)
  assert.equal(loaded.meta.schema, 1)
  assert.equal(loaded.meta.policy_version, 'iamchinese-0.2.0')
})

test('档案也接受直接给 json 路径', async () => {
  const dir = await tempDir()
  await writeProfile(dir, buildPersona(78))
  const loaded = await readProfile(pathsFor(dir).profile)
  assert.equal(loaded.path.endsWith(PROFILE_NAME), true)
})

test('env.sh 是 KEY=value，env.ps1 带 Set-Culture', async () => {
  const dir = await tempDir()
  await writeProfile(dir, buildPersona(79))
  const paths = pathsFor(dir)
  const sh = await readFile(paths.envSh, 'utf8')
  assert.match(sh, /^LANG=zh_CN\.UTF-8$/m)
  assert.match(sh, /^TZ=Asia\/Shanghai$/m)
  const ps1 = await readFile(paths.envPs1, 'utf8')
  assert.match(ps1, /Set-Culture/)
})

test('目录里没有档案时报明确的错', async () => {
  const dir = await tempDir()
  await assert.rejects(() => readProfile(dir), /找不到档案文件/)
})

test('档案不是合法 JSON 也报明确的错', async () => {
  const dir = await tempDir()
  const { writeFile } = await import('node:fs/promises')
  await writeFile(pathsFor(dir).profile, '{ 不是 json', 'utf8')
  await assert.rejects(() => readProfile(dir), /不是合法 JSON/)
})

test('undo 只删三件套，不删目录里别的东西', async () => {
  const dir = await tempDir()
  await writeProfile(dir, buildPersona(80))
  const { writeFile } = await import('node:fs/promises')
  const keeper = join(dir, 'keep.txt')
  await writeFile(keeper, 'keep', 'utf8')

  const removed = await removeProfile(dir)
  assert.equal(removed.length, 3)
  assert.equal(await readFile(keeper, 'utf8'), 'keep')
  assert.deepEqual(await removeProfile(dir), [])
})

test('plan 清单覆盖五段，并写清不提供出口 IP', () => {
  const text = planText(buildPersona(81), '.iamchinese')
  assert.match(text, /## 一、系统区域与时区/)
  assert.match(text, /## 二、浏览器与站点的地区信号/)
  assert.match(text, /## 三、出口与网络/)
  assert.match(text, /RFC 5737/)
  assert.match(text, /## 四、别做的事/)
  assert.match(text, /## 五、验收/)
})

test('verify 文本先列六项，再列环境差项', () => {
  const persona = buildPersona(82)
  const text = verifyText(persona, {
    matched: false,
    items: [{ label: '时区', ok: false, current: 'UTC', want: 'Asia/Shanghai', fix: 'tzutil /s "Asia/Shanghai"' }],
  })
  assert.match(text, /# 人设自检/)
  assert.match(text, /✓ locale ↔ 时区/)
  assert.match(text, /# 环境对比/)
  assert.match(text, /时区：UTC → 要 Asia\/Shanghai/)
})

test('分享包四个文件齐全，说明里写清边界', async () => {
  const dir = await tempDir('cn-share-')
  const persona = buildPersona(83)
  const bundle = await writeShareBundle(join(dir, 'bundle'), persona, { from: '老张', note: '先用这个' })

  assert.equal(bundle.files.length, 4)
  for (const file of bundle.files) {
    const text = await readFile(file, 'utf8')
    assert.ok(text.length > 0, `${file} 不该是空的`)
  }
  const readme = await readFile(join(bundle.dir, 'README.md'), 'utf8')
  assert.match(readme, /拿去注册、实名/)
  assert.match(readme, /伪造证件/)
  assert.match(readme, /来自：老张/)
  assert.match(readme, /附言：先用这个/)

  assert.match(bundle.message, /iamchinese verify/)
  assert.ok(!bundle.message.includes('token'))
  assert.equal(ENV_SH_NAME, 'env.sh')
  assert.equal(ENV_PS1_NAME, 'env.ps1')
})
