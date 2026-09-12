# /docs redesign — design direction (Pass 1)

Same content, same sections, same copy. New visual identity, applied to `/docs` only (its own components, so no other marketing page changes).

## The idea in one line

An email doesn't look like a SaaS card grid — it looks like a **header block, a ruled thread, and a delivery log**. The docs page is built from those three shapes: monospaced header fields, hairline-ruled lists, and a single bold "sending" moment.

## Color — "Ink & Signal"

Paper-white page, deep ink type, one saturated signal blue (the existing MunchReach accent, kept for brand continuity), plus two status hues used only where status is real (healthy / warming).

| Name | Hex | Role |
|---|---|---|
| Ink | `#0E1726` | Headlines, the one dark hero panel |
| Slate | `#4A5A70` | Body text, secondary rows |
| Paper | `#FBFCFD` | Page background |
| Rule | `#DDE3EB` | Hairlines — the main structural device |
| Signal | `#1E9AE0` | Links, focus ring, the one accent (existing brand blue) |
| Delivered | `#1F9E6E` | "Healthy" status only |
| Warming | `#C98A16` | "Warming" status only |

No gradient decoration, no tinted card washes. Color appears as ink, rule, or status — never as ornament.

## Type

- **Headlines: Archivo** — tight, slightly condensed grotesque; set at large sizes with negative tracking. Reads editorial/technical rather than friendly-startup, and is clearly not Inter/Poppins.
- **Body: IBM Plex Sans** — high legibility at documentation lengths.
- **Structural labels: IBM Plex Mono** — used for the things that genuinely are machine text: hero header fields (`From:`, `Subject:`), section indexes, mailbox rows, article slugs. Sentence-case, no letter-spaced all-caps.

## Layout

### Hero — left-aligned, asymmetric 7/5 split

The one bold moment. Dark ink panel, full-bleed, with the headline set flush-left against a monospaced "message header" block; the right column holds a quiet send-progress ledger. Baseline rules extend to the panel edge instead of a card border.

```text
┌──────────────────────────────────────────────────────────────┐
│  From: docs@munchreach.com          │  ledger                │
│  Subject: Everything you need to    │  ─────────────         │
│                                     │  queued      1,248     │
│  Everything you need to             │  delivered     991     │
│  SET UP AND SCALE                   │  replied        74     │
│  ───────────────────────────────    │  ─────────────         │
│  Practical guides for every part…   │  fill bar ▓▓▓▓░░       │
│                                     │                        │
│  [ Start for Free ]  Browse docs →  │                        │
└──────────────────────────────────────────────────────────────┘
```

Motion: one deliberate load-in — the ledger's fill bar draws once and the three counters count up once, on load only. Nothing animates on scroll. Disabled entirely under reduced-motion (final values shown immediately).

### Popular articles — a ruled thread, not a card grid

No cards, no shadows, no equal-radius boxes. A single left-aligned list of full-width rows separated by hairlines: monospaced index on the left, article title in body type, arrow on the right that only appears on hover/focus. Rows are flush edge-to-edge so the list reads as a document, not as tiles.

```text
Popular articles
─────────────────────────────────────────────────────────────
01   Why are my emails landing in spam?                    →
─────────────────────────────────────────────────────────────
02   How mailbox rotation distributes volume
─────────────────────────────────────────────────────────────
03   Setting up a custom tracking domain
─────────────────────────────────────────────────────────────
…
Building an integration? See the API reference.
```

### Everything else stays quiet

- **Quickstart** — genuine sequence, so numbering stays: a vertical rail with mono step numbers and a hairline spine, left-aligned.
- **Browse the docs** — three columns of ruled link lists under mono section titles. No card per group.
- **Connected mailbox** — a framed terminal-style panel with a mono title bar, real status colors, hairline rows.
- **FAQ** — hairline-divided disclosure rows, generous measure, no boxes.
- **CTA / footer** — unchanged footer; CTA is a single ink rule band with left-aligned type.

Radius is hierarchical, not uniform: the hero panel and mailbox frame get a small 6px radius, list rows get 0, buttons get a pill. Nothing gets a soft grey drop shadow.

## Principles

1. The page should read like a well-typeset technical document from a company that ships email infrastructure — structure comes from rules and monospace, not from boxes and shadows.
2. Boldness is spent once, in the hero; every section after it is deliberately quiet so the documentation itself is the loudest thing on the page.

## Self-review against the avoid list

- No cream/terracotta, no near-black-plus-neon; palette is paper + ink + one existing brand blue.
- No repeated identical cards or soft grey shadows — hairline rules replace them everywhere.
- No decorative gradients at all.
- No all-caps tracked eyebrows: the hero's `Subject:` line is a real monospaced header field, and other sections use plain sentence-case titles.
- Numbering only where sequential (Quickstart) plus the Popular-articles list index, which is a genuine ordered list.
- No middle-dot meta strings in new markup — the mailbox rows show provider and limit as separate ruled columns instead.
- Radius is deliberately tiered (panel 6px / rows 0 / buttons pill).

**Changed during self-review:** my first pass put "Popular articles" in a 2-column card grid with hover lift, and used an all-caps `DOCUMENTATION` eyebrow in the hero — both are on the avoid list, so the grid became a ruled thread and the eyebrow became the real `From:`/`Subject:` header field. I also cut a decorative radial glow behind the hero panel; it was accessory, not information.

## Technical notes

- New `src/components/docs/*` components; `src/routes/docs.tsx` stops using the shared marketing primitives so no other page shifts. `MarketingLayout` (nav + footer) is kept.
- Archivo / IBM Plex Sans / IBM Plex Mono loaded via a `<link>` in the root route head; font and color tokens added to `src/styles.css` as semantic variables (docs-scoped names).
- Focus-visible rings on every link/row/button; `prefers-reduced-motion` short-circuits the single hero animation.
- Verified with a desktop and a mobile screenshot, critiqued against this plan before showing you.
