/**
 * 宿主入口。DSH 按 `name` 认这个插件，按 `inject` 等到 tools 服务就绪后调 `apply`。
 *
 * 这里**不 import 宿主包**（`@deepseek-ai/dsh-tools` 之类）：插件被 link 进 profile
 * 时，那些包在插件自己的目录下解析不到，静态 import 会让整个插件加载失败。工具定义
 * 用宿主接受的 JSON Schema 子集直接写，见 `lib/tools.js`。
 * @module iamchinese
 */

import { mountCnPersona } from './mount.js'
import { CN_TOOL_NAMES } from './tools.js'
import { CN_PERSONA_SKILL_NAME } from './skill.js'

export const name = 'iamchinese'

/** 必须等这个服务；缺了它工具无处注册。 */
export const inject = ['tools']

/**
 * 插件入口。
 * @param {object} ctx cordis 上下文。
 * @returns {() => void} 注销函数。
 */
export function apply(ctx) {
  const dispose = mountCnPersona(ctx)
  ctx.logger?.info?.(`iamchinese 已挂载：身份段 + skill ${CN_PERSONA_SKILL_NAME} + ${CN_TOOL_NAMES.join(' + ')}`)
  return dispose
}

export { mountCnPersona } from './mount.js'
export {
  CHINA_CONTEXT_ORDER,
  CHINA_CONTEXT_SECTION_NAME,
  CHINA_CONTEXT_TEXT,
  DISABLE_ENV,
  registerChinaContext,
} from './prompt.js'
export { CN_TOOL_NAMES, createCnTools } from './tools.js'
export {
  CN_PERSONA_SKILL_CONTENT,
  CN_PERSONA_SKILL_DESCRIPTION,
  CN_PERSONA_SKILL_NAME,
  CN_PERSONA_SKILL_WHEN_TO_USE,
  registerCnPersonaSkill,
} from './skill.js'
export * from './core/persona.js'
export * from './core/data.js'
export { compareEnvironment, readEnvironment, regionOf, renderEnvironmentReport } from './core/environment.js'
export {
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
} from './core/profile.js'
