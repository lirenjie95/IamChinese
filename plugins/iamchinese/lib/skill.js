/**
 * 插件自带的这份手册，通过 `ctx.skills.register()` 贡献给运行环境。
 *
 * 为什么是 skill 而不是把说明堆进工具描述：工具描述回答的是「这个参数填什么」，
 * 一次一个工具；真正每个会话都要重新摸的是**工具之间的顺序**——先生成还是先看
 * 环境、自检哪几项才算过、分享包里能不能放身份证号。这些写不进单个工具描述里。
 *
 * 注册是防御式的：没有 skills 服务的 profile 照样能加载这个插件，只是不挂这份
 * 手册（`ctx.inject(['skills'], …)` 的作用域内回调不执行，插件本体不受影响）。
 * @module iamchinese/skill
 */

/** 技能 id，kebab-case，可寻址为 `/iamchinese`。 */
export const IAMCHINESE_SKILL_NAME = 'iamchinese'

export const IAMCHINESE_SKILL_DESCRIPTION =
  '把开发/测试环境配成一套自洽的中国用户人设：生成身份与网络字段、检查内部是否自洽、'
  + '打印落地清单、写档案文件、导出可发给朋友的分享包。任何「把这个环境弄成国内口径」'
  + '的任务，先读这份手册再调 iamchinese* 工具。'

export const IAMCHINESE_SKILL_WHEN_TO_USE =
  '需要造一份中国用户的人设、核对 locale/时区/号段/身份证区划是否对得上、'
  + '把档案落到机器上、或者把一份人设打包给别人时。也适用于「这个测试账号看起来'
  + '像不像国内用户」「时区还是 UTC 没改」这类收尾检查。'

export const IAMCHINESE_SKILL_CONTENT = `# 中国用户人设：先自洽，再落地

核心一句：**这份东西的价值不在名字多像，而在字段之间不打架**。单看每个字段都真，
凑一起矛盾就是假的——身份证前 6 位和收货地址不在一个区、手机号段和运营商不是一家、
locale 是 zh-CN 而时区还停在 UTC。所以顺序永远是「生成 → 自检 → 落地 → 复验」。

## 什么时候用哪个工具

| 工具 | 用在哪 |
| --- | --- |
| \`iamchinese\` | 造一份人设。给 \`seed\` 可复现；不给就用默认 seed，同一台机器每次结果一致 |
| \`iamchinese_check\` | 读回一份档案，跑六项自洽检查 + 当前环境对比。**改完任何东西都要再跑一次** |
| \`iamchinese_plan\` | 打印落地清单（系统区域、时区、浏览器语言、验收）。不写文件 |
| \`iamchinese_apply\` | 真写文件：\`iamchinese-profile.json\` + \`env.sh\` + \`env.ps1\` |
| \`iamchinese_share\` | 导出分享包（三个文件 + README），附一句能直接粘贴的话 |

典型链路：\`iamchinese\` → \`iamchinese_apply\` → \`iamchinese_check\` → 人照清单改机器 →
再 \`iamchinese_check\`。要给朋友就最后来一发 \`iamchinese_share\`。

## 六项自洽检查（check 输出的那六行）

1. **locale ↔ 时区**：\`zh-Hans-CN\` 必须配 \`Asia/Shanghai\`。zh-CN + UTC 是最常见的一眼假。
2. **身份证区划 ↔ 地址**：身份证前 6 位就是区划码，必须和档案里的 \`region_code\` 相同。
3. **顺序码 ↔ 性别**：第 17 位奇数男、偶数女。改成女却不动这一位，校验就断。
4. **号段 ↔ 运营商**：133/149/153/173/177/180/181/189/190/191/199 是中国电信，不是移动。
5. **号段 ↔ ASN**：电信 = AS4134 Chinanet，联通 = AS4837，移动 = AS9808。运营商写电信、
   ASN 写 AS9808 是自相矛盾。
6. **手机号长度**：11 位纯数字。

任何一项红，先修数据再加别的。**不要**为了让检查变绿去改检查。

## 落地：能自动的与不能自动的

- 能自动（本插件产出的就是文本）：档案 JSON、\`env.sh\`、\`env.ps1\`。
- 要人手一条条来：\`Set-Culture\`、\`Set-WinUILanguageOverride\`、\`tzutil /s\`、shell 启动文件、
  浏览器首选语言列表。改系统区域是要用户自己点头的事，别替他执行。
- 自动不了的：**出口 IP**。人设里的 \`egress_ip\` 是 RFC 5737 的 \`203.0.113.0/24\` 文档段，
  故意选它，因为它永远不会撞到真人。要让 CDN 看到中国出口，只能是真实的中国线路——
  这个包不提供、不代填、不假装能绕过去。被问到就说清楚这一点，别绕。

## 复验怎么看

\`iamchinese_check\` 给两块输出：**人设自洽**（档案内部对不对）和**环境对比**
（这台机器现在是什么）。两块是不同的事：档案可以全绿而机器还全是默认值，那不是
数据错，是还没落地。报告里 \`fix\` 字段给的是该执行的命令，不是已经执行过的命令。

## 边界（写死在手册里，别越过去）

- 这套样例字段**只用于测试环境**。拿去注册账号、实名认证、过 KYC、开银行卡，性质就
  从「配环境」变成「伪造证件」，跟本工具无关，也不在能帮的范围内。
- 不覆盖真实身份的账号资料，不改别人的设备，不把分享包发给不知情的人。
- 分享包里不放任何凭据、token、真实手机号。只放拼出来的样例。
- 用户说「帮我过一下某站的身份验证」时：停下来，讲清这一步和前面几步不是同一件事，
  然后问他到底想测什么——多数情况下他要的是「让站点认为我在国内」，那只需要 locale、
  时区、语言列表和真实线路，不需要身份证。

## 常见坑

- **同一个 seed 在 Python 版和 JS 版结果不同**：两边 PRNG 不同，跨语言没有稳定契约，
  同一语言内才可复现。要跨语言对齐就传完整档案，别传 seed。
- **Windows 控制台中文乱码/报错**：\`PYTHONIOENCODING=utf-8\` 是 Python 侧的事；本插件跑在
  Node 上，输出本来就是 UTF-8，乱码一般是终端代码页（\`chcp 65001\`）。
- **只改了 \`LANG\` 没改 TZ**：Node 的 \`Intl\` 读的是系统时区，\`process.env.TZ\` 只在进程启动时
  生效。改完要重开终端，check 才会变绿。
- **档案放错目录**：默认 \`.iamchinese\`。给了 \`out_dir\` 就一直在那儿，别在两个目录之间来回写。
`

/**
 * 在宿主提供 skills 服务时注册这份手册。
 *
 * 用 `ctx.inject(['skills'], …)` 而不是 `ctx.skills?.` 守卫：cordis 对未声明的服务
 * 连属性访问都拒绝（cannot get property without inject），那个异常会把整个插件带
 * 下线；作用域注入在缺服务时只是不执行回调。返回的是作用域 fiber 的 dispose。
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {() => void}
 */
export function registerCnPersonaSkill(ctx) {
  const fiber = ctx.inject(['skills'], scoped => {
    const skills = scoped.skills
    scoped.effect(() => skills.register({
      name: IAMCHINESE_SKILL_NAME,
      description: IAMCHINESE_SKILL_DESCRIPTION,
      whenToUse: IAMCHINESE_SKILL_WHEN_TO_USE,
      content: IAMCHINESE_SKILL_CONTENT,
      source: 'bundled',
    }), 'iamchinese:skill')
  })
  return () => { void fiber.dispose() }
}
