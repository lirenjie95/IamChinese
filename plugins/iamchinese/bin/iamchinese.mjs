#!/usr/bin/env node
/**
 * 命令行入口：不装插件也能用。
 *
 *   iamchinese persona [--seed N] [--json]
 *   iamchinese plan    [--out DIR] [--seed N]
 *   iamchinese apply   [--out DIR] [--seed N]
 *   iamchinese verify  [--profile DIR|FILE] [--no-env]
 *   iamchinese share   [--out DIR] [--seed N] [--from NAME] [--note TEXT]
 *   iamchinese undo    [--out DIR]
 *
 * 退出码：0 全部通过；1 自检有红项（人设不自洽或环境没对上）。CI 里能直接判。
 * @module iamchinese/cli
 */

import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildPersona, personaConsistency, renderCard } from '../lib/core/persona.js'
import { DEFAULT_PERSONA_SEED } from '../lib/core/data.js'
import { compareEnvironment, readEnvironment, renderEnvironmentReport } from '../lib/core/environment.js'
import {
  planText,
  readProfile,
  removeProfile,
  verifyText,
  writeProfile,
  writeShareBundle,
} from '../lib/core/profile.js'

const DEFAULT_OUT_DIR = '.iamchinese'

const USAGE = `iamchinese —— 把环境配成一套自洽的中国用户人设

用法：
  iamchinese persona [--seed N] [--json]        生成一份人设（不写文件）
  iamchinese plan    [--out DIR] [--seed N]     打印落地清单
  iamchinese apply   [--out DIR] [--seed N]     写 cn-profile.json / env.sh / env.ps1
  iamchinese verify  [--profile DIR|FILE]       自检 + 与当前环境对比（红了退出码 1）
  iamchinese share   [--out DIR] [--seed N]     导出分享包（可发朋友）
  iamchinese undo    [--out DIR]                删掉三件套

选项：
  --seed N       复现用种子，默认 ${DEFAULT_PERSONA_SEED}
  --out DIR      档案/分享包目录，默认 ${DEFAULT_OUT_DIR}
  --profile P    要检查的档案目录或 json 路径
  --json         persona 子命令输出 JSON
  --no-env       verify 只查人设自洽，不读当前环境
  --from NAME    share 的署名
  --note TEXT    share 的附言
  -h, --help     这段`

function parse(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      seed: { type: 'string' },
      out: { type: 'string' },
      profile: { type: 'string' },
      json: { type: 'boolean', default: false },
      'no-env': { type: 'boolean', default: false },
      from: { type: 'string' },
      note: { type: 'string' },
      help: { type: 'boolean', short: 'h', default: false },
    },
  })
  const seed = values.seed === undefined ? DEFAULT_PERSONA_SEED : Number(values.seed)
  if (!Number.isInteger(seed)) throw new Error(`--seed 要是整数，收到 ${values.seed}`)
  return { command: positionals[0] ?? '', values, seed }
}

/**
 * CLI 主体。返回退出码而不是直接 process.exit，方便测试里直接调。
 * @param {string[]} argv
 * @returns {Promise<number>}
 */
export async function main(argv = process.argv.slice(2)) {
  const { command, values, seed } = parse(argv)

  if (values.help || !command) {
    process.stdout.write(`${USAGE}\n`)
    return 0
  }

  switch (command) {
    case 'persona': {
      const persona = buildPersona(seed)
      if (values.json) {
        // checks 一起给：调用方（包括 Claude/DSH 的模型）不该自己再算一遍六项自洽
        const payload = { ...persona, seed, checks: personaConsistency(persona) }
        process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`)
      } else {
        process.stdout.write(`${renderCard(persona)}\n\n`)
        process.stdout.write(`种子 ${seed}（同一个种子结果一致）\n`)
      }
      return 0
    }

    case 'plan': {
      const dir = resolve(values.out ?? DEFAULT_OUT_DIR)
      process.stdout.write(`${planText(buildPersona(seed), dir)}\n`)
      return 0
    }

    case 'apply': {
      const dir = resolve(values.out ?? DEFAULT_OUT_DIR)
      const persona = buildPersona(seed)
      const written = await writeProfile(dir, persona)
      process.stdout.write(`已写入：\n${written.files.join('\n')}\n\n`)
      const failed = personaConsistency(persona).filter(item => !item.ok)
      if (failed.length) {
        process.stderr.write(`自检未过：${failed.map(item => item.label).join('、')}\n`)
        return 1
      }
      process.stdout.write('六项自洽检查通过。下一步：iamchinese verify\n')
      return 0
    }

    case 'verify': {
      const target = values.profile ?? resolve(values.out ?? DEFAULT_OUT_DIR)
      const loaded = await readProfile(target)
      const environment = values['no-env']
        ? null
        : compareEnvironment(loaded.persona, readEnvironment())
      process.stdout.write(`${verifyText(loaded.persona, environment)}\n\n档案：${loaded.path}\n`)
      const consistent = personaConsistency(loaded.persona).every(item => item.ok)
      const matched = environment ? environment.matched : true
      if (!consistent || !matched) {
        if (environment && !environment.matched) {
          process.stderr.write(`\n${renderEnvironmentReport(environment)}\n`)
        }
        return 1
      }
      return 0
    }

    case 'share': {
      const dir = resolve(values.out ?? 'iamchinese-share')
      const persona = buildPersona(seed)
      const bundle = await writeShareBundle(dir, persona, { from: values.from, note: values.note })
      process.stdout.write(`分享包：${bundle.dir}\n${bundle.files.join('\n')}\n\n可以直接发的话：\n${bundle.message}\n`)
      return 0
    }

    case 'undo': {
      const dir = resolve(values.out ?? DEFAULT_OUT_DIR)
      const removed = await removeProfile(dir)
      process.stdout.write(removed.length ? `已删除：\n${removed.join('\n')}\n` : `没有可删的文件：${dir}\n`)
      return 0
    }

    default: {
      process.stderr.write(`未知子命令：${command}\n\n${USAGE}\n`)
      return 2
    }
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false
if (invokedDirectly) {
  main().then(code => { process.exitCode = code }).catch(error => {
    process.stderr.write(`出错了：${error?.message ?? error}\n`)
    process.exitCode = 1
  })
}
