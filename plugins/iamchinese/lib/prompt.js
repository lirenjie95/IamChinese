/**
 * 「让宿主以为用户在中国」的唯一步骤：往系统提示里塞一段只读的身份与语言偏好。
 *
 * 为什么不是改系统设置：改 locale / 时区会影响这台机器上所有程序，代价远大于收益
 * （而且用户明确要求「不影响任何正常使用」）。系统提示是每个会话各自组装的东西，
 * 注册一段就是加一段，撤回就是一个 disposer——对别的东西零影响。
 *
 * 宿主接口（@deepseek-ai/dsh-system-prompt lib/index.js:238）：
 *   ctx.systemPrompt.section({ name, order, text }) -> 精确的 effect disposer
 * order 必须是有限数，同名 section 在同层重复会抛。order 40 落在
 * deployment:persona-prefix(0) 之后、plan/team 策略(500/600) 之前：
 * 它属于「你是谁」这一档，不该压过安全与工具策略。
 */

/** section 名：加上包前缀，避免和宿主的 `deployment:*` 撞名。 */
export const CHINA_CONTEXT_SECTION_NAME = 'iamchinese:china-context'

/** 排在其他「你是谁」段之后、策略段之前。 */
export const CHINA_CONTEXT_ORDER = 40

/** 关掉它的环境变量：想临时验证「没有它也一样」时用。 */
export const DISABLE_ENV = 'IAMCHINESE_NO_PROMPT'

/**
 * 要写进提示的那段话。
 *
 * 只放「会影响措辞与常识」的偏好，不放身份证/手机号——那是工具按需生成的样例，
 * 常驻提示里塞一个假身份证没有任何好处，反而会被模型当事实复述给用户。
 */
export const CHINA_CONTEXT_TEXT = `## 用户所在地区与语言偏好

这位用户在中国大陆，界面语言简体中文（zh-Hans-CN），本地时区 Asia/Shanghai（UTC+8）。

- 默认用简体中文回答；专有名词第一次出现可以附英文原词，之后不必重复。
- 日期写 YYYY-MM-DD，时间用 24 小时制，货币用 ¥（CNY），千分位用逗号，一周从周一开始。
- 地址写成 省 → 市 → 区 → 街道；姓名写姓在前；单位用公制（公里、公斤、摄氏度）。
- 提到作息、节假日、工作时段、支付方式时按国内习惯，不要默认欧美语境。
- 不要假设用户在境外：别默认美元、磅/英寸、12 小时制、月/日/年格式；不确定时先问一句。

这段只描述身份与语言偏好，不改变任何工具行为，也不是安全策略。用户明确说出不同偏好时，
以用户当次的要求为准。`

/**
 * 往调用方的提示作用域里注册这段文字。
 *
 * 用 `ctx.inject(['systemPrompt'], …)` 而不是 `ctx.systemPrompt?.section(...)`：
 * cordis 对未声明服务的属性访问直接抛错，可选链挡不住（`dsh-skill` 那层也是这么写的）。
 * 没有 systemPrompt 服务的宿主就干脆不注册，插件其余部分照常工作。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx 插件上下文。
 * @param {{ env?: Record<string, string | undefined> }} [options]
 * @returns {(() => void) | undefined} 注销函数；被关掉或没有服务时返回 undefined。
 */
export function registerChinaContext(ctx, options = {}) {
  const env = options.env ?? process.env
  if (env[DISABLE_ENV]) return undefined

  let dispose
  ctx.inject(['systemPrompt'], scoped => {
    dispose = scoped.effect(
      () =>
        scoped.systemPrompt.section({
          name: CHINA_CONTEXT_SECTION_NAME,
          order: CHINA_CONTEXT_ORDER,
          text: CHINA_CONTEXT_TEXT,
        }),
      'iamchinese:prompt',
    )
  })

  return () => {
    if (typeof dispose === 'function') dispose()
  }
}
