import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildPersona,
  idCardRegion,
  idCheckDigit,
  isConsistent,
  makeIdCard,
  personaConsistency,
  personaEnv,
  personaEnvFile,
  personaFromJSON,
  personaPowershell,
  personaToJSON,
  renderCard,
} from '../lib/core/persona.js'
import { CARRIERS, DEFAULT_PERSONA_SEED, REGIONS } from '../lib/core/data.js'

test('校验位符合 GB 11643 的公开样例', () => {
  assert.equal(idCheckDigit('11010519491231002'), 'X')
})

test('校验位只接受 17 位数字', () => {
  assert.throws(() => idCheckDigit('1101051949123100'), /17 digits/)
  assert.throws(() => idCheckDigit('1101051949123100a'), /17 digits/)
})

test('身份证第 17 位奇偶跟着性别走', () => {
  const male = makeIdCard('110105', '1990-05-06', true, 7)
  const female = makeIdCard('110105', '1990-05-06', false, 7)
  assert.equal(Number(male[16]) % 2, 1)
  assert.equal(Number(female[16]) % 2, 0)
  assert.equal(male.length, 18)
  assert.equal(idCardRegion(male), '110105')
})

test('makeIdCard 拒绝非法输入', () => {
  assert.throws(() => makeIdCard('11010', '1990-05-06', true), /6 digits/)
  assert.throws(() => makeIdCard('110105', '1990/05/06', true), /YYYY-MM-DD/)
})

test('idCardRegion 对长度不对的号返回 null', () => {
  assert.equal(idCardRegion('110105'), null)
  assert.equal(idCardRegion('abcdefghijklmnopqr'), null)
})

test('默认种子生成的人设六项自洽全绿', () => {
  const persona = buildPersona()
  const checks = personaConsistency(persona)
  assert.equal(checks.length, 6)
  for (const check of checks) {
    assert.equal(check.ok, true, `${check.label} 未通过：${check.note}`)
  }
  assert.equal(isConsistent(persona), true)
})

test('同一个种子结果完全一致，换种子就变', () => {
  assert.deepEqual(buildPersona(42), buildPersona(42))
  assert.notDeepEqual(buildPersona(42), buildPersona(43))
})

test('人设字段和静态表对得上', () => {
  const persona = buildPersona(DEFAULT_PERSONA_SEED)
  const region = REGIONS.find(item => item[3] === persona.regionCode)
  assert.ok(region, '区划码必须来自 REGIONS 表')
  assert.equal(persona.province, region[0])
  assert.equal(persona.city, region[1])
  assert.equal(persona.district, region[2])

  const carrier = CARRIERS.find(item => item.name === persona.carrier)
  assert.ok(carrier)
  assert.equal(persona.asn, carrier.asn)
  assert.ok(carrier.prefixes.includes(persona.phone.slice(0, 3)))
  assert.match(persona.phone, /^1\d{10}$/)
})

test('区划码都是 6 位数字且不重复', () => {
  const codes = REGIONS.map(item => item[3])
  assert.equal(new Set(codes).size, codes.length)
  for (const code of codes) assert.match(code, /^\d{6}$/)
})

test('每个运营商都有号段、ASN、org', () => {
  for (const carrier of CARRIERS) {
    assert.ok(carrier.prefixes.length > 0)
    assert.match(carrier.asn, /^AS\d+$/)
    assert.ok(carrier.org.length > 0)
  }
})

test('单位名跟着城市走，不出现错位', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const persona = buildPersona(seed)
    assert.ok(!persona.employer.includes('{'), '模板占位必须全部替换掉')
    if (persona.employer.includes(persona.city)) continue
    assert.equal(persona.employer, '无固定单位')
  }
})

test('出口地址落在 TEST-NET-3 文档段里', () => {
  for (const seed of [7, 8, 9]) {
    assert.match(buildPersona(seed).egressIp, /^203\.0\.113\.\d{1,3}$/)
  }
})

test('env / env.ps1 / 摘要都按人设出文本', () => {
  const persona = buildPersona()
  const env = personaEnv(persona)
  assert.equal(env.LANG, 'zh_CN.UTF-8')
  assert.equal(env.LC_ALL, 'zh_CN.UTF-8')
  assert.equal(env.TZ, 'Asia/Shanghai')
  assert.equal(personaEnvFile(persona).split('\n').filter(Boolean).length, 4)
  const ps = personaPowershell(persona)
  assert.match(ps, /Set-Culture -CultureInfo "zh-Hans-CN"/)
  assert.match(ps, /tzutil \/s "Asia\/Shanghai"/)
  assert.match(renderCard(persona), /姓名/)
})

test('落盘结构能原样读回', () => {
  const persona = buildPersona(1234)
  const back = personaFromJSON(personaToJSON(persona))
  assert.deepEqual(back, persona)
})

test('读回时缺块就报错，不猜默认值', () => {
  const json = personaToJSON(buildPersona())
  delete json.address
  assert.throws(() => personaFromJSON(json), /address must be an object/)
  const badBirth = personaToJSON(buildPersona())
  badBirth.birth_date = '1990/05/06'
  assert.throws(() => personaFromJSON(badBirth), /YYYY-MM-DD/)
})
