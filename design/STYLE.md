# App style: Burgundy velvet (D-010)

Chosen 2026-11-07 from 12 mockups (`design/mockups/index.html#velvet-inter`). Reference render: J1 in `design/mockups/velvet.html`.

## Tokens (light; the app ships light by default)
| Token | Value | Use |
|---|---|---|
| `--page` | `#fbf7f4` | page background (cream) |
| `--card` | `#ffffff` | cards, panels |
| `--ink` | `#3a1021` | primary text |
| `--ink2` | `#6b4652` | secondary text |
| `--muted` | `#99808a` | captions, axis labels |
| `--line` | `#eedfe2` | hairline borders |
| `--grid` | `#f0e3e6` | chart gridlines, rank tracks |
| `--brand` | `#6d1a36` | oxblood: logo, feature KPI card, highlighted bar |
| `--brand-ink` | `#fbeedd` | text on brand |
| `--accent` | `#b08d57` | gold: eyebrows, low-rank fills |
| `--accent-soft` | `#f6ece2` | selected row, active nav, verdict callout |
| `--bar` | `#cdb6bd` | non-highlighted bars (emphasis = one hue + muted) |
| `--ref` | `#3a1021` | reference lines (floor average) |

Verdict tags use the colorblind-safe categorical set **with a text label**, never color alone: Location `#2a78d6`, Inspect `#c0392b`, Retired `#99808a`, Machine/game `#e08a1e`; OK and Watch get neutral chips.

## Type
- Headings (h1, brand, section titles): **Cormorant Garamond 600**, h1 ≈ 44px.
- Card numbers (KPI values, scorecard title): **Inter 600**, lining figures (Carson's change to J).
- Body, tables, labels: **Inter 400/500**, 14px; tables and axis ticks use tabular figures.

## Components (from the mockup)
Filter row (period, zone, bank, guest group) · eyebrow + h1 + one-line subhead · 4 KPI cards (first = feature card in brand color) each with an "Evidence: Cxx" link · zone bar chart (highlight one bar, floor-average dashed line, value labels with a card-colored halo) · machine scorecard side panel (rank X of N + percentile track; low ranks in gold) · verdict table with tag chips, click a row → panel + `?machine=` URL (D-021).

Charts: Recharts + custom SVG (D-038), following the dataviz rules: one axis, thin marks, 4px rounded bar ends, recessive grid, hover tooltips, legends for ≥2 series.

## Responsive behaviour (2026-11-07)
Tested at 375 (phone), 768 (tablet), 1280 and 1440 (laptop), 1920 (wide); no horizontal page scroll at any size.
| Width | Layout |
|---|---|
| ≥1100px | two columns: content left, **scorecard pinned on the right** (sticky, scrolls on its own) so it stays visible next to both tables; max content width 1520px |
| 1100–1439px | pinned scorecard uses stacked rank rows (value above the bar) |
| <1100px | one column: list → machine card → floor map; clicking a machine scrolls to its card |
| ≤1000px | nav scrolls sideways with a fade on the right edge |
| ≤900px | verdict tables become row cards (machine + verdict, place + house win, days, why) |
| ≤520px | KPI cards 2×2; zone chart uses short zone names and $10 ticks |
Type and spacing are fluid (`clamp()`): headline 30–56px, KPI numbers 24–36px, gutters 12–32px; header stays sticky.

