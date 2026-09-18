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
| marathoner | The Marathoner | `Longest streak **{streak}**, **{activeHours}h active** in {days} days.` | `You do not stop while it compiles.` |
| nightOwl | The Night Owl | `**{lateHours} late-night hours** out of {activeHours}.` | `The best commits happen after midnight.` |

Where `maxSessions` and `maxContextSwitches` are the window maxima over
buckets, `reports` and `outputTokens` are window sums, `streak` is the maximum
`streakMin` over buckets rendered as `5h12m` (or `48m` under an hour),
`activeHours` is the count of active buckets, `lateHours` the count of active
buckets with `lateNight`, `days` the `--days` value. `outputTokens` is
rendered as `412k` or `1.2M` (one decimal, `k` under a million). The stdout
character line and the JSON `sentence` carry the sentence without the bold
marks and without the motto.

Totals shown on the card: `activeHours` (as `13h`), `peak` (max index and its
level), `hotHours` (active buckets with index ≥ 60). Window label:
`YOUR LAST {days} DAYS · {first date} – {last date}` with dates as
`YYYY-MM-DD`.

`--json` prints:

```json
{ "days": 14, "from": "2026-09-05", "to": "2026-09-18", "character": "conductor",
  "name": "The Conductor", "sentence": "6 sessions at once, 38 context switches in one hour.",
  "shares": { "conductor": 0.61, "supervisor": 0.33, "marathoner": 0.52, "nightOwl": 0.06 },
  "activeHours": 70, "peak": { "index": 89, "level": "Fried" }, "hotHours": 12 }
```

Shares are rounded to two decimals in JSON only.

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

A dark card with two soft colour blooms (the character's accent at the top
left, cyan at the bottom right), a faint 40-px grid fading out from the
character's corner, a 3-px gradient line along the top edge, and a subtle
scanline texture at 6 % opacity. Type is Inter; small numeric labels are
JetBrains Mono.

| Element | Position and style (CSS px) |
|---|---|
| Character | the character's crop of the sheet (see Characters), longer side 320 px, centred at (190, 210), with a soft drop shadow, over a radial halo of the accent colour (260×260 at (60, 84), 42 % opacity at the centre fading to 0 at 72 %) and a dashed accent ring of radius 138 centred at (190, 204) at 28 % opacity |
| Window label | at (372, 92), Inter 600 15 px, letter-spacing 3.5 px, uppercase, muted `#8e93b3`; the day count in the accent's light shade |
| Name | at (368, 120), Inter 800 76 px, letter-spacing −2.5 px, filled with a horizontal gradient from white to the accent's light shade |
| Sentence | at (372, 214), width 760, Inter 400 24 px, line height 32, `#c9cce4`; the bold spans in white Inter 600; the motto follows on the same paragraph |
| Heatmap | block at (372, 296), 768×168: 24 columns at a pitch of 32 px, cells 28 px wide with radius 4; rows at pitch `p = floor(168 / days)`, cell height `p − 3` when `p ≥ 4`, else `p`; an hour without activity is white at 5.5 % with a 1-px inner hairline at 3 %; level colours calm `#7ee2a3`, warming `#fbd77a`, heating `#c4a0ff`, fried `#ff6b8f`; heating and fried cells carry an outer glow of their own colour (14 px, 55 %; 16 px, 60 %) |
| Weekday letters | JetBrains Mono 500 13 px, `#585d80`, centred in a 22-px column at x = 340, one per row, vertically centred on the row; omitted when `p < 16` |
| Hour axis | at y = 470 under the heatmap, JetBrains Mono 12 px `#585d80`: `00 06 12 18 23` at x = 372 + 32 · hour (23 right-aligned to the block) |
| Totals | a row at (372, 512): three blocks separated by 1-px lines at 10 % white with 44 px of padding on each side; number Inter 800 44 px, letter-spacing −1.5 px, tabular figures; caption below (8 px gap) Inter 600 12 px, letter-spacing 2.5 px, uppercase, muted. `13h` / `ACTIVE`; `87 Fried` / `PEAK HOUR` with the level word in its level colour and a text glow; `4` / `HOT HOURS` |
| Brand | at (72, 520): a 10-px dot with a light-accent-to-cyan gradient and glow, then `zapara` in Inter 700 20 px; below it at (72, 552) `github.com/drakulavich/zapara` in JetBrains Mono 13 px `#585d80` |
| Tag | right-aligned to x = 1140 at y = 590, Inter 13 px, letter-spacing 2 px, uppercase, `#585d80`: `keep your head cold` |

Accents (main / light shade): Conductor `#8b5cf6` / `#c4b5fd`, Supervisor
`#22d3ee` / `#a5f3fc`, Marathoner `#f59e0b` / `#fde68a`, Night Owl `#60a5fa`
/ `#bfdbfe`. The background is `#07070f` to `#12122a` at 160°.

The reference for this look is the mock rendered during design review
(scratch file `card-v2.html`, a screenshot of which the owner approved); the
template starts from that file's CSS.

### Characters

Four illustrations in one style, generated once by the owner as a single
sheet with a transparent background (Conductor top left, Supervisor top
right, Marathoner bottom left, Night Owl bottom right; they do not respect
exact quadrants), stored as `assets/characters.webp`: the sheet resized to
1024×1024, lossy WebP at quality 85 with alpha, about 200 KB, committed as
an ordinary file (not LFS) so a plain clone renders cards. The template
shows each character through a crop rectangle given in sheet fractions
`[x, y, w, h]`, a constant `CHARACTER_RECTS` in `src/cardhtml.ts` measured
on the current sheet (Conductor `[0.02, 0.01, 0.53, 0.525]`, Supervisor
`[0.55, 0.07, 0.38, 0.505]`, Marathoner `[0.02, 0.57, 0.50, 0.42]`, Night
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

- `busy-week` through `analyze()` then `cardData()`: the character and the
  full sentence with its numbers pinned; `activeHours`, `peak`, `hotHours`
  pinned; the four shares pinned to two decimals.
- One small fixture per character, each built so that one share clearly
  wins, pinning the character and the sentence's numbers. A tie fixture
  (two equal shares) pins the tie order.
- An empty window through `cardData()` is `null`.
- `cardHtml` on `busy-week` (window `--to 2026-09-20 --days 7`): the page
  contains the name and the sentence once each; exactly 7 × 24 heatmap
  cells, of which Monday's 12:00 to 14:00 carry the fried class, Friday's
  15:00 the heating class and Sunday's row no level class; the character
  box carries the conductor's quadrant class; the sheet and all four fonts
  are embedded as `data:` URIs; no `http:`,
  `https:` or `//` reference anywhere; the page's SHA-256 is pinned as a
  golden value with a comment naming the command that regenerates it (any
  change to the look has to be acknowledged in the test).
- Heatmap budget: for 14 and 28 days the last row's bottom edge computed
  from the pitch rule stays within the 168-px block.
- Sentence fit: the longest sentence the formats can produce (five-digit
  session and switch counts, a seven-figure token count) plus the motto is
  under 190 characters, the width at which two lines of 24-px Inter overflow
  760 px.
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
