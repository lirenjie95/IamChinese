/**
 * 档案落盘、读回、清单文本、分享包。
 *
 * 写文件只有这一个模块做，而且只写三个固定名字的文件。不做「顺手把配置改了」的
 * 事：这个包产出的全部是**文本资产**，要不要用、怎么用，由人决定。
 * @module iamchinese/core/profile
 */

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import {
  personaConsistency,
  personaEnvFile,
  personaPowershell,
  personaToJSON,
  personaFromJSON,
  renderCard,
} from './persona.js'

export const PROFILE_NAME = 'cn-profile.json'
export const ENV_SH_NAME = 'env.sh'
export const ENV_PS1_NAME = 'env.ps1'
export const SCHEMA_VERSION = 1

/**
 * 一个输出目录里三个固定文件的路径。
 * @param {string} dir
 * @returns {{ dir: string, profile: string, envSh: string, envPs1: string }}
 */
export function pathsFor(dir) {
  const base = resolve(dir)
  return {
    dir: base,
    profile: join(base, PROFILE_NAME),
    envSh: join(base, ENV_SH_NAME),
    envPs1: join(base, ENV_PS1_NAME),
  }
}

/** 原子写：同目录 .tmp → fsync 由 writeFile 保证落盘语义 → rename 覆盖。 */
async function writeAtomic(path, text) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, text, { encoding: 'utf8' })
  try {
    await rename(tmp, path)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
  return path
}

/**
 * 把一份人设写成 `cn-profile.json` + `env.sh` + `env.ps1`。
 * @param {string} dir 输出目录。
 * @param {object} persona
 * @param {{ policyVersion?: string, now?: Date }} [meta]
 * @returns {Promise<{ dir: string, files: string[] }>}
 */
export async function writeProfile(dir, persona, meta = {}) {
  const paths = pathsFor(dir)
  const body = {
    schema: SCHEMA_VERSION,
    generated_at: (meta.now ?? new Date()).toISOString(),
    policy_version: meta.policyVersion ?? 'iamchinese-0.2.0',
    persona: personaToJSON(persona),
  }
  await writeAtomic(paths.profile, `${JSON.stringify(body, null, 2)}\n`)
  await writeAtomic(paths.envSh, personaEnvFile(persona))
  await writeAtomic(paths.envPs1, `${personaPowershell(persona)}\n`)
  return { dir: paths.dir, files: [paths.profile, paths.envSh, paths.envPs1] }
}

/**
 * 读回档案。既接受目录也接受 `cn-profile.json` 的完整路径。
 * @param {string} target
 * @returns {Promise<{ persona: object, meta: { schema: number, generated_at?: string, policy_version?: string }, path: string }>}
 */
export async function readProfile(target) {
  const path = target.endsWith('.json') ? resolve(target) : join(resolve(target), PROFILE_NAME)
  let raw
  try {
    raw = await readFile(path, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') throw new Error(`找不到档案文件：${path}`)
    throw error
  }
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`档案不是合法 JSON：${path}`)
  }
  return {
    persona: personaFromJSON(parsed.persona),
    meta: {
      schema: Number(parsed.schema ?? 0),
      generated_at: parsed.generated_at,
      policy_version: parsed.policy_version,
    },
    path,
  }
}

/**
 * 删掉三件套。
 * @param {string} dir
 * @returns {Promise<string[]>} 实际删掉的路径。
 */
export async function removeProfile(dir) {
  const paths = pathsFor(dir)
  const removed = []
  for (const path of [paths.profile, paths.envSh, paths.envPs1]) {
    try {
      await rm(path)
      removed.push(path)
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return removed
}

/**
 * 给模型/人看的落地清单。写的是「哪些事必须做、哪些事不该做」，不是教程。
 * @param {object} persona
 * @param {string} dir
 * @returns {string}
 */
export function planText(persona, dir) {
  const paths = pathsFor(dir)
  return [
    '# 落地清单',
    '',
    `档案：${paths.profile}`,
    `环境变量：${paths.envSh} / ${paths.envPs1}`,
    '',
    '## 一、系统区域与时区（要重启终端才生效）',
    `1. Windows：Set-Culture -CultureInfo "${persona.localeBcp47}"（当前用户，不用管理员）`,
    `2. Windows：Set-WinUILanguageOverride -Language "${persona.localeBcp47}"`,
    `3. tzutil /s "${persona.timezone}"（这一条要管理员）`,
    `4. POSIX / Git Bash：source ${paths.envSh}，或把 LANG=${persona.localePosix} 写进 shell 启动文件`,
    '',
    '## 二、浏览器与站点的地区信号',
    `1. 首选语言列表放 zh-CN，其次 zh、en；不要留 en-US 打头`,
    `2. 时区选 ${persona.timezone}，不要用「跟随系统」以外的自动探测插件`,
    `3. 站点地区/货币/日期格式按人设改：${persona.conventions.date}、${persona.conventions.currency}`,
    '',
    '## 三、出口与网络（这条要自己判断）',
    `1. 人设里的 ${persona.asn} ${persona.org} 只是「应该长这样」的样例，出口地址 ${persona.egressIp} 是 RFC 5737 文档段，不是真地址`,
    `2. 要让 CDN/风控看到中国出口，得用真实的中国线路；这一项这个包不提供，也不代填`,
    '',
    '## 四、别做的事',
    '1. 不拿这套东西去注册、认证、过 KYC —— 那是伪造证件，和人设演示是两件事',
    '2. 不覆盖真实身份的账号资料；只在明确属于你的测试环境里用',
    '3. 不改别人的设备，不把档案包发给不知情的人',
    '',
    '## 五、验收',
    '1. `iamchinese verify`（或插件里的 cn_persona_check）应当全绿',
    '2. 打开一个看地区的站点，确认它认为你在国内',
    '3. 终端里 `date` 输出应当是北京时间，`locale` 应当是 zh_CN.UTF-8',
  ].join('\n')
}

/**
 * 自检报告文本：人设内部自洽 + 当前环境对比。
 * @param {object} persona
 * @param {{ matched: boolean, items: Array<object> }} [environment]
 * @returns {string}
 */
export function verifyText(persona, environment) {
  const checks = personaConsistency(persona)
  const lines = ['# 人设自检', '']
  for (const check of checks) {
    lines.push(`${check.ok ? '✓' : '✗'} ${check.label}：${check.note}`)
  }
  if (environment) {
    lines.push('', '# 环境对比', '')
    lines.push(environment.matched ? '✓ 当前环境与人设一致。' : '✗ 还有不一致的项：')
    for (const item of environment.items) {
      if (item.ok) continue
      lines.push(`  - ${item.label}：${item.current} → 要 ${item.want}（${item.fix}）`)
    }
  }
  return lines.join('\n')
}

/**
 * 生成一份能直接发给朋友的分享包（三个文件 + 说明）。
 *
 * 分享包只含人设与建议，不含任何凭据，也不含「照着做就能通过实名」的暗示：
 * 说明第一段就把边界写清楚，收到的人不至于误用。
 * @param {string} dir 分享包输出目录。
 * @param {object} persona
 * @param {{ from?: string, note?: string }} [options]
 * @returns {Promise<{ dir: string, files: string[], message: string }>}
 */
export async function writeShareBundle(dir, persona, options = {}) {
  const target = resolve(dir)
  await mkdir(target, { recursive: true })
  const files = []

  files.push(await writeAtomic(join(target, PROFILE_NAME), `${JSON.stringify({
    schema: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    policy_version: 'iamchinese-0.2.0-share',
    persona: personaToJSON(persona),
  }, null, 2)}\n`))
  files.push(await writeAtomic(join(target, ENV_SH_NAME), personaEnvFile(persona)))
  files.push(await writeAtomic(join(target, ENV_PS1_NAME), `${personaPowershell(persona)}\n`))

  const readme = [
    '# 一份中国用户人设（测试用）',
    '',
    '这是别人给你的一份**演示档案**，用来把开发/测试环境配成国内口径。里面的',
    '姓名、身份证号、手机号都是按规则拼出来的样例，不对应任何真实的人，也不能',
    '拿去注册、实名、过 KYC —— 那属于伪造证件，和配环境是两件事。',
    '',
    '## 里面有什么',
    `- ${PROFILE_NAME}：人设本体（身份、地址、号段、locale、时区、书写约定）`,
    `- ${ENV_SH_NAME} / ${ENV_PS1_NAME}：把 locale 与时区落到环境变量的脚本`,
    '',
    '## 怎么用',
    '1. 装 DSH 插件：`dsh plugin --profile web add iamchinese`',
    '2. 载入这份档案：`iamchinese verify --profile 这个目录`',
    '3. 想改机器：照 `iamchinese plan` 打出来的清单一条条来',
    '',
    '## 人设摘要',
    '```',
    renderCard(persona),
    '```',
    '',
    ...(options.from ? [`来自：${options.from}`, ''] : []),
    ...(options.note ? [`附言：${options.note}`, ''] : []),
  ].join('\n')
  files.push(await writeAtomic(join(target, 'README.md'), readme))

  const message = [
    `给你一份中国用户人设（测试环境用）：${persona.name}，${persona.city}${persona.district}，${persona.carrier}。`,
    `装上 iamchinese 之后执行：iamchinese verify --profile "${target}"`,
    '里面的身份证/手机号是拼出来的样例，别拿去注册或实名。',
  ].join('\n')

  return { dir: target, files, message }
}
