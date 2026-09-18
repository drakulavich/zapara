# zapara card: a shareable picture of your last two weeks

Extends `2026-09-17-zapara-design.md`. Everything not mentioned here stays as
that spec says.

## Purpose

`zapara card` turns a window of transcripts into one image a person wants to
send to a colleague: a character that names how they drive Claude Code, one
sentence with two numbers behind that name, the peak hour, a load spectrum,
three highlights, and the project's line. It exists to make the tool travel:
the week heatmap convinces the person who ran it, the card convinces the
person they show it to.

The card shows aggregates only. Nothing on it says when the person worked,
how much, or on which days: no heatmap, no dates, no hour totals. A person
should never want to hide their card from a manager or a partner, so every
number on it reads as a trait or an achievement, not as a timesheet.

The card is a picture of numbers zapara already computes. It adds no new
signal, no new score, and no new data source.

## CLI

```
zapara card [--days N] [--to YYYY-MM-DD] [--out PATH] [--json] [--projects DIR]
```

- `--days` defaults to 14 and accepts 1 to 90, like `week`.
- `--to` defaults to today, as for `week`.
- `--out` defaults to `zapara-card.png` in the current directory. The format
  is the extension: `.png` or `.webp` for the picture, `.html` for the page
  the picture is taken of (written as is, no browser involved, for checking
  the design). Any other extension is a usage error (exit 2). A value
  containing a control character (any code point below 0x20, or 0x7f) is a
  usage error too (exit 2, the message names the flag, not the value), so
  the `wrote …` line is always one line of plain text and can never carry a
  terminal escape. An existing file is overwritten: the person named it.
- `--json` prints the card's data (below) to stdout and writes no file.
- Without `--json`, stdout gets two lines: the character line
  (`The Conductor: 5 sessions at once, 54 context switches in one hour`) and
  `wrote zapara-card.png`, echoing `--out` exactly as given. No other path is
  ever printed.
- A window with no active hour prints `no activity in the last 14 days`
  (with the actual `--days`) to stderr, writes nothing, exits 1.
- When the picture cannot be rendered because no browser engine is available
  (see Rendering), stderr gets one line, `card needs a browser engine:
  install Google Chrome, or write --out card.html`, exit 1. A render that
  does not finish within 15 seconds is `render timed out`, exit 1.
- Colors and TTY detection do not apply: the card is the same everywhere.

Privacy amendment to the base spec: `card` is the one command that writes a
file. It writes exactly one file, at the path the person gave or the default in
the current directory, and prints that path back verbatim. It never writes
anywhere else and never prints a path it derived from the projects tree or
from its own install location. The page it renders is self-contained: no
network request is made while rendering, and the browser engine runs
headless with an ephemeral data store. The README's privacy section says "no
file is written except the card you ask for".

## Card data

From the `Day[]` of the window, over the buckets with a score ("active
hours"):

```
share.conductor  = Σ(parts.parallel + parts.pace)        / (40 · activeHours)
share.supervisor = Σ(parts.supervision + parts.reading)  / (40 · activeHours)
share.marathoner = Σ(parts.streak)                        / (10 · activeHours)
share.nightOwl   = Σ(parts.late)                          / (10 · activeHours)
```

Each share is the fraction of that character's maximum possible points the
window actually collected, so a 10-point component competes fairly with a
40-point one. The character is the largest share; ties break in the order
Conductor, Supervisor, Marathoner, Night Owl. With every share zero (possible
only for a window of lone single-event hours) the tie rule gives Conductor.

| Character | Name | Sentence (numbers from the window; bold spans marked with `**`) | Motto |
|---|---|---|---|
| conductor | The Conductor | `**{maxSessions} sessions** at once, **{maxContextSwitches} context switches** in one hour.` | `You run agents like an orchestra.` |
| supervisor | The Supervisor | `**{reports} agent reports** and **{outputTokens} tokens** of output read.` | `Nothing ships without your eyes on it.` |
| marathoner | The Marathoner | `Longest streak **{streak}** without a break, **{calmShare}%** of your hours calm.` | `You do not stop while it compiles.` |
| nightOwl | The Night Owl | `**{lateShare}%** of your hours **after midnight**.` | `The best commits happen after midnight.` |

Where `maxSessions` and `maxContextSwitches` are the window maxima over
buckets, `reports`, `outputTokens` and `interrupts` are window sums, `streak`
is the maximum `streakMin` over buckets rendered as `5h12m` (or `48m` under
an hour), `activeHours` is the count of active buckets (used only as a
divisor, never shown), `lateShare` is the share of active buckets with
`lateNight` in whole percent, `calmShare` the share of active buckets at
Calm, `days` the `--days` value. `outputTokens` is rendered as `412k` or
`1.2M` (one decimal, `k` under a million). The stdout character line and the
JSON `sentence` carry the sentence without the bold marks and without the
motto.

**Peak**: the maximum index over active buckets and its level.

**Spectrum**: the share of active buckets at each level, four whole percents
that sum to 100 by largest-remainder rounding (a level with no hours is 0).

**Highlights**: three, chosen from this pool. Each has a key, a value string
and a one-line caption in sentence case that carries the unit. `norm` is the
value divided by its calibration norm, for ranking:

| Key | Value | Caption | norm |
|---|---|---|---|
| peakSessions | `{maxSessions}` | `sessions at once` | `(maxSessions − 1) / 4` |
| contextSwitches | `{maxContextSwitches}` | `switches in one hour` | `maxContextSwitches / 45` |
| longestStreak | `{streak}` | `longest streak` | `maxStreakMin / 120` |
| reportsRead | `{reports}` | `agent reports read` | `reports / (12 · activeHours)` |
| tokensRead | `{outputTokens}` | `tokens of output read` | `outputTokens / (65000 · activeHours)` |
| interrupts | `{interrupts}` | `times you stopped Claude` | `interrupts / (3 · activeHours)` |
| lateShare | `{lateShare}%` | `of hours after midnight` | `lateShare / 25` |

The first two highlights are the character's own pair, in this order: Conductor
`peakSessions, contextSwitches`; Supervisor `reportsRead, tokensRead`;
Marathoner `longestStreak, interrupts`; Night Owl `lateShare, longestStreak`.
The third is the remaining key with the largest `norm`; `lateShare` is
eligible as the third only for the Night Owl (a late-night number on someone
else's card is exactly the kind of thing they would hide). Ties keep the
table order.

Window label: `LAST {days} DAYS`. No dates appear on the card.

`--json` prints:

```json
{ "days": 14, "from": "2026-09-05", "to": "2026-09-18", "character": "conductor",
  "name": "The Conductor", "sentence": "6 sessions at once, 38 context switches in one hour.",
  "shares": { "conductor": 0.61, "supervisor": 0.33, "marathoner": 0.52, "nightOwl": 0.06 },
  "peak": { "index": 89, "level": "Fried" },
  "spectrum": { "calm": 62, "warming": 25, "heating": 10, "fried": 3 },
  "highlights": [
    { "key": "peakSessions", "value": "6", "caption": "sessions at once" },
    { "key": "contextSwitches", "value": "38", "caption": "switches in one hour" },
    { "key": "longestStreak", "value": "5h35m", "caption": "longest streak" } ] }
```

Shares are rounded to two decimals in JSON only. `from` and `to` are in the
JSON for scripts; they are not drawn.

## Picture

The card is an HTML page, 1200×630 CSS pixels, produced by a pure function
from the card data, and photographed by a headless browser engine that Bun
ships with (`Bun.WebView`, WebKit on macOS, Chrome elsewhere). The output
picture is always 2400×1260 pixels: the page is loaded in a 2400×1260
viewport with `zoom: 2` on the root element, so the engine lays the card out
at twice its size and text is rendered at that size rather than upscaled; the
screenshot is then resized to exactly 2400×1260 with `Bun.Image` when the
device pixel ratio made it larger. PNG is the screenshot's own format; WebP
is re-encoded from it with `Bun.Image` at quality 90.

The page is self-contained. Fonts and character pictures are embedded as
`data:` URIs; the template contains no `http`, `https` or protocol-relative
reference, and a test guards that.

### Look

Raycast-like: a near-black card, a few blurred diagonal light streaks in
the character's accent behind the character, film grain over the whole
card, and one glass panel holding all the text. Type is Inter for the name,
the sentence and the numbers; every small label is JetBrains Mono.

| Element | Position and style (CSS px) |
|---|---|
| Background | `#07070a` |
| Streaks | a 900×1100 group at (−200, −260) rotated 38°, blurred 22 px, opacity 0.9: four vertical bars (widths 150, 70, 200, 90 at x = 120, 320, 440, 700) with vertical gradients from transparent through the accent (peak alpha 0.9, 0.7, 0.35 with a cyan `#22d3ee` touch, 0.5) back to transparent; a radial vignette centred at (30 %, 40 %) fades everything to the background beyond 75 % |
| Grain | an SVG `feTurbulence` fractal-noise tile (300×300, base frequency 0.9, two octaves) as a repeating background over the whole card, opacity 0.35, blend mode overlay |
| Character | the character's crop of the sheet (see Characters), longer side 360 px, centred at (195, 300), drop shadow 0 30 40 at 70 % black |
| Panel | at (380, 56), 760×518, radius 20, 1-px border at 10 % white, fill a vertical gradient from 4.5 % to 2 % white, inner 1-px top highlight at 8 % white, shadow 0 30 80 at 50 % black, padding 36 px 40 px; everything below sits inside it, top to bottom |
| Label | JetBrains Mono 13 px, `#6b6b76`, uppercase, letter-spacing 0.5 px: `LAST 14 DAYS` (the day count from `--days`) |
| Peak pill | right end of the same row: JetBrains Mono 12 px uppercase `#6b6b76` in a pill (padding 6×12, radius 8, 1-px border at 10 % white, 3 % white fill): `PEAK HOUR` then `{index} · {LEVEL}` in the level colour, weight 500 |
| Name | 18 px below, Inter 700 76 px, letter-spacing −3 px, white, text shadow 0 0 40 at 18 % white |
| Sentence | 22 px below, Inter 400 22 px, line height 31, `#a1a1aa`, max width 660, the bold spans white Inter 600, the motto in the same paragraph |
| Divider | 30 px below, 1 px at 10 % white, 26 px of space after it |
| Spectrum bar | 8 px tall, radius 4, four segments in order calm, warming, heating, fried, widths in percent, 2-px gaps, segments of 0 % omitted |
| Legend | 14 px below the bar, JetBrains Mono 12.5 px `#6b6b76`: a 6-px dot, the percent in `#a1a1aa` weight 500, the level name, items separated by two spaces |
| Highlights | 30 px below, three equal panels with 16-px gaps: radius 12, 1-px border at 10 % white, 2.5 % white fill, inner top highlight, padding 18×20; value Inter 700 38 px, letter-spacing −1.6 px, tabular figures, white; caption 8 px below, JetBrains Mono 12.5 px `#6b6b76`, sentence case, one line (`sessions at once`, `switches in one hour`, `longest streak`, …) |
| Repo link | at (60, 566), two lines: JetBrains Mono 11 px uppercase `#6b6b76`, letter-spacing 1.5 px, `GET YOURS`; 8 px below, JetBrains Mono 500 17 px in the character's light accent, letter-spacing −0.2 px: `github.com/drakulavich/zapara` |
| Source line | right-aligned to x = 1140 at y = 588, JetBrains Mono 12 px `#a1a1aa`: `computed locally from your Claude Code transcripts · nothing leaves your machine` |

Level colours: calm `#7ee2a3`, warming `#fbd77a`, heating `#c4a0ff`, fried
`#ff6b8f`. Each character has an accent for the streaks and a light accent for
the repo link: Conductor `#8b5cf6` / `#c4b5fd`, Supervisor `#22d3ee` /
`#a5f3fc`, Marathoner `#f59e0b` / `#fde68a`, Night Owl `#60a5fa` / `#bfdbfe`.

The reference for this look is the mock rendered during design review
(`card-v6.template.html` in the ledger workspace, a screenshot of which the
owner approved); the template starts from that file's CSS.

### Characters

Four illustrations in one style, generated once by the owner as a single
sheet with a transparent background (Conductor top left, Supervisor top
right, Marathoner bottom left, Night Owl bottom right; they do not respect
exact quadrants), stored as `assets/characters.webp`: the sheet resized to
1024×1024, lossy WebP at quality 85 with alpha, about 200 KB, committed as
an ordinary file (not LFS) so a plain clone renders cards. The template
shows each character through a crop rectangle given in sheet fractions
`[x, y, w, h]`, a constant `CHARACTER_RECTS` in `src/cardhtml.ts` measured
on the current sheet (Conductor `[0.02, 0.01, 0.53, 0.543]`, Supervisor
`[0.55, 0.07, 0.38, 0.505]`, Marathoner `[0.02, 0.553, 0.50, 0.437]`, Night
Owl `[0.54, 0.585, 0.45, 0.41]`); the box is scaled so the rectangle's longer
side is 320 px, and centred at (190, 210), using CSS `background-size` and
`background-position`, so no cropping tool is involved anywhere.
`scripts/prepare-characters.ts` turns the source PNG into the WebP with
`Bun.Image` (resize to 1024, alpha kept) and is how it is regenerated when
the art changes; a new sheet means re-measuring the four rectangles. The
source PNG is not in the repository.

### Fonts

Inter 400, 700 and 800 and JetBrains Mono 500, Latin subsets as WOFF2, in
`assets/fonts/` with their SIL Open Font License texts, committed as ordinary
files (about 30 KB each). `scripts/fetch-fonts.ts` downloads them from pinned
URLs and checks pinned SHA-256 digests; it is how they are regenerated. The
template declares them with `@font-face` and `data:font/woff2;base64,` URIs.

## Architecture

Core (pure, no `node:`, no `Bun`, no clock), all taking plain data:

```
src/card.ts      cardData(days: Day[], w: { days: number }) → CardData | null   (null when no active hour)
src/cardhtml.ts  cardHtml(card: CardData, days: Day[], assets: CardAssets) → string
                 CardAssets = { fonts: { inter400, inter700, inter800, mono500 }, characters: string }  (the sheet)
                 every field a base64 string; the function escapes nothing from the transcripts
                 because nothing from the transcripts reaches it: only numbers, dates and the fixed strings above
```

Shell:

```
src/image.ts     loadAssets() → Promise<CardAssets>      reads assets/fonts and assets/characters next to the source
                 renderCard(html: string, out: string) → Promise<void>
```

`loadAssets` reads the five files relative to `import.meta.dir`; a missing
or unreadable one is `assets missing: reinstall zapara` on stderr, exit 1,
with no path. `renderCard` writes the HTML as is when `out` ends in `.html`.
Otherwise it opens `new Bun.WebView({ width: 2400, height: 1260 })`,
navigates to a `data:text/html;charset=utf-8` URL of the page, waits until
`document.fonts.status` is `loaded` and every `<img>` reports `complete`
(polled through `evaluate`, 15-second budget), takes a PNG screenshot, resizes
it to 2400×1260 with `Bun.Image` when it is larger, re-encodes to WebP when
asked, writes the file, and closes the view (also on failure). A constructor
or navigation failure whose message says no browser is available becomes the
`card needs a browser engine` line.

`Bun.WebView` has been in Bun since April 2026 and `Bun.Image` since May
2026; `engines` says `>= 1.4.0`, which has both.

This is why the shell grows a fourth file: the base spec's Architecture
section and the CLAUDE.md shell rule are amended in the same change to list
`src/image.ts` as the only module that may use `Bun.WebView` or `Bun.Image`,
read the assets, or write a file.

`src/index.ts` gains the `card` command and its flags. `report()` is reused
unchanged; `card` never reads the projects tree itself.

## Testing

Same rules as the base spec: fixtures in the real transcript format, through
`analyze()` (for `cardData` and `cardHtml`) or the CLI; nothing imports
`parse`, `derive` or `scan`; every new test fails under a one-line mutation.
`cardHtml` tests get the real assets through the same loader the CLI uses,
handed in as data.

Scenarios:

- `busy-week` through `analyze()` then `cardData()` (window `--to
  2026-09-20 --days 14`, the default): the character and the full sentence with its numbers
  pinned; `peak` pinned; the spectrum pinned (22 active hours: 15 calm, 3
  warming, 1 heating, 3 fried → 68 / 14 / 4 / 14, and a test that the four
  numbers sum to 100); the three highlights pinned by key, value and caption
  (Conductor: peakSessions `5`, contextSwitches `54`, then longestStreak
  as the largest remaining norm); the four shares pinned to two decimals.
- One small fixture per character, each built so that one share clearly
  wins, pinning the character, the sentence's numbers and the two owned
  highlights. A tie fixture (two equal shares) pins the tie order. A fixture
  where `lateShare` has the largest remaining norm on a non-Night-Owl card
  pins that it is skipped for the third highlight.
- Spectrum rounding: a fixture whose raw shares are 33.3 / 33.3 / 33.3 / 0
  pins 34 / 33 / 33 / 0 (largest remainder).
- An empty window through `cardData()` is `null`.
- `cardHtml` on `busy-week`: the page contains the name and the sentence
  once each; the peak pill carries `87 · Fried` in the fried class; the
  spectrum bar has exactly four segments whose inline widths are `68%`,
  `14%`, `4%`, `14%`; three highlight panels in the pinned order; the
  character box carries the conductor's class; the sheet and all four fonts
  are embedded as `data:` URIs; no `http:`, `https:` or `//` reference
  anywhere; no date string (`2026-`) anywhere in the page; the page's
  SHA-256 is pinned as a golden value with a comment naming the command that
  regenerates it (any change to the look has to be acknowledged in the test).
- Sentence fit: the longest sentence the formats can produce (five-digit
  session and switch counts, a seven-figure token count) plus the motto is
  under 180 characters, the width at which three lines of 22-px Inter
  overflow the 660-px sentence box. Highlight values: the longest value
  (`99999`, `5h59m`, `100%`) fits the 40-px-tall value line of a 213-px
  panel at 38 px; the test pins the character count limit derived from the
  mock.
- CLI on the `busy-week` tree: `--out x.html` writes exactly the `cardHtml`
  string; `--json` prints the data and creates no file; an empty window
  exits 1 with the one-line message and no file; `--out x.gif` exits 2 with
  a usage line; `--out` with an embedded newline and `--out` with an ESC byte
  each exit 2, print one stderr line without the value, and create no file;
  stdout's second line is `wrote <exactly the --out given>`.
- CLI rendering, run only where a `Bun.WebView` can be constructed (the test
  probes once and skips otherwise; GitHub's Ubuntu runners ship Chrome, so
  CI runs it): `--out x.png` produces a file whose `Bun.Image` metadata is
  2400×1260 PNG; `--out x.webp` a 2400×1260 WebP; both larger than 20 KB.
- Assets: `loadAssets` on the checked-in files returns five non-empty
  base64 strings (four fonts and the sheet), and the sheet decodes to
  1024×1024 WebP through `Bun.Image`.

`tests/helpers` gains nothing new: the character fixtures are composed from
the existing builders.

## README and repository

README gets a section `## Share a card` after `## What it looks like`: the
command, the two stdout lines, the card rendered from `busy-week`
(`assets/card.png`, 2400×1260; `.gitattributes` gains `assets/card.png` so it
is tracked by LFS like the other media), and one line saying the picture
needs macOS or an installed Google Chrome, while `--out card.html` works
anywhere. CHANGELOG under Unreleased/Added. The demo screencast stays as it
is.

## Later

Not in this change: a `--theme light`, a card for `day`, custom text, or
posting anywhere. If people share the card, the next thing to consider is a
tiny caption they can edit; until then the card says only what the data says.
