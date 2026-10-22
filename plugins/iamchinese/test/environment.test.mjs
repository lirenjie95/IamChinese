import assert from 'node:assert/strict'
import { test } from 'node:test'

import { compareEnvironment, readEnvironment, regionOf, renderEnvironmentReport } from '../lib/core/environment.js'
import { buildPersona } from '../lib/core/persona.js'

const CN_ENV = {
  locale: 'zh-Hans-CN',
  timeZone: 'Asia/Shanghai',
  lang: 'zh_CN.UTF-8',
  lcAll: 'zh_CN.UTF-8',
  tz: 'Asia/Shanghai',
  platform: 'win32',
  nodeVersion: '24.0.0',
}

const US_ENV = {
  locale: 'en-US',
  timeZone: 'UTC',
  lang: 'en_US.UTF-8',
  lcAll: 'en_US.UTF-8',
  tz: 'UTC',
  platform: 'linux',
  nodeVersion: '24.0.0',
}

test('regionOf 认得 POSIX、BCP47、Windows 显示名三种写法', () => {
  assert.equal(regionOf('zh-Hans-CN'), 'CN')
  assert.equal(regionOf('zh_CN.UTF-8'), 'CN')
  assert.equal(regionOf('Chinese (Simplified)_China.936'), 'CN')
  assert.equal(regionOf('en-US'), 'US')
  assert.equal(regionOf(''), null)
  assert.equal(regionOf('es-419'), null)
})

test('脚本子标签不遮蔽地区标签', () => {
  assert.equal(regionOf('zh-Hans'), null)
  assert.equal(regionOf('zh-Hant-TW'), 'TW')
})

test('readEnvironment 把 Intl 与环境变量都收进来', () => {
  const env = readEnvironment({ LANG: 'zh_CN.UTF-8', LC_ALL: 'zh_CN.UTF-8', TZ: 'Asia/Shanghai' },
    () => ({ locale: 'zh-Hans-CN', timeZone: 'Asia/Shanghai' }))
  assert.equal(env.locale, 'zh-Hans-CN')
  assert.equal(env.timeZone, 'Asia/Shanghai')
  assert.equal(env.lang, 'zh_CN.UTF-8')
  assert.equal(env.platform, process.platform)
})

test('国内环境与人设一致', () => {
  const report = compareEnvironment(buildPersona(), CN_ENV)
  assert.equal(report.matched, true)
  for (const item of report.items) assert.equal(item.ok, true, `${item.label} 应当通过`)
})

test('en-US + UTC 会被逐项判红，并给出该执行的命令', () => {
  const report = compareEnvironment(buildPersona(), US_ENV)
  assert.equal(report.matched, false)
  const failed = report.items.filter(item => !item.ok).map(item => item.label)
  assert.ok(failed.includes('界面 locale'))
  assert.ok(failed.includes('时区'))
  for (const item of report.items.filter(entry => !entry.ok)) {
    assert.ok(item.fix.length > 0, `${item.label} 缺 fix`)
  }
})

test('只改 LANG 不改 TZ 时，只红时区那一项', () => {
  const report = compareEnvironment(buildPersona(), { ...CN_ENV, tz: 'UTC' })
  assert.equal(report.matched, false)
  const failed = report.items.filter(item => !item.ok).map(item => item.label)
  assert.deepEqual(failed, ['TZ'])
})

test('Windows 平台才追加显示语言那一项', () => {
  assert.ok(compareEnvironment(buildPersona(), CN_ENV).items.some(item => item.label === 'Windows 显示语言'))
  assert.ok(!compareEnvironment(buildPersona(), US_ENV).items.some(item => item.label === 'Windows 显示语言'))
})

test('报告文本带勾叉和修法', () => {
  const report = compareEnvironment(buildPersona(), US_ENV)
  const text = renderEnvironmentReport(report)
  assert.match(text, /不一致/)
  assert.match(text, /✗ 时区/)
  assert.match(text, /tzutil/)
})
