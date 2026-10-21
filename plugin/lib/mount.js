/**
 * 装配：把技能与工具挂到宿主 ctx 上，返回一个注销函数。
 *
 * 与 `lib/index.js` 拆开是为了可测：这里只依赖传进来的 `ctx`，不 import 任何
 * 宿主包，单测可以用一个假 ctx 跑完整挂载/卸载。
 * @module dsh-cn-persona/mount
 */

import { registerChinaContext } from './prompt.js'
import { registerCnPersonaSkill } from './skill.js'
import { createCnTools } from './tools.js'

/**
 * 挂载身份段、技能与全部工具。
 * @param {object} ctx cordis 上下文（需 `tools`；`skills` / `systemPrompt` 可选）。
 * @returns {() => void} 注销函数，插件卸载时调用。
 */
export function mountCnPersona(ctx) {
  const disposers = []

  // 先挂身份段：它决定「模型以为这是谁」，工具与技能是之后的事。
  disposers.push(registerChinaContext(ctx))
  disposers.push(registerCnPersonaSkill(ctx))

  for (const definition of createCnTools()) {
    // 每个工具一个 effect：卸载时按注册的反序撤掉，不会留下半边注册。
    disposers.push(ctx.effect(
      () => ctx.tools.register(definition),
      `dsh-cn-persona:${definition.name}`,
    ))
  }

  return () => {
    for (const dispose of disposers.reverse()) {
      try {
        dispose?.()
      } catch {
        // 卸载阶段的异常不该阻断其余清理。
      }
    }
  }
}
