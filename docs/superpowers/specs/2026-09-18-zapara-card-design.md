# zapara card: a shareable picture of your last two weeks

Extends `2026-09-17-zapara-design.md`. Everything not mentioned here stays as
that spec says.

## Purpose

`zapara card` turns a window of transcripts into one image a person wants to
send to a colleague: a character that names how they drive Claude Code, one
sentence with two numbers behind that name, a heatmap of the window, three
totals, and the project's line. It exists to make the tool travel: the week
heatmap convinces the person who ran it, the card convinces the person they
show it to.

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
anywhere else and never prints a path it derived from the projects tree or
from its own install location. The README's privacy section says "no file is
written except the card you ask for".

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
| conductor | The Conductor | `{maxSessions} sessions at once, {maxContextSwitches} context switches in one hour` |
| supervisor | The Supervisor | `{reports} agent reports and {outputTokens} tokens of output read` |
| marathoner | The Marathoner | `longest streak {streak}, {activeHours}h active in {days} days` |
| nightOwl | The Night Owl | `{lateHours} late-night hours out of {activeHours}` |

Where `maxSessions` and `maxContextSwitches` are the window maxima over
buckets, `reports` and `outputTokens` are window sums, `streak` is the maximum
`streakMin` over buckets rendered as `5h12m` (or `48m` under an hour),
`activeHours` is the count of active buckets, `lateHours` the count of active
buckets with `lateNight`, `days` the `--days` value. `outputTokens` is
rendered as `412k` or `1.2M` (one decimal, `k` under a million).

Totals shown on the card: `activeHours`, `peak` (max index and its level),
`hotHours` (active buckets with index ≥ 60). Window label:
`YOUR LAST {days} DAYS · {first date} – {last date}` with dates as
`YYYY-MM-DD`.

`--json` prints:

```json
{ "days": 14, "from": "2026-09-05", "to": "2026-09-18", "character": "conductor",
  "name": "The Conductor", "sentence": "6 sessions at once, 38 context switches in one hour",
  "shares": { "conductor": 0.61, "supervisor": 0.33, "marathoner": 0.52, "nightOwl": 0.06 },
  "activeHours": 70, "peak": { "index": 89, "level": "Fried" }, "hotHours": 12 }
```

Shares are rounded to two decimals in JSON only.

## Picture

1200×630 pixels (the aspect ratio social previews use), drawn directly at
that size by the pure core with anti-aliased primitives and a real typeface.
Nothing is scaled afterwards.

### Typeface

Inter (SIL Open Font License), Regular and Bold, rendered ahead of time into
glyph atlases: one file per weight and size holding, for every glyph, its
advance, bearings, bitmap size and an 8-bit coverage bitmap. The core draws
text by alpha-blending those bitmaps; there is no rasterizer in the runtime.

| Atlas | Used for |
|---|---|
| bold 64 | character name |
| bold 40 | the three totals' numbers |
| regular 26 | the sentence |
| regular 20 | window label, totals' captions, weekday letters, footer |

Charset: printable ASCII plus `·` and `–`. Anything else renders as `?`.
Kerning is ignored; the advance is the glyph's own. No hinting: the atlases
are rendered at the exact pixel size they are used at, so text is crisp
without it.

The atlases live in `assets/fonts/inter-{bold,regular}-{64,40,26,20}.atlas`
(gzip, a few hundred KB together), committed as ordinary files, not LFS, so a
plain clone renders cards without Git LFS. `scripts/font-atlas.ts` rebuilds
them: it downloads a pinned Inter release from the upstream repository
(version and SHA-256 in the script), serves `scripts/font-atlas.html` on a
local port, runs the system Chrome headless against it, and reads the atlas
bytes the page emits. The page draws every glyph into a canvas with
`fillText`, measures it with `measureText`, and reads coverage from the alpha
channel. Chrome is a tool for regenerating the fonts, never a runtime
requirement; the script says which Chrome paths it tries and fails with one
line if none exists. The OFL text sits beside the atlases as
`assets/fonts/LICENSE-Inter.txt`.

### Drawing primitives (core, `src/raster.ts`)

- `Raster = { width, height, rgb: Uint8Array }`, row-major, 3 bytes per pixel.
- `fillRect`, `fillRoundedRect(radius)`, `fillCircle`, each with an
  anti-aliased edge: coverage is computed analytically per edge pixel (no
  supersampling of the whole card), then blended.
- `linearGradient` (vertical) and `radialGradient` fills for rectangles and
  circles.
- `glow(mask, color, radius, strength)`: a separable box blur run three times
  over a coverage mask, added to the raster as light. Used behind the badge
  and under hot heatmap cells.
- `strokeLine(x0, y0, x1, y1, width)` with round caps, anti-aliased, for the
  icons.
- `text(font, x, y, string, color, { align: left | right })` and
  `measure(font, string)`; `wrap(font, string, maxWidth)` breaks at spaces.

All arithmetic is deterministic floating point over integers, so the raster
for a given input is byte-identical across runs and machines.

### Layout

| Element | Position and size | Detail |
|---|---|---|
| Background | whole card | vertical gradient `#0f1020` (top) → `#1b1d3d` (bottom) |
| Accent glow | centred on the badge | `glow` with the character's accent, radius 60, so the badge floats on a soft halo |
| Badge | circle, centre (180, 190), radius 110 | radial gradient from the accent (centre) to its darker shade (edge), 2-px rim at 30 % white |
| Icon | inside the badge, 120×120 box centred | the character's icon in white with one accent-tinted detail |
| Window label | (340, 96), regular 20, `#9aa0b8`, letter-spaced 2 px | `YOUR LAST 14 DAYS · 2026-09-05 – 2026-09-18` |
| Name | (340, 170), bold 64, `#f4f4f8` | `The Conductor` |
| Sentence | (340, 226), regular 26, `#c9cce0`, line height 34, wrapped to at most 820 px, at most two lines | |
| Heatmap | block from (340, 310) to (1140, 470) | 24 columns, x pitch `800 / 24`; cells are rounded rectangles (radius 3) of width pitch − 3; rows: pitch `p = floor(160 / days)`, height `p − 2` when `p ≥ 4` else `p`, row `i` at `y = 310 + i · p`, so the block ends at or before y = 470 for 1 to 28 days. Cell colour by level; an hour without activity is white at 8 % over the background. Cells at Heating and above get a `glow` of their own colour, radius 6 |
| Weekday letters | x = 322, right-aligned, regular 20, `#9aa0b8`, one per row when `p ≥ 20`, otherwise none | `M T W T F S S` |
| Totals | three blocks at x = 340, 620, 900, baseline y = 536 (number, bold 40, `#f4f4f8`) and y = 566 (caption, regular 20, `#9aa0b8`, letter-spaced 1 px) | `70` / `ACTIVE HOURS`; `89 · Fried` / `PEAK` with the level word in the level colour; `12` / `HOT HOURS` |
| Footer | right-aligned to x = 1140, baseline y = 600, regular 20, `#6b7090` | `keep your head cold · github.com/drakulavich/zapara` |

A mock of this layout with the `busy-week` numbers was rendered in a browser
during design review; the implementation is expected to look like it, with
the icon and the halo drawn by the core instead of CSS.

Colours: level colours are the terminal's four (calm `#a6e3a1`, warming
`#f9e2af`, heating `#cba6f7`, fried `#f38ba8`). Accents: Conductor `#8b5cf6`,
Supervisor `#38bdf8`, Marathoner `#f59e0b`, Night Owl `#60a5fa`.

### Icons

Flat, geometric, drawn with the primitives above in `src/icons.ts`, one
function per character taking the raster, a centre, a size and the accent:

- Conductor: a raised baton (a thick diagonal line with a dot at the tip) over
  two arcs that read as raised arms.
- Supervisor: two round lenses joined by a bridge, above three short
  horizontal lines that read as a stack of pages.
- Marathoner: a figure mid-stride, built from a head circle, a leaning torso
  line, two leg lines, and a headband ribbon trailing behind.
- Night Owl: an owl body (a rounded shape) with two large eye circles, a small
  beak triangle, on a branch line, with a crescent moon at the upper right.

The exact geometry belongs to the implementation plan; the spec fixes the
concept, the 120×120 box, white as the main colour and one accent detail per
icon. The four must be distinguishable at 40 px, because that is how large
they are in a chat preview.

## Architecture

Core (pure, no `node:`, no `Bun`, no clock), all taking plain data:

```
src/card.ts     cardData(days: Day[], w: { days: number }) → CardData | null   (null when no active hour)
src/raster.ts   Raster and the drawing primitives above
src/font.ts     Font = decoded atlas; decodeAtlas(bytes: Uint8Array) → Font (parses the atlas format, pure)
src/icons.ts    the four icons
src/cardview.ts rasterCard(card: CardData, days: Day[], fonts: Fonts) → Raster   (1200×630)
```

Shell:

```
src/image.ts    loadFonts() → Promise<Fonts>            reads and gunzips the atlases next to the source
                writeImage(raster: Raster, out: string) → Promise<void>
```

`loadFonts` reads the four atlas files relative to `import.meta.dir` and
gunzips them with `node:zlib`; the path is never printed, and a missing or
corrupt atlas is reported as one stderr line (`fonts missing: reinstall
zapara`) with exit 1. `writeImage` wraps the raster in a 24-bit BMP header
(54 bytes, no compression, no checksums), hands the bytes to
`new Bun.Image(bytes)`, encodes with `.png({ compressionLevel: 9 })` or
`.webp({ quality: 90 })` by extension, and `.write(out)`. `Bun.Image` ships
with Bun since 1.3.14; `engines` already says `>= 1.4.0`.

This is the reason the shell grows a fourth file: the base spec's Architecture
section and the CLAUDE.md shell rule are amended in the same change to list
`src/image.ts` as the only module that may use `Bun.Image`, read the font
atlases, or write a file. No other module may touch `Bun.Image`.

`src/index.ts` gains the `card` command and its flags. `report()` is reused
unchanged; `card` never reads the projects tree itself.

## Testing

Same rules as the base spec: fixtures in the real transcript format, through
`analyze()` (for `cardData` and `rasterCard`) or the CLI; nothing imports
`parse`, `derive` or `scan`; every new test fails under a one-line mutation.
Raster tests get the real atlases through the same loader the CLI uses,
handed in as data.

Scenarios:

- `busy-week` through `analyze()` then `cardData()`: the character and the
  full sentence with its numbers pinned; `activeHours`, `peak`, `hotHours`
  pinned; the four shares pinned to two decimals.
- One small fixture per character, each built so that one share clearly
  wins, pinning the character and the sentence's numbers. A tie fixture
  (two equal shares) pins the tie order.
- An empty window through `cardData()` is `null`.
- `rasterCard` on `busy-week` (window `--to 2026-09-20 --days 7`): the
  pixel at the centre of Monday's 13:00 cell is exactly the fried colour and
  Sunday's 03:00 cell is exactly the empty-cell colour over the background
  at that y; the badge centre is not background; a horizontal scan through
  the name's baseline band finds text pixels; the raster's SHA-256 is pinned
  as a golden value with a comment naming the command that regenerates it
  (any visual change, wanted or not, has to be acknowledged in the test).
- Heatmap budget: for `--days 14` and `--days 28` the last row's bottom
  pixel is at y ≤ 469 and the rows y = 470..479 hold no cell colour across
  the block.
- Sentence fit: the longest sentence the formats can produce (five-digit
  session and switch counts, a seven-figure token count) wraps to two lines
  within 820 px.
- CLI on the `busy-week` tree: the file exists, `Bun.Image(...).metadata()`
  says 1200×630 and `png`; `--out x.webp` gives `webp`; `--json` prints the
  data and creates no file; an empty window exits 1 with the one-line
  message and no file; `--out x.gif` exits 2 with a usage line; `--out` with
  an embedded newline and `--out` with an ESC byte each exit 2, print one
  stderr line without the value, and create no file; stdout's second line is
  `wrote <exactly the --out given>`.
- Atlas round trip: the checked-in atlases decode to fonts whose glyph count
  and sizes match the table above (a corrupt or truncated atlas is caught by
  `decodeAtlas`, which is what the CLI's `fonts missing` line relies on).

`tests/helpers` gains nothing new: the character fixtures are composed from
the existing builders.

## README and repository

README gets a section `## Share a card` after `## What it looks like`: the
command, the two stdout lines, and the card rendered from `busy-week`
(`assets/card.png`; `.gitattributes` gains `assets/*.png` so it is tracked by
LFS like the other media; the tape does not change). The font atlases are not
under `assets/*.png` and stay ordinary files. CHANGELOG under
Unreleased/Added. The demo screencast stays as it is.

## Later

Not in this change: a `--theme light`, a card for `day`, custom text, hand
drawn illustrations in place of the geometric icons (they would arrive as
PNG assets and need a small PNG decoder in the shell), or posting anywhere.
If people share the card, the next thing to consider is a tiny caption they
can edit; until then the card says only what the data says.
