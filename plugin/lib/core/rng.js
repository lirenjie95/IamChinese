/**
 * 一个可复现的小 PRNG（mulberry32）加上几个取值助手。
 *
 * 为什么不用 Math.random：人设要能被复现。同一个 seed 两次生成必须完全一样，
 * 否则「上次给我生成的那份」就再也找不回来了，分享给朋友的档案包也没法对齐。
 * 注意 Python 版用的是 random.Random，两边同一个数字不会得到同一份人设——只有
 * 同语言内才是稳定契约。
 * @module dsh-cn-persona/core/rng
 */

/**
 * 建一个 32 位状态的 PRNG。
 * @param {number} seed 任意整数；非整数按位截断。
 * @returns {{ next: () => number, int: (maxExclusive: number) => number, pick: <T>(list: readonly T[]) => T, chance: (probability: number) => boolean }}
 */
export function makeRng(seed) {
  let state = (Number(seed) | 0) >>> 0
  if (state === 0) state = 0x9e3779b9

  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const int = maxExclusive => Math.floor(next() * maxExclusive)

  return {
    next,
    int,
    pick: list => list[int(list.length)],
    chance: probability => next() < probability,
  }
}
