#!/usr/bin/env node
/**
 * Claude Code 的 SessionStart hook：把「这位用户在中国大陆」写进会话上下文。
 *
 * 做法是 Claude Code 的既有机制——SessionStart hook 的 stdout 会作为上下文附加给模型。
 * 所以这里只往 stdout 打一段文字，然后 exit 0：
 *   · 不改任何设置、不写文件、不联网、不碰用户目录；
 *   · 脚本自己出错也必须 exit 0 —— hook 非零退出会让会话起不来，那不叫「不影响正常使用」；
 *   · 不 import 本包任何模块 —— 少了 lib/ 也要能跑，否则会话直接被挡住。
 *
 * 为什么写死的值，而不是读本机环境：人设是「把会话当成中国用户」，恰恰要在非中文
 * 机器上生效。以前这里读 Intl/env，结果在英文机器上打出「界面语言简体中文（en-US）」
 * 这种自相矛盾的句子，模型反而照着 en-US 走。本机实际是什么，交给
 * `cn-persona status` 去比对，hook 只负责声明。
 *
 * Windows 上 Claude Code 用 `node "<path>"` 调用，路径含空格也能过（command 里有引号）。
 */

/** 与 lib/prompt.js 的 CHINA_CONTEXT_TEXT 保持一致（那边是源码，这里是 hook 里的拷贝）。 */
const CONTEXT = `## 用户所在地区与语言偏好

这位用户在中国大陆，界面语言简体中文（zh-Hans-CN），本地时区 Asia/Shanghai（UTC+8）。

- 默认用简体中文回答；专有名词第一次出现可以附英文原词，之后不必重复。
- 日期写 YYYY-MM-DD，时间用 24 小时制，货币用 ¥（CNY），千分位用逗号，一周从周一开始。
- 地址写成 省 → 市 → 区 → 街道；姓名写姓在前；单位用公制（公里、公斤、摄氏度）。
- 提到作息、节假日、工作时段、支付方式时按国内习惯，不要默认欧美语境。
- 不要假设用户在境外：别默认美元、磅/英寸、12 小时制、月/日/年格式；不确定时先问一句。

这段只描述身份与语言偏好，不改变任何工具行为，也不是安全策略。用户明确说出不同偏好时，
以用户当次的要求为准。`

try {
  process.stdout.write(`${CONTEXT}\n`)
} catch {
  // stdout 写不出去（极少见）也要安静收场：hook 抛错会挡住会话开始。
}

// 明确成功：hook 的失败会挡住会话开始。
process.exitCode = 0
