/**
 * CLI 的测试：`main()` 是 DSH 工具和 Claude 命令共同调用的那一层，
 * 它坏了两个外壳都坏，所以单独盯住。
 *
 * main 直接写 process.stdout / stderr，这里临时接管这两个 write 抓输出，
 * 结束后原样还回去——比另起子进程快，也拿得到退出码。
 */
import assert from 'node:assert/strict'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'

import { main } from '../bin/iamchinese.mjs'

const original = { out: process.stdout.write, err: process.stderr.write }

before(() => {
  process.stdout.write = () => true
  process.stderr.write = () => true
})

after(() => {
  process.stdout.write = original.out
  process.stderr.write = original.err
})

/** 跑一次 CLI，把 stdout / stderr / 退出码都收回来。 */
async function run(argv) {
  const chunks = { out: '', err: '' }
  process.stdout.write = chunk => {
    chunks.out += chunk
    return true
  }
  process.stderr.write = chunk => {
    chunks.err += chunk
    return true
  }
  try {
    const code = await main(argv)
    return { code, ...chunks }
  } finally {
    process.stdout.write = original.out
    process.stderr.write = original.err
  }
}

test('没有子命令：打印用法并返回 0', async () => {
  const result = await run([])
  assert.equal(result.code, 0)
  assert.match(result.out, /persona/)
  assert.match(result.out, /share/)
})

test('persona --json：带 seed 和六项自洽，字段能被 JSON.parse', async () => {
  const result = await run(['persona', '--json'])
  const payload = JSON.parse(result.out)
  assert.equal(payload.seed, 20261019)
  assert.equal(payload.checks.length, 6)
  assert.ok(payload.checks.every(check => check.ok))
  assert.equal(payload.localeBcp47, 'zh-Hans-CN')
  assert.match(payload.egressIp, /^203\.0\.113\./)
})

test('persona：文本卡片里有身份字段和种子说明', async () => {
  const result = await run(['persona'])
  assert.equal(result.code, 0)
  assert.match(result.out, /zh-Hans-CN/)
  assert.match(result.out, /20261019/)
  assert.doesNotMatch(result.out, /\{/, '文本模式不该吐 JSON')
})

test('apply → verify → undo 走通，且三件套是唯一产物', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iamchinese-cli-'))
  try {
    const applied = await run(['apply', '--out', dir])
    assert.equal(applied.code, 0)
    assert.deepEqual((await readdir(dir)).sort(), ['env.ps1', 'env.sh', 'iamchinese-profile.json'])

    // --no-env：只验档案内部自洽，不拿这台机器的环境来判（环境项在别的用例里）
    const verified = await run(['verify', '--profile', join(dir, 'iamchinese-profile.json'), '--no-env'])
    assert.equal(verified.code, 0)
    assert.match(verified.out, /人设自检/)

    // 手改档案里的区划码（档案里它挂在 address.region_code 下），verify 必须红
    const file = join(dir, 'iamchinese-profile.json')
    const data = JSON.parse(await readFile(file, 'utf8'))
    data.persona.address.region_code = '110105'
    await writeFile(file, JSON.stringify(data), 'utf8')
    const broken = await run(['verify', '--profile', file, '--no-env'])
    assert.equal(broken.code, 1)
    assert.match(broken.out + broken.err, /身份证区划/)

    const undone = await run(['undo', '--out', dir])
    assert.equal(undone.code, 0)
    assert.deepEqual(await readdir(dir), [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('share：导出四个文件并给出可粘贴的话术', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iamchinese-share-'))
  try {
    const result = await run(['share', '--from', '老张', '--out', dir])
    assert.equal(result.code, 0)
    assert.deepEqual((await readdir(dir)).sort(), ['README.md', 'env.ps1', 'env.sh', 'iamchinese-profile.json'])
    assert.match(result.out, /可以直接发的话/)
    // 收件人只落在 README 里，不上命令行话术（那是给收件人看的，不是给他看自己名字）
    assert.match(await readFile(join(dir, 'README.md'), 'utf8'), /老张/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('plan 只打印清单，不写盘', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'iamchinese-plan-'))
  try {
    const result = await run(['plan', '--out', dir])
    assert.equal(result.code, 0)
    assert.deepEqual(await readdir(dir), [])
    assert.match(result.out, /系统区域与时区/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('未知子命令：进 stderr 并返回 2', async () => {
  const result = await run(['nonsense'])
  assert.equal(result.code, 2)
  assert.match(result.err, /nonsense/)
})
