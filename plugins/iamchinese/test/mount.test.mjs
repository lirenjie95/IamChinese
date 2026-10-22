import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mountCnPersona } from '../lib/mount.js'
import { CN_TOOL_NAMES } from '../lib/tools.js'
import { IAMCHINESE_SKILL_NAME } from '../lib/skill.js'

/** 只照契约实现，不模拟真实行为：够验证「挂了什么、撤了什么」。 */
function makeFakeCtx({ skillsService = true, promptService = true } = {}) {
  const registered = new Map()
  const disposers = []
  const effects = []
  const skills = []
  const sections = []
  const logs = []

  const ctx = {
    tools: {
      register(definition) {
        registered.set(definition.name, definition)
        return () => registered.delete(definition.name)
      },
    },
    effect(factory, label) {
      effects.push(label)
      const dispose = factory()
      disposers.push(dispose)
      return dispose
    },
    inject(services, callback) {
      // 缺服务时 cordis 根本不执行回调——这是它的语义，不是错误。
      if (!skillsService && services.includes('skills')) return { dispose() {} }
      if (!promptService && services.includes('systemPrompt')) return { dispose() {} }
      const scoped = {
        effect(factory) { const dispose = factory(); disposers.push(dispose); return dispose },
        ...(services.includes('skills')
          ? { skills: { register(skill) { skills.push(skill); return () => {} } } }
          : {}),
        ...(services.includes('systemPrompt')
          ? {
              systemPrompt: {
                section(section) {
                  sections.push(section)
                  return () => {
                    const index = sections.indexOf(section)
                    if (index >= 0) sections.splice(index, 1)
                  }
                },
              },
            }
          : {}),
      }
      callback(scoped)
      return { dispose() {} }
    },
    logger: { info: message => logs.push(message) },
  }

  return { ctx, registered, effects, skills, sections, logs, disposers }
}

test('mount 挂上 5 个工具和 1 份技能', () => {
  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)

  assert.deepEqual([...fake.registered.keys()].sort(), [...CN_TOOL_NAMES].sort())
  assert.equal(fake.skills.length, 1)
  assert.equal(fake.skills[0].name, IAMCHINESE_SKILL_NAME)
  assert.equal(fake.skills[0].source, 'bundled')
  assert.ok(fake.skills[0].content.includes('iamchinese_check'))
})

test('每个工具都带 name/description/parameters/output/execute', () => {
  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)
  for (const [name, definition] of fake.registered) {
    assert.equal(definition.name, name)
    assert.ok(definition.description.length > 20, `${name} 的描述太短`)
    // 参数是宿主的参数 DSL（隐式属性表），不是 JSON Schema：根上不能有 type。
    assert.equal(typeof definition.parameters, 'object')
    assert.equal(definition.parameters.type, undefined, `${name} 的参数根不该带 type`)
    assert.ok(Object.keys(definition.parameters).length > 0, `${name} 至少要有一个参数`)
    assert.equal(definition.output.schema.type, 'object', `${name} 的输出必须是对象根`)
    assert.equal(typeof definition.output.render, 'function')
    assert.equal(typeof definition.execute, 'function')
  }
})

test('参数 DSL 只用宿主认识的节点形状', () => {
  const scalarTypes = new Set(['string', 'number', 'integer', 'boolean', 'null', 'json'])
  const allowedKeys = new Set(['type', 'description', 'title', 'default', 'examples', 'enum', 'const', 'required', 'properties', 'additionalProperties', 'items', 'oneOf'])

  const walk = (node, path) => {
    assert.equal(typeof node, 'object', `${path} 必须是对象`)
    assert.ok(node !== null, `${path} 不能是 null`)
    for (const key of Object.keys(node)) {
      assert.ok(allowedKeys.has(key), `${path}.${key} 不在参数 DSL 里`)
    }
    if (Object.hasOwn(node, 'required')) {
      assert.equal(node.required, true, `${path}.required 只能是 true`)
    }
    if (Object.hasOwn(node, 'oneOf')) {
      assert.ok(node.oneOf.length >= 2, `${path}.oneOf 至少要两个分支`)
      node.oneOf.forEach((branch, index) => walk(branch, `${path}.oneOf[${index}]`))
      return
    }
    assert.ok(scalarTypes.has(node.type), `${path}.type 不认识：${node.type}`)
    if (node.type === 'object') {
      assert.equal(typeof node.additionalProperties, 'boolean', `${path}.additionalProperties 必须显式写`)
      for (const [key, child] of Object.entries(node.properties ?? {})) {
        walk(child, `${path}.properties.${key}`)
      }
    }
    if (node.type === 'array' && node.items) walk(node.items, `${path}.items`)
  }

  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)
  for (const [name, definition] of fake.registered) {
    for (const [key, node] of Object.entries(definition.parameters)) {
      walk(node, `${name}.parameters.${key}`)
    }
  }
})

test('工具写出的是 [{ type: "text" }] 形状', () => {
  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)
  const blocks = fake.registered.get('iamchinese').output.render({ brief: true }, { summary: '你好' })
  assert.deepEqual(blocks, [{ type: 'text', text: '你好' }])
})

test('撤销会把工具全部撤掉', () => {
  const fake = makeFakeCtx()
  const dispose = mountCnPersona(fake.ctx)
  assert.equal(fake.registered.size, CN_TOOL_NAMES.length)
  assert.equal(fake.sections.length, 1, '身份段也应挂上')
  dispose()
  assert.equal(fake.registered.size, 0)
  assert.equal(fake.sections.length, 0, '撤销后身份段要一起撤掉')
})

test('没有 skills 服务时照样挂工具，只是不挂技能', () => {
  const fake = makeFakeCtx({ skillsService: false })
  mountCnPersona(fake.ctx)
  assert.equal(fake.skills.length, 0)
  assert.equal(fake.registered.size, CN_TOOL_NAMES.length)
})

test('没有 systemPrompt 服务时：工具与技能照挂，身份段安静跳过', () => {
  const fake = makeFakeCtx({ promptService: false })
  assert.doesNotThrow(() => mountCnPersona(fake.ctx))
  assert.equal(fake.sections.length, 0)
  assert.equal(fake.registered.size, CN_TOOL_NAMES.length)
  assert.equal(fake.skills.length, 1)
})

test('iamchinese 工具能真跑出六项自洽的人设', async () => {
  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)
  const result = await fake.registered.get('iamchinese').execute({})
  assert.match(result.summary, /身份证/)
  assert.equal(result.persona.gender === '男' || result.persona.gender === '女', true)
  assert.match(result.persona.idCard, /^\d{17}[\dX]$/)
})

test('iamchinese_plan 不写文件，只给清单', async () => {
  const fake = makeFakeCtx()
  mountCnPersona(fake.ctx)
  const result = await fake.registered.get('iamchinese_plan').execute({ out_dir: '.iamchinese' })
  assert.match(result.summary, /落地清单/)
  assert.ok(result.out_dir.endsWith('.iamchinese') || result.out_dir.endsWith('iamchinese'))
})
