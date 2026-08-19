# Design — 绘界

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

## Genre
editorial

## Macrostructure family
- App pages: Workbench — left parameter rail + right canvas/grid. Rail is a
  warm raised card; canvas is a flat paper surface with hairline borders.
- Gallery pages (explore / history): Card Grid — masonry / column layout of
  image cards with hairline borders and inline meta.
- Admin pages: List / Form — table-like rows with hairline separators.

## Theme
- `--color-paper`     oklch(97.5% 0.010 85)   warm oat
- `--color-paper-2`   oklch(94% 0.013 85)
- `--color-paper-3`   oklch(90% 0.015 85)
- `--color-paper-4`   oklch(85% 0.017 85)
- `--color-ink`       oklch(24% 0.018 60)
- `--color-ink-2`     oklch(42% 0.014 60)
- `--color-ink-3`     oklch(56% 0.012 60)
- `--color-line`      oklch(83% 0.010 85)
- `--color-accent`    oklch(52% 0.16 30)   cinnabar / vermilion seal
- `--color-accent-2`  oklch(45% 0.09 175)  ink-green (rare)
- `--color-accent-ink` oklch(97.5% 0.010 85)
- `--color-focus`     oklch(52% 0.16 30)

## Typography
- Display: system serif stack (Songti SC / SimSun / Georgia), weight 600–700 — headings + wordmark
- Body: Geist (sans), weight 400
- Mono: Geist Mono — data, sizes, credits, seeds
- Display tracking: -0.02em
- Type scale anchor: `--text-display = clamp(2rem, 4vw + 1rem, 3.25rem)`

## Spacing
4-point named scale (`--space-1…16`). Pages use named tokens, never raw values.

## Motion
- Easings: `--ease-out cubic-bezier(0.22, 1, 0.36, 1)`
- Reveal pattern: fade-up on grid cards only; page enter = 180ms fade
- Reduced-motion fallback: opacity-only, ≤ 150ms.

## Microinteractions stance
- silent success (no celebratory toasts)
- hover delay 800ms · focus delay 0ms
- buttons: instant focus ring, `translateY(1px)` on active, no glow

## CTA voice
- Primary CTA: solid cinnabar fill, 4px radius, ink-light text
- Secondary CTA: hairline border on paper, ink text

## Per-page allowances
- Marketing pages MAY use enrichment — none exist in this app.
- App pages MUST NOT use enrichment — function carries the page.
- Content pages: typography only.

## What pages MUST share
- The wordmark (Fraunces serif, "绘界" or a short mark).
- The cinnabar accent and its placement (≤ 5% per viewport).
- The display + body fonts.
- The CTA voice (4px radius, solid fill primary).
- Section heading rhythm (serif heading + small caps label).

## What pages MAY differ on
- Macrostructure within the page-type family.
- Hero archetype (within the family's allowance).
- Enrichment — none in this app.

## Exports
`src/app/tokens.css` is the single source of truth for tokens.
