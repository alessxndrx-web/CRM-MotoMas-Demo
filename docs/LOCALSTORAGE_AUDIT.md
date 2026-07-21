# Auditoría de dependencias localStorage

## Alcance y método

Patch 3.7A revisó las referencias a `localStorage` en `src` y las 28 claves
centralizadas en `src/shared/persistence/storage-keys.ts`. El archivo solicitado
`src/shared/storage-keys.ts` no existe en este checkout; la fuente real de
claves es la ruta de `shared/persistence` anterior.

- 71 referencias textuales a `localStorage` en 34 archivos fuente.
- 28 claves de persistencia centralizadas.
- 26 rutas operativas renderizan un panel DB y, además, un panel local separado
  por `LegacySectionDivider`.
- Esta auditoría no modificó ninguna clave, dato, comportamiento, esquema ni
  ruta.

## Resumen ejecutivo

La migración PostgreSQL ya coloca paneles DB primero en los flujos migrados,
pero los paneles heredados continúan renderizados y permiten operar datos
locales independientes. Por tanto, la mayoría de las claves no son solamente
fallback: siguen siendo una dependencia operacional activa (B) con riesgo de
datos duplicados o de una vista local desactualizada.

Marketing, Reportes y el Dashboard operativo siguen leyendo servicios locales
como fuente primaria. El catálogo público no usa `localStorage`; proviene de
`src/data/catalog/motorcycles.ts`.

El fallback público permanece intencionalmente. Tras Patch 3.6F, los cuatro
seguimientos DB requieren código más teléfono o cédula coincidente también
antes de usar el fallback local, y el teléfono renderizado se enmascara.

| Clasificación | Claves / componentes | Resultado |
|---|---:|---|
| A. Safe fallback only | 0 claves centrales aisladas | No se identificó una clave que sea solo fallback y no esté renderizada o escrita por un flujo activo. |
| B. Operational dependency still active | 26 claves | Riesgo medio/alto: paneles y servicios heredados siguen leyendo/escribiendo datos locales. |
| C. Presentation bridge / compatibility mirror | 1 clave | `demoSession` replica la sesión autenticada para shells/componentes heredados. |
| D. Public fallback with security implications | 1 clave | `publicLeads`; permanece como compatibilidad pública con verificación reforzada. |
| E. Candidate for removal | 1 helper sin consumidores | `local-storage-adapter.ts`; evaluar después de retirar los paneles heredados. |

## Inventario de claves

| Clave | Uso / módulos principales | Clase | Riesgo actual | Acción recomendada | Patch / retirada |
|---|---|---|---|---|---|
| `motomas-public-leads-v1` | `lead-service`, `public-process-service`, formulario público, `leads-service` | D | Medio: contiene datos de contacto en el navegador; sirve al fallback público y a inbox heredado. | Mantener; conservar código + verificación coincidente y máscara. | 3.7B, retirar solo tras sustitución completa de inbox/form fallback. |
| `motomas-customers-v1` | `customer-files-service`, clientes/expedientes heredados, proceso público | B | Alto: datos de clientes locales pueden divergir del panel DB. | Gatear panel local tras smoke de CRM. | 3.7B; no retirar aún. |
| `motomas-customer-files-v1` | expedientes, créditos, reportes/dashboard, proceso público | B | Alto: expediente local sigue siendo operable y visible debajo del DB. | Gatear panel local y planificar exportación/limpieza controlada. | 3.7B. |
| `motomas-inventory-units-v1` | inventario, ventas, reservas, traslados, reportes/dashboard, proceso público | B | Alto: stock local puede diferir del inventario DB. | Gatear operaciones locales antes de retirar. | 3.7B. |
| `motomas-transfer-orders-v1` | `transfer-service`, `TransfersPanel`, dashboard | B | Alto: flujo de traslados local sigue creando/actualizando órdenes. | Gatear panel heredado; mantener solo compatibilidad temporal. | 3.7B. |
| `motomas-reservations-v1` | `reservation-service`, panel heredado, ventas/reportes/dashboard, proceso público | B | Alto: reserva local puede contradecir unidad/reserva DB. | Gatear panel local y conservar solo lectura durante transición. | 3.7B. |
| `motomas-sales-v1` | `sales-service`, panel heredado, reportes/dashboard, proceso público | B | Alto: ventas locales pueden divergir de entregas DB. | Gatear creación/edición local antes de retiro. | 3.7B. |
| `motomas-quotes-v1` | `quote-service`, expediente heredado, créditos/reportes/dashboard | B | Medio/alto: proformas locales alimentan métricas y crédito heredado. | Reemplazar consumidores de KPI y gatear UI heredada. | 3.7B/3.7C. |
| `motomas-expedient-documents-v1` | documentos y créditos heredados, reportes/dashboard, proceso público | B | Alto: checklist local coexiste con documentos DB. | Gatear el panel heredado después de revisión de documentos. | 3.7B. |
| `motomas-credit-applications-v1` | `credit-application-service`, créditos, reportes/dashboard, proceso público | B | Alto: estado y observaciones locales pueden divergir de crédito DB. | Gatear operaciones locales; no exponer hacia portal. | 3.7B. |
| `motomas-activities-v1` | `activity-service`, actividades, créditos/reportes/dashboard | B | Medio/alto: actividades locales siguen siendo editables. | Gatear panel local después de smoke de actividades. | 3.7B. |
| `motomas-marketing-campaigns-v1` | `marketing-campaign-service`, Marketing, formulario público | B | Alto: Marketing es local como fuente primaria; el portal lee campañas locales para metadatos. | Migrar Marketing antes de retirar. | 3.7C. |
| `motomas-accounting-journal-entries-v1` | `accounting-service`, Contabilidad heredada | B | Alto financiero: diario local visible junto a DB. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-vouchers-v1` | comprobantes heredados | B | Alto financiero: duplicidad de comprobantes. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-documents-v1` | documentos contables heredados; Caja heredada los consulta | B | Alto financiero: documentos locales alimentan flujo heredado de caja. | Gatear conjuntamente Caja/Contabilidad. | 3.7B. |
| `motomas-accounting-expenses-v1` | gastos heredados | B | Alto financiero/costos. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-payroll-v1` | planilla heredada | B | Alto: información de planilla local independiente. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-inventory-costs-v1` | costos de inventario heredados | B | Alto: costos no deben competir con el ledger DB. | Gatear primero; retirar tras conciliación. | 3.7B. |
| `motomas-accounting-chart-accounts-v1` | catálogo contable heredado | B | Alto: catálogo local puede invalidar reportes locales. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-banks-v1` | bancos heredados | B | Alto financiero. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-reconciliations-v1` | conciliaciones heredadas | B | Alto financiero. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-closures-v1` | cierres contables heredados | B | Alto financiero. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-accounting-third-parties-v1` | terceros heredados | B | Alto: terceros locales divergen de DB. | Gatear bloque heredado por sección. | 3.7B. |
| `motomas-cashier-invoices-v1` | facturación local, `CashierPanel` | B | Alto financiero: facturas locales siguen visibles/operables. | Gatear panel heredado. | 3.7B. |
| `motomas-cashier-receipts-v1` | recibos locales, `CashierPanel` | B | Alto financiero: recibos locales siguen visibles/operables. | Gatear panel heredado. | 3.7B. |
| `motomas-cashier-notes-v1` | notas locales, `CashierPanel` | B | Alto financiero: notas locales siguen visibles/operables. | Gatear panel heredado. | 3.7B. |
| `motomas-cashier-closures-v1` | cierres de caja locales, `CashierPanel` | B | Alto financiero: cierres locales siguen visibles/operables. | Gatear panel heredado. | 3.7B. |
| `motomas-demo-session-v1` | `session-service`, `SessionBridge`, shell/login heredado | C | Medio: refleja sesión/rol/sucursal para UI heredada; no sustituye la cookie ni la autorización de servidor. | Mantener como puente hasta la limpieza final del shell; no usar para autorización. | 3.7D. |

## Dependencias por superficie

### Operación ya migrada, pero con panel local activo

Las rutas siguientes muestran el panel DB primero y luego siempre renderizan el
panel heredado (o lo hacen cuando DB está habilitada): clientes, leads,
expedientes, créditos, actividades, inventario/movimientos, reservas, ventas,
traslados, las cinco secciones de Caja y las secciones de Contabilidad.
`LegacySectionDivider` separa visualmente los bloques, pero no deshabilita la
lectura ni escritura local. Esto es B, no A.

Consecuencia: un usuario puede ver una fuente DB y una fuente local en la misma
ruta. Los paneles DB no escriben las claves locales, pero los paneles heredados
sí pueden generar un estado visible que no existe en PostgreSQL.

### Superficies todavía locales como fuente primaria

- **Marketing:** `MarketingPanel` usa `marketing-campaign-service` y datos
  locales de leads, expedientes, reservas y ventas.
- **Reportes:** `ReportsPanel` compone sus métricas desde servicios locales de
  actividades, expedientes, créditos, inventario, leads, reservas, ventas,
  proformas y documentos.
- **Dashboard:** `OperationsDashboard` calcula KPIs desde los mismos servicios
  locales y `demoSession`.

Estas tres superficies requieren 3.7C; no deben presentarse como datos DB.

### Portal público

`/consultar-expediente`, `/mi-credito`, `/mi-reserva` y `/mi-entrega` prefieren
la acción DB. Si esta no resuelve, `public-process-service` puede consultar las
claves locales. Para las cuatro vistas DB, el fallback exige código público más
teléfono o cédula válida y coincidente; ya no permite código solo y enmascara el
teléfono en la UI heredada. No se identificó exposición de notas, costos,
montos, VIN/chasis/motor o IDs desde el DTO DB. Mantener esta revisión en 3.7B
antes de considerar cualquier retiro.

`/solicitar-informacion` sigue escribiendo `publicLeads` como compatibilidad
después de intentar `createPublicLeadAction`; es la razón para no retirar esa
clave todavía.

### Puentes y candidatos

- `SessionBridge` replica la sesión autenticada en `motomas-demo-session-v1`
  porque shells y servicios heredados aún leen `DemoSession`. La autorización
  de servidor continúa usando cookie/sesión de servidor, pero el puente puede
  producir una UI local desactualizada.
- `src/shared/persistence/local-storage-adapter.ts` no tiene consumidores en
  `src`; es candidato E. No eliminar hasta que 3.7B confirme que no se necesita
  como punto de compatibilidad externo.
- `demo-data-reset-service` borra el conjunto central de claves desde Settings;
  no se toca en este patch. Es un punto de riesgo operativo que debe quedar
  detrás del flujo/flag de demo durante 3.7B.

## Riesgos de seguridad y presentación

| Hallazgo | Estado | Acción futura |
|---|---|---|
| Búsqueda pública por código solo | No detectada en las cuatro vistas DB; 3.6F reforzó también el fallback. | Mantener prueba de regresión en 3.7B. |
| Contacto/nota/costo/identificador de unidad en resultado público DB | No detectado; DTO público enmascara contacto y no expone esos campos. | Mantener smoke de payload al cambiar el fallback. |
| Datos locales sobre DB | Detectado: 26 rutas muestran un panel local debajo del DB. | Prioridad alta: gatear el panel heredado, no borrar claves. |
| Escritura local que altere estado DB | No detectada desde paneles DB; las escrituras pertenecen a paneles heredados. | Evitar cualquier sincronización bidireccional automática. |
| Copia técnica visible | Las etiquetas técnicas revisadas pasan por `LegacySectionDivider` y usan `SHOW_TECHNICAL_LABELS`; por defecto se muestra una etiqueta de negocio. Comentarios y mensajes de servidor no son UI. | Conservar el gate y revisar nuevas etiquetas en 3.7B. |

## Secuencia recomendada

1. **Patch 3.7B — Gatear fallback operacional inseguro.** Ocultar o volver
   explícitamente no operativo el bloque local cuando la ruta DB está
   habilitada; conservar claves y fallback para rollback. Incluir smoke de
   roles, sesión puente y portal público.
2. **Patch 3.7C — Migrar Marketing, Reportes y KPIs.** Reemplazar sus lecturas
   locales primarias por queries/DTOs DB antes de tocar sus claves.
3. **Patch 3.7D — Smoke final de roles, navegación y shell.** Retirar el uso
   funcional de `demoSession` solo cuando cada shell lea la sesión autenticada.
4. **Patch 3.7E — Checklist de endurecimiento productivo.** Confirmar flags,
   rutas públicas, reset demo, retención/limpieza aprobada y ausencia de copy
   técnico por defecto.

## No cambios de este patch

No se eliminó `localStorage`, no se removió ninguna clave, no se migró módulo,
no se modificó Prisma, no se ejecutaron migraciones y no se alteró `.env`.

## Patch 3.7B result

- Se agregó `shouldShowLegacyOperationalPanel` y el flag explícito
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS`. Con PostgreSQL disponible, el
  modo normal oculta el panel operacional local; el flag permite recuperarlo
  para trabajo técnico.
- Se gatearon las 26 rutas identificadas en 3.7A: Leads, Clientes, Expedientes,
  Créditos, Actividades, Reservas, Ventas, Traslados; las cinco rutas de Caja;
  y las trece rutas DB de Contabilidad.
- Si PostgreSQL no está disponible, el panel heredado se conserva como fallback
  para un rol autorizado. `LegacySectionDivider` solo aparece en recuperación
  explícita y mantiene su texto técnico detrás de
  `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`.
- Inventario/Movimientos ya usa la pantalla DB sin un panel heredado adicional.
  `/panel/inventario` conserva su vista local de consulta porque todavía no
  existe un panel DB equivalente; ocultarla dejaría la ruta vacía y migrarla no
  pertenece a 3.7B.
- El fallback de seguimiento público permanece: la consulta DB tiene prioridad,
  el fallback local exige código más teléfono o cédula coincidente, y el
  teléfono mostrado sigue enmascarado.
- `SessionBridge`, `session-service` y `motomas-demo-session-v1` permanecen como
  espejo de compatibilidad de UI. Ningún módulo bajo `src/server` los usa para
  autorización.
- El reset destructivo de datos del navegador se conserva, pero su control de
  Settings ahora está oculto por defecto y requiere
  `NEXT_PUBLIC_ENABLE_DEMO_DATA_RESET=true`. No toca PostgreSQL.
- Marketing, Reportes y Dashboard KPIs siguen local-first y sin cambios. Junto
  con la vista general de Inventario, son el trabajo restante a evaluar en
  3.7C.
- No se eliminó ninguna clave, servicio o dato local; no hubo cambio de Prisma,
  migración ni modificación de datos DB.

## Patch 3.7C.1 result

Se agregó la **capa de servidor DB** para Marketing, Reportes y KPIs del
Dashboard. La UI sigue **sin conectar**: los paneles Marketing, Reportes y
Dashboard aún leen sus servicios locales como fuente primaria. Este patch solo
prepara las queries/DTOs DB que 3.7C.2+ conectará.

### Capas de servidor añadidas

- `src/server/marketing/shared.ts` — enums, labels, `MarketingCampaignDTO`,
  `MarketingCampaignPerformanceDTO`, `MarketingSummaryDTO`, `MarketingCampaignInput`.
- `src/server/marketing/queries.ts` — `listMarketingCampaigns`,
  `getMarketingCampaignDetail`, `getMarketingCampaignPerformance`,
  `getMarketingSummary` (alcance Admin global / Gerente sucursal).
- `src/server/marketing/actions.ts` — `createMarketingCampaignAction`,
  `updateMarketingCampaignAction`, `archiveMarketingCampaignAction` (solo Admin).
- `src/server/analytics/shared.ts` — DTOs client-safe: `DashboardSummaryDTO`,
  `ReportSummaryDTO`, `LeadFunnelDTO`, `InventorySummaryDTO`,
  `ReservationSalesSummaryDTO`, `CreditSummaryDTO`, `QuoteDocumentSummaryDTO`,
  `ActivitySummaryDTO`, `ExpedienteSummaryDTO`, `BranchPerformanceDTO`,
  `SellerPerformanceDTO`, `DashboardRoleContextDTO`, `DashboardAlertDTO`.
- `src/server/analytics/queries.ts` — dashboard (`getOperationsDashboardSummary`,
  `getDashboardRoleContext`, `getDashboardAlerts`, `getDashboardRecentActivity`,
  `getDashboardBranchPerformance`, `getDashboardSellerPerformance`) y reportes
  (`getCommercialReportSummary`, `getLeadReport`, `getInventoryReport`,
  `getReservationSalesReport`, `getActivityReport`,
  `getQuoteCreditDocumentReport`, `getMarketingReport`, `getSellerReport`,
  `getBranchReport`).
- `src/server/auth/access.ts` — predicados `canViewCommercialAnalytics`,
  `canViewBranchPerformance`, `canViewSellerPerformance`,
  `getAnalyticsScopeForUser`, `canViewMarketing`, `canManageMarketing`,
  `getMarketingScopeForUser` (+ tipo `MarketingScope`).

### Esquema de marketing

**No requirió cambios en este patch.** El modelo `MarketingCampaign`, los enums
`MarketingChannel` / `MarketingCampaignStatus` / `MarketingCampaignObjective` y
los campos de atribución del `Lead` (`marketingCampaignId`, `utmSource`,
`utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `originChannel`) ya existen
en `prisma/schema.prisma` y en la migración
`20260711010940_analytics_marketing_foundation`. La capa de servidor solo los
consume.

### KPIs/Reportes ahora consultables desde DB

Derivados con agregación Prisma (`groupBy`/`aggregate`), nunca desde
localStorage: funnel de leads por estado/canal/campaña y conversión; conteos de
clientes y expedientes por estado; actividades pendientes/vencidas/próximas/
completadas; disponibilidad de inventario por modelo/estado; reservas y ventas
por estado; créditos por estado y monto solicitado; proformas y checklist
documental; performance de marketing por campaña; rendimiento por vendedor y por
sucursal.

### Alcance por rol (aplicado en la capa DB, no en la UI)

- Admin → global; Gerente → su sucursal; Vendedor → sus datos personales.
- Cajero y Contador → **bloqueados** de analítica comercial
  (`canViewCommercialAnalytics` los excluye antes de cualquier query).
- Marketing: Admin gestiona; Gerente lee su sucursal + campañas company-wide;
  Vendedor/Cajero/Contador no ven Marketing.
- El presupuesto de campaña se oculta a quien no puede ver costos.
- Los filtros de UI se combinan con el alcance mediante AND y nunca lo amplían;
  ningún branch/seller provisto por el cliente se confía.

### Pendiente para siguientes patches

- **3.7C.2** — Conectar `OperationsDashboard` a `getOperationsDashboardSummary`
  y helpers, detrás del flag DB, conservando el fallback local.
- **3.7C.3** — Conectar `ReportsPanel` a `getCommercialReportSummary`.
- **3.7C.4** — Conectar `MarketingPanel` a las queries/acciones de marketing.
- Tras conectar cada superficie, gatear su lectura local (como en 3.7B) antes de
  considerar el retiro de `motomas-marketing-campaigns-v1` y demás claves KPI.

## Patch 3.7C.2 result

- **Dashboard** pasó de local-first a **DB-backed**. La ruta
  `/panel/dashboard` es ahora un server component que resuelve la sesión, arma un
  `AnalyticsContext` y llama `getOperationsDashboardSummary`,
  `getDashboardRoleContext`, `getDashboardAlerts`, `getDashboardRecentActivity`,
  `getDashboardBranchPerformance` y `getDashboardSellerPerformance`; los KPIs se
  renderizan con `DashboardDbPanel`
  (`src/features/operations/modules/dashboard-db/dashboard-db-panel.tsx`), sin
  leer `localStorage`.
- **Reportes** pasó de local-first a **DB-backed**. La ruta `/panel/reportes` es
  ahora un server component que llama `getCommercialReportSummary` (incluye
  `getLeadReport`, `getInventoryReport`, `getReservationSalesReport`,
  `getActivityReport`, `getQuoteCreditDocumentReport`, `getMarketingReport`,
  `getSellerReport`, `getBranchReport`) y renderiza `ReportsDbPanel`
  (`src/features/operations/modules/reports-db/reports-db-panel.tsx`).
- Los servicios y claves locales de Dashboard/Reportes **se conservan** pero ya
  **no son la fuente primaria** de esas superficies. El panel heredado
  (`OperationsDashboard`, `ReportsPanel`) solo se renderiza por el gate 3.7B:
  fallback cuando no hay PostgreSQL, o recuperación técnica explícita con
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS=true`. No se renderiza junto al
  panel DB por defecto.
- Alcance por rol preservado: Admin global (resumen + desempeño por sucursal +
  vendedores + alertas), Gerente sucursal (desempeño de vendedores propios +
  alertas), Vendedor personal; Cajero/Contador reciben solo su encabezado no
  comercial (sin KPIs comerciales). Reportes sigue restringido a Admin/Gerente;
  Vendedor/Cajero/Contador ven la tarjeta "Reportes restringidos".
- Reportes muestra agregados de marketing **solo lectura** vía
  `getMarketingReport`; no se conectó la UI CRUD de Marketing ni se importaron
  acciones de marketing.
- Marketing UI sigue **pendiente** para 3.7C.3.
- No se mostró terminología técnica por defecto: las cadenas técnicas solo
  aparecen en comentarios de código, no en la UI, y el divisor heredado sigue
  detrás de `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS=true`.

## Patch 3.7C.3 result

- **Marketing** pasó de local-first a **DB-backed**. La ruta `/panel/marketing`
  es ahora un server component que resuelve la sesión, gatea a Admin/Gerente,
  arma la `MarketingScope` y llama `listMarketingCampaigns`,
  `getMarketingCampaignPerformance` y `getMarketingSummary`. El nuevo
  `MarketingDbPanel`
  (`src/features/operations/modules/marketing-db/marketing-db-panel.tsx`)
  renderiza lista, resumen y desempeño, y ejecuta las mutaciones vía las server
  actions `createMarketingCampaignAction`, `updateMarketingCampaignAction` y
  `archiveMarketingCampaignAction`. No lee `localStorage`.
- El servicio local `marketing-campaign-service` y la clave
  `motomas-marketing-campaigns-v1` **se conservan** pero ya **no son la fuente
  primaria** de `/panel/marketing`. El panel heredado `MarketingPanel` solo se
  renderiza por el gate 3.7B (sin PostgreSQL, o
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS=true`); no aparece junto al panel
  DB por defecto.
- El **desempeño de campaña** proviene de registros DB
  (`getMarketingCampaignPerformance`): leads atribuidos por `marketingCampaignId`,
  convertidos (leads en `EXPEDIENTE`), y reservas/ventas ligadas por
  expediente → lead → campaña. Ninguna métrica se calcula desde `localStorage`;
  si un dato no está disponible se muestra 0/estado vacío seguro.
- Alcance por rol preservado y aplicado en servidor: Admin gestiona global
  (crear/editar/finalizar, ve presupuesto); Gerente lee su sucursal + campañas
  company-wide sin gestionar; Vendedor/Cajero/Contador ven "Marketing
  restringido". El presupuesto se anula en el DTO para roles sin visibilidad de
  costos; los filtros de UI solo estrechan la lista ya scopeada por el servidor.
- **Compatibilidad del formulario público:** `/solicitar-informacion` sigue
  **sin cambios**. Captura `campaignId` + UTM desde el query string y resuelve el
  `campaignName` cosmético desde la lista local como *fallback*; la atribución DB
  del lead usa `campaignId`/UTM directamente y no depende de esa lectura local.
  No existe aún una consulta pública de campañas segura en la capa de servidor;
  añadir una sin tocar el flujo público de captación queda diferido. No se expuso
  presupuesto ni detalle privado de campaña en el portal.
- Dashboard, Reportes, Caja, Contabilidad y las rutas públicas de seguimiento
  **no se tocaron**. Terminología técnica oculta por defecto (solo en
  comentarios de código).
- Pendiente para **3.7C.4**: smoke test de roles end-to-end y evaluación de
  retiro/gating de `motomas-marketing-campaigns-v1` una vez validado.

## Patch 3.7C.4 result

Smoke test end-to-end contra PostgreSQL real (`motomas_db`, migraciones al día).
Se usó un harness temporal de dos rutas (`/api/smoke-3-7c4` y
`/api/smoke-3-7c4-pages`) que sembró fixtures aislados `SMOKE-3-7C4`, ejercitó las
funciones reales de query/serialización por rol y luego limpió todo. **Ambas
rutas fueron eliminadas** al terminar; no quedó código nuevo en el árbol y la DB
quedó sin fixtures (`campaigns=0, leads=0, units=0`).

- **Dashboard:** 200 para los cinco roles. Admin ve KPIs globales +
  `getDashboardBranchPerformance` (14 sucursales) + `getDashboardSellerPerformance`
  + alertas; Gerente ve KPIs de sucursal, `branchPerformance` vacío (solo Admin) y
  desempeño de sus vendedores; Vendedor ve KPIs personales y `sellerPerformance`
  vacío. Cajero y Contador reciben resumen comercial vacío
  (`canViewCommercialAnalytics=false`). Métricas DB verificadas: leads por
  estado/canal/campaña, actividades pendientes/vencidas/completadas,
  clientes/expedientes, proformas, créditos, checklist documental, inventario
  disponible, reservas, ventas, desempeño por sucursal/vendedor y alertas.
- **Reportes:** 200 para Admin/Gerente; Vendedor/Cajero/Contador ven la tarjeta
  "Reportes restringidos". `getCommercialReportSummary` scopeado (Admin global con
  14 sucursales, Gerente sin filas de sucursal). Marketing en Reportes es
  solo-lectura y DB-derivado.
- **Marketing:** 200 para los cinco roles. Admin lista/gestiona campañas y ve
  presupuesto; Gerente ve campañas company-wide (solo-lectura); Vendedor/Cajero/
  Contador → alcance `none` / tarjeta restringida. Performance DB verificada:
  leads atribuidos (2), convertidos (1), reservas (1), ventas (1). Presupuesto
  visible para roles con costos y **anulado** (`null`) cuando `canViewBudget=false`.
  DTOs serializan fechas como string (sin registros Prisma crudos). Update→PAUSED
  y archive→COMPLETED reflejados en la lista.
- **Escala/seguridad:** el alcance del Vendedor no se amplió (2 leads propios vs 3
  de sucursal del Gerente); Gerente no obtiene comparación entre sucursales;
  Cajero/Contador bloqueados de analítica comercial. Filtros de UI no pueden
  ampliar el alcance ya scopeado en servidor.
- **Regresión localStorage:** las tres superficies renderizan datos DB por
  defecto; los paneles heredados no aparecen (marcadores legacy ausentes en el
  HTML) al estar el gate 3.7B en su valor por defecto. No se muestra terminología
  técnica prohibida en el HTML de ninguna de las 15 combinaciones rol×página. No
  se eliminó ninguna clave ni servicio local.
- **Resultado:** 94/94 verificaciones OK (49 de capa de query + 45 de render de
  página). Sin cambios de esquema, sin migraciones, sin borrado de datos reales.
- **Trabajo restante:** evaluar en un patch posterior el gating/retiro de
  `motomas-marketing-campaigns-v1` y demás claves KPI locales, y una consulta
  pública de campañas segura para `/solicitar-informacion` (hoy sigue resolviendo
  el `campaignName` cosmético desde la lista local como fallback).

## Patch 3.7D result

Smoke test final integrado de roles, navegación, acceso a rutas, portal público,
gating heredado y terminología, contra PostgreSQL real. Harness temporal de una
ruta (`/api/smoke-3-7d`) que minteó cookies de sesión firmadas por rol, recorrió
todas las rutas internas y públicas y verificó estados/contenido; la ruta fue
**eliminada** al terminar (sin código nuevo en el árbol, sin fixtures DB creadas).

- **Auth/sesión:** las rutas `/panel/*` sin cookie redirigen a `/login`
  (verificado en dashboard, caja, contabilidad, marketing). La autorización de
  servidor usa la cookie firmada (`getCurrentUserSession`/`requireAuth`); el
  `OperationsShell` y `SessionBridge`/`motomas-demo-session-v1` son solo espejo de
  UI (clase C) y no participan en la autorización de servidor ni en el scoping de
  datos.
- **Admin:** las 33 rutas internas (comercial, operación, supervisión, caja,
  contabilidad + secciones) responden 200 sin crash, sin terminología técnica
  prohibida y sin marcadores de paneles heredados.
- **Gates por rol (server-side):** Reportes y Marketing devuelven la tarjeta
  restringida para Vendedor/Cajero/Contador y contenido normal para
  Admin/Gerente. Cajero en `/panel/leads` responde 200 sin panel de datos (gate
  `canOperateCrm`), sin fuga; su dashboard muestra encabezado no comercial.
- **Público:** `/`, `/catalogo`, `/motocicletas/boxer-150`,
  `/solicitar-informacion`, `/consultar-expediente`, `/mi-credito`, `/mi-reserva`,
  `/mi-entrega` responden 200 sin terminología técnica prohibida. La seguridad de
  seguimiento público (código + teléfono/cédula coincidente en la ruta DB, con
  máscara) no se modificó en 3.7C/3.7D.
- **Gating heredado:** con el entorno por defecto, ninguna superficie migrada
  renderiza su panel local (marcadores legacy ausentes en el HTML); el
  `LegacySectionDivider` sigue detrás de
  `NEXT_PUBLIC_ENABLE_LEGACY_OPERATIONAL_PANELS`, y las etiquetas técnicas detrás
  de `NEXT_PUBLIC_SHOW_TECHNICAL_MIGRATION_LABELS`.
- **Resultado:** 131/131 verificaciones OK. Sin cambios de código, esquema,
  migraciones ni borrado de datos.
- **Estado del puente localStorage:** `motomas-demo-session-v1` (clase C) y las
  claves operativas locales (clase B/D) permanecen intactas, gateadas por 3.7B.
- **Endurecimiento restante para producción:** retirar el uso funcional de
  `SessionBridge`/`demoSession` una vez que el shell lea la sesión autenticada del
  servidor; evaluar gating/retiro de las claves locales migradas; añadir la
  consulta pública de campañas segura; y el checklist de endurecimiento (flags,
  reset demo, retención) previsto para 3.7E.
