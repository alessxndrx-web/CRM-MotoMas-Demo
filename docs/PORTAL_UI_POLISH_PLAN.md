# MotoMas — Portal Cliente UI polish plan (Patch 3.9P-A)

Visual audit of the **public customer portal only** (`src/app/(portal)`,
`src/features/portal`). The internal `/panel` operations center is out of scope and
must not be touched by any patch in this plan.

This is an audit and direction document. It changes **no** source code, no business
logic, no DB query, no auth and no Prisma model. It defines what to change, in what
order, and what must stay untouched.

> **Direction amendment (Patch 3.9P-C):** the "dark cinematic hero" originally
> proposed in §2/§4 was **rejected**. The Portal Cliente stays **white/light
> premium** end to end: no dark hero, no dark first viewport, no cinematic dark
> staging. The dark navy `.portal-stage` surface is acceptable only for the
> *final* CTA band. Wherever this document says "dark stage" for the hero or the
> model detail band, read "soft light showroom platform" instead. Everything else
> (navy primary, orange = conversion CTA only, unboxed bike, status-first
> tracking pages) stands.

---

## 1. Current diagnosis

The portal is **not** a blank slate. Patches 3.P1/3.P4A already gave it a
portal-scoped light UI kit (`src/features/portal/components/ui.tsx`), a sticky
header, a mobile CTA, scroll reveals and hover lifts. The problem is not "missing
polish" — it is that the portal is **well-executed generic**. It looks like a
competent SaaS marketing template that happens to contain motorcycles, not like a
motorcycle dealership.

Six concrete causes, in order of visual damage.

### 1.1 The brand color is never actually used (highest impact, lowest effort)

`src/app/globals.css` defines the real brand token:

```css
--brand-navy: #12284c;   /* deep blue  */
--brand-orange: #f97316; /* MotoMas orange */
```

The portal then uses **stock Tailwind `blue-600` (#2563eb)** for every primary
button, icon tile, focus ring, active nav and progress step. `blue-600` is the
single most recognizable "AI SaaS default" color in existence. The deep navy that
would make this feel automotive and premium is defined, exported through
`@theme inline` as `--color-navy`, and then **ignored by every portal component**.

This one substitution changes the perceived brand more than any layout work.

### 1.2 The hero is light and boxed, not dark and cinematic

`showroom-hero.tsx` is a light hero. The motorcycle sits **inside a bordered white
card** (`rounded-3xl border border-slate-200 bg-gradient-to-b from-white to-slate-100`)
— the bike is framed like a product thumbnail in a dashboard widget, not staged in
a showroom.

Worse, the two genuinely cinematic assets that exist are wasted:

| Asset | Current use | Effect |
|---|---|---|
| `public/motomas/hero/background.webp` | `opacity-[0.07]` | Invisible |
| `public/motomas/hero/floor.webp` | `opacity-25`, clipped to bottom half of a card | Barely readable as a floor |

The dark cinematic hero the brief asks for is **already possible with the assets on
disk**. It is currently being suppressed to near-zero opacity to protect dark text
on a light background.

### 1.3 The tracking pages are literally a CRM record view

This is the "looks like an internal dashboard" complaint, and it is accurate.
`public-process-lookup.tsx` renders every customer-facing result — `/mi-credito`,
`/mi-reserva`, `/mi-entrega`, `/consultar-expediente` — as:

- a **2-column grid of 6–9 `InfoTile`s**, each a bordered slate box with an
  uppercase micro-label and a bold value (`Nombre`, `Código de solicitud`,
  `Teléfono`, `Sucursal`, `Estado actual`, `Última actualización`…), and
- a **`DbProgressLine`**: five bordered boxes with numbered squares.

That is a database record printed to the screen. A customer does not want to read
their own record — they want one sentence: *where is my motorcycle, and what
happens next.* The information is correct and the DTO is safe; the **presentation**
is internal-tooling shaped.

The `NextStep` block — the single most valuable thing on the page — is rendered
last, below the tiles, in the smallest visual container.

### 1.4 Catalog data is mostly empty, and the current card design exposes that

Measured against `src/data/catalog/motorcycles.ts` (~16 models):

| Field | Models missing it |
|---|---|
| `category` | **all** (no model has a category) |
| `colors` | 15 |
| `brand` | 13 |
| `shortDescription` | 10 |
| `technicalSpecs` | 10 |

So for **10 of ~16 models**, `MotorcyclePublicCard` renders an image, a name, and
then nothing — no brand pill, no description, and two buttons. The grid reads as
half-finished. On `/motocicletas/[slug]` it is worse: those models get a hero
image, a title, and an empty right column where specs would be.

`PROJECT_RULES.md` §17 forbids inventing names, specs, colors or prices. **So this
cannot be fixed with design alone.** The card must be redesigned to look
*intentional* when sparse (imagery-led, typographic), and the real data must be
collected as a separate content task. Any patch that "fills" these cards with
invented spec chips violates project rules.

There is also **no filtering or sorting** on `/catalogo` — and with zero categories
in the data, none is currently possible.

### 1.5 Image treatment is inconsistent and unoptimized

- **Two visual languages in one grid**: 5 models have transparent PNGs
  (`/showroom/motorcycles/*.png`), the other ~15 are JPEG photos *with their own
  backgrounds* (`/catalog/motorcycles/*.jpeg`). Both are shown `object-contain` on
  a slate gradient plate, so the photos read as "sticker on a plate" next to the
  clean cut-outs.
- **`next/image` is used in exactly zero portal files.** Six files carry
  `/* eslint-disable @next/next/no-img-element */` and use raw `<img>`. No srcset,
  no AVIF/WebP conversion, no width/height → no responsive delivery, and the hero
  bike (the LCP element) is not prioritized.

### 1.6 Hierarchy and rhythm are flat

- Every section is `py-14` with a `max-w-[1240px]` container and an identical
  `PortalSectionHeader` (badge → h2 → orange rule → description). Four consecutive
  sections on the home page have the exact same opening cadence, so nothing feels
  more important than anything else.
- **The orange accent is spent everywhere** — header CTA, hero CTA, mobile sticky
  CTA, final CTA, every section eyebrow rule, every card hover underline. When
  everything is accented, the conversion CTA is no longer special.
- No typeface is loaded: `--font-geist-sans` resolves to `"Segoe UI", Arial`. The
  portal is set in the system UI font, which is the definition of neutral.
- Radii and shadows are ad-hoc: `rounded-xl` / `rounded-2xl` / `rounded-3xl` and
  four different hand-written `rgba` shadows coexist.

### 1.7 Dead code still in the tree

`featured-motorcycle-carousel.tsx` and `motomas-showroom-carousel.tsx` are both
superseded by `showroom-hero.tsx` and are no longer imported by any page. They are
carrying `eslint-disable` comments and asset references for nothing.

---

## 2. Target visual direction

> **A premium dealership showroom, not a CRM with a public skin.**

The portal should open **dark and cinematic** (the bike, staged, lit), then drop
into **clean light content** (catalog, process, self-service). Dark is the stage;
light is the paperwork. The customer-facing tracking pages should read as a
**status story**, not a record dump.

| Principle | Means |
|---|---|
| Premium automotive | Deep navy + near-black, generous negative space, restrained motion |
| Motorcycle-first | The product is the largest element on every screen it appears on |
| Dark cinematic hero | Real backdrop + floor assets at full strength, light text on dark |
| Clean light content | Below the hero: white/off-white, high legibility, calm |
| Deep blue primary | `--brand-navy #12284c`, **not** `blue-600` |
| Orange accent | Reserved for the single conversion CTA and active state — nothing else |
| Strong product imagery | Bikes staged, not boxed in cards |
| Subtle motion | ≤ 320ms, `prefers-reduced-motion` honored (already true — keep it) |
| No neon, no dashboard | No glow, no stat tiles, no label/value grids on customer pages |

---

## 3. The visual system

### 3.1 Color

Add portal tokens to `globals.css` and use them via Tailwind's `@theme inline`
(`--color-navy` already exists). No new dependency.

| Role | Token | Value | Used for |
|---|---|---|---|
| Primary | `--brand-navy` | `#12284c` | Primary buttons, links, active states, icon tiles |
| Primary hover | `--brand-navy-soft` | `#1b3765` | Hover of primary |
| Stage (hero) | `--portal-stage` | `#0b1526` → `#12284c` gradient | Dark hero background |
| Accent | `--brand-orange` | `#f97316` | **Only** the conversion CTA + active indicator |
| Surface | `#ffffff` | | Cards, content sections |
| Canvas | `#f6f7f9` | | Page background (already `.portal-canvas`) |
| Text | `#0f172a` / `#475569` | | Primary / secondary |

**Rule:** ban `blue-500` / `blue-600` / `blue-700` from `src/features/portal/**`.
A grep for `blue-600` in the portal must return zero hits after Patch 3.9P-B.

**Contrast:** navy `#12284c` on white is ~13:1 and orange `#f97316` needs white
text at ≥ 16px semibold to clear AA — both already hold; keep them verified.

### 3.2 Typography

Keep the system stack **or** load one display face via `next/font` (built into
`next`, so it installs nothing). Recommended: a tight grotesque for headings,
system stack for body.

| Step | Size (mobile → desktop) | Weight | Use |
|---|---|---|---|
| Display | 36 → 60px | 700, tracking-tight | Hero headline |
| H1 | 30 → 44px | 700 | Page titles, model name |
| H2 | 24 → 32px | 700 | Section titles |
| H3 | 18 → 20px | 600 | Card titles |
| Body | 16px / 1.75 | 400 | Paragraphs |
| Small | 14px / 1.6 | 400 | Secondary copy |
| Label | 12px, uppercase, tracking-wider | 600 | Eyebrows only |

Cut the uppercase micro-label from customer-facing **values** (it is what makes the
tracking pages read as a database table).

### 3.3 Cards

One card, one radius, one shadow. Replace the ad-hoc set with:

- Radius: `rounded-2xl` everywhere (hero stage may use `rounded-3xl`).
- Border: `border-slate-200/80`.
- Shadow rest: `0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.06)`.
- Shadow hover: `0 16px 40px rgba(18,40,76,.12)` + `-2px` lift (keep `.hover-lift`).
- **No card behind a motorcycle in the hero.** The bike is staged on the floor
  asset with a contact shadow, not framed.

### 3.4 CTAs

| Level | Style | Where |
|---|---|---|
| Conversion (1 per screen) | Solid **orange**, h-12, `rounded-xl` | "Solicitar información" — hero, detail page, final CTA, mobile sticky |
| Primary | Solid **navy** | "Ver catálogo", "Ver modelo", form submit, lookup submit |
| Secondary | Outline, slate border on white | "Volver al catálogo" |
| Tertiary | Text + arrow, navy | Inline links |

The header CTA should become **navy**, not orange — the orange in the sticky header
currently competes with the hero's orange CTA on the same viewport.

### 3.5 Spacing & section structure

Break the flat `py-14` rhythm with three tiers:

- **Stage** (hero): full-bleed dark, `min-h-[86vh]` desktop / `auto` mobile.
- **Feature** (catalog grid, process): `py-20 lg:py-24`, white.
- **Supporting** (trust signals, branches, tools): `py-14`, canvas tint.

Alternate white / canvas between adjacent sections so the page has a pulse.
Container stays `max-w-[1240px]`.

### 3.6 Image treatment

1. **Migrate the portal to `next/image`** (removes all six `no-img-element`
   disables). `priority` on the hero bike; `sizes` on the catalog grid.
2. **Normalize the two image languages.** Transparent PNGs get the staged
   treatment (drop shadow + floor contact ellipse). JPEG photos get a *flat neutral
   plate* (`bg-slate-100`, no gradient) so they don't fight the cut-outs.
   Long-term: cut out the remaining models to match. That is a content task.
3. Keep `object-contain` — `object-cover` slices the near-square shots (already
   documented in the card; do not regress this).
4. Fallback stays the `Bike` icon; never a broken frame.

### 3.7 Mobile behavior

- Hero: bike above headline, no model strip overflow, sticky CTA visible.
- Catalog: 1 column < 640px, 2 at `sm`, 3 at `lg`, 4 at `xl` (already correct).
- Tracking: the lookup form stacks **above** the result; it must not stay sticky
  and eat the viewport on mobile.
- No horizontal overflow at 360px. The `4xl → 3xl` mobile headline step-down in the
  hero exists for this reason — preserve it.
- Sticky CTA must keep clearing the footer (`pb-24` on the footer bottom row — this
  is deliberate; do not remove it).

---

## 4. Page-by-page recommendations

Priority: **P1 = worst offender / highest payoff.**

### `/` — Home — **P1**

- Rebuild `ShowroomHero` as a **dark stage**: `background.webp` at full strength
  with a navy gradient overlay, `floor.webp` as a real floor, bike staged on it
  with a contact shadow. Light text on dark. Remove the white card around the bike.
- One orange CTA ("Solicitar información"); "Ver catálogo" becomes a light-on-dark
  outline.
- Keep the model selector strip (it is good, and it is manual — no autoplay), but
  restyle for the dark stage.
- Cut the section count: trust signals (6 cards) + process (7 steps) + tools (6
  cards) + branches + final CTA is **five** stacked card grids. Merge "tools" into
  the footer area or a slim band; the home page should end on the hero → catalog
  teaser → process → CTA.
- Consider a **featured models row** on the home page (the 5 models that actually
  have transparent art and copy) instead of the generic "client tools" grid.

### `/consultar-expediente`, `/mi-credito`, `/mi-reserva`, `/mi-entrega` — **P1**

This is the biggest "CRM look" fix and it is one component
(`public-process-lookup.tsx`), so all four pages improve at once.

- **Lead with the answer.** Replace the `InfoTile` grid with a *status hero*:
  large status line ("Tu asesor te contactará hoy"), the model name, the branch,
  and the **`NextStep` promoted to the top** as the primary element.
- Replace `DbProgressLine`'s five bordered boxes with a **horizontal stepper** —
  a connected line, dots, done/current/pending, one label per step. No numbered
  squares in boxes.
- Demote the record fields into a quiet **definition list** ("Detalles de tu
  solicitud") below the fold — same data, same DTO, no new fields, but no longer
  the first thing the customer sees.
- Keep the masked phone, the generic not-found copy and the four-field lookup
  exactly as they are — **that is security behavior, not visual behavior.**

### `/motocicletas/[slug]` — **P2**

- Give the bike a **dark staged band** (consistent with the hero) instead of the
  light gradient card, so the product reads as a product.
- Handle the sparse case deliberately: when `technicalSpecs` / `colors` / `brand`
  are empty, do **not** render an empty column — collapse to a wide, image-led,
  typographic layout. Show `PENDING_CATALOG_INFO` only where the project rules
  require it, never as filler chips.
- The gallery (`extraImages`) should be a proper thumbnail row, not three loose
  cards.

### `/catalogo` — **P2**

- Redesign `MotorcyclePublicCard` to survive missing data: bigger image plate,
  name as the hero element, brand pill **only when present**, description clamped
  **only when present**, and one primary action ("Ver modelo") with the request
  action as a secondary link — two full-width stacked buttons per card currently
  make the grid look like a form.
- Add a lightweight **search/filter bar** *only if* real `category` data is
  collected. With today's data (zero categories) a filter UI would be an empty
  control — do not ship one.

### `/solicitar-informacion` — **P3**

Already the strongest page: a real two-column layout, a sticky aside, inline
validation, an emerald success state. Needs only token alignment (navy over
`blue-600`), consistent radii, and the submit button restyled as navy-primary with
orange reserved for the page's single conversion moment.

---

## 5. Component-level recommendations

| Component | Action |
|---|---|
| `ui.tsx` (`btnPrimary`, `btnAccent`, `btnOutline`, `PortalCard`, `PortalBadge`) | **Single source of truth.** Retokenize to navy/orange, unify radius + shadow. Everything downstream inherits the fix. |
| `showroom-hero.tsx` | Rebuild as dark stage (§4 `/`). Keep the manual model strip and the keyed remount animation. |
| `public-process-lookup.tsx` | Status-first rebuild (§4 tracking). **Do not touch** `runLookup`, the DTO, the fallback order or the masking. |
| `motorcycle-public-card.tsx` | Sparse-data-tolerant redesign; one primary action. |
| `public-header.tsx` | CTA → navy. Nav is 6 items wide and collapses at `xl` — move the three tracking links into a "Mi proceso" grouping so the desktop bar breathes. |
| `public-footer.tsx` | Keep. It is fine. Preserve `pb-24` (mobile CTA clearance). |
| `mobile-sticky-cta.tsx` | Keep as the one orange CTA on mobile. |
| `featured-motorcycle-carousel.tsx`, `motomas-showroom-carousel.tsx` | **Delete** — dead, unimported, superseded. |
| `globals.css` | Add portal tokens + stage gradient. Keep the `prefers-reduced-motion` block and the `view()` reveal exactly as-is. |

---

## 6. Exact patch sequence

Each patch is independently shippable and independently revertable. Build must pass
at every step.

| Patch | Scope | Why this order |
|---|---|---|
| **3.9P-B — Portal design tokens** | `globals.css` + `ui.tsx`. Navy replaces `blue-600`, unified radius/shadow, CTA hierarchy (orange = conversion only), header CTA → navy. Delete the two dead carousels. | Pure token swap. Every page improves at once with near-zero regression risk. Highest payoff per line changed. |
| **3.9P-C — Dark cinematic hero** | `showroom-hero.tsx` only. Dark stage, real backdrop/floor opacity, bike unboxed, light-on-dark copy. | The single most visible surface. Isolated to one component. |
| **3.9P-D — Customer status experience** | `public-process-lookup.tsx` only. Status-first layout, real stepper, next-step promoted, record fields demoted. **Zero changes to lookup/DTO/masking.** | Kills the CRM look on four routes at once. Highest risk of accidentally touching security surface → do it deliberately, alone. |
| **3.9P-E — Catalog & model pages** | `motorcycle-public-card.tsx`, `/catalogo`, `/motocicletas/[slug]`. Sparse-tolerant cards, staged detail hero, gallery row. | Depends on tokens (B) and the staging language (C). |
| **3.9P-F — Image pipeline** | Migrate portal to `next/image`, drop six `no-img-element` disables, `priority` on hero, `sizes` on grid, normalize the plate for JPEG vs PNG. | Last, so it migrates the *final* markup rather than markup that is about to change. |
| **3.9P-G — Home composition** *(optional)* | Reduce the five stacked card grids, add a featured-models row. | Composition, not correction. Only after B–F land. |

**Content task, parallel and non-blocking:** collect real `brand`, `category`,
`shortDescription`, `technicalSpecs` and `colors` for the ~10 bare models, and cut
out transparent art for the remaining ~11. This unlocks catalog filtering and full
detail pages. **No patch may invent this data** (`PROJECT_RULES.md` §17).

---

## 7. Things NOT to change

Hard boundaries. A visual patch that trips any of these is a defect.

**Security / correctness (do not touch, at all):**
- `lookupPublicPortalStatusAction`, `PublicPortalLookupResultDTO`, and the DB →
  localStorage fallback order in `runLookup()`.
- The **code + phone/cédula** verification requirement, the **masked phone**, and
  the **generic `PUBLIC_LOOKUP_NOT_FOUND`** copy. Never render a raw phone, an
  internal id, a VIN/chassis/engine number, a cost, or any Caja/Contabilidad field.
- `campaignId` / UTM capture on `/solicitar-informacion`.
- Lead creation, validation rules (cédula format, 8-digit phone) and the
  `?moto=<slug>` preselection contract.

**Project rules:**
- Never invent a model name, spec, color, or **price**. Missing data renders
  `PENDING_CATALOG_INFO` or renders nothing — never filler.
- No operational data on the portal: no inventory, no stock by branch, no
  seller-as-user, no reports, no internal login.

**Scope:**
- **Do not touch `/panel`**, `src/components/ui/*` (dark, shared by operations),
  `src/server/**`, Prisma, auth, or `package.json`.

**Behavior worth preserving (these were deliberate fixes):**
- `object-contain` on catalog images — `object-cover` sliced 7 of 15 photos.
- The hero's mobile headline step-down (`text-3xl` at 375px) — prevents overflow.
- The footer's `pb-24` — clears the mobile sticky CTA.
- `scroll-padding-top: 6rem` — keeps anchors clear of the sticky header.
- The `prefers-reduced-motion` block and the `translate`-based (not `transform`)
  scroll reveal — they compose with `.hover-lift` on purpose.

---

## 8. Visual QA checklist

Run after every patch in the sequence.

**Build / correctness**
- [ ] `npx tsc --noEmit` and `npm run build` pass.
- [ ] No `blue-500|blue-600|blue-700` remains under `src/features/portal/**`.
- [ ] No new `eslint-disable` added; the six `no-img-element` disables are gone by 3.9P-F.

**Brand**
- [ ] Primary actions are navy; **exactly one** orange CTA is visible per viewport.
- [ ] Hero reads dark/cinematic; content below reads light/clean.
- [ ] No neon, no glow, no stat tiles, no label/value grid on any customer page.

**Pages** (all 8: `/`, `/catalogo`, `/motocicletas/[slug]`, `/solicitar-informacion`,
`/consultar-expediente`, `/mi-credito`, `/mi-reserva`, `/mi-entrega`)
- [ ] Each returns 200 and renders with no console error.
- [ ] A model with **no** brand/description/specs still looks intentional (test with
      `boxer-150` or `ct-125`).
- [ ] Tracking result leads with status + next step, not a field grid.

**Responsive**
- [ ] No horizontal scroll at **360px**, 768px, 1024px, 1440px.
- [ ] Hero headline does not overflow at 375px.
- [ ] Mobile sticky CTA does not cover the footer's last row.

**Motion / a11y**
- [ ] All motion ≤ 320ms; `prefers-reduced-motion: reduce` removes it.
- [ ] Visible focus ring on every link, button and input.
- [ ] Body text ≥ AA contrast on both the dark stage and the light sections.
- [ ] Every image has a real `alt`; the missing-image fallback still renders.

**Security regression (re-verify after 3.9P-D)**
- [ ] Lookup still requires code **+** phone/cédula; phone still masked.
- [ ] Not-found copy is still generic.
- [ ] No VIN / chassis / engine / internal id / cost visible in any public DTO render.
