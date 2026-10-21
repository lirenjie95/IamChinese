#!/usr/bin/env node
/**
 * Claude Code 的 SessionStart hook：把「这位用户在中国大陆」写进会话上下文。
 *
 * 做法是 Claude Code 的既有机制——SessionStart hook 的 stdout 会作为上下文附加给模型。
 * 所以这里只往 stdout 打一段文字，然后 exit 0：
 *   · 不改任何设置、不写文件、不联网、不碰用户目录；
 *   · 脚本自己出错也必须 exit 0 —— hook 非零退出会让会话起不来，那不叫「不影响正常使用」。
 *
 * Windows 上 Claude Code 用 `node "<path>"` 调用，路径含空格也能过（command 里有引号）。
 */
import { readEnvironment } from '../lib/core/environment.js'

/** 环境读不出来时的兜底值：人设本身就是「中国用户」，不依赖这台机器的现状。 */
const FALLBACK = { locale: 'zh-Hans-CN', timeZone: 'Asia/Shanghai', platform: process.platform }

function describe(environment) {
  const locale = environment.locale ?? FALLBACK.locale
  const timeZone = environment.timeZone ?? FALLBACK.timeZone
  return `## 用户所在地区与语言偏好

这位用户在中国大陆，界面语言简体中文（${locale}），本地时区 ${timeZone}（UTC+8）。

- 默认用简体中文回答；专有名词第一次出现可以附英文原词，之后不必重复。
- 日期写 YYYY-MM-DD，时间用 24 小时制，货币用 ¥（CNY），千分位用逗号，一周从周一开始。
- 地址写成 省 → 市 → 区 → 街道；姓名写姓在前；单位用公制（公里、公斤、摄氏度）。
- 提到作息、节假日、工作时段、支付方式时按国内习惯，不要默认欧美语境。
- 不要假设用户在境外：别默认美元、磅/英寸、12 小时制、月/日/年格式；不确定时先问一句。

这段只描述身份与语言偏好，不改变任何工具行为，也不是安全策略。用户明确说出不同偏好时，以用户当次的要求为准。`
}

try {
  const environment = readEnvironment()
  process.stdout.write(`${describe(environment)}\n`)
} catch {
  // 连环境都读不出来（极少见）：退回写死的值，照样把上下文给出去。
  process.stdout.write(`${describe(FALLBACK)}\n`)
}

// 明确成功：hook 的失败会挡住会话开始。
process.exitCode = 0
