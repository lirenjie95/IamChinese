/**
 * 身份段的两条路都要测：DSH 走系统提示注册，Claude 走 SessionStart hook。
 * 这里测的是「注册的东西对不对」和「缺服务/出错时是否安静退场」——
 * 后者更要紧：一段提示不该让插件或会话起不来。
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

import {
  CHINA_CONTEXT_ORDER,
  CHINA_CONTEXT_SECTION_NAME,
  CHINA_CONTEXT_TEXT,
  DISABLE_ENV,
  registerChinaContext,
} from '../lib/prompt.js'

/** 只实现 cordis 里我们真正用到的那几条语义。 */
function fakeCtx({ withService = true, env = {} } = {}) {
  const sections = []
  const effects = []
  const ctx = {
    inject(services, callback) {
      assert.deepEqual(services, ['systemPrompt'])
      if (!withService) return { dispose() {} }
      const scoped = {
        systemPrompt: {
          section(section) {
            sections.push(section)
            return () => {
              const index = sections.indexOf(section)
              if (index >= 0) sections.splice(index, 1)
            }
          },
        },
        effect(run, label) {
          effects.push(label)
          return run()
        },
      }
      return callback(scoped)
    },
  }
  return { ctx, sections, effects, env }
}

test('注册的 section：名字带包前缀、order 落在策略段之前、文本讲清身份与偏好', () => {
  const { ctx, sections } = fakeCtx()
  registerChinaContext(ctx, { env: {} })

  assert.equal(sections.length, 1)
  const [section] = sections
  assert.equal(section.name, CHINA_CONTEXT_SECTION_NAME)
  assert.equal(section.order, CHINA_CONTEXT_ORDER)
  assert.ok(Number.isFinite(section.order), 'order 必须是有限数，否则宿主直接抛')
  assert.ok(CHINA_CONTEXT_ORDER > 0 && CHINA_CONTEXT_ORDER < 500, '应落在 persona-prefix 之后、策略段之前')
  assert.equal(section.text, CHINA_CONTEXT_TEXT)
  assert.match(section.text, /简体中文/)
  assert.match(section.text, /Asia\/Shanghai/)
  // 常驻提示里不该出现假身份证或假手机号：那是工具按需生成的
  assert.doesNotMatch(section.text, /\d{17}[\dX]/)
  assert.doesNotMatch(section.text, /1[3-9]\d{9}/)
})

test('注销后 section 被撤掉', () => {
  const { ctx, sections } = fakeCtx()
  const dispose = registerChinaContext(ctx, { env: {} })
  assert.equal(sections.length, 1)
  dispose()
  assert.equal(sections.length, 0)
})

test('没有 systemPrompt 服务的宿主：不抛错，返回的注销函数安全', () => {
  const { ctx, sections } = fakeCtx({ withService: false })
  const dispose = registerChinaContext(ctx, { env: {} })
  assert.deepEqual(sections, [])
  assert.doesNotThrow(() => dispose?.())
})

test(`${DISABLE_ENV} 设了就完全不注册`, () => {
  const { ctx, sections } = fakeCtx()
  const dispose = registerChinaContext(ctx, { env: { [DISABLE_ENV]: '1' } })
  assert.deepEqual(sections, [])
  assert.equal(dispose, undefined)
})

test('Claude 侧 hook 清单：SessionStart + 用 CLAUDE_PLUGIN_ROOT 定位脚本', async () => {
  const root = resolve(import.meta.dirname, '..')
  const config = JSON.parse(await readFile(join(root, 'hooks/hooks.json'), 'utf8'))
  const [group] = config.hooks.SessionStart
  const [hook] = group.hooks
  assert.equal(hook.type, 'command')
  assert.match(hook.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\/china-context\.mjs/)
  assert.ok(hook.timeout > 0)
})

test('Claude 侧 hook 脚本：stdout 就是给模型的上下文，退出码 0', () => {
  const root = resolve(import.meta.dirname, '..')
  const output = execFileSync(process.execPath, [join(root, 'hooks/china-context.mjs')], {
    encoding: 'utf8',
  })
  assert.match(output, /用户所在地区与语言偏好/)
  assert.match(output, /简体中文/)
  // 机器上探测到的可能是 zh-CN，也可能是 zh-Hans-CN：两种写法都合法
  assert.match(output, /zh(-Hans)?-CN/)
  assert.match(output, /Asia\/Shanghai/)
  assert.doesNotMatch(output, /\d{17}[\dX]/)
})
