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

---

## 17. The application shell (Patch POS2.0-B)

POS2.0-A built the token layer and the primitives. This is the first patch that
consumes them, and it consumes them for the one thing every screen shares: the
frame around it.

### 17.1 Phase 0 — what was already there

The panel had a shell, and most of it was right. It is worth being precise about
which parts, because a rewrite that discards working behaviour is a regression
wearing a new coat.

**Structure found in `operations-shell.tsx`** (638 lines, one file): a 260px
`fixed` sidebar; a `sticky` header carrying module title, role, branch, user and
logout; a `max-w-[1400px]` main; a hand-rolled mobile panel; seven navigation
groups filtered by role; four role-restriction screens; and a
most-specific-wins active-route matcher.

**Retained, unchanged in behaviour:**

- every route, label, icon and role in the navigation — no module invented, none
  removed;
- the four role-restriction screens, with their exact copy and destinations;
- `navGroupLabelForRole` / `navGroupRank`, so the owner keeps their own grouping;
- the "Mis leads" → "Leads" relabelling for non-sellers;
- the active-route rule that `/panel/inventario/movimientos` wins over
  `/panel/inventario`;
- `max-w-[1400px]` as the default content width — every unmigrated screen renders
  exactly as before.

**What POS2.0-B changes visually:**

| Before | After |
|---|---|
| Sidebar `fixed`, content offset by `padding-left`; the whole page scrolled beneath it | Sidebar is a real column; **only the content area scrolls** |
| Mobile menu hand-built: no focus trap, no Escape, no scroll lock | The design-system `Drawer`, which brings all four |
| Configuration and help sat among the business modules | A `secondary` tier, separated by a rule at the foot of the rail |
| No breadcrumbs anywhere; `Breadcrumbs` existed unused since POS2.0-A | Nested routes carry a trail |
| One `max-width` for every screen | Three widths, applied as **exceptions** to the default |
| Each screen drew its own title block | `PageHeader` — eyebrow, breadcrumb, title, description, actions |

**What must remain unchanged, and did:** authorization (every page and action
re-authorizes on the server), routes, the Prisma schema, purchasing behaviour,
and the rendered output of the 44 screens this patch does not migrate.

**One consequence worth stating**, because a browser assertion caught it: with the
session known at render time, an **area restriction is now decided on the
server**. A restricted role used to receive the page it may not see and have it
replaced on hydration; now that markup is never emitted. This tightens what the
server discloses; it does not change who is authorized.

### 17.2 The shell

```text
┌──────────────────────────────────────────────┐
│              TOP CONTEXT BAR                 │
├────────────┬─────────────────────────────────┤
│    LEFT    │                                 │
│    RAIL    │         PAGE CONTENT            │
└────────────┴─────────────────────────────────┘
```

Four files, each with one job:

- `lib/nav-model.ts` — the navigation data and the route matcher. **Pure**: no
  `"use client"`, no JSX, no `usePathname`. A route matcher you cannot read is a
  route matcher you cannot trust.
- `components/operations-rail.tsx` — the rail. **One component, two mountings**:
  the desktop column and the mobile drawer render the same thing.
- `components/operations-topbar.tsx` — context, not navigation.
- `components/operations-shell.tsx` — composition and drawer state.

**[R] Scrolling belongs to the content area, not the page.** The rail is stable
because it is not inside the thing that moves — not because it is pinned on top
of it. `lg:h-screen lg:overflow-hidden` on the frame, `lg:overflow-y-auto` on the
content column, and no third scroll container between them.

**[R] Route matching compares segments.** `routeMatches` requires an exact match
or a trailing slash, so `/panel/ventas-antiguas` is not "inside" `/panel/ventas`.
The active item is the **longest** matching href; between two hrefs that both
contain the current path, the longer one is necessarily the more specific.

### 17.3 Navigation hierarchy

Groups carry a `tier`. `primary` is the user's work; `secondary` — configuration
and help — sits at the foot of the rail behind a rule, with a quieter label.

**Soporte Técnico keeps its screens in `primary` deliberately.** For that role the
support centre is not chrome, it is the job. Demoting it would have confused
"infrequent for most people" with "secondary".

**[R] The navigation is not a security boundary.** Filtering by role here is
visual courtesy. A hidden item authorizes nothing: the server page and the server
action both re-check, and both would still refuse a hand-typed URL.

### 17.4 Page header and content width

One hierarchy, everywhere: **breadcrumb → eyebrow → title → description →
actions**. Fields are optional; the order is not. A page never re-invents title
spacing, action alignment or how the two stack on a phone.

**[R] Breadcrumbs only from the second level down.** On a top-level screen a trail
is decoration, and decoration in a dense interface is noise.

`PageContainer` offers three widths — `wide` (1600px) for listings that need the
columns, `default` (1400px) for detail, `form` (860px) for capture. **[R] Not one
fixed max-width for everything**: a single-column form at 1400px produces lines
the eye loses on the way back.

Which screen gets which is a **short list of exceptions** in `nav-model.ts`, not
a per-page setting. The default is the width the old shell imposed on everything,
so no unmigrated screen moves. **[D]** If that list outgrows a handful of entries,
the right answer becomes each page composing its own container and the shell
imposing none. Today it does not justify that.

### 17.5 Drawer

The mobile navigation is the POS2.0-A `Drawer`, extended by two props rather than
duplicated:

- `side` — detail arrives from the right, where reading ends; **navigation
  arrives from the left**, because that is where it came from. A menu that appears
  at the opposite edge from the button that opened it makes the user hunt for what
  they just asked for.
- `contentClassName` — for full-bleed content that carries its own spacing.

Everything else is unchanged, which is the point: Escape, focus trap, outside
click and scroll lock all still come from `overlay.tsx`, and a second drawer would
have been a second place for that behaviour to drift.

A new keyframe, `sb-drawer-in-left`, is the only token added — and it is listed in
the `prefers-reduced-motion` block with the others.

### 17.6 Verification

**[E] SUITE-POS2.0-B — 21 browser tests, 21 green.** Semantic landmarks · the rail
holding still while content scrolls · nested purchase routes marking their module
· the deeper route winning over the one containing it · the top bar carrying no
module links · page actions living in the page · breadcrumbs present when nested
and absent at top level · the drawer replacing the rail below 1024px · Escape ·
outside click · **focus trapped across forty tabs** · background scroll locked and
released · navigating from the drawer closing it and landing on the chosen route ·
**no horizontal overflow at 1440, 1280, 1024, 768 and 390px across three routes**
· content never underneath the rail at any of the five widths · and the menu
trigger existing only where the rail does not.

---

## 18. The component library (Patch POS2.0-C)

POS2.0-A built the tokens and the primitives. POS2.0-B built the frame. This
patch builds what sits between them: the pieces POS2.1 and POS2.2 will assemble
screens from.

**No business logic, no schema, no server action, no permission.** Every
component here is ignorant of Prisma, of routes, of roles and of any module.

### 18.1 Phase 0 — what already existed

The audit found more than expected, which is the point of doing it.

| Need | Already there | Verdict |
|---|---|---|
| Table cells | `Table`, `TH`, `TD`, `TR`, `TDActions`, `TableEmptyRow` | Kept; the loop over them was what was missing |
| Table frame | `DataTableShell` | Kept, composed |
| Search input | `SearchField` | Kept, composed |
| Toolbar strip | `Toolbar` | Kept, composed |
| Status chip | `Badge` with `dot` | Kept; **the mapping** was missing |
| Empty | `EmptyState`, `TableEmptyRow` | `EmptyState` had one variant of the two |
| Loading | `Skeleton`, `SkeletonTable`, `Spinner`, `LoadingOverlay` | Table covered; card/form/block/page were not |
| Dialog | `Dialog`, `ConfirmDialog` | Kept; wiring it was the repeated part |
| Drawer | `Drawer` (+ `side` from POS2.0-B) | Kept; its **contents** had no primitive |
| Field | `Field` | Renders label/hint/error but **associates none of them** |
| Pagination | `Pagination` | Kept, nothing needed |
| Checkbox | — | **Did not exist.** Three screens hand-rolled it |

Two duplications worth naming: **ten modules declare their own `statusTone` map**,
and three hand-roll `type="checkbox"`. Both are now expressible once.

**Deliberately not built**: sorting, server pagination, column resizing, grouping,
a rich search-select, and anything chart-shaped. Each is a real decision that
belongs to the module that first needs it (P-34, P-35).

### 18.2 What was added

| Component | File | Why it exists |
|---|---|---|
| `Checkbox` | `checkbox.tsx` | A real `<input>`, with the **indeterminate** state a table header needs |
| `DataTable` | `data-table.tsx` | The loop every list screen wrote: columns, rows, selection, loading, empty |
| `defineStatuses`, `StatusBadge` | `status.tsx` | One status dictionary per module instead of ten tone maps |
| `FilterBar`, `BulkActionBar` | `toolbar.tsx` | Search + filters + clear; and the bar that replaces them while rows are selected |
| `FormField` | `form-field.tsx` | Label, hint and error **associated** with the control |
| `DetailList` | `detail-list.tsx` | The field/value pairs a drawer is made of |
| `ConfirmAction` | `confirm-action.tsx` | Binds a danger button to its confirmation, state included |
| `EmptyState` variants | `empty-state.tsx` | "Nothing yet" and "nothing matched" are different messages |
| `SkeletonCards/Form/Block/Page` | `feedback.tsx` | The three geometries `SkeletonTable` did not cover |

### 18.3 Decisions

**`DataTable` does not replace the cell primitives.** An irregular table still
composes `Table` + `TR` + `TD` directly. Forcing every table through one door is
how a 700-line `SuperTable` gets written, and this patch was told not to write one.

**Status tones are semantic, not colours.** A module declares `tone: "warning"`,
never `tone: "amber"`. The palette then changes in one place instead of ten.

**`FormField` takes a render function.** The usual alternative — cloning the child
to inject props — breaks the moment the control is wrapped in anything. Reading a
context from `Input` would have meant touching the forty screens already using it.
Explicit wins:

```tsx
<FormField error={error} label="Costo unitario" required>
  {(field) => <MoneyInput {...field} value={v} onChange={…} />}
</FormField>
```

**Mobile hides columns; it does not become cards.** `hideOnMobile` drops the
accessory columns and the rest scrolls inside the frame. A POS works with a lot of
information at once, and the card format destroys exactly that.

**`BulkActionBar` replaces the filter bar, it does not stack on it.** While a
selection is live the user's question changed from "what am I looking at" to
"what do I do with this".

### 18.4 Accessibility

Verified in the browser, not asserted in prose: the header checkbox reports
`indeterminate` to the platform; a clickable row is reachable by Tab and responds
to Enter; the field error carries `role="alert"` and is pointed at by
`aria-describedby`, and **replaces** the hint rather than joining it; clicking a
label focuses its control; the confirm dialog traps Tab and **returns focus to the
button that opened it**; `BulkActionBar` is a `role="status"`.

Nothing here adds ARIA where the platform already answers: the checkbox is an
`<input>`, the detail list is a `<dl>`, the table is a `<table>`.

### 18.5 Verification

**[E] SUITE-POS2.0-C — 29 browser tests, 29 green.** Numeric columns aligned *and*
tabular · selection marking the row and announcing the count · header passing
through indeterminate before checked · a non-selectable row that "select all"
skips · selection cleared from its own bar · rows opened by mouse **and** by
keyboard · the checkbox not opening the row · search narrowing the list and the
active-filter count appearing · a no-results table explaining *why* instead of
saying "no data" · clear removing every filter · the two empty states saying
different things · loading replacing the table and coming back · the form error
associated with its field, replacing the hint, and clearing on correction · the
label focusing its control · confirmation required before the action runs ·
cancel doing nothing · focus returned and trapped · the drawer's field/value pairs
including "—" for an absent value · **no horizontal overflow at 1440, 1280, 1024,
768 and 390px** · and mobile keeping the table a table.
