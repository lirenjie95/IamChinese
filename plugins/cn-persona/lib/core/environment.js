/**
 * 读当前这台机器实际是什么环境，并和人设逐项对比。
 *
 * 只用 Node 自带的 Intl / process.env：不写注册表、不改系统设置、不装依赖。
 * 「把机器变成中国用户」是照清单手动做的事（或者用 profile.js 生成的脚本），
 * 这个模块只负责回答「现在还差哪几项」，以及每项该怎么改。
 * @module dsh-cn-persona/core/environment
 */

import { LOCALE_BCP47, LOCALE_POSIX, LOCALE_WINDOWS, TIMEZONE } from './data.js'

/**
 * 采集当前环境。字段缺失一律给空串/undefined，不用默认值伪造。
 * @param {NodeJS.ProcessEnv} [env] 便于测试注入。
 * @param {() => Intl.ResolvedDateTimeFormatOptions} [resolve] 便于测试注入。
 * @returns {{ locale: string, timeZone: string, lang: string, lcAll: string, tz: string, platform: string, nodeVersion: string }}
 */
export function readEnvironment(env = process.env, resolve = () => Intl.DateTimeFormat().resolvedOptions()) {
  const resolved = resolve() ?? {}
  return {
    locale: String(resolved.locale ?? ''),
    timeZone: String(resolved.timeZone ?? ''),
    lang: String(env.LANG ?? ''),
    lcAll: String(env.LC_ALL ?? ''),
    tz: String(env.TZ ?? ''),
    platform: process.platform,
    nodeVersion: process.versions.node,
  }
}

/**
 * 把 `zh-Hans-CN` / `zh_CN` / `Chinese (Simplified)_China.936` 都归一成两个字母的
 * 地区码。归一化失败返回 null，而不是硬猜一个 CN。
 * @param {string} value
 * @returns {string|null}
 */
export function regionOf(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const windows = /chinese \(simplified\)_china/i.test(text)
  if (windows) return 'CN'
  // POSIX 写法带编码后缀（zh_CN.UTF-8），BCP47 带脚本段（zh-Hans-CN）。
  const bare = text.split('.')[0]
  const tags = bare.replaceAll('_', '-').split('-').filter(Boolean)
  // 第 0 段永远是语言本身，不是地区，所以从倒数第二段往回找。
  for (let i = tags.length - 1; i >= 1; i -= 1) {
    const tag = tags[i]
    if (/^[A-Za-z]{2}$/.test(tag) && !/^(hans|hant|latn|cyrl)$/i.test(tag)) return tag.toUpperCase()
  }
  return null
}

/**
 * 逐项对比人设与当前环境。
 *
 * `ok: false` 的项都带 `fix`，说明照着改什么：环境变量就 export，Windows 区域就
 * Set-Culture。不自动执行——改系统区域是用户自己的决定。
 * @param {object} persona
 * @param {ReturnType<typeof readEnvironment>} [environment]
 * @returns {{ matched: boolean, items: Array<{ label: string, ok: boolean, current: string, want: string, fix: string }> }}
 */
export function compareEnvironment(persona, environment = readEnvironment()) {
  const items = []

  const localeRegion = regionOf(environment.locale)
  items.push({
    label: '界面 locale',
    ok: localeRegion === 'CN',
    current: environment.locale || '(读不到)',
    want: persona.localeBcp47 || LOCALE_BCP47,
    fix: `set LANG=${persona.localePosix || LOCALE_POSIX}`,
  })

  items.push({
    label: '时区',
    ok: environment.timeZone === (persona.timezone || TIMEZONE),
    current: environment.timeZone || '(读不到)',
    want: persona.timezone || TIMEZONE,
    fix: `tzutil /s "${persona.timezone || TIMEZONE}"`,
  })

  items.push({
    label: 'LANG',
    ok: environment.lang === (persona.localePosix || LOCALE_POSIX),
    current: environment.lang || '(未设置)',
    want: persona.localePosix || LOCALE_POSIX,
    fix: `export LANG=${persona.localePosix || LOCALE_POSIX}`,
  })

  items.push({
    label: 'TZ',
    ok: environment.tz === (persona.timezone || TIMEZONE),
    current: environment.tz || '(未设置)',
    want: persona.timezone || TIMEZONE,
    fix: `export TZ=${persona.timezone || TIMEZONE}`,
  })

  if (environment.platform === 'win32') {
    const want = persona.localeWindows || LOCALE_WINDOWS
    items.push({
      label: 'Windows 显示语言',
      ok: localeRegion === 'CN',
      current: environment.locale || '(读不到)',
      want,
      fix: `Set-Culture -CultureInfo "${persona.localeBcp47 || LOCALE_BCP47}"`,
    })
  }

  return { matched: items.every(item => item.ok), items }
}

/**
 * 渲染成给人看的中文报告。
 * @param {ReturnType<typeof compareEnvironment>} report
 * @returns {string}
 */
export function renderEnvironmentReport(report) {
  const head = report.matched ? '当前环境与人设一致。' : '当前环境与人设不一致的地方：'
  const lines = report.items.map(item => {
    const mark = item.ok ? '✓' : '✗'
    const tail = item.ok ? '' : `  → ${item.fix}`
    return `${mark} ${item.label}：${item.current}（要 ${item.want}）${tail}`
  })
  return [head, ...lines].join('\n')
}
