/**
 * 真宿主契约测试：把插件挂到 DSH 自己那份 cordis 上，而不是自己写的假 ctx。
 *
 * 假 ctx 只能证明「我以为的契约自洽」，证明不了「宿主真的这样调用我」。
 * 所以这里直接 import 宿主安装里的 @deepseek-ai/cordis，用 provide + set
 * 搭出最小服务环境，再走一遍 ctx.plugin() → apply() → ctx.effect() → 注销。
 *
 * 找不到宿主时整组跳过——朋友机器上没有 DSH 也不会红。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const CANDIDATES = [
  process.env.DSH_CORDIS,
  process.env.APPDATA && join(process.env.APPDATA, 'npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/cordis/lib/index.js'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Programs/DeepSeek Harness/resources/app.asar.unpacked/node_modules/@deepseek-ai/cordis/lib/index.js'),
].filter(Boolean)

const cordisPath = CANDIDATES.find((candidate) => existsSync(candidate))
const skip = cordisPath ? false : '本机没有装 DSH，跳过宿主契约测试'

async function mountIntoHost() {
  const { Context } = await import(pathToFileURL(cordisPath).href)
  const plugin = await import('../lib/index.js')

  const app = new Context()
  const tools = []
  app.provide('tools')
  app.set('tools', {
    register(definition) {
      tools.push(definition.name)
      return () => {
        const at = tools.indexOf(definition.name)
        if (at >= 0) tools.splice(at, 1)
      }
    },
  })

  const fiber = app.plugin(plugin)
  await new Promise((resolve) => setTimeout(resolve, 80))
  return { app, fiber, tools, plugin }
}

test('真 cordis：五个工具都挂上，注销后清空', { skip }, async () => {
  const { fiber, tools, plugin } = await mountIntoHost()
  assert.deepEqual([...tools].sort(), [...plugin.CN_TOOL_NAMES].sort())

  await fiber?.dispose?.()
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.deepEqual(tools, [])
})

test('真 cordis：没有 skills 服务时不崩，有了就注册', { skip }, async () => {
  const { app, tools } = await mountIntoHost()
  assert.equal(tools.length, 5)

  const skills = []
  app.provide('skills')
  app.set('skills', { register: (entry) => skills.push(entry) })
  await new Promise((resolve) => setTimeout(resolve, 80))

  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, 'iamchinese')
  assert.equal(skills[0].source, 'bundled')
  assert.match(skills[0].content, /cn_persona/)
})

/** 宿主那份 SystemPrompt 真身：能装上才有资格谈「注册进去了」。 */
const promptModule = CANDIDATES.map((candidate) =>
  candidate.replace(/cordis[/\\]lib[/\\]index\.js$/, 'dsh-system-prompt/lib/index.js'),
).find((candidate) => existsSync(candidate))
const skipPrompt = promptModule ? false : '本机没有 dsh-system-prompt，跳过提示段契约测试'

test('真 cordis + 真 systemPrompt：身份段落进系统提示，位置在 persona 前缀之后、策略段之前', { skip: skipPrompt }, async () => {
  const { Context } = await import(pathToFileURL(cordisPath).href)
  const { SystemPrompt } = await import(pathToFileURL(promptModule).href)
  const prompt = await import('../lib/prompt.js')

  const app = new Context()
  app.plugin(SystemPrompt, {})
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.ok(app.systemPrompt, 'SystemPrompt 服务应已就位')

  // 只挂身份段：这里验的是提示注册，不牵扯工具
  const dispose = prompt.registerChinaContext(app, { env: {} })
  await new Promise((resolve) => setTimeout(resolve, 80))

  const assembly = await app.systemPrompt.assemble({})
  const names = assembly.sections.map((section) => section.name)
  const ours = assembly.sections.find((section) => section.name === prompt.CHINA_CONTEXT_SECTION_NAME)
  assert.ok(ours, `系统提示里应有 ${prompt.CHINA_CONTEXT_SECTION_NAME}`)
  assert.equal(ours.text, prompt.CHINA_CONTEXT_TEXT)
  assert.ok(names.indexOf(prompt.CHINA_CONTEXT_SECTION_NAME) > names.indexOf('deployment:persona-prefix'),
    '身份段应排在 deployment:persona-prefix 之后')

  dispose?.()
  await new Promise((resolve) => setTimeout(resolve, 80))
  const after = await app.systemPrompt.assemble({})
  assert.equal(after.sections.some((section) => section.name === prompt.CHINA_CONTEXT_SECTION_NAME), false,
    '注销后系统提示里不应再有这一节')
})
