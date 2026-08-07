# SmartBitz Design System

Patch POS2.0-A. The visual language every Operations screen must follow.

This document is normative. When a screen and this document disagree, the screen
is wrong.

---

## Notación epistémica

- **[R]** — regla del sistema. Verificable en el código.
- **[I]** — inferencia razonada sobre la evidencia.
- **[D]** — decisión abierta, no tomada aquí.

---

## 1. What was studied, and what was taken

The reference material was a working Nicaraguan ERP of the same shape as this one
— importer, multi-branch, credit sales, purchasing, payroll — plus the interfaces
the brief named: Stripe Dashboard, Shopify POS, Square POS, Linear, Notion,
Raycast.

**Nothing was copied.** What follows is what the study produced.

### 1.1 What professional ERPs have in common

**[I] A fixed left rail, and content that never moves.** Every reference keeps
navigation anchored and scrolls only the working area. The reason is muscle
memory: an operator who reaches for "Compras" a hundred times a day must find it
in the same pixel each time. Top navigation fails this the moment the menu grows
past a dozen entries — and this product already has sixteen.

**[R] A page header with four fixed parts**: a small uppercase eyebrow naming the
module, a title, a one-line description, and the primary action on the right.
Repeated identically on every screen, it becomes furniture the eye stops reading
— which is the goal. `PageHeader` already implements exactly this.

**[I] Stat cards state, they do not decorate.** The strongest examples show a
label, one number, and one hint. The weakest wrap the number in a coloured tile
and a chart, and the number gets harder to read for it.

**[R] The table is the product.** Dashboards are looked at; tables are worked in.
Everything that makes a table faster — tabular figures, right-aligned numbers,
sticky headers, a visible result count — outranks anything that makes it prettier.

**[I] Density is a spectrum, and ERPs sit in the middle.** Linear and Raycast are
tighter than an ERP should be: they are used by one person on their own data.
Notion is looser than an ERP can afford. The comfortable middle is a 40px row
that fits ~20 rows on a laptop without a magnifying glass.

**[R] One accent colour, used sparingly.** In every strong reference the accent
appears on the primary action and the active navigation item, and almost nowhere
else. When four colours compete for primacy — as they do in the weaker reference —
the interface has no primary action at all.

### 1.2 What the reference material got wrong, and this system fixes

These are recorded because avoiding them **is** the design work.

**[I] Sixteen ungrouped navigation entries.** A flat list past ~7 items stops
being scannable; the eye reads every label instead of jumping. → §11: navigation
is grouped, and a command palette exists for direct jumps.

**[I] "No hay datos" as an empty state.** It says nothing: the user cannot tell
whether the filter is too narrow, the module is unconfigured, or the day has been
quiet. → §9: empty states name the cause and the next step, and a filtered table
uses different wording from an unused module.

**[I] Charts with no number on screen.** Several show an axis and no value
anywhere. A bar the user cannot read a figure off is decoration. → §10: every
chart carries its headline figure as text.

**[I] Overlapping labels in the checkout summary** — "Subtotal" collided with
"Descuento" in the reference. A layout that breaks at the moment of taking money
is the worst possible place for it. → §4: fixed control heights and a spacing
scale, so columns cannot collapse into each other.

**[I] Four button colours with no semantics.** Gold, navy, teal and red all appear
as primary somewhere. → §7: five variants, each with a stated meaning.

---

## 2. Philosophy

**Information first. Chrome last.**

Five rules, in priority order. When they conflict, the earlier one wins.

1. **Legibility of data** beats everything. If a decoration costs contrast on a
   number, the decoration goes.
2. **Consistency** beats local optimisation. A slightly worse layout that matches
   every other screen beats a better one that is unique.
3. **Speed of the practised user** beats discoverability for the first-timer.
   This is a tool people use eight hours a day, not a landing page.
4. **Reversibility** beats confirmation. Prefer an undo to a dialog; keep dialogs
   for what genuinely cannot be undone.
5. **Silence** beats feedback. Only tell the user what they could not already see.

**[R] The corollary that shaped every token below: the system was extracted from
the running product, not imposed on it.** Every value encodes what the panel
already renders, so adopting a token changes no pixel. A design system nobody can
adopt without a redesign is a design system nobody adopts.

---

## 3. Tokens

All tokens live in `src/app/globals.css` under `--sb-*`. Use the token, never the
literal.

### 3.1 Spacing — 4px base

| Token | Value | Use |
|---|---|---|
| `--sb-space-1` | 4px | Icon-to-text inside a control |
| `--sb-space-2` | 8px | Between related controls |
| `--sb-space-3` | 12px | Inside a dense cell |
| `--sb-space-4` | 16px | Cell padding, form field gap |
| `--sb-space-5` | 20px | Card padding |
| `--sb-space-6` | 24px | Between cards |
| `--sb-space-8` | 32px | Between sections |
| `--sb-space-10/12/16` | 40/48/64px | Page rhythm, empty states |

**[R] These steps and no others.** A 14px gap is not a decision, it is a
mistake that survived review.

### 3.2 Typography

| Token | Size | Use |
|---|---|---|
| `--sb-text-eyebrow` | 11px | Module eyebrow, uppercase, `0.06em` tracking |
| `--sb-text-xs` | 12px | Table headers, hints, badges |
| `--sb-text-sm` | 14px | **The default.** Body, table cells, inputs, buttons |
| `--sb-text-base` | 16px | Card and section titles |
| `--sb-text-lg` | 18px | Emphasised figure inside a card |
| `--sb-text-xl` | 24px | Page title, stat value |
| `--sb-text-display` | 30px | Dashboard headline only |

**[R] 14px is the body size, not 16px.** A 16px table wastes about 15% of the
vertical space, which is two or three rows on a laptop — and rows are the
product.

**[R] Weights: 400 body, 500 labels, 600 headings and numbers.** No 700. Bold on
a 14px sans is heavier than it looks and turns a table into stripes.

**[R] `sb-numeric` on every number.** Tabular figures, always. A column of
proportional digits cannot be scanned for magnitude, which is the only reason to
put numbers in a column.

### 3.3 Radius and elevation

`sm` 6px (badges, inputs) · `md` 8px (buttons, menus) · `lg` 12px (cards,
dialogs) · `full` (pills, dots).

Three elevations, and **depth means distance from the page**:

- `--sb-shadow-rest` — sits on the page. Cards, table shells.
- `--sb-shadow-raised` — floats above it. Menus, popovers.
- `--sb-shadow-overlay` — blocks it. Dialogs, drawers.

**[R] There is no fourth.** A shadow used decoratively makes the three that mean
something meaningless.

### 3.4 Colour

**Surfaces**, darkest to lightest: `--sb-canvas` (page) → `--sb-surface-sunken`
(table header, footer) → `--sb-surface-muted` (subtle fill) → `--sb-surface`
(white cards).

**Text**, four levels: `primary` (values), `secondary` (labels), `muted`
(descriptions), `subtle` (placeholders). **[R] A fifth grey is illegible or
redundant.**

**Semantic**, each with fill / soft / border / text:

| Role | Means | Not |
|---|---|---|
| `accent` blue | The primary action, the active item | Decoration |
| `success` green | Settled, paid, received | "Saved" (that is silence) |
| `warning` amber | Needs attention, still open | Errors |
| `danger` red | Failed, cancelled, irreversible | Anything reversible |
| `info` sky | Neutral context | Success |

**[R] Colour is never the only carrier of meaning.** Every status pairs its tone
with a word, and `Badge dot` adds a shape. Roughly 8% of men cannot separate the
red and green in a margin column.

### 3.5 Controls and icons

Heights `--sb-control-sm/md/lg` = 32/40/44px. **[R] This is why an input and a
button placed side by side line up** — the single most common visual defect in
hand-built forms.

Icons: 12/16/20/24px. **[R] 16px inside a control, 20px standing alone.** An icon
larger than its text outweighs it.

### 3.6 Motion

`instant` 90ms (hover) · `fast` 140ms (menus) · `normal` 200ms (dialogs) ·
`slow` 280ms (drawers).

**[R] Nothing exceeds 280ms.** Above that the interface feels like it is thinking.

**[R] Motion is an accent, never a dependency.** `prefers-reduced-motion` removes
every animation and nothing becomes unreachable.

---

## 4. Layout and density

**[R] Desktop-first.** This panel is used on a counter PC. Breakpoints:

| Width | Behaviour |
|---|---|
| < 768px | Single column. Tables scroll horizontally in their own container. |
| 768–1279px | Two-column forms, sidebar collapses. |
| ≥ 1280px | **The design target.** Full sidebar, four-up stat cards. |
| ≥ 1536px | Content capped; whitespace grows, not line length. |

**[R] The page body never scrolls sideways.** Wide content scrolls inside its own
`overflow-x-auto` container. A horizontally scrolling page loses the sidebar.

Row heights: 40px comfortable (default), 32px compact (dense tables), 48px
relaxed (touch). **[D]** A user-facing density toggle is not implemented; whether
the product needs one is unanswered.

---

## 5. Focus, keyboard and accessibility

**[R] One focus ring for the whole application**: `.sb-focus`, which draws a white
inner ring and a blue outer one so the same token is legible on white inputs and
on coloured buttons.

**[R] `:focus-visible`, never `:focus`.** A mouse click should not draw a ring.

**[R] Never remove an outline without replacing it.**

Keyboard contract:

| Key | Everywhere |
|---|---|
| `Tab` | Moves between controls, never inside a widget |
| `Arrows` | Move inside menus, tabs, the palette |
| `Enter` | Activates |
| `Escape` | Closes the topmost surface and **returns focus to its trigger** |
| `Ctrl/⌘-K` | Command palette |

**[R] Restoring focus on close is not optional.** Dropping focus to `<body>` means
the next Tab starts from the top of the page.

Contrast: **[R] 4.5:1 for text, 3:1 for borders and icons.** `--sb-text-subtle` is
the lightest grey permitted on white, and only for placeholders.

Every interactive element needs an accessible name. Icon-only buttons carry
`aria-label`. **[R] `Field` appends `*` to the label of a required input**, which
changes its accessible name — tests must match on the full string.

---

## 6. Component catalogue

Everything lives in `src/components/ui/`. **[R] Compose; never fork.** A second
implementation is one decision written twice, and the copy is where the next
change gets forgotten.

### Existing, kept

| Component | Role |
|---|---|
| `Button` | Five variants, four sizes |
| `Input` | The base field |
| `Card` | The surface |
| `Badge` | Label **and** status chip |
| `StatCard` | One figure |
| `PageHeader` | Eyebrow, title, description, actions |
| `EmptyState` | A section that has never held data |
| `FormSection`, `Field` | Form grouping and labelling |
| `DataTableShell` | Table frame |
| `SectionTabs` | Tabs that are routes |
| `SubSidebar` | Contextual module rail |
| `BrandLoading` | Full-page brand loader |

### Added by POS2.0-A

| Component | File | Role |
|---|---|---|
| `Dialog`, `ConfirmDialog` | `dialog.tsx` | Interrupt for an answer |
| `Drawer` | `drawer.tsx` | Detail beside context |
| `DropdownMenu`, `MenuTrigger` | `dropdown-menu.tsx` | Actions on one thing |
| `Select` | `select.tsx` | Native select, styled once |
| `SearchField`, `MoneyInput`, `QuantityInput`, `DateInput`, `Textarea` | `fields.tsx` | The four things an ERP types all day |
| `Table`, `THead`, `TBody`, `TR`, `TH`, `TD`, `TDActions`, `TableEmptyRow` | `table.tsx` | Semantic table cells |
| `Pagination` | `pagination.tsx` | Range, page size, windowed pages |
| `Skeleton`, `SkeletonTable`, `Spinner`, `LoadingOverlay`, `Notice`, `ToastProvider`, `useToast` | `feedback.tsx` | Loading and notification |
| `Tabs`, `Breadcrumbs`, `Toolbar` | `navigation.tsx` | In-page navigation |
| `CommandPalette`, `useCommandPalette` | `command-palette.tsx` | Ctrl-K foundation |
| `ChartFrame`, `ChartLegend`, `chartSeriesColors` | `chart-frame.tsx` | Chart container and palette |
| overlay hooks | `overlay.tsx` | Escape, outside-click, focus trap, scroll lock |

---

## 7. Buttons

**[R] One primary action per view.** Three blue buttons means no primary action.

`default` the reason the screen exists · `secondary` everything safe, including
Cancel · `ghost` inside rows and toolbars · `danger` **irreversible only** ·
`success` completing a flow, rarely.

**[R] Destructive actions are never the default focus** and never sit where the
safe action usually is. Cancel left, confirm right, always.

Labels are verbs with an object: "Registrar gasto", not "Guardar". **[R] A button
labelled "OK" is a button that will be clicked without reading.**

---

## 8. Tables

**[R] Numbers right, text left, one action column on the right.**

- Headers: uppercase, 12px, muted. They should disappear once learned.
- `TD numeric` right-aligns **and** switches on tabular figures. The two always
  travel together.
- `TR muted` for records that exist but no longer act — cancelled, deactivated.
  **It dims, it never hides.** An ERP that hides cancelled documents cannot be
  audited.
- Two row actions inline; three or more go into a `DropdownMenu`.
- Money always shows its currency and always two decimals. **[R] `1,615.00`, never
  `1615`** — a truncated amount is indistinguishable from a wrong one.

---

## 9. States

Four states, and a screen is always in exactly one.

**Loading** — `SkeletonTable` for lists, `Skeleton` for known shapes,
`LoadingOverlay` scoped to the card being written to. **[R] Never a full-screen
block for an in-page write**: it teaches users the application freezes.

**Empty** — `EmptyState` for a section that has never held data: icon, what it is,
and the action that fills it. `TableEmptyRow` for filters that excluded
everything. **[R] These are different messages.** One says "start here", the other
says "your filter is too narrow".

**Populated** — the default.

**Error** — `Notice` inline for anything the user must fix; a `danger` toast only
for a failure with no place on the page. **[R] Validation errors never go in a
toast**: they vanish while the user is still hunting for the field.

**[R] Disabled controls state why**, through a title or adjacent text. A greyed
button with no explanation is a dead end.

---

## 10. Charts

**[R] There is no charting library and this patch adds none** — choosing one is a
real architectural decision (bundle, SSR, accessibility of the output) that
deserves its own patch. `ChartFrame` settles everything around the plot so the
choice, when made, changes nothing else.

- **[R] Every chart states its headline figure as text.** A bar with no readable
  number is decoration.
- **[R] Series colours come from `chartSeriesColors`**, ordered for maximum
  separation between neighbours. Reds are late: red means failure elsewhere.
- **[R] Empty charts say why**, not just that.
- **[R] A chart never carries information that is not also in a table.**

---

## 11. Navigation

**[R] Fixed left sidebar, grouped.** Groups exist because a flat list past ~7
entries stops being scannable, and this product has sixteen.

**[R] The active item is unmistakable** — one item, one treatment, no hover state
that resembles it.

`SectionTabs` for tabs that are routes — **[R] prefer these**, because a colleague
should be able to paste the URL of "facturas vencidas". `Tabs` for state that
nobody would ever link to.

`Breadcrumbs` only more than one level deep. On a top-level page they are
decoration.

**Command palette** — `Ctrl/⌘-K`. **[R] It ships with no commands**: what it can do
is a product decision per module, and POS2.0-A may not touch workflows. A later
patch passes commands in; nothing in the component changes.

---

## 12. Motion

Hover 90ms · menus 140ms · dialogs 200ms · drawers 280ms.

**[R] Surfaces enter from where they belong**: dialogs scale up from centre,
drawers slide from the right edge, menus drop 4px, toasts rise 12px.

**[R] Nothing loops except loading indicators**, and those stop the moment content
arrives.

**[R] Skeletons sweep, they do not pulse.** A pulsing block reads as broken; a
sweep reads as arriving.

---

## 13. Scrollbars

`.sb-scroll` on every scrollable region: thin, neutral, and **visible only while
the region is hovered or focused**. A dense table has enough going on without a
permanent grey bar on every pane.

---

## 14. Rules for future screens

Before a screen is finished, all of these must be true:

1. It uses `PageHeader` with an eyebrow, a title and one primary action.
2. Every number carries `sb-numeric` and its currency.
3. Every table uses the `table.tsx` primitives, with numeric columns marked.
4. It renders all four states in §9 — including the two different empty states.
5. Every interactive element is reachable and operable by keyboard.
6. Every icon-only control has an `aria-label`.
7. Nothing scrolls the page horizontally at 1280px.
8. No colour is the only carrier of meaning.
9. No hardcoded hex, spacing or duration — tokens only.
10. Destructive actions use `ConfirmDialog` and name the consequence in the title.

---

## 15. Extension

**To add a token**: it must be used in at least two places and be impossible to
express with an existing one. Sizes and durations especially — a seventh type size
is a decision nobody can defend later.

**To add a component**: first prove it cannot be composed. `MoneyInput` is a
legitimate component because it adds a currency affix and decimal input mode to
`Input`; a `PrimaryButton` would not be, because it is `Button` with a prop.

**To change an existing component**: the rendered output of every screen already
using it must be considered. POS2.0-A refactored `Button`, `Input` and `Badge`
onto tokens **without changing what they render** — that constraint is the
standard, not the exception.

**[D] Open decisions**, recorded rather than invented:

| # | Question |
|---|---|
| **DS-1** | Which charting library, if any. |
| **DS-2** | Whether the product needs a user-facing density toggle. |
| **DS-3** | Whether a dark theme is in scope. Tokens are structured to allow one; no dark values exist. |
| **DS-4** | Whether the command palette should search records, not just navigate. |
| **DS-5** | Whether `Badge`'s alias tones (`emerald`, `yellow`, `gray`) should be migrated to the canonical set and removed. |

---

## 16. What POS2.0-A changed

**Added**: the `--sb-*` token layer and behaviour utilities in `globals.css`; nine
new primitive files; this document.

**Refactored, with identical rendered output**: `Button`, `Input` and `Badge`
adopt `.sb-focus`; `Badge` gains an optional `dot`; `Input` gains hover and
disabled states it did not have.

**Not touched**: no screen, no workflow, no action, no query, no Prisma schema, no
permission. Verified by `next build`, `tsc --noEmit` and lint.

**Consumed by**: POS2.0-B onward, which will migrate screens module by module —
each one an explicit patch, never a silent restyle.
