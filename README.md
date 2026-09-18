<h1 align="center">zapara</h1>

<p align="center">
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License: MIT"></a>
  <a href="https://bun.sh"><img src="https://img.shields.io/badge/runtime-Bun-f9f1e1?logo=bun" alt="Bun"></a>
  <a href="https://www.npmjs.com/package/@drakulavich/zapara"><img src="https://img.shields.io/npm/v/@drakulavich/zapara?logo=npm&color=cb3837" alt="npm"></a>
</p>

<p align="center"><b>How hard was today?</b> zapara reads the transcripts Claude Code already writes on your machine and scores every hour 0–100 from parallel sessions, prompt pace, agent supervision, model output, streak length and late-night work. Nothing leaves the machine, no message text is kept.</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/drakulavich/zapara/main/assets/demo.webp" alt="zapara demo: week heatmap, day table, JSON" width="800">
</p>

Claude Code writes a JSONL transcript for every session under `~/.claude/projects`. zapara reads those files, puts each record in the local hour it happened in, and turns the hour into one number. A week is a heatmap of seven rows by 24 cells; a day is a table with one row per hour and, with `--explain`, the weighted contribution of each component. Nothing is installed into Claude Code, no hook is registered, and no network call is made.

## Quick Start

```bash
# Install Bun if you do not have it (zapara needs 1.4 or newer)
curl -fsSL https://bun.sh/install | bash

# Your week, straight from the registry
bunx @drakulavich/zapara@latest

# A day, with the components behind each index
bunx @drakulavich/zapara@latest day --explain

# The card
bunx @drakulavich/zapara@latest card
```

To keep it around, `bun add -g @drakulavich/zapara` puts `zapara` on your PATH. There is no build step and no runtime dependency: Bun runs `src/index.ts` from the package as it is.

## What it looks like

Both pictures below come from the synthetic fixture in `tests/fixtures/busy-week`: a calm morning of one session, a five-session storm in the middle of the day, and a late tail that runs past midnight.

```
            00 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23   peak  active
Mon 14/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ░  █  █  █  ·  ·  ·  ·  ·  ░  ░  ·  ░     87    6h00
Tue 15/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ░  ░  ▒  ▒  ▒  ░  ·  ·  ·  ·  ·  ·     33    4h00
Wed 16/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·      -    0h00
Thu 17/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ░  ░  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·     14    1h00
Fri 18/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ▓  ·  ·  ·  ·  ·  ·  ·  ·     82    1h00
Sat 19/09    ░  ░  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·     24    1h00
Sun 20/09    ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·  ·      -    0h00

  ░ calm   ▒ warming   ▓ heating   █ fried
  13h00 active   346 prompts   0 reports   100 decisions   5 sessions at once
```

```
hour   index  level    sess  prompts  intr  rej  quest  plan  mode  ctx-sw  streak  out-tok  par  pace   sup  read  strk  late
09:00      9  Calm        1        6     0    0      0     0     0       0     53m      600    0   4.5     0   0.1   4.4     0
10:00     14  Calm        1        6     0    0      0     0     0       0    113m      600    0   4.5     0   0.1   9.4     0
11:00     15  Calm        1        6     0    0      0     0     0       0    173m      600    0   4.5     0   0.1    10     0
12:00     87  Fried       5       55    20    1      1     1     2      54    237m    55.0k   25    15    30   6.9    10     0
13:00     87  Fried       5       55    20    1      1     1     2      54    297m    55.0k   25    15    30   6.9    10     0
14:00     87  Fried       5       55    20    1      1     1     2      54    357m    55.0k   25    15    30   6.9    10     0
20:00      9  Calm        1        6     0    0      0     0     0       0     53m      600    0   4.5     0   0.1   4.4     0
21:00     14  Calm        1        6     0    0      0     0     0       0    113m      600    0   4.5     0   0.1   9.4     0
23:00     19  Calm        1        6     0    0      0     0     0       0     53m      600    0   4.5     0   0.1   4.4    10
  no reports today
```

<details>
<summary><b>Reproduce these pictures from the repository</b></summary>

Two commands in a terminal reproduce them. The fixture's timestamps are UTC and zapara buckets by local time, so pin the zone to get these exact hours:

```bash
TZ=UTC bun src/index.ts week --projects tests/fixtures/busy-week --to 2026-09-20 --no-color
TZ=UTC bun src/index.ts day 2026-09-14 --projects tests/fixtures/busy-week --explain --no-color
```

The grid is a fixed 98 columns wide, 100 with its hour header, and does not reflow, so it needs a terminal at least that wide.

</details>

## Share a card

`zapara card` turns your last two weeks into one picture: a character named after the kind of load that dominates your hours, the sentence behind it, the peak hour, the share of calm, warming, heating and fried hours, and three highlights. No dates, no hour totals, nothing that reads as a timesheet.

```bash
zapara card                    # writes zapara-card.png in the current directory
zapara card --out card.webp    # WebP instead; --out card.html writes the page itself
```

On macOS, one more command puts the picture on the clipboard, ready to paste into a chat:

```bash
zapara card && osascript -e 'set the clipboard to (read (POSIX file "zapara-card.png") as «class PNGf»)'
```

```
The Marathoner: Longest streak 7h53m without a break, 68% of your hours calm.
wrote zapara-card.png
```

<p align="center"><img src="https://raw.githubusercontent.com/drakulavich/zapara/main/assets/card.webp" alt="zapara card: The Marathoner, longest streak 7h53m, 68% of hours calm" width="800"></p>

This one comes from the same `busy-week` fixture as the pictures above. The picture is taken by a headless browser that Bun drives: WebKit on macOS, an installed Google Chrome elsewhere, so on Linux or Windows install Chrome, or write `--out card.html` and open the page in any browser.

## Usage

| Command | What it does |
|---|---|
| `zapara` | Same as `zapara week`. |
| `zapara week` | The last 7 days ending today, in local time. |
| `zapara week --days 14 --to 2026-09-17` | Any window. `--days` takes an integer from 1 to 90. |
| `zapara day` | Today, one row per hour that had activity. |
| `zapara day 2026-09-14 --explain` | One day, with the six weighted components behind each index. |
| `zapara card` | The last 14 days as one shareable picture, `zapara-card.png` in the current directory. |
| `zapara card --days 30 --out me.webp` | Any window from 1 to 90 days; `.png`, `.webp` or `.html` by extension. `--json` prints the card's data instead. |

| Flag | What it does |
|---|---|
| `--json` | Print the whole window as one JSON document instead of a table. |
| `--projects <dir>` | Read this directory instead of `~/.claude/projects`. |
| `--out <path>` | Where `card` writes; the extension picks the format. |
| `--no-color` | Plain glyphs with no ANSI codes. `NO_COLOR` in the environment does the same. |
| `--help` | Usage, exit 0. |
| `--version` | The version from `package.json`, exit 0. |

Levels: calm 0–29, warming 30–59, heating 60–84, fried 85–100.

`week` and `day` print a text table when stdout is a terminal and JSON otherwise, so `zapara week | cat` prints JSON; there is no flag to force text in a pipe yet. `card` always writes its file and prints its two lines, piped or not, and only `card --json` prints JSON.

Exit codes are 0 on success, 1 when the projects directory is missing or cannot be read (two different messages, neither with a path), and 2 for a usage error such as a bad date or an unknown flag. A window with no data prints an empty grid and exits 0.

## Privacy

zapara reads `~/.claude/projects/**/*.jsonl`, taking only files modified inside the window and skipping subagent transcripts under `subagents/`. Message text is compared against a few fixed markers, for interrupts, tool rejections and inbound agent messages, and then discarded. What survives into an event is a timestamp, a session id, an event kind and a token count.

No message text, prompt length, file path or session title is kept, written or printed. The CLI never prints a path it derived or read, not even the projects root when it cannot open it. Nothing is sent anywhere, no file is written except the card you ask for, and nothing is installed into Claude Code.

## Limits

- Time is local and buckets are whole hours, so an hour that straddles midnight or a daylight-saving change is bucketed by the local clock. On a fall-back day two wall-clock hours share one label and merge.
- Only Claude Code transcripts are read. Work in other tools, and time away from the keyboard, is invisible.
- Files are chosen by modification time. A very old session touched today is read in full, but only its in-window events count.
- The transcript format is Claude Code's private format, built against version 2.1.274, and it may drift. `bun run stats` shows when it has.
- The norms come from two machines of one user working in auto mode. They are a starting point for a conversation about the metric, not a study.
- The 98-column grid does not adapt to a narrow terminal.
- For `week` and `day` a pipe always gets JSON, and there is no flag to ask for text instead.
- The card needs a browser engine: WebKit comes with macOS, elsewhere Google Chrome must be installed. `--out card.html` works everywhere.

## Under the hood

The formula behind the number and the transcript record behind every column, for when the number surprises you.

<details>
<summary><b>How the index works</b></summary>

Every hour that had activity gets six components normalized into `[0, 1]` and summed with integer weights:

```
parallel    = clamp((sessions - 1) / 4)                                   # 1 session → 0, 3 → 0.5, 5+ → 1
pace        = clamp(prompts / 20)                                         # 10 prompts/hour → 0.5, 20+ → 1
supervision = clamp((3 * decisions + reports + contextSwitches) / 45)     # 15 decisions alone → 1; 45 reports alone → 1
reading     = clamp(outputTokens / 80000)                                 # 40k → 0.5, 80k+ → 1
streak      = clamp(streakMin / 120)                                      # 60 min → 0.5, 2h+ → 1
late        = lateNight ? 1 : 0

index = round(25*parallel + 15*pace + 30*supervision + 10*reading + 10*streak + 10*late)
```

`decisions` is the sum of interrupts, tool rejections, questions, plan reviews and permission-mode switches. Without the late-night flag the index tops out at 90. An hour with no activity has no index at all: it renders as `·` and is `null` in JSON.

| Level | Range |
|---|---|
| Calm | 0–29 |
| Warming | 30–59 |
| Heating | 60–84 |
| Fried | 85–100 |

The norms come from two machines, 14 days each, of real transcripts covering 116 and 114 active hours. The surprise in that data was how rare explicit decisions are: in auto mode the p90 is 3 decisions per hour, so a component built on decisions alone reads near zero on hours that felt heavy. What those hours actually cost is reading the reports agents send back, switching between sessions, and getting through the volume of model output, which is why supervision carries 30 points and reading 10. Human prompts reached a p90 of 13 per hour on one machine and 20 on the other, hence the pace norm of 20. The parallel-session threshold follows the research this project started from rather than the transcripts: BCG and HBR report that productivity drops past three simultaneous AI tools, and Osmani makes the same point as three focused teammates beating five scattered ones.

Weights and norms live in one exported constant in `src/score.ts`, so a recalibration is one diff there plus a line in `CHANGELOG.md`.

</details>

<details>
<summary><b>What each column of the day table counts</b></summary>

| Column | What it counts |
|---|---|
| `sess` | Distinct session ids with at least one user or assistant record in the hour. |
| `prompts` | Messages the human typed. A `user` record whose text is neither an interrupt marker nor an agent-message marker; `isMeta` and sidechain records are excluded. |
| `rep` | Inbound messages from subagents, other sessions and background tasks. A `user` record whose text starts with one of the agent-message markers, which is something to read and react to rather than something typed. |
| `intr` | Interrupts. A `user` record whose text block starts with `[Request interrupted by user`, covering both the plain and the tool-use form. |
| `rej` | Tool rejections. A `tool_result` block saying the user did not want to proceed with that tool use. |
| `quest` | `AskUserQuestion` tool calls in an assistant message, one per block. |
| `plan` | `ExitPlanMode` tool calls in an assistant message, one per block. |
| `mode` | Permission-mode switches. A `permission-mode` record whose mode differs from the previous one; the first record of a session sets the baseline and repeats of the same mode count nothing. |
| `ctx-sw` | Context switches. Over the hour's prompts in time order, the number of consecutive pairs that came from different sessions. |
| `streak` | Minutes since the current activity streak began, which may reach back before the hour. A gap longer than 10 minutes between records breaks the streak. |
| `out-tok` | Assistant output tokens, summed once per request and only for requests that produced a text block. Claude Code repeats the same usage on each content block of a response, and a request holding only tool calls is not text anyone reads. |

`bun run stats --days 14` is the tool the norms were set with. It prints the per-hour distribution of each signal over the active hours of a window (n, p50, p75, p90, max, and how many hours were zero), the top hours by reports and by human prompts, and a format-drift line comparing records seen against events the parser recognised. Run it on another machine, or after a Claude Code update, to see whether the norms and the parser still fit. It prints numbers and nothing else.

</details>

## Development

```bash
git clone git@github.com:drakulavich/zapara.git
cd zapara
bun install
bun link
```

`bun link` registers the clone's `bin` entry, so `zapara` runs this checkout; without it, `bun src/index.ts week` does the same thing.

```bash
bun run check    # tsc --noEmit, then the test suite under TZ=UTC
```

Tests are fixture-driven: they build or load transcripts in the real Claude Code format and assert the statistics that come out of the public seams, `analyze()`, `report()` and the CLI itself. No test imports the parser, the deriver or the scanner, so refactoring internals never touches a test. The rules every change follows are in [CLAUDE.md](CLAUDE.md), the design is in [docs/superpowers/specs/2026-09-17-zapara-design.md](docs/superpowers/specs/2026-09-17-zapara-design.md), and every change is recorded in [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
