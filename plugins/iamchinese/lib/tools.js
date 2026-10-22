/**
 * 五个面向模型的工具。
 *
 * 这里不 `import … from '@deepseek-ai/dsh-tools'`：插件一旦静态 import 宿主包，就必须在
 * profile 的 node_modules 里能解析到它——本地 link 装的插件解析不到，整个插件会加载
 * 失败。所以定义直接按宿主 `tools.register()` 的契约手写。
 *
 * 两个字段的形状**不一样**，抄错就会在调用时炸掉：
 * - `parameters` 是宿主的**参数 DSL**（隐式属性表）：`{ 参数名: 值节点 }`。值节点形如
 *   `{ type: 'string' }`、`{ type: 'object', additionalProperties: false, properties: {…} }`、
 *   `{ type: 'array', items: {…} }`、`{ oneOf: [节点, 节点] }`，可选 `required: true`
 *   标在该参数自己的节点上。宿主用 `parameterSchemaSpecToJsonSchema()` 把它编译成
 *   JSON Schema；把裸 JSON Schema 塞进来会在 `validateArgs` 里抛
 *   `UNSUPPORTED_SCHEMA: parameters.type must be a value schema object`。
 * - `output.schema` 是**裸 JSON Schema**，只允许
 *   type/oneOf/properties/required/additionalProperties/items/enum/const + 注解。
 * @module iamchinese/tools
 */

import { resolve } from 'node:path'
import { buildPersona, personaConsistency, renderCard } from './core/persona.js'
import { DEFAULT_PERSONA_SEED } from './core/data.js'
import { compareEnvironment, readEnvironment } from './core/environment.js'
import { planText, readProfile, verifyText, writeProfile, writeShareBundle } from './core/profile.js'

export const DEFAULT_OUT_DIR = '.iamchinese'

const jsonText = value => [{ type: 'text', text: JSON.stringify(value, null, 2) }]
const plainText = (_args, value) => [{ type: 'text', text: value.summary }]

/** 参数 DSL：字符串节点。 */
const str = description => ({ type: 'string', description })
/** 参数 DSL：整数节点。 */
const int = description => ({ type: 'integer', description })
/** 参数 DSL：布尔节点。 */
const bool = description => ({ type: 'boolean', description })

/** 输出用裸 JSON Schema：对象根 + 可选的必填列表，默认不许多余字段。 */
const outputObject = (properties, required = []) => ({
  type: 'object',
  additionalProperties: false,
  properties,
  ...(required.length > 0 ? { required } : {}),
})

/** `cn_persona_check` 输出的六项检查数组。 */
const checkArraySchema = {
  type: 'array',
  items: outputObject(
    { label: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } },
    ['label', 'ok', 'note'],
  ),
}

/** 五个工具共用的输出根：必有 `summary`，其余字段按工具补。 */
const summarySchema = (extra, required = ['summary']) => outputObject(
  { summary: { type: 'string' }, ...extra },
  required,
)

/**
 * 建全部工具。
 * @returns {object[]} 可直接 `ctx.tools.register()` 的定义数组。
 */
export function createCnTools() {
  const cnPersona = {
    name: 'cn_persona',
    description: '生成一份「中国用户」人设：姓名、性别、出生日期、身份证（含校验位）、'
      + '手机号（号段与运营商/ASN 绑定）、真实区划码对应的省市区地址、邮箱、职业与单位、'
      + 'locale 与时区、书写约定。同一 seed 结果完全一致，所以复现和分享都靠 seed。'
      + '生成后立刻调 cn_persona_check 验一遍六项自洽——这一步不是可选的。',
    parameters: {
      seed: int(`复现用种子，默认 ${DEFAULT_PERSONA_SEED}。同一个种子在同一版本内稳定。`),
      brief: bool('只返回一行摘要而不是完整 JSON（默认 false，返回完整人设）。'),
    },
    output: {
      schema: summarySchema({ persona: { type: 'object', additionalProperties: true } }),
      render: (args, value) => (args.brief ? plainText(args, value) : jsonText(value)),
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const persona = buildPersona(args.seed ?? DEFAULT_PERSONA_SEED)
      return { summary: renderCard(persona), persona }
    },
  }

  const cnPersonaPlan = {
    name: 'cn_persona_plan',
    description: '打印把环境配成中国口径的落地清单：系统区域与时区怎么设、浏览器语言列表'
      + '怎么排、书写约定怎么对齐、哪几件事不该做、验收看什么。只读不写，适合先给人看'
      + '再决定要不要真改机器。',
    parameters: {
      out_dir: str(`档案目录，默认 ${DEFAULT_OUT_DIR}。`),
      seed: int('用哪份人设生成清单，默认与 cn_persona 相同。'),
    },
    output: {
      schema: summarySchema({ out_dir: { type: 'string' } }, ['summary', 'out_dir']),
      render: plainText,
    },
    timeoutMs: 10_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const dir = resolve(args.out_dir ?? DEFAULT_OUT_DIR)
      const persona = buildPersona(args.seed ?? DEFAULT_PERSONA_SEED)
      return { summary: planText(persona, dir), out_dir: dir }
    },
  }

  const cnPersonaApply = {
    name: 'cn_persona_apply',
    description: '把一份人设写成三个文本文件：cn-profile.json（档案本体）、env.sh、env.ps1'
      + '（locale 与时区的等价命令）。只写这三个文件，不碰系统设置、不装东西、不改注册表。'
      + '写完用 cn_persona_check 复验。',
    parameters: {
      out_dir: str(`输出目录，默认 ${DEFAULT_OUT_DIR}。`),
      seed: int('用哪份人设，默认与 cn_persona 相同。'),
    },
    output: {
      schema: summarySchema({
        out_dir: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
      }, ['summary', 'out_dir', 'files']),
      render: plainText,
    },
    timeoutMs: 15_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const dir = resolve(args.out_dir ?? DEFAULT_OUT_DIR)
      const persona = buildPersona(args.seed ?? DEFAULT_PERSONA_SEED)
      const written = await writeProfile(dir, persona)
      const failed = personaConsistency(persona).filter(item => !item.ok)
      const tail = failed.length
        ? `注意：这份人设没通过 ${failed.map(item => item.label).join('、')}。`
        : '六项自洽检查通过。'
      return {
        summary: `已写入 ${written.files.length} 个文件：\n${written.files.join('\n')}\n\n${tail}`,
        out_dir: written.dir,
        files: written.files,
      }
    },
  }

  const cnPersonaCheck = {
    name: 'cn_persona_check',
    description: '读回一份档案，做两件事：一是六项人设自洽检查（locale↔时区、身份证区划↔地址、'
      + '顺序码↔性别、号段↔运营商、号段↔ASN、手机号长度）；二是和当前机器对比 locale/时区/'
      + 'LANG/TZ，没对上的项给出该执行的命令（只是建议，不执行）。改完之后必须再跑一次。',
    parameters: {
      profile: str(`档案目录或 cn-profile.json 路径，默认 ${DEFAULT_OUT_DIR}。`),
      include_environment: bool('是否对比当前环境（默认 true）。要纯看档案时就关掉。'),
    },
    output: {
      schema: summarySchema({
        path: { type: 'string' },
        consistent: { type: 'boolean' },
        checks: checkArraySchema,
        environment_matched: { type: 'boolean' },
      }, ['summary', 'path', 'consistent', 'checks']),
      render: plainText,
    },
    timeoutMs: 15_000,
    isConcurrencySafe: () => true,
    async execute(args) {
      const loaded = await readProfile(resolve(args.profile ?? DEFAULT_OUT_DIR))
      const checks = personaConsistency(loaded.persona)
      const consistent = checks.every(item => item.ok)
      let environment = null
      if (args.include_environment !== false) {
        environment = compareEnvironment(loaded.persona, readEnvironment())
      }
      return {
        summary: `${verifyText(loaded.persona, environment)}\n\n档案：${loaded.path}`,
        path: loaded.path,
        consistent,
        checks,
        ...(environment ? { environment_matched: environment.matched } : {}),
      }
    },
  }

  const cnPersonaShare = {
    name: 'cn_persona_share',
    description: '把一份人设导成能直接发给朋友的分享包：cn-profile.json、env.sh、env.ps1、'
      + 'README.md（写清这是样例、不能拿去注册或实名），外加一句可以直接粘贴的话。'
      + '包里不放任何凭据和真实号码。',
    parameters: {
      out_dir: str('分享包目录，默认 ./iamchinese-share。'),
      seed: int('用哪份人设，默认与 cn_persona 相同。'),
      from: str('署名，写进 README 的「来自」。'),
      note: str('附言，一句话。'),
    },
    output: {
      schema: summarySchema({
        dir: { type: 'string' },
        files: { type: 'array', items: { type: 'string' } },
        message: { type: 'string' },
      }, ['summary', 'dir', 'files', 'message']),
      render: (_args, value) => [{ type: 'text', text: `${value.summary}\n\n${value.message}` }],
    },
    timeoutMs: 20_000,
    isConcurrencySafe: () => false,
    async execute(args) {
      const dir = resolve(args.out_dir ?? 'iamchinese-share')
      const persona = buildPersona(args.seed ?? DEFAULT_PERSONA_SEED)
      const bundle = await writeShareBundle(dir, persona, { from: args.from, note: args.note })
      return {
        summary: `分享包已写到 ${bundle.dir}：\n${bundle.files.join('\n')}`,
        dir: bundle.dir,
        files: bundle.files,
        message: bundle.message,
      }
    },
  }

  return [cnPersona, cnPersonaPlan, cnPersonaApply, cnPersonaCheck, cnPersonaShare]
}

export const CN_TOOL_NAMES = [
  'cn_persona',
  'cn_persona_plan',
  'cn_persona_apply',
  'cn_persona_check',
  'cn_persona_share',
]
