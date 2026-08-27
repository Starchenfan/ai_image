# Design — 绘界

A locked design system for this app. Every page redesign reads this file before
emitting code. Do not regenerate per page — extend or amend this file when the
system needs to grow.

Brand source of truth: the logo (`public/image/logo.svg`) — a navy→blue→cyan
gradient mark with a white ring, a white calligraphic stroke, and a cyan seal
dot. The entire UI language is derived from it. The previous warm "Atelier"
(cinnabar) system was replaced because it did not match the logo.

## Genre
web-app (cosmic / technical)

## Brand
- Gradient stops: `--brand-start #0A194F` (navy) → `--brand-mid #2D6BFF` (blue) → `--brand-end #23D1FF` (cyan)
- Seal accent: `--brand-accent #25D0FF`
- The full 3-stop gradient is reserved for the logo and hero moments.
  Buttons use the 2-stop navy→blue gradient (`--brand-gradient-btn`) so they
  never compete with the mark.

## Macrostructure family
- App pages: Workbench — left parameter rail + right canvas/grid. Rail is a
  white raised card with a cool hairline; canvas is a cool light surface.
- Gallery pages (explore / history): Card Grid — column layout of image cards
  with hairline borders, a gradient thumbnail, and a bottom scrim + title.
- Admin pages: List / Form — table-like rows with hairline separators.

## Theme
- `--color-paper`     #F4F7FB   cool light canvas
- `--color-paper-2`   #FFFFFF   raised card
- `--color-paper-3`   #E9EFF7   hover card
- `--color-paper-4`   #DCE5F0   active / inset
- `--color-ink`       #0A194F   navy ink
- `--color-ink-2`     #4A5878
- `--color-ink-3`     #8896B0
- `--color-line`      #D9E1EC   cool hairline
- `--color-accent`    #23D1FF   cyan seal
- `--color-accent-2`  #2D6BFF   electric blue
- `--color-accent-ink` #0A194F
- `--color-focus`     #23D1FF
- States: `--color-danger #E5406A` · `--color-warn #E8A93C` · `--color-ok #22B573`

## Typography
- Display: Noto Serif SC (serif), weight 600–700 — headings + wordmark
- Body: Noto Sans SC (sans), weight 400
- Mono: Noto Sans Mono — data, sizes, credits, seeds
- Display tracking: -0.01em
- Type scale anchor: `--text-display = clamp(2rem, 4vw + 1rem, 3.25rem)`

## Spacing
4-point named scale (`--space-1…16`). Pages use named tokens, never raw values.

## Radius
Soft & friendly: sm 6 · md 10 · lg 14 · xl 20 · 2xl 28 (pill).

## Motion
- Easings: `--ease-out cubic-bezier(0.22, 1, 0.36, 1)`
- Reveal pattern: fade-up on grid cards only; page enter = 180ms fade
- Reduced-motion fallback: opacity-only, ≤ 150ms.

## Microinteractions stance
- silent success (no celebratory toasts)
- hover delay 800ms · focus delay 0ms
- buttons: instant focus ring, subtle lift on hover, soft shadow (no hard glow)

## CTA voice
- Primary CTA: navy→blue gradient fill, 10px radius, white text, soft shadow.
- Secondary CTA: white fill + cool hairline border, navy text.
- Ghost CTA: transparent, navy text.
- Destructive CTA: solid danger red.

## What pages MUST share
- The wordmark ("绘界" in Noto Serif SC) and the gradient brand mark.
- The cool cosmic-blue palette and its placement.
- The display + body + mono fonts.
- The CTA voice (gradient primary, soft radius).
- Section heading rhythm (serif heading + small-caps label).

## What pages MAY differ on
- Macrostructure within the page-type family.
- Hero archetype (within the family's allowance).

## Exports
`src/app/tokens.css` is the single source of truth for tokens.
Visual reference: the Ardot design file `绘界 · UI Design Framework v2`
(file 719333681564030) — brand interpretation, tokens, components, app shell,
gallery, and wordmark lockups.
