/**
 * 生成一份「中国用户」人设，并校验它内部是否自洽。
 *
 * 三块拼图必须对齐，这是这类伪造最常见的露馅点，也是这个模块存在的理由：
 *  1. 身份证前 6 位 ← 收货地址的省市区；第 17 位奇偶 ← 性别；第 18 位是校验位
 *  2. 手机号前 3 位 ← 运营商；运营商 ← ASN / org
 *  3. locale ← 时区 ← 书写约定
 * 单看每个字段都像真的，凑在一起互相矛盾就是假的，所以 `personaConsistency()`
 * 是这份数据的验收标准，不是可选装饰。
 * @module iamchinese/core/persona
 */

import {
  CARRIERS,
  DEFAULT_CONVENTIONS,
  DEFAULT_PERSONA_SEED,
  EMAIL_DOMAINS,
  EGRESS_IP_PREFIX,
  GIVEN_CHARS_FEMALE,
  GIVEN_CHARS_MALE,
  LOCALE_BCP47,
  LOCALE_POSIX,
  LOCALE_WINDOWS,
  OCCUPATIONS,
  REGIONS,
  ROADS,
  SURNAMES,
  SURNAME_PINYIN,
  TIMEZONE,
  UTC_OFFSET_MINUTES,
} from './data.js'
import { makeRng } from './rng.js'

const ID_WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const ID_CHECK_CHARS = '10X98765432'

/**
 * 按 GB 11643 / ISO 7064 MOD 11-2 算校验位。
 * @param {string} body17 前 17 位数字。
 * @returns {string} 一位校验字符，可能是 'X'。
 */
export function idCheckDigit(body17) {
  if (typeof body17 !== 'string' || body17.length !== 17 || !/^\d{17}$/.test(body17)) {
    throw new Error('id body must be 17 digits')
  }
  let total = 0
  for (let i = 0; i < 17; i += 1) total += Number(body17[i]) * ID_WEIGHTS[i]
  return ID_CHECK_CHARS[total % 11]
}

/**
 * 拼一个结构合法的 18 位身份证号。
 * @param {string} regionCode 6 位区划码。
 * @param {string} birthDate `YYYY-MM-DD`。
 * @param {boolean} male 性别：决定第 17 位奇偶。
 * @param {number} [sequence] 只影响顺序码，方便复现。
 * @returns {string}
 */
export function makeIdCard(regionCode, birthDate, male, sequence = 0) {
  if (typeof regionCode !== 'string' || !/^\d{6}$/.test(regionCode)) {
    throw new Error('regionCode must be 6 digits')
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) {
    throw new Error('birthDate must be YYYY-MM-DD')
  }
  const seq = (Math.abs(Math.trunc(sequence)) % 100) * 2 + (male ? 1 : 0) + 10
  const body = regionCode + String(birthDate).replaceAll('-', '') + String(seq).padStart(3, '0')
  return body + idCheckDigit(body)
}

/**
 * 取回身份证前 6 位区划码。
 * @param {string} idNumber
 * @returns {string|null} 长度或字符不对时返回 null。
 */
export function idCardRegion(idNumber) {
  if (typeof idNumber !== 'string' || idNumber.length !== 18) return null
  const head = idNumber.slice(0, 6)
  return /^\d{6}$/.test(head) ? head : null
}

/** 1975-01-01 起按天偏移，全程 UTC，避开本地时区把生日挤到前一天。 */
function birthFromOffset(days) {
  const base = Date.UTC(1975, 0, 1)
  const d = new Date(base + days * 86400000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function makePhone(rng, carrier) {
  const prefix = rng.pick(carrier.prefixes)
  let tail = ''
  for (let i = 0; i < 8; i += 1) tail += String(rng.int(10))
  return prefix + tail
}

/**
 * 生成一份人设。给定 seed 则完全可复现。
 * @param {number} [seed] 默认 DEFAULT_PERSONA_SEED。
 * @returns {object} 人设对象，字段见 README 的「人设字段」表。
 */
export function buildPersona(seed = DEFAULT_PERSONA_SEED) {
  const rng = makeRng(seed)

  const surname = rng.pick(SURNAMES)
  const male = rng.chance(0.52)
  const pool = male ? GIVEN_CHARS_MALE : GIVEN_CHARS_FEMALE
  let given = rng.pick(pool)
  if (rng.chance(0.55)) given += rng.pick(pool)
  const name = surname + given

  const [province, city, district, regionCode] = rng.pick(REGIONS)

  const birthDate = birthFromOffset(rng.int(365 * 31))
  const idCard = makeIdCard(regionCode, birthDate, male, rng.int(1000))

  const carrier = rng.pick(CARRIERS)
  const phone = makePhone(rng, carrier)

  const road = rng.pick(ROADS)
  const address = `${road}${1 + rng.int(998)}号${1 + rng.int(29)}栋${1 + rng.int(27)}0${1 + rng.int(9)}室`

  const local = SURNAME_PINYIN[surname] ?? 'user'
  const email = `${local}${1970 + rng.int(40)}${100 + rng.int(899)}@${rng.pick(EMAIL_DOMAINS)}`

  const [occupation, employerTemplate] = rng.pick(OCCUPATIONS)
  const employer = employerTemplate.replaceAll('{city}', city).replaceAll('{district}', district)

  return {
    name,
    gender: male ? '男' : '女',
    birthDate,
    phone,
    idCard,
    province,
    city,
    district,
    regionCode,
    address,
    email,
    occupation,
    employer,
    carrier: carrier.name,
    asn: carrier.asn,
    org: carrier.org,
    egressIp: `${EGRESS_IP_PREFIX}${2 + rng.int(248)}`,
    localeBcp47: LOCALE_BCP47,
    localePosix: LOCALE_POSIX,
    localeWindows: LOCALE_WINDOWS,
    timezone: TIMEZONE,
    utcOffsetMinutes: UTC_OFFSET_MINUTES,
    conventions: { ...DEFAULT_CONVENTIONS },
  }
}

/**
 * 逐条检查人设内部是否自洽。
 * @param {object} persona
 * @returns {Array<{ label: string, ok: boolean, note: string }>}
 */
export function personaConsistency(persona) {
  const idRegion = idCardRegion(persona.idCard)
  const prefix = String(persona.phone).slice(0, 3)
  const ownCarrier = CARRIERS.find(c => c.name === persona.carrier)

  return [
    {
      label: 'locale ↔ 时区',
      ok: String(persona.localeBcp47).endsWith('-CN') && persona.timezone === TIMEZONE,
      note: `${persona.localeBcp47} / ${persona.timezone}`,
    },
    {
      label: '身份证区划 ↔ 地址',
      ok: idRegion === persona.regionCode,
      note: `${idRegion ?? '(空)'} vs ${persona.regionCode}`,
    },
    {
      label: '顺序码 ↔ 性别',
      ok: Number(String(persona.idCard)[16]) % 2 === (persona.gender === '男' ? 1 : 0),
      note: `第 17 位 ${String(persona.idCard)[16]} / ${persona.gender}`,
    },
    {
      label: '号段 ↔ 运营商',
      ok: Boolean(ownCarrier && ownCarrier.prefixes.includes(prefix)),
      note: `${prefix} / ${persona.carrier}`,
    },
    {
      label: '号段 ↔ ASN',
      ok: Boolean(ownCarrier && ownCarrier.asn === persona.asn),
      note: `${persona.asn} ${persona.org} / ${persona.carrier}`,
    },
    {
      label: '手机号长度',
      ok: /^\d{11}$/.test(String(persona.phone)),
      note: `${String(persona.phone).length} 位`,
    },
  ]
}

/**
 * 全部检查是否通过。
 * @param {object} persona
 * @returns {boolean}
 */
export function isConsistent(persona) {
  return personaConsistency(persona).every(item => item.ok)
}

/**
 * 落地成系统环境变量（POSIX / Git Bash / WSL）。
 * @param {object} persona
 * @returns {Record<string, string>}
 */
export function personaEnv(persona) {
  return {
    LANG: persona.localePosix,
    LC_ALL: persona.localePosix,
    LC_CTYPE: persona.localePosix,
    TZ: persona.timezone,
  }
}

/**
 * env 文件正文：`KEY=value` 一行一个，末尾带换行。
 * @param {object} persona
 * @returns {string}
 */
export function personaEnvFile(persona) {
  const env = personaEnv(persona)
  return Object.keys(env).map(key => `${key}=${env[key]}`).join('\n') + '\n'
}

/**
 * Windows 下的等价命令。只有 tzutil 需要管理员权限。
 * @param {object} persona
 * @returns {string}
 */
export function personaPowershell(persona) {
  return [
    `Set-Culture -CultureInfo "${persona.localeBcp47}"`,
    `Set-WinUILanguageOverride -Language "${persona.localeBcp47}"`,
    `tzutil /s "${persona.timezone}"`,
    `$env:LANG = "${persona.localePosix}"`,
    `$env:TZ = "${persona.timezone}"`,
  ].join('\n')
}

/**
 * 一行式摘要，给 CLI 与工具结果用。
 * @param {object} persona
 * @returns {string}
 */
export function renderCard(persona) {
  const c = persona.conventions ?? {}
  return [
    `姓名      ${persona.name}（${persona.gender}，${persona.birthDate}）`,
    `手机      ${persona.phone}（${persona.carrier}）`,
    `身份证    ${persona.idCard}`,
    `地址      ${persona.province}${persona.city}${persona.district}${persona.address}`,
    `邮箱      ${persona.email}`,
    `职业      ${persona.occupation} @ ${persona.employer}`,
    `网络      ${persona.asn} ${persona.org} / ${persona.egressIp}`,
    `系统      ${persona.localeBcp47} · ${persona.timezone} (UTC+${persona.utcOffsetMinutes / 60})`,
    `约定      日期 ${c.date ?? '-'}，货币 ${c.currency ?? '-'}，一周从${c.week_start ?? '-'}开始`,
  ].join('\n')
}

/** 落盘用的结构：把人设拆成 address / network / system 三块，读回来好校验。 */
export function personaToJSON(persona) {
  return {
    name: persona.name,
    gender: persona.gender,
    birth_date: persona.birthDate,
    phone: persona.phone,
    id_card: persona.idCard,
    address: {
      province: persona.province,
      city: persona.city,
      district: persona.district,
      region_code: persona.regionCode,
      detail: persona.address,
    },
    email: persona.email,
    occupation: persona.occupation,
    employer: persona.employer,
    network: {
      carrier: persona.carrier,
      asn: persona.asn,
      org: persona.org,
      egress_ip: persona.egressIp,
    },
    system: {
      locale_bcp47: persona.localeBcp47,
      locale_posix: persona.localePosix,
      locale_windows: persona.localeWindows,
      timezone: persona.timezone,
      utc_offset_minutes: persona.utcOffsetMinutes,
    },
    conventions: { ...persona.conventions },
  }
}

/**
 * 从 `iamchinese-profile.json` 的 persona 块读回。缺字段直接抛错，不猜默认值——
 * 猜出来的地址和身份证必然对不上，那正是要防的事。
 * @param {object} data
 * @returns {object}
 */
export function personaFromJSON(data) {
  if (!data || typeof data !== 'object') throw new Error('persona must be an object')
  const { address, network, system } = data
  for (const [label, block] of [['address', address], ['network', network], ['system', system]]) {
    if (!block || typeof block !== 'object') throw new Error(`${label} must be an object`)
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(data.birth_date))) {
    throw new Error('birth_date must be YYYY-MM-DD')
  }
  return {
    name: String(data.name),
    gender: String(data.gender),
    birthDate: String(data.birth_date),
    phone: String(data.phone),
    idCard: String(data.id_card),
    province: String(address.province),
    city: String(address.city),
    district: String(address.district),
    regionCode: String(address.region_code),
    address: String(address.detail),
    email: String(data.email),
    occupation: String(data.occupation),
    employer: String(data.employer),
    carrier: String(network.carrier),
    asn: String(network.asn),
    org: String(network.org),
    egressIp: String(network.egress_ip),
    localeBcp47: String(system.locale_bcp47 ?? LOCALE_BCP47),
    localePosix: String(system.locale_posix ?? LOCALE_POSIX),
    localeWindows: String(system.locale_windows ?? LOCALE_WINDOWS),
    timezone: String(system.timezone ?? TIMEZONE),
    utcOffsetMinutes: Number(system.utc_offset_minutes ?? UTC_OFFSET_MINUTES),
    conventions: { ...(data.conventions ?? {}) },
  }
}
