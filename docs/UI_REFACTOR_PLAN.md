# MotoMas — Plan de Refactor Visual (3.P3A)

Documento de dirección de diseño. No implementa código.
Alcance: login, shell de operaciones, Contabilidad, Caja, páginas comerciales, formularios y tablas.
Fuera de alcance (no tocar): Prisma, seeds, server actions, auth, middleware, helpers de roles, claves de localStorage, reglas de negocio.

---

## 1. Auditoría UI (estado actual)

Stack real: Next.js 16 App Router, React 19, Tailwind v4, lucide-react, cva + clsx + tailwind-merge. Sin librería de animación. Sin kit shadcn completo: solo 4 primitivos manuales (`button`, `card`, `badge`, `input` en `src/components/ui/`).

Problemas encontrados:

1. **Tema oscuro hardcodeado en todo el sistema.** `globals.css` fija `--background: #050505`; cada pantalla monta un glow radial rojo (`rgba(239,35,45,…)`) decorativo. Resultado: "panel hacker" genérico, exactamente lo que hay que eliminar.
2. **Primitivos atados al tema oscuro.** `Button` primario rojo con sombra-glow de 32px; `Card` `#111111` con sombra de 80px; `Badge` translúcido uppercase. Nada de esto sobrevive en tema claro sin reescritura.
3. **Login genérico** (`src/app/login/page.tsx` + `login-form.tsx`): tarjeta oscura centrada, sin identidad de marca, sin columna visual. El asset WEBM ya existe en `public/assets/login/motorcycle-loading.webm` y no se usa.
4. **Sidebar plano de 17 ítems sin agrupación** (`operations-shell.tsx`): sin secciones, labels `lg:text-lg` sobredimensionados, activo rojo con glow, footer con badge técnico "Privado /panel". En móvil la navegación es un scroll horizontal de píldoras.
5. **Fuga de lenguaje técnico en UI visible:** "Altas y bajas (BD)" en el sidebar; concepto `authSource` ("database" / "dev-fallback") llega hasta el login.
6. **Contabilidad = volcado de opciones.** El "layout" contable renderiza una Card con una grilla de 13 enlaces agrupados encima de cada página (`accounting-panel.tsx:460-486`). No hay sub-sidebar persistente; cada vista carga con un bloque de navegación gigante antes del contenido. Tono visual comercial/oscuro, no de control financiero.
7. **Caja ya tiene nav de secciones y primario azul** (`cashier-panel.tsx:71-97`) pero sobre tema oscuro y sin jerarquía de panel operativo (resumen de caja, acciones rápidas, transacciones).
8. **Tipografía sin sistema:** `font-black` como peso por defecto, uppercase + tracking ancho en demasiados lugares, títulos `text-3xl` compitiendo con contenido.
9. **Header sin contexto real:** título deducido del path, sin breadcrumb, sin chip de sucursal/rol visible, campana de notificaciones decorativa.
10. **Radios y sombras inconsistentes:** `rounded-lg/xl/2xl/3xl` mezclados sin regla; sombras enormes en superficies pequeñas.

Lo que sí está bien y se conserva: separación Portal/Operaciones, filtrado de nav por rol, pantallas de restricción para Contador/Cajero, rutas ya divididas por sección en Contabilidad y Caja, patrón config-first de navegación (arrays tipados → render).

---

## 2. Dirección visual

Plataforma interna de gestión comercial para concesionario de motos. Debe leerse como herramienta de trabajo diario para Admin, Gerente, Vendedor, Cajero y Contador: seria, rápida, clara, entrenable.

- Tema **claro profesional**: fondo gris suave, superficies blancas elevadas, bordes contenidos, sombras sutiles.
- **Azul** para toda acción primaria. **Naranja MotoMas** como acento de marca (logo, indicador activo, detalles). **Rojo solo destructivo.**
- El rojo actual `#ef232d` deja de ser color de UI. La marca migra a naranja: decisión deliberada de esta dirección; si el negocio exige conservar rojo de marca, se limita al isotipo del logo y nunca a botones ni estados.
- Cero glows radiales, cero glassmorphism, cero fondos animados en pantallas operativas.
- Densidad de información alta pero legible: el usuario ve estado actual → qué requiere atención → próxima acción.

---

## 3. Sistema de color

Definir tokens en `globals.css` (`@theme`) y consumirlos desde los primitivos. Escala base: Tailwind `slate`.

| Token | Valor | Uso |
|---|---|---|
| `--color-page` | `#f4f5f7` (slate-100 aprox.) | Fondo de página |
| `--color-surface` | `#ffffff` | Cards, sidebar, header |
| `--color-border` | slate-200 `#e2e8f0` | Bordes por defecto |
| `--color-ink` | slate-900 `#0f172a` | Títulos |
| `--color-body` | slate-600 `#475569` | Texto cuerpo |
| `--color-muted` | slate-500 `#64748b` | Texto secundario/labels |
| `--color-primary` | blue-600 `#2563eb` (hover blue-700) | Acciones primarias, enlaces, activo |
| `--color-accent` | orange-500 `#f97316` (fuerte orange-600) | Marca, indicador activo del sidebar, highlights |
| `--color-danger` | red-600 `#dc2626` | Solo destructivo |
| `--color-success` | emerald-600 `#059669` | Confirmaciones, estados positivos |
| `--color-warning` | amber-600 `#d97706` | Pendientes, atención |

Reglas:
- Un solo azul de acción en toda la app. Ningún botón rojo salvo eliminación/cancelación real.
- Naranja nunca como botón primario de formularios; es identidad, no acción.
- Focus ring: `ring-2 ring-blue-500/40` global.
- Selection y scrollbar de `globals.css` pasan a neutros claros (scrollbar `slate-300`, hover `slate-400`; selection azul suave).

### Badges de estado (lenguaje único)

Fórmula clara: fondo `tono-50`, texto `tono-700`, borde `tono-200`. Sin uppercase, `text-xs font-medium`, `rounded-md`.

| Estado | Tono |
|---|---|
| Nuevo / Nuevo Lead | blue |
| Asignado / Contactado | indigo (o blue si se limita paleta) |
| Interesado / En proceso | amber |
| Reservada / Pendiente / Borrador | amber |
| Aprobado / Vendida / Recibido / Pagado / Conciliado | emerald |
| En tránsito / Emitido | blue |
| Entregada / Cerrado | slate |
| Cancelado / Descartado / Anulado | red |

`Badge` amplía tonos a: `blue | emerald | amber | red | slate | orange | indigo`. Un solo componente; prohibido inventar badges ad-hoc en módulos.

---

## 4. Tipografía y espaciado

Se mantiene la stack de sistema (`Segoe UI`) — sin dependencias nuevas.

| Rol | Clase | Nota |
|---|---|---|
| Título de página | `text-2xl font-semibold text-ink` | Uno por página, en el header del shell |
| Título de sección/card | `text-base font-semibold` | |
| Cuerpo | `text-sm text-body leading-6` | |
| Secundario | `text-sm text-muted` | |
| Label de grupo (sidebar/nav) | `text-[11px] font-semibold uppercase tracking-wider text-muted` | Único uso permitido de uppercase |
| Cifras/tablas financieras | `tabular-nums` | Obligatorio en Caja y Contabilidad |

- `font-black` queda prohibido; máximo `font-semibold` (`font-bold` solo en cifras destacadas de métricas).
- Radios: `rounded-md` (inputs, badges, botones sm), `rounded-lg` (botones, filas), `rounded-xl` (cards). `rounded-2xl/3xl` se eliminan.
- Sombras: `shadow-sm` por defecto en cards; `shadow-md` máximo (menús flotantes). Sombras de color, prohibidas.
- Ritmo: base 4px. Página `px-6 py-6` (móvil `px-4`), cards `p-5`, gaps `gap-4`/`gap-6`, secciones `space-y-6`. Contenido `max-w-[1400px]`.

---

## 5. Blueprint de componentes (`src/components/ui/`)

Reescritura de primitivos a tema claro + nuevos primitivos compartidos. API compatible donde sea posible (mismos nombres de variantes) para minimizar el diff en módulos.

**Button** — `primary` (blue-600 → hover blue-700, texto blanco, `shadow-sm`), `secondary` (blanco, borde slate-300, texto slate-700), `ghost`, `danger` (rojo sólido, no translúcido), `success`. Alturas: `default h-10`, `sm h-8`, `icon h-10 w-10`. El variant `default` mapea a `primary`.

**Card** — blanco, `border-slate-200`, `rounded-xl`, `shadow-sm`. `CardHeader` con slots título/descripción/acción.

**Badge** — según §3.

**Input / Select / Textarea** — `h-10`, blanco, `border-slate-300`, texto `slate-900`, placeholder `slate-400`, focus `border-blue-500 ring-2 ring-blue-500/20`. Select con chevron consistente.

**Nuevos primitivos** (evitan copy-paste entre 15 módulos):
- `PageHeader` — título, descripción, breadcrumb opcional, slot de acciones a la derecha.
- `StatCard` — label, valor (`tabular-nums`), delta/nota opcional, icono opcional. Sin decoración gratuita.
- `EmptyState` — icono, título, texto de una línea, acción primaria opcional.
- `DataTable` (wrapper de presentación, no de datos) — `thead` gris suave sticky, filas `divide-y divide-slate-100`, hover `bg-slate-50`, celda de acciones alineada derecha. Scroll horizontal solo dentro del wrapper.
- `SectionTabs` — nav horizontal de secciones (Caja) con activo subrayado/pill.
- `SubSidebar` — nav lateral agrupada (Contabilidad).
- `FormSection` — fieldset con título y grid responsive de campos.
- `Field` — label + control + helper/error; label siempre arriba.

Iconos: lucide (ya instalado). Mapa: Inicio `LayoutDashboard`, Leads `UserPlus`, Clientes `Users`, Expedientes `FolderOpen`, Actividades `ListChecks`, Créditos `CreditCard`, Inventario `PackageSearch`, Traslados `ArrowRightLeft`, Reservas `BookmarkCheck`, Ventas `BadgeDollarSign`, Vendedores `UserRoundCog`, Reportes `BarChart3`, Marketing `Megaphone`, Configuración `Settings`, Caja `WalletCards`, Contabilidad `Landmark`, Documentos `FileText`, Planilla `UsersRound`, Cierres `LockKeyhole`. Tamaño único `h-4 w-4` en nav y botones (`h-5 w-5` solo en EmptyState/logo). No agregar iconos a cada celda de tabla.

---

## 6. Blueprint de Login

`src/app/login/page.tsx` + `login-form.tsx`. Dos columnas en desktop, una en móvil.

- **Columna izquierda (visual, `lg:flex` oculta en móvil):** panel con gradiente sobrio `slate-900 → slate-800` con detalle naranja; el video `/assets/login/motorcycle-loading.webm` con `autoPlay muted loop playsInline`, contenido (no fullscreen ni protagonista), con fallback elegante si falla (`onError` → oculta el video y queda el panel de marca). Encima: logotipo MotoMas, claim "Plataforma Integral de Gestión Comercial", línea de "Acceso interno seguro". El video nunca bloquea el render del formulario.
- **Columna derecha:** fondo `--color-page`, card blanca `max-w-md` con: marca compacta, "Iniciar sesión", campos Correo/Contraseña (labels arriba, sin uppercase), error inline con `AlertCircle`, botón primario azul full-width con estado de carga, pie "Acceso restringido a personal autorizado".
- **Copy:** eliminar cualquier rastro visible de `authSource` ("database", "dev-fallback"). Si hay hint de roles demo ya existente, se presenta como "Cuentas de acceso" en un bloque discreto plegable.
- Motion: fade-in único del card (<300ms), nada más. `prefers-reduced-motion` → sin fade y video sin autoplay.

---

## 7. Blueprint del shell de operaciones

`operations-shell.tsx`. Misma lógica de sesión/roles; cambia solo presentación y estructura del array de navegación (de lista plana a grupos). **El filtrado por rol no se toca** (incluida la exclusión de Traslados para Vendedor y las pantallas de restricción de Contador/Cajero, que pasan a tema claro).

**Sidebar (260px, blanco, borde derecho slate-200):**
- Header: logo (cuadro naranja con icono + "MotoMas / Operaciones" en dos líneas, sin uppercase ancho).
- Grupos con label §4 y separación `mt-6`:
  - *Inicio* — Inicio.
  - *Gestión Comercial* — Leads, Clientes, Expedientes, Actividades, Créditos.
  - *Operación* — Inventario, Movimientos de inventario, Reservas, Traslados, Ventas.
  - *Supervisión* — Vendedores, Reportes, Marketing.
  - *Sistema* — Configuración.
  - *Finanzas* — Contabilidad, Caja (visibles según rol, como hoy).
- Ítem: `h-9 rounded-lg px-3 text-sm font-medium`, icono `h-4 w-4`. Activo: `bg-blue-50 text-blue-700` + barra vertical naranja de 3px a la izquierda (el acento de marca). Inactivo: `text-slate-600 hover:bg-slate-100`.
- Renombrar "Altas y bajas (BD)" → **"Movimientos de inventario"** (solo label; ruta y permisos intactos).
- Footer: nombre de usuario, chip de rol (badge slate) + chip de sucursal, botón Salir `secondary sm`. Eliminar badge "Privado /panel".

**Header (h-16, blanco, sticky, borde inferior):**
- Izquierda: título de página + breadcrumb ligero (`Operación / Inventario`) derivado de los grupos.
- Derecha: chip `Sucursal · Rol`, campana (si no notifica nada, se elimina — nada decorativo), menú de usuario con Salir.
- Subtítulos por rol actuales se conservan como línea de contexto pero en `text-sm text-muted`.

**Móvil:** botón hamburguesa en header → drawer lateral (mismo árbol agrupado) con overlay. Se elimina el scroll horizontal de píldoras.

---

## 8. Blueprint de layout de Contabilidad

Problema a matar: la Card-grilla de navegación encima de cada página. Se reemplaza por un layout de dos columnas dentro del shell.

- **SubSidebar fija (240px, `xl:` en adelante):** blanca, sticky bajo el header, grupos actuales reordenados a: Resumen (Dashboard) · Documentos (Revisión de documentos) · Operación diaria (Asientos, Comprobantes, Gastos) · Control contable (Plan de cuentas, Bancos, Conciliación, Cierres, Terceros) · Soporte (Inventario contable, Planilla) · Análisis (Reportes). Activo `bg-blue-50 text-blue-700`, sin glow. El filtrado por rol Gerente (solo Inventario/Reportes) se mantiene tal cual.
- **< xl:** la sub-nav colapsa a un `SectionTabs` horizontal scrolleable arriba del contenido.
- **Dashboard contable compacto:** fila de 4 StatCards (documentos por revisar, asientos del período, gastos del mes, conciliaciones abiertas) → bloque "Requiere atención" (documentos en borrador/emitidos sin contabilizar, cierres pendientes, con enlace directo) → actividad reciente (últimos asientos/documentos). Sin grilla de opciones gigantes.
- **Tono financiero:** cifras `tabular-nums` alineadas a la derecha, tablas más densas (`py-2.5`), menos badges, montos con formato consistente, botones de export (CSV/PDF) agrupados en un menú o fila secundaria arriba-derecha de cada tabla — nunca una botonera de 6 botones.
- El encabezado narrativo largo ("Contabilidad revisa, contabiliza...") se reduce a una línea de contexto; la card "Alcance de sesión" desaparece (el dato ya vive en el header del shell).
- Sin cambios en lecturas/escrituras de datos ni en exportadores.

---

## 9. Blueprint de layout de Caja

Caja debe sentirse rápida y operativa. La estructura de secciones existente se conserva.

- **SectionTabs horizontales** bajo el header: Panel de caja · Facturación · Recibos · Notas · Cierres. Activo con subrayado azul de 2px.
- **Panel de caja (dashboard):** fila de StatCards del día (Efectivo, Tarjeta, Transferencia, Total) con `tabular-nums` → acciones rápidas (Nueva factura, Nuevo recibo, Nueva nota — botón primario + dos secundarios) → últimos documentos emitidos (tabla compacta con estado) → estado del cierre del día (abierto/cerrado con hora).
- **Facturación/Recibos/Notas:** layout de trabajo en dos columnas `lg:`: formulario a la izquierda (FormSection), resumen vivo del documento a la derecha (subtotal, retención, total, sticky). En móvil el resumen va abajo del form.
- **Cierres:** tabla de cierres con estado + panel de cierre del día; imprimir/exportar siempre arriba-derecha del documento, con icono `Printer`/`Download`, nunca dispersos.
- El primario azul ya adoptado en Caja se convierte en el estándar global (§3), así que el estilo local `cashierPrimaryButton` se elimina en favor de `Button`.
- EmptyStates reales ("Aún no hay recibos hoy" + acción) en cada lista vacía. Cálculos y persistencia intactos.

---

## 10. Reglas de formularios y tablas

**Formularios**
- Label arriba, `text-sm font-medium text-slate-700`; requerido con `*` naranja; helper `text-xs text-muted` debajo.
- Agrupación por `FormSection` con título; grid `sm:grid-cols-2` (campos largos `col-span-2`); `gap-4`.
- Acción primaria abajo-derecha (o arriba-derecha en paneles largos), secundaria a su izquierda como `secondary`. Una sola primaria por formulario.
- Prohibido: placeholder como label, inputs pegados sin gap, selects sin label.

**Tablas**
- Header `bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500`, sticky en tablas largas.
- Filas `py-3` (comercial) / `py-2.5` (finanzas), `divide-y divide-slate-100`, hover `bg-slate-50`.
- Filtros en una fila encima: búsqueda + selects compactos + contador de resultados; chips de filtros activos si aplica.
- Estados siempre con `Badge` §3. Acciones por fila agrupadas a la derecha (iconos ghost o menú "⋯" si son 3+).
- Montos alineados a la derecha con `tabular-nums`. Overflow horizontal solo dentro del wrapper.
- `< md`: fallback a cards apiladas (título, 2-3 datos clave, badge, acción) en listas comerciales; en finanzas se permite scroll horizontal contenido.

---

## 11. Reglas de animación

- Permitido: `transition-colors` (150ms) en hover, fade-in de card/página (200-300ms, una vez), indicador activo del sidebar con `transition-all` corto, video del login.
- Prohibido: bounce, glows pulsantes, fondos animados, animaciones >300ms, entrance animations por fila de tabla.
- Todo respeta `prefers-reduced-motion` (media query global en `globals.css` que anula transiciones no esenciales).
- No instalar librerías de animación; CSS puro.

---

## 12. Plan de refactor ruta por ruta

| Ruta | Cambio |
|---|---|
| `/login` | Rediseño completo dos columnas + WEBM (§6) |
| Shell `/panel/*` | Tema claro, sidebar agrupado, header con contexto, drawer móvil (§7); pantallas de restricción Contador/Cajero re-tematizadas |
| `/panel/dashboard` | Reestructurar a: estado actual (StatCards) → requiere atención → acciones rápidas por rol |
| `/panel/leads` | Filtros en fila, tabla/cards según §10, badges de estado unificados, forms de asignación con Field |
| `/panel/clientes`, `/panel/expedientes`, `/panel/actividades`, `/panel/creditos` | Mismo patrón: PageHeader + filtros + DataTable + EmptyState |
| `/panel/inventario` (+ `/movimientos`) | Tabla operativa densa, badges de disponibilidad; renombrar label de nav (§7) |
| `/panel/reservas`, `/panel/traslados`, `/panel/ventas` | Patrón lista + form estructurado; estados En tránsito/Recibido/etc. con badge única |
| `/panel/vendedores`, `/panel/reportes`, `/panel/marketing` | StatCards + tablas; reportes con export agrupado |
| `/panel/configuracion` | FormSections claras por bloque |
| `/panel/contabilidad/*` (13 rutas) | Layout SubSidebar + dashboard compacto (§8) |
| `/panel/caja/*` (5 rutas) | SectionTabs + panel operativo (§9) |
| Portal público `(portal)` | **Fuera de alcance de esta fase** (mantiene su identidad actual) |

Copy en todo `/panel`: eliminar "BD", "base de datos", "localStorage", "demo", "migración", "sesión demo", "fuente principal" de cualquier texto visible; sustituir por vocabulario operativo (Registros, Historial, Operación, Documentos, Control). Los sufijos internos de módulos (`-db`) no se renombran en código, solo en labels.

---

## 13. Secuencia de implementación

1. **3.P3B — Login.** Rediseño completo del login (§6), autocontenido: sin tocar primitivos compartidos ni `globals.css`, para no dejar los módulos oscuros en estado intermedio roto (texto blanco sobre cards blancas).
2. **3.P3C — Fundaciones + Shell.** Tokens en `globals.css`, reescritura de primitivos ui/ (Button, Card, Badge, Input), nuevos primitivos (§5), sidebar agrupado, header, drawer móvil, pantallas de restricción, copy del shell. *Riesgo aceptado: el cambio de primitivos flipea todo el panel a claro de golpe; los módulos con utilidades oscuras (`text-white`, `border-white/10`) se corrigen con un barrido mecánico en este mismo parche y se pulen en 3.P3D/E — validar build y smoke visual de las rutas principales.*
3. **3.P3D — Contabilidad + Caja.** SubSidebar contable, dashboard contable compacto, SectionTabs de caja, panel de caja, layouts de trabajo dos columnas.
4. **3.P3E — Páginas comerciales.** Dashboard, leads, clientes, expedientes, actividades, créditos, inventario, reservas, traslados, ventas, vendedores, reportes, marketing, configuración: PageHeader/filtros/DataTable/Forms/EmptyStates/badges.
5. **3.P3F — QA responsive y pulido.** Móvil (drawer, cards fallback, tabs scrolleables), reduced motion, contraste, consistencia de radios/sombras/espaciado, limpieza de estilos muertos.

Después de cada parche: `npm.cmd run build`. Un parche = un commit revisable. Nunca todo en una pasada.

---

## 14. Checklist de QA

- [ ] Ningún `#050505`, `bg-[#111]`, glow radial ni sombra de color en `/panel` ni `/login`
- [ ] Un solo azul de acción; rojo solo en acciones destructivas; naranja solo como acento de marca
- [ ] `font-black` eliminado; uppercase solo en labels de grupo y headers de tabla
- [ ] Sidebar agrupado correcto por rol (Vendedor sin Traslados; Contador/Cajero restringidos igual que antes)
- [ ] Label "Movimientos de inventario" (sin "(BD)"); cero vocabulario técnico visible en `/panel`
- [ ] Login: video carga con fallback; form funciona con video ausente; sin labels de authSource
- [ ] Contabilidad: sub-sidebar visible en `xl`, tabs en menor; sin grilla de opciones sobre el contenido
- [ ] Caja: tabs de sección, resumen del día con `tabular-nums`, export/print arriba-derecha
- [ ] Todas las tablas: header gris, hover, badges §3, sin overflow de página
- [ ] Todos los forms: labels arriba, secciones, una primaria
- [ ] EmptyStates con acción en toda lista vacía
- [ ] `prefers-reduced-motion` respetado; ninguna animación >300ms
- [ ] Móvil: drawer de nav, cards fallback en listas comerciales, sin scroll horizontal de página
- [ ] `npm.cmd run build` verde
- [ ] Sin cambios en: Prisma, seeds, server actions, auth, middleware, claves de localStorage, permisos

---

*Referencias de investigación (principios, no código): convenciones de sidebar agrupado de [shadcn/ui Sidebar](https://ui.shadcn.com/docs/components/base/sidebar) (nav config-first, grupos con label, drawer móvil, activo distinto padre/hijo); buenas prácticas de dashboards financieros ([Eleken](https://www.eleken.co/blog-posts/financial-dashboard-examples), [F9 Finance](https://www.f9finance.com/dashboard-design-best-practices/)): orientación a decisión, KPI + atención + tendencia, densidad con claridad.*
