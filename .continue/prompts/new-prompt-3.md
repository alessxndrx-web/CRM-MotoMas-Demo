---
name: MotoMas UI/UX Rule
description: UI/UX Rule

invokable: true
---

You are working on MotoMas UI/UX.

The client wants a dark, sporty, technological and commercial motorcycle dealership style. Do not convert MotoMas into a light/minimalist corporate template.

Brand identity:

* MotoMas identity uses blue and orange.
* Do not use red as the main brand color.
* Red should only be used for errors, rejection, danger or destructive actions.
* Use dark backgrounds, blue/orange accents, strong contrast, premium motorcycle showroom energy and clean commercial hierarchy.

Visual direction:

MotoMas should feel like:

* modern motorcycle dealership
* digital showroom
* commercial platform
* sporty motorcycle brand
* technology-driven operations system
* premium but practical interface

Avoid:

* generic AI template look
* white cards behind motorcycles
* flat catalog cards as the main experience
* cheap gaming neon
* excessive glow
* messy overlays
* text over busy backgrounds
* broken responsive layouts
* visual changes that feel fake or superimposed

Portal Cliente:

Use public-friendly language:

* solicitud
* catálogo
* motocicleta
* asesor
* sucursal
* crédito
* reserva
* entrega
* seguimiento
* próximo paso

Never show public users:

* lead
* localStorage
* payload
* internal id
* vendedorAsignado
* repository
* JSON
* operational inventory data
* internal reports

Home / Hero Showroom:

When editing the Home Hero Showroom:

* The motorcycle carousel is the hero, not a section below the hero.
* The main motorcycle must be large, clear and dominant.
* Side motorcycles should be partially visible on desktop.
* The scene should feel like a garage/showroom, not a background image with PNGs pasted on top.
* Motorcycles must appear aligned to the same floor/baseline.
* Use floor, shadows, contact shadows, depth, perspective, blue/orange lighting and cinematic composition.
* Do not add white or gray boxes behind motorcycles.
* Do not duplicate the carousel.
* Do not change `/catalogo`, motorcycle detail pages, forms, or `/panel`.

For each motorcycle image:

* Use transparent PNG/WebP assets when available.
* Do not use white-background catalog images inside the showroom if transparent assets exist.
* If assets have different canvas sizes, use per-slug visual calibration for scale, x/y offset and baseline alignment.
* Do not modify the main catalog data just to fix showroom composition.

Operations UI:

The operations portal should be professional, readable and efficient.

Keep:

* dark premium surfaces
* clear cards
* consistent status badges
* readable tables
* clean empty states
* role-based visibility
* strong but controlled CTAs

Do not make the internal portal overly decorative. Operations screens must prioritize clarity.

Buttons:

Primary actions:

* orange MotoMas
* clear label
* strong visibility

Secondary actions:

* dark/blue outline
* lower visual weight

Danger actions:

* red/danger styling only for destructive or rejection actions

Use clear labels:

* Ver catálogo
* Solicitar información
* Consultar solicitud
* Ver detalles
* Crear expediente
* Guardar cambios
* Actualizar estado
* Marcar como recibido
* Marcar como revisado
* Marcar como rechazado
* Reiniciar datos demo

Avoid vague labels:

* OK
* Procesar
* Hacer
* Enviar when the action is unclear

Responsive:

Always check desktop, tablet and mobile.

Avoid:

* horizontal overflow
* cropped buttons
* unreadable tables
* text hidden behind motorcycles
* header breaking
* side motorcycles showing on mobile if they cause overflow

UI change rules:

* Do UI changes by section, not global redesigns.
* Do not touch business logic for visual tasks.
* Do not touch localStorage, services, Prisma, routes or data unless explicitly requested.
* Preserve existing links and flows.
* Always run `npm.cmd run build`.
* Update CHANGES.md only when the patch is completed and build passes.
