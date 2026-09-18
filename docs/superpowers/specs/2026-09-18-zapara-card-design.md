# zapara card: a shareable picture of your last two weeks

Extends `2026-09-17-zapara-design.md`. Everything not mentioned here stays as
that spec says.

## Purpose

`zapara card` turns a window of transcripts into one image a person wants to
send to a colleague: a pixel-art character that names how they drive Claude
Code, one sentence with two numbers behind that name, a heatmap of the window,
three totals, and the project's line. It exists to make the tool travel: the
week heatmap convinces the person who ran it, the card convinces the person
they show it to.

The card is a picture of numbers zapara already computes. It adds no new
signal, no new score, and no new data source.

## CLI

```
zapara card [--days N] [--to YYYY-MM-DD] [--out PATH] [--json] [--projects DIR]
```

- `--days` defaults to 14 and accepts 1 to 28 (the heatmap has room for 28
  rows; `week` keeps its own 1 to 90).
- `--to` defaults to today, as for `week`.
- `--out` defaults to `zapara-card.png` in the current directory. The format
  is the extension: `.png` or `.webp`; any other extension is a usage error
  (exit 2). A value containing a control character (any code point below
  0x20, or 0x7f) is a usage error too (exit 2, the message names the flag,
  not the value), so the `wrote …` line is always one line of plain text and
  can never carry a terminal escape. An existing file is overwritten: the
  person named it.
- `--json` prints the card's data (below) to stdout and writes no file.
- Without `--json`, stdout gets two lines: the character line
  (`The Conductor: 6 sessions at once, 38 context switches in one hour`) and
  `wrote zapara-card.png`, echoing `--out` exactly as given. No other path is
  ever printed.
- A window with no active hour prints `no activity in the last 14 days`
  (with the actual `--days`) to stderr, writes nothing, exits 1.
- Colors and TTY detection do not apply: the card is the same everywhere.

Privacy amendment to the base spec: `card` is the one command that writes a
file. It writes exactly one file, at the path the person gave or the default in
the current directory, and prints that path back verbatim. It never writes
anywhere else and never prints a path it derived from the projects tree. The
README's privacy section says "no file is written except the card you ask
for".

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

| Character | Name on the card | Sentence (numbers from the window) |
|---|---|---|
| conductor | THE CONDUCTOR | `{maxSessions} sessions at once, {maxContextSwitches} context switches in one hour` |
| supervisor | THE SUPERVISOR | `{reports} agent reports and {outputTokens} tokens of output read` |
| marathoner | THE MARATHONER | `longest streak {streak}, {activeHours}h active in {days} days` |
| nightOwl | THE NIGHT OWL | `{lateHours} late-night hours out of {activeHours}` |

Where `maxSessions` and `maxContextSwitches` are the window maxima over
buckets, `reports` and `outputTokens` are window sums, `streak` is the maximum
`streakMin` over buckets rendered as `5h12m` (or `48m` under an hour),
`activeHours` is the count of active buckets, `lateHours` the count of active
buckets with `lateNight`, `days` the `--days` value. `outputTokens` is
rendered as `412k` or `1.2M` (one decimal, `k` under a million).

Totals shown on the card: `activeHours`, `peak` (max index and its level),
`hotHours` (active buckets with index ≥ 60). Window label:
`{days} DAYS  {first date} TO {last date}` with dates as `YYYY-MM-DD`. Every
string drawn on the card is printable ASCII, because that is all the font has;
separators are spaces and `|`, never `·` or dashes other than `-`.

`--json` prints:

```json
{ "days": 14, "from": "2026-09-05", "to": "2026-09-18", "character": "conductor",
  "name": "The Conductor", "sentence": "6 sessions at once, 38 context switches in one hour",
  "shares": { "conductor": 0.61, "supervisor": 0.33, "marathoner": 0.52, "nightOwl": 0.06 },
  "activeHours": 70, "peak": { "index": 89, "level": "Fried" }, "hotHours": 12 }
```

Shares are rounded to two decimals in JSON only.

## Picture

The card is drawn at a base size of 400×210 pixels and scaled ×3 with
nearest-neighbour sampling to 1200×630, the aspect ratio social previews use.
Everything on it is pixel art: an 8×8 bitmap font, 32×32 sprites, flat
rectangles. No anti-aliasing anywhere, so the scaled image stays crisp and the
base raster is what tests look at.

Layout in base pixels (x right, y down):

| Element | Position | Detail |
|---|---|---|
| Background | whole card | `#1e1e2e` |
| Header left | (12, 8) | `ZAPARA` in the 8×8 font, `#cdd6f4` |
| Header right | right-aligned to x = 388, y = 8 | window label, `#a6adc8` |
| Sprite | (12, 28), 64×64 | the character's 32×32 sprite drawn at ×2 |
| Name | (88, 36) | `THE CONDUCTOR`, font at ×2 (16 px), `#f5e0dc` |
| Sentence | (88, 62) | font at ×1, up to two lines of at most 37 characters, wrapped at spaces, `#cdd6f4` |
| Heatmap | (12, 100) | one row per day, 24 cells; cell width 14 with a 1-px gap (x pitch 15, block width 359). Vertical budget is 84 px: row pitch `p = floor(84 / days)` (84 for 1 day, 6 for 14, 3 for 28); the drawn cell height is `p - 1` when `p >= 3` (the remaining pixel is the gap) and `p` otherwise; row `i` starts at `y = 100 + i * p`, so the block ends at or before y = 184 for every allowed `--days`. Cell colour by level, `#313244` for an hour without activity |
| Totals | (12, 190) | `70H ACTIVE | PEAK 89 FRIED | 12H HEATING+`, `#a6adc8` |
| Footer | (12, 200) left, right-aligned to 388 | left `KEEP YOUR HEAD COLD` in `#f5e0dc`; right `github.com/drakulavich/zapara` in `#a6adc8` |

Level colours match the terminal's four: calm `#a6e3a1`, warming `#f9e2af`,
heating `#cba6f7`, fried `#f38ba8`.

The font is `font8x8` (Daniel Hepper, public domain), the 96 printable ASCII
glyphs embedded as 768 bytes of hex in `src/font8x8.ts` with the licence note.
Characters outside ASCII render as `?`; the card never needs them.

Sprites live in `src/sprites.ts` as 32 strings of 32 characters each per
character, with `.` for transparent and `a`–`d` for that sprite's four palette
colours. The four are visibly different silhouettes: the Conductor with both
arms raised and a baton, the Supervisor with round glasses and a stack of
pages, the Marathoner mid-stride with a headband, the Night Owl an owl on a
branch under a crescent moon. Their pixel art is part of the implementation
plan, not this spec; the spec only fixes size, palette count and the reading
order.

## Architecture

Core (pure, no `node:`, no `Bun`, no clock), all taking plain data:

```
src/card.ts     cardData(days: Day[], w: { days: number }) → CardData | null   (null when no active hour)
src/raster.ts   Raster = { width: number; height: number; rgb: Uint8Array }     (row-major, 3 bytes per pixel)
                rasterCard(card: CardData, days: Day[]) → Raster                (400×210)
                helpers: fill, text (8×8 font at a scale), sprite
src/font8x8.ts  the glyph table
src/sprites.ts  the four sprites and their palettes
```

Shell:

```
src/image.ts    writeImage(raster: Raster, out: string) → Promise<void>
```

`writeImage` wraps the raster in a 24-bit BMP header (54 bytes, no
compression, no checksums), hands the bytes to `new Bun.Image(bytes)`,
applies `.resize(1200, 630, { kernel: "nearest" })`, encodes with
`.png({ palette: true })` or `.webp({ lossless: true })` by extension, and
`.write(out)`. `Bun.Image` ships with Bun since 1.3.14; `engines` already says
`>= 1.4.0`. This is the reason the shell grows a fourth file: the base spec's
Architecture section and the CLAUDE.md shell rule are amended in the same
change to list `src/image.ts` as the only module that may use `Bun.Image` or
write a file.

`src/index.ts` gains the `card` command and its flags. `report()` is reused
unchanged; `card` never reads the projects tree itself.

## Testing

Same rules as the base spec: fixtures in the real transcript format, through
`analyze()` (for `cardData` and `rasterCard`) or the CLI; nothing imports
`parse`, `derive` or `scan`; every new test fails under a one-line mutation.

Scenarios:

- `busy-week` through `analyze()` then `cardData()`: the character and the
  full sentence with its numbers pinned; `activeHours`, `peak`, `hotHours`
  pinned; the four shares pinned to two decimals.
- One small fixture per character, each built so that one share clearly
  wins, pinning the character and the sentence's numbers. A tie fixture
  (two equal shares) pins the tie order.
- An empty window through `cardData()` is `null`.
- `rasterCard` on `busy-week` (window `--to 2026-09-20 --days 7`): the
  pixel at the centre of Monday's 13:00 cell is the fried colour and Sunday's
  03:00 cell is the empty colour; a pixel inside the sprite box is not
  background; the raster's SHA-256 is pinned as a golden value with a comment
  naming the command that regenerates it (any visual change, wanted or not,
  has to be acknowledged in the test).
- Heatmap budget: for `--days 14` and `--days 28`, the last row's bottom
  pixel is at y ≤ 183 and the pixel row y = 184..189 is background across the
  block, so the heatmap never touches the totals line.
- CLI on the `busy-week` tree: the file exists, `Bun.Image(...).metadata()`
  says 1200×630 and `png`; `--out x.webp` gives `webp`; `--json` prints the
  data and creates no file; an empty window exits 1 with the one-line
  message and no file; `--out x.gif` exits 2 with a usage line; `--out` with
  an embedded newline and `--out` with an ESC byte each exit 2, print one
  stderr line without the value, and create no file; stdout's second line is
  `wrote <exactly the --out given>`.

`tests/helpers` gains nothing new: the character fixtures are composed from
the existing builders.

## README and repository

README gets a section `## Share a card` after `## What it looks like`: the
command, the two stdout lines, and the card rendered from `busy-week`
(`assets/card.png`; `.gitattributes` gains `assets/*.png` so it is tracked by
LFS like the other media; the tape does not change). CHANGELOG under
Unreleased/Added. The demo screencast stays as it is.

## Later

Not in this change: a `--theme light`, a card for `day`, custom text, or
posting anywhere. If people share the card, the next thing to consider is a
tiny caption they can edit; until then the card says only what the data says.
