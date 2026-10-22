# IamChinese

![I am Chinese · 我爱国无罪](assets/logo-horizontal.png)

**English** | [简体中文](README.zh-CN.md)

[![tests](https://img.shields.io/badge/tests-137%20Python%20%C2%B7%2081%20JS-brightgreen)](#tests)
[![license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![python](https://img.shields.io/badge/python-3.10%2B-informational)](#quick-start)
[![node](https://img.shields.io/badge/node-%E2%89%A520-informational)](#two-shells-dsh-plugin--claude-code-plugin)
[![npm](https://img.shields.io/badge/npm-iamchinese-cb3837)](https://www.npmjs.com/package/iamchinese)

> The product is called **IamChinese**; the package, command and directory are lowercase iamchinese (npm only takes lowercase names).

`regiongate` had its coordinate system flipped. The default user is now an ordinary person
living in mainland China: home broadband or 4G egress, `zh-Hans-CN`, `Asia/Shanghai`. North
America and Western Europe are the ones outside the supported list.

The original build assumed the opposite: Comcast cable, `America/Los_Angeles`, `en-US`, with
`CN` sitting in `restricted` and a screen that read "your network egress is in CN, this region
is not supported."

No third-party dependencies. 137 `unittest` cases run offline in about 0.7 s. `plugins/iamchinese/` holds a
second, dependency-free JavaScript implementation with 81 cases that installs into DeepSeek
Harness or Claude Code as a plugin.

Installed as a plugin, both hosts treat you as a mainland-China user from the first turn:
Simplified Chinese in the session, dates as `2026-10-21`, money as `¥ CNY`, addresses as
province → city → district → street, weeks starting Monday. It does not touch your system
locale, your registry, or any tool's behaviour, and it does not fake an egress IP. Set
`CN_PERSONA_NO_PROMPT=1` on the DSH side to turn that off. If you want an actual concrete
persona generated, use the tools below.

---

## Quick start

```bash
python -m unittest discover -s tests -t . -v      # all tests, ~0.7 s

python -m regiongate persona                       # print a persona + the six consistency checks
python -m regiongate plan                          # print the manual checklist, writes nothing
python -m regiongate apply --out .\profile         # write cn-profile.json + env.sh + env.ps1
python -m regiongate verify --profile .\profile\cn-profile.json
python -m regiongate undo --out .\profile          # delete only the three files it wrote

python -m regiongate check                         # run region evaluation with that persona
python -m regiongate check --gate                  # Stage 3' screen copy
python -m regiongate check --diag .\diag           # redacted diagnostic bundle (local only)
python -m regiongate check --json                  # machine readable
```

From GitHub:

```bash
git clone https://github.com/lirenjie95/IamChinese.git
cd IamChinese
python -m unittest discover -s tests -t .          # 137 cases, no network needed
```

Or scan the QR code in `plugins/iamchinese/dist/qr.png` — it points at this repository (see
"Two shells" below for how that code is generated).

`--seed` pins the persona (default `20261019`); the same seed reproduces byte-identical output.

Windows consoles default to GBK, where `¥` and CJK characters raise `UnicodeEncodeError`.
`__main__` forces UTF-8 on stdout/stderr; if your terminal still complains, run `chcp 65001`.

`env.ps1` contains `Set-Culture`, `Set-WinUILanguageOverride` and `tzutil` next to the `$env:`
variables — **dot-sourcing it really does change system settings**. For a shell-only change,
`source ./profile/env.sh`. `undo` deletes files; it does not roll system settings back.

---

## Two shells: DSH plugin / Claude Code plugin

`plugins/iamchinese/` is the JavaScript port of the same persona logic. Installed into a host, it is callable
from inside the session, and it packages up for handing to a friend.

```bash
cd plugins/iamchinese
node --test                                      # 81 cases, no dependencies

# install into DSH (dsh appends the package to the profile's bundle stack by itself)
dsh plugin --profile web add D:\IamChinese\plugin
# or from the packed tarball — this is the path a friend takes
dsh plugin --profile web add .\dist\iamchinese-0.2.0.tgz

npm run dist                                     # tgz + zip + install.ps1 + 发给朋友.md + qr.png
npm run share                                    # local distribution page; phone scans, downloads (port 8848)
```

Five tools show up after install: `cn_persona` (generate), `cn_persona_plan` (checklist),
`cn_persona_apply` (write the three files), `cn_persona_check` (six checks + environment diff),
`cn_persona_share` (export a share bundle), plus a `iamchinese` skill that explains the order to
use them in. On the Claude Code side, `.claude-plugin/plugin.json` is the manifest,
`skills/iamchinese/SKILL.md` explains the order, `commands/` adds three slash commands
(persona/apply/share), and the CLI is the same file.

The QR codes are generated in this package (`scripts/lib/qr.js` — versions 1–6, byte mode, ECC
M/Q, no dependencies). The default target is this repository, so a code you hand out keeps
working on someone else's machine:

<img src="assets/qr-repo.png" width="200" alt="QR code pointing at this repository">

`assets/qr-repo.png` is that code, committed; `npm run qr` redraws it,
`node scripts/share-qr.mjs --url https://your.domain/` points it elsewhere.
`npm run share` serves a LAN page whose own code targets the current interface address — that is
the one for handing a tarball to someone in the same room (`--lan` reproduces it on the command
line). Decodability is checked against OpenCV's decoder by `scripts/verify-qr.py`: 12 boundary
cases across six versions and two ECC levels, all decoded byte-identical; `--png <file>
--expect <url>` verifies a single image.

`plugins/iamchinese/README.md` covers install, uninstall, sharing and "what it does not do". The two
implementations **do not share seed semantics**: one seed gives different personas in the Python
and JS versions. To line them up, pass the full profile instead.

### Distributing it

| Path | Command |
|---|---|
| DSH plugin, from npm | `dsh plugin --profile web add iamchinese` |
| DSH plugin, from the release asset | `dsh plugin --profile web add https://github.com/lirenjie95/IamChinese/releases/latest/download/iamchinese-0.2.0.tgz` |
| DSH plugin, from a local tarball | `dsh plugin --profile web add .\dist\iamchinese-0.2.0.tgz` |
| Claude Code, this repo as a marketplace | `claude plugin marketplace add lirenjie95/IamChinese` then `claude plugin install iamchinese@iamchinese` |
| Claude Code, inside a session | `/plugin marketplace add lirenjie95/IamChinese`, then `/plugin install iamchinese@iamchinese` |
| Anything else | `plugins/iamchinese/dist/` — tarball, Claude zip, `install.ps1`, `发给朋友.md`, QR |

The marketplace manifest is `.claude-plugin/marketplace.json` at the repository root; it points
at `./plugins/iamchinese`, which carries its own `.claude-plugin/plugin.json`. With the Claude CLI installed,
`claude plugin validate .` re-checks both files.

Listings for the two directories live in `marketplace/`: the entry YAML for [Awesome DSH Plugin]
(https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) — copied verbatim to that repo's
`data/plugins/lirenjie95__IamChinese--plugin.yml`, one file is the whole submission — plus release
notes and the rules to check before opening the PR.

---

## Two layers, deliberately split

| Layer | Modules | Answers | Writes to the host |
|---|---|---|---|
| Core | `preflight` → `evaluate` → `gate` → `diagnostics` | Which region does the service think this machine is in | No, read-only throughout |
| Persona | `persona` + CLI | What set of fields makes it look like a Chinese user | Only three text files |

Five stages:

```
Stage 1 read-only collection → Stage 2 apply the region list → Stage 3 allow / Stage 3' explain and offer options → Stage 5 diagnostic bundle
```

Stage 1 and Stage 2 are separate (collection records facts, evaluation applies rules; each is
testable alone). Stage 2 has to be computable locally; a remote list is an update, not a
dependency. Stage 3' is a first-class screen, not an error dialog — the set of available buttons
is computed from `reason_code`.

---

## Why the persona is not made up

What gets past a coarse filter is not "the name sounds Chinese" but **six fields that interlock**:

| Check | Why it matters | Implementation |
|---|---|---|
| locale ↔ time zone | `zh-Hans-CN` with `America/Los_Angeles` is the classic tell | `LOCALE_BCP47` / `TIMEZONE` |
| ID region code ↔ shipping address | The first six digits must match province and city | `_REGIONS`: 28 real province/city/district codes |
| Sequence digit ↔ sex | Digit 17 encodes sex by parity; flip it and the whole card is wrong | `make_id_card(..., male=…)` |
| Phone prefix ↔ carrier | 155 is Unicom, 139 is Mobile; mixing them is a mismatch | `CARRIERS`, each with real prefixes |
| Prefix ↔ ASN | Residential egress ASN must match the carrier | Mobile AS9808 / Unicom AS4837 / Telecom AS4134 |
| Number length | 11 digits; one short and it is obviously wrong | `consistency()` |

The 18th digit is computed for real with GB 11643 MOD 11-2 (`id_check_digit()`). A unit test
pins the official sample `11010519491231002X` and asserts that changing any single digit breaks
the checksum. Egress IP comes from TEST-NET-3 (`203.0.113.0/24`), so nobody mistakes it for a
live host and starts scanning.

---

## Verdict semantics: three kinds of "no" must stay apart

| Situation | status | Retryable | Appealable |
|---|---|---|---|
| Egress unknown | `unknown` | Yes | No |
| Not on the list, policy = warn | `unknown` | — | Yes |
| Not on the list, policy = block | `not_supported` | No | Yes |
| Explicitly excluded region (e.g. `US`) | `not_supported` | No | **No** |

Collapsing the first two into "installation failed" is where most real-world pointless appeals
come from. The reason-code table in `reasons.py` is the single source of truth for status,
confidence, appealability and next action:

`OK`, `OK_WITH_WARNINGS`, `OK_UNLISTED`, `W_REGION_UNLISTED`, `E_REGION_UNLISTED`,
`E_REGION_RESTRICTED` (a policy conclusion, appeals accomplish nothing),
`E_NO_NETWORK_DATA` (insufficient data, retryable), `E_POLICY_STALE` (stale snapshot, not
blocking).

Copy rules: never write "we detected you are using a VPN" (an inference is not a fact), never
write "please disable your proxy and retry" (that is a bypass tutorial), never quote specific
thresholds ("3 accounts share one IP").

---

## Design decisions that carry weight

1. **No requests by default.** `consent_network` defaults to `False` and must be paired with an
   explicit provider; the default provider is `NullEgressProvider`, which does nothing.
2. **Network failure only degrades.** Exception, timeout or `None` all become
   `egress_country=None`, which routes to `E_NO_NETWORK_DATA`; installation can still continue
   `local_only`.
3. **IP exists only masked.** It is masked to `203.0.113.0` at collection time, and the
   diagnostic bundle rescans recursively so any IPv4 left in a string gets masked too.
4. **Buttons are computed.** No "submit an appeal" on non-appealable verdicts; buttons whose
   policy is missing `docs_url` / `appeal_url` do not render; `not_supported` has no "continue
   installing"; an empty set still yields at least "quit".
5. **Diagnostics stay local.** `diagnostics.py` has no upload function and `uploaded` is always
   `False`; `_scrub()` drops `fingerprint`/`hostname`/`token`/`cookie`-like keys by name.
6. **Policy updates always have a fallback.** Fresh cache → remote → stale cache → bundled
   snapshot; any failure is recorded in `PolicyUpdate.error` and nothing else. Malformed remote
   payloads (missing version, non-ISO country codes, empty `supported`, overlap with
   `restricted`) are **rejected**, not merged — a half-right list is worse than no update.
7. **The persona layer stays in its lane.** `persona.py` is pure: no environment reads, no file
   writes, no network. Writes go through `storage.py` (`atomic_write_json`, `atomic_write_text`,
   `remove_files`), and `remove_files()` deletes named files, never directories.

---

## Static invariants (`tests/test_invariants.py`)

Source-level assertions, not ordinary unit tests:

- no `subprocess` / `winreg` / `ctypes` / `socket` / `requests` / `shutil` / `os.system` in the package
- no `eval(` / `exec(`
- disk writes only in `storage.py`; network only in `preflight.py` and `update.py`
- two allowlists asserted with exact equality — adding a module means editing tests, on purpose
- models are frozen; an invalid `status` / `confidence` / `unknown_action` raises `ValueError`

---

## Tests

| Suite | Count | Command |
|---|---|---|
| Python core | 137 | `python -m unittest discover -s tests -t .` |
| JS plugin | 81 | `cd plugins/iamchinese && node --test` |

The JS suite includes four cases that call the host's real argument/schema validators, two that
mount the plugin in a real cordis context, twelve covering the QR encoder, and seven driven
through the CLI.

---

## Layout

```
README.md                this file (English, GitHub default)
README.zh-CN.md          Simplified Chinese version
LICENSE                  MIT
.claude-plugin/
└── marketplace.json     Claude Code marketplace manifest (entry → ./plugins/iamchinese)
marketplace/
├── lirenjie95__IamChinese--plugin.yml  Awesome DSH Plugin entry (copy it to open the PR)
├── release-notes.md                    GitHub Release body
└── README.md                           listing steps and rules for both directories
regiongate/
├── __init__.py          public API
├── __main__.py          CLI: persona / plan / apply / undo / check / verify
├── persona.py           persona generation: ID card, prefixes, region codes, locale, time zone
├── signals.py           pure functions: IP masking, locale parsing, time zone → country, ASN class
├── models.py            EnvironmentSnapshot / RegionDecision (frozen)
├── policy.py            RegionPolicy + bundled list (CN-first, sample data)
├── reasons.py           single source of truth for reason codes
├── preflight.py         Stage 1: read-only collection + injectable egress probe
├── evaluate.py          Stage 2: verdict + evidence explanation
├── gate.py              Stage 3': copy and buttons, with action filtering
├── diagnostics.py       Stage 5: redacted diagnostic bundle
├── storage.py           the only module allowed to write (atomic)
└── update.py            remote policy + cache + fallback chain

tests/                   137 cases (34 of them persona, plus the static invariants)

assets/                  finished logo files (no source image, no generator)
├── logo.png             512×512 primary logo
├── logo-mark.png        532×532 transparent roundel (works on light and dark)
├── logo-horizontal.png  1200×360 banner, used at the top of this file
├── social-preview.png   1280×640 social preview (repo Settings → Social preview)
├── qr-repo.png          QR code pointing at this repository
└── favicon.ico          16/24/32/48/64/128, whole face mosaicked, no caption

> The logo borrows a widely circulated meme image, pixelated over the eyes: the joke still
> reads, but it is no longer a sharp portrait travelling around attached to this repo. The
> icon is mosaicked across the whole face — 16px has no room for features, and none for a
> caption. Only the rendered files are in the repository; the source image and the script
> that produced them are not.
>
> `social-preview.png` has to be uploaded by hand: GitHub exposes no API for the social
> preview, so it goes in through Settings → Social preview. Everywhere else the logo carries
> itself — README banner, share page header and favicon, release notes, and `assets/` inside
> the npm package.

plugins/                 JS ports; every subdirectory is an independently installable plugin
└── iamchinese/          one DSH plugin and one Claude Code plugin, same logic
    ├── lib/core/        pure logic (persona, tables, PRNG, environment, profile), no IO
    ├── lib/             host wiring (index / mount / tools / skill / prompt)
    ├── bin/             CLI: persona / plan / apply / verify / share / undo
    ├── skills/          Claude-side skill manual
    ├── commands/        Claude-side slash commands
    ├── hooks/           Claude-side SessionStart hook (same identity paragraph)
    ├── .claude-plugin/  Claude Code manifest
    ├── test/            81 cases
    └── scripts/         dist packaging, LAN share server, QR encoder, QR verifier
```

---

## Boundaries and costs

Not done: silently changing locale, time zone or the registry; injecting or rewriting HTTP
headers (`Accept-Language`, `X-Forwarded-For`, `CF-IPCountry`); bundling a proxy, tunnel or DNS
rewrite; silently collecting device fingerprints; multi-accounting, registering accounts for
others, account pools; reverse-engineering a specific platform's thresholds.

The reason is not moralising: those moves leave the risk with **the person using them** — the
account is yours, the ban is yours, and the tool's author bears none of it. So this stops at
"generate text + print a checklist". Whether it lands in your system is your own action, and
there is `undo` plus an auditable trail.

The cost, stated plainly: even with all six checks green this only gets past a **coarse filter**.
Platforms with history look at account history and behaviour sequences; swapping the environment
does not change that part. The docs do not sell it as "safe and undetectable".

---

## Implementation notes and known limits

- `locale_tz_consistent` is `Optional[bool]`: when a time zone cannot be mapped to a country
  (e.g. `UTC+08:00`), `False` would fabricate a warning, so `None` means "cannot decide".
- `RegionDecision` carries `policy_version` / `policy_stale` / `warnings` beyond the minimal
  design — cleaner than `hasattr` fallbacks.
- Under a DSH workspace-write sandbox, creating files in the system temp directory hangs; test
  temp dirs live in `tests/.testtmp/` and `atomic_write_*` uses a sibling temp file instead of
  `tempfile.mkstemp`. `REGIONGATE_DIAG_DIR` / `REGIONGATE_CACHE_DIR` relocate the defaults.
- The persona covers Simplified Chinese / mainland China only. Hong Kong, Macao, Taiwan and
  overseas-Chinese locale combinations are not modelled yet.
- No GUI (`GateView` is UI-agnostic already, only `render_text` exists today); no real egress
  endpoint is wired (`HttpEgressProvider` is an injection point with no default address); policy
  payloads are structurally validated, not signature-verified.

## License

MIT, see [LICENSE](LICENSE). The logo borrows a meme image and pixelates it. Every name, address,
ID number and phone number in this repository is generated from a fixed seed and corresponds to
no real person.

`BUNDLED_POLICY` is sample data, not any vendor's real list; `appeal_url` / `docs_url` point at
`example.invalid`.
