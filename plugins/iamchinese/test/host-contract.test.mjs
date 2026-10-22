/**
 * 宿主契约测试：拿 DSH 自己那份 `dsh-tools` 校验我们的工具定义。
 *
 * 这条测试的价值在于它**不靠我的理解**：`validateArgs` / `assertSupportedJsonSchema`
 * 是宿主的真代码。之前参数写成裸 JSON Schema，自己的测试全绿，一碰到宿主就抛
 * `UNSUPPORTED_SCHEMA: parameters.type must be a value schema object`——参数要的是
 * 宿主的参数 DSL，不是 JSON Schema。这种错只有跑宿主的校验器才会暴露。
 *
 * 宿主没装（朋友只装了 Claude 侧、或者 CI 里没有 DSH）时整组跳过，不算失败：
 * 插件本身零依赖，没有宿主也能用。
 */

import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

import { createCnTools } from '../lib/tools.js'

/** 宿主可能躺在哪些地方：显式给的环境变量优先，然后猜几个常见安装位置。 */
function hostCandidates() {
  const found = []
  if (process.env.DSH_TOOLS_MODULE) found.push(process.env.DSH_TOOLS_MODULE)

  const suffix = join('@deepseek-ai', 'dsh', 'node_modules', '@deepseek-ai', 'dsh-tools', 'lib', 'index.js')
  for (const root of [process.env.APPDATA, process.env.LOCALAPPDATA].filter(Boolean)) {
    found.push(join(root, 'npm', 'node_modules', suffix))
  }
  found.push(join('/usr', 'lib', 'node_modules', suffix))
  found.push(join('/usr', 'local', 'lib', 'node_modules', suffix))
  if (process.env.DSH_HOME) found.push(join(process.env.DSH_HOME, '..', 'node_modules', suffix))
  return found
}

/** 导入宿主模块；找不到就返回 null。 */
async function loadHost() {
  for (const candidate of hostCandidates()) {
    if (!existsSync(candidate)) continue
    try {
      return await import(pathToFileURL(candidate).href)
    } catch {
      // 版本不兼容就当没装，别让测试替宿主的升级背锅。
    }
  }
  return null
}

const host = await loadHost()
const needsHost = host ? test : test.skip

needsHost('每个工具的参数都能被宿主编译成 JSON Schema', () => {
  for (const tool of createCnTools()) {
    const violations = host.validateArgs(tool.parameters, {})
    assert.deepEqual(violations, [], `${tool.name} 的参数方案有问题`)
  }
})

needsHost('每个工具的输出方案都在宿主支持的子集里', () => {
  for (const tool of createCnTools()) {
    assert.doesNotThrow(() => host.assertSupportedJsonSchema(tool.output.schema), tool.name)
  }
})

needsHost('工具真跑出来的输出能通过宿主的值校验', async () => {
  const [persona] = createCnTools()
  const value = await persona.execute({})
  assert.deepEqual(host.validateJsonSchemaValue(persona.output.schema, value), [])
})

needsHost('参数类型写错会被宿主拦下来', () => {
  const check = createCnTools().find(tool => tool.name === 'iamchinese_check')
  const violations = host.validateArgs(check.parameters, { include_environment: 'yes' })
  assert.equal(violations.length, 1)
  assert.match(violations[0], /include_environment/)
})
