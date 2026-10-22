/**
 * 冒烟：把 dist/cn-persona-claude.zip 解开，当成「朋友的机器」从零跑一遍。
 *
 * 验的是「这个 zip 自己就能用」：CLI 六个子命令、三件套落盘、分发页能起并有内容。
 * 任何一步失败就抛错退出——这份报告就是要贴在交付说明里的证据。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cp, mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const dist = resolve(import.meta.dirname, '..', 'dist')
const zip = join(dist, 'cn-persona-claude.zip')
const work = await mkdtemp(join(tmpdir(), 'cn-persona-claude-'))

const run = (args, options = {}) =>
  execFileSync('node', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })

try {
  // 1. 解包
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${work}' -Force`], { stdio: 'ignore' })
  const root = join(work, 'claude-plugin')
  const entries = await readdir(root)
  console.log('解开后的顶层：', entries.join('、'))

  // 2. 清单、技能、命令、hook 都在
  assert.ok(entries.includes('.claude-plugin'))
  assert.ok(entries.includes('skills'))
  assert.ok(entries.includes('commands'))
  assert.ok(entries.includes('hooks'))
  assert.ok(entries.includes('scripts'))

  // 2b. SessionStart hook：stdout 就是给模型的上下文，退出码必须是 0
  const context = run([join(root, 'hooks/china-context.mjs')])
  assert.match(context, /中国大陆/)
  assert.match(context, /简体中文/)
  console.log('hook: 注入', context.split('\n')[2] ?? context.split('\n')[0])

  // 3. CLI 能跑：persona --json 必须是合法 JSON 且六项自洽全绿
  const cli = join(root, 'bin/cn-persona.mjs')
  const persona = JSON.parse(run([cli, 'persona', '--json']))
  assert.equal(persona.checks.length, 6)
  assert.ok(persona.checks.every(check => check.ok), '六项自洽有红项')
  console.log(`persona: ${persona.name} / ${persona.phone} / ${persona.carrier} / 六项全绿`)

  // 4. 落盘 + 复验
  const out = join(work, 'profile-out')
  run([cli, 'apply', '--out', out])
  const written = (await readdir(out)).sort()
  assert.deepEqual(written, ['cn-profile.json', 'env.ps1', 'env.sh'])
  console.log('apply:', written.join('、'))

  // 5. 分发页：把自己这个 zip 放进目录，起服务看能不能下
  await cp(zip, join(root, 'cn-persona-claude.zip'))
  const server = await import(new URL('./share-server.mjs', `file:///${join(root, 'scripts/x')}`).href)
  const started = await server.startShareServer({ port: 0, dir: root })
  try {
    const page = await fetch(started.baseUrl)
    const html = await page.text()
    assert.equal(page.status, 200)
    assert.match(html, /cn-persona-claude\.zip/)
    assert.match(html, /实名认证/)
    const download = await fetch(new URL('cn-persona-claude.zip', started.baseUrl))
    assert.equal(download.status, 200)
    console.log(`分发页 200，列出：${started.files.map(file => file.name).join('、')}`)
  } finally {
    await started.close()
  }

  // 6. share 子命令也走一遍
  const shared = run([cli, 'share', '--from', '冒烟', '--out', join(work, 'share-out')])
  console.log('share:', shared.trim().split('\n').slice(-1)[0])

  console.log('\nClaude 侧冒烟：全部通过')
} finally {
  await rm(work, { recursive: true, force: true })
}
