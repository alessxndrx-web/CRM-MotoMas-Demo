# MotoMas — Especificación de eventos contables (FF1.2-A)

Contrato funcional del motor de contabilización (FF1.4). Cataloga **todos** los
eventos de negocio de MotoMas que hoy generan, o deberán generar, un movimiento
contable.

> **Fase de análisis y documentación.** No se escribió código de producción, no
> se modificó el esquema, no se crearon servicios ni APIs y no se contabilizó
> nada. Este documento **no asigna cuentas**: eso corresponde al conjunto de
> mapeo contable (`AccountMappingSet`) que el contador de la empresa definirá.

Documentos relacionados: [FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md)
(FF1.0), [CHART_OF_ACCOUNTS.md](CHART_OF_ACCOUNTS.md) (FF1.1-A),
[FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md) (secuencia),
[ACCOUNTING_INTEGRATION_AUDIT.md](ACCOUNTING_INTEGRATION_AUDIT.md) y
[CASH_OPERATIONAL_AUDIT.md](CASH_OPERATIONAL_AUDIT.md) (auditorías 4.0S-A).

---

## 1. Cómo se construyó este catálogo

Los eventos **no se supusieron**: se descubrieron leyendo las acciones de
servidor que persisten en PostgreSQL, sus guardias y los modelos Prisma que
tocan. Módulos inspeccionados:

| Módulo | Ruta | Acciones exportadas |
|---|---|---|
| Caja | `src/server/caja/actions.ts` | 14 |
| Contabilidad | `src/server/contabilidad/actions.ts` | 51 |
| Ventas / Reservas / Traslados | `src/server/operations/actions.ts` | 10 |
| Inventario | `src/server/inventory/actions.ts` | 2 |
| Expedientes y créditos | `src/server/expedientes/actions.ts` | 12 |
| CRM | `src/server/crm/actions.ts` | 5 |
| Usuarios | `src/server/users/actions.ts` | 1 |
| Fundación financiera | `src/server/finance/**` | servicios (numeración, mapeo, catálogo) |
| Autenticación | `src/server/auth/**` | predicados y sesión firmada |

Los paneles heredados en `localStorage` (`src/features/operations/modules/accounting`,
`src/data/operations/accounting.ts`) **no se consideran fuente de eventos**: no
persisten en la base de datos, son por navegador y su retiro está planificado
(FF1.6). Cuando aportan un concepto que la base no modela, se anota como
hallazgo, no como evento.

### Hecho transversal, válido para todo el documento

> **Hoy ningún evento genera un asiento contable.** «Contabilizar» es, en todos
> los casos, un cambio de estado. La columna «Implementación actual» describe si
> el **hecho de negocio** está implementado, nunca si contabiliza.

### Esquema de cada ficha

- **Evento / Módulo / Disparador / Descripción**
- **Implementación actual**: Implementado · Parcial · Planificado · Ausente
- **Impacto contable esperado**: sobre Efectivo, Banco, Inventario, CxC, CxP,
  Ingresos, Gastos, Activos, Pasivos, Patrimonio, Impuestos
- **Requisitos de contabilización**: precondiciones, validaciones, entidades
  requeridas, permisos, fallos posibles
- **Integración futura**: mapeo, motor, auditoría, cierre de caja, reportes

Para no repetir 87 veces lo mismo, la **integración futura común a un módulo**
se declara una vez al inicio del módulo y cada ficha solo anota lo que se
desvía.

---

## 2. Módulo Caja

Ruta: `/panel/caja`. Roles: Cajero opera, Administrador opera como respaldo,
Gerente revisa cierres. Persistencia real en PostgreSQL desde el Parche 3.4A.

**Integración futura común del módulo:**
`AccountMappingSet` con alcance de sucursal preferido sobre el corporativo ·
el motor FF1.4 leerá el documento emitido y sus pagos, nunca el borrador ·
auditoría ya existente (`FinancialAuditEvent`, dominio CAJA) más el evento del
asiento (dominio CONTABILIDAD) · el traspaso a Contabilidad es FF1.3 e
idempotente por `cashDocumentId` · los cierres alimentan reportes de arqueo.

---

### CJ-01 · Apertura de turno de caja

- **Disparador:** `openCashSessionAction`
- **Descripción:** un cajero abre su turno en una sucursal; a partir de ahí sus
  documentos y pagos quedan asociados a ese turno.
- **Implementación actual:** **Parcial.** La sesión existe y valida «un turno
  abierto por cajero y sucursal» dentro de una transacción, pero sin índice
  único parcial: dos aperturas simultáneas pueden ganar ambas (hallazgo vigente
  de 4.0S-A, cierre planificado en FF1.6). **No existe saldo inicial** (ver
  CJ-15).
- **Impacto contable esperado:** ninguno por sí mismo. Lo tendrá cuando exista
  saldo inicial (Efectivo).
- **Requisitos:**
  - *Precondiciones:* sucursal válida; sin turno abierto del mismo cajero.
  - *Validaciones:* código de sucursal resuelto en servidor, nunca del cliente.
  - *Entidades:* `Branch`, `User`, `CashSession`.
  - *Permisos:* `canOperateCaja` (Administrador, Cajero).
  - *Fallos:* sucursal inexistente; turno ya abierto; base no configurada.
- **Integración futura:** delimita el período de arqueo; no se mapea.

### CJ-02 · Creación de documento de caja en borrador

- **Disparador:** `createCashDocumentAction`
- **Descripción:** se abre una factura, recibo, nota de débito o nota de crédito
  en estado BORRADOR, con tercero, concepto y montos.
- **Implementación actual:** **Implementado.**
- **Impacto contable esperado:** **ninguno.** Un borrador no es un hecho
  económico y no debe contabilizarse jamás.
- **Requisitos:**
  - *Precondiciones:* turno ABIERTO propio.
  - *Validaciones:* tipo válido; montos ≥ 0 y `Decimal(12,2)`; nota de crédito y
    de débito requieren documento relacionado; moneda de 3 letras si se indica.
  - *Entidades:* `CashSession`, `CashDocument`, opcionalmente `Customer`,
    `Sale`, `Reservation`.
  - *Permisos:* `canOperateCaja`.
  - *Fallos:* turno cerrado; tipo inválido; montos inválidos; número duplicado.
- **Integración futura:** el motor debe **ignorar** los borradores. La numeración
  secuencial de FF1.0 (`FinancialDocumentSeries.CAJA_*`) todavía **no está
  cableada** aquí: el número se genera con sufijo aleatorio.

### CJ-03 · Alta, edición y retiro de ítems del documento

- **Disparador:** `addCashDocumentItemAction`, `updateCashDocumentItemAction`,
  `removeCashDocumentItemAction`
- **Descripción:** líneas de detalle (descripción, cantidad, precio unitario)
  que componen el subtotal de una factura.
- **Implementación actual:** **Implementado**, solo sobre BORRADOR.
- **Impacto contable esperado:** ninguno directo; determina el subtotal que sí
  se contabilizará al emitir.
- **Requisitos:** documento en BORRADOR y turno ABIERTO; cantidad y precio no
  negativos; `canOperateCaja`.
- **Integración futura:** los ítems son la base de un futuro desglose de
  ingresos por línea de negocio (motos, repuestos, taller). **Hoy no existe
  clasificación de ítem**, así que el motor solo podrá mapear el subtotal
  completo a una única cuenta de ingreso por tipo de documento.

### CJ-04 · Registro de pago en borrador

- **Disparador:** `addCashPaymentAction`
- **Descripción:** el cajero registra cuánto recibió y por qué método
  (EFECTIVO, TRANSFERENCIA, CHEQUE, TARJETA).
- **Implementación actual:** **Parcial.** Solo puede registrarse mientras el
  documento está en BORRADOR; después de emitir, **no hay forma de cobrar**
  (planificado en FF1.2). Las notas de débito y crédito no aceptan pagos.
- **Impacto contable esperado:** Efectivo · Banco · CxC (cuando el pago es
  parcial) · Activos.
- **Requisitos:**
  - *Precondiciones:* documento BORRADOR, turno ABIERTO.
  - *Validaciones:* la suma de pagos **no puede superar el total** del
    documento; método válido; monto > 0.
  - *Entidades:* `CashDocument`, `CashPayment`, `CashSession`.
  - *Permisos:* `canOperateCaja`.
  - *Fallos:* documento emitido o anulado; pagos superan el total; método
    inválido.
- **Integración futura:** es el componente monetario más importante del módulo.
  Los componentes `PAGO_EFECTIVO`, `PAGO_TRANSFERENCIA`, `PAGO_CHEQUE` y
  `PAGO_TARJETA` de FF1.0 existen exactamente para esto.

### CJ-05 · Modificación de un pago en borrador
### CJ-06 · Retiro de un pago en borrador

- **Disparadores:** `updateCashPaymentAction`, `removeCashPaymentAction`
- **Implementación actual:** **Implementado** (solo BORRADOR).
- **Impacto contable esperado:** ninguno, porque el documento aún no se emitió.
  Si FF1.2 habilita cobros posteriores a la emisión, **modificar o borrar un
  pago dejará de ser aceptable** y deberá sustituirse por una reversión con
  contrapartida, igual que hizo 4.0S-C2 con los asientos.
- **Permisos:** `canOperateCaja`. **Fallos:** documento no borrador; tope de
  pagos excedido tras la edición.

### CJ-07 · Emisión de FACTURA

- **Disparador:** `issueCashDocumentAction` con `type = FACTURA`
- **Descripción:** el documento pasa a EMITIDO. Es el hecho económico: se
  reconoce el ingreso y el cobro asociado.
- **Implementación actual:** **Implementado** como hecho de negocio; **sin
  efecto contable**.
- **Impacto contable esperado:** Ingresos · Efectivo/Banco · CxC · Impuestos
  (retenciones) · **Inventario y Costo** cuando la factura corresponde a una
  venta de unidad (hoy imposible de determinar, ver riesgo R-04).
- **Requisitos:**
  - *Precondiciones:* BORRADOR; turno ABIERTO; **al menos un ítem**.
  - *Validaciones:* el subtotal se **recalcula desde los ítems** dentro de la
    transacción; `total = max(subtotal − abono − retención1 − retención2, 0)`;
    los pagos no pueden superar el total.
  - *Entidades:* `CashDocument`, `CashDocumentItem`, `CashPayment`,
    `CashSession`, `Branch`, `User`.
  - *Permisos:* `canOperateCaja`.
  - *Fallos:* sin ítems; turno cerrado; pagos superan el total; documento ya
    emitido.
- **Evento FF1.0:** `CAJA_FACTURA`. Componentes disponibles: `SUBTOTAL`,
  `RETENCION_1`, `RETENCION_2`, `ABONO_APLICADO`, `TOTAL`, `PAGO_*`.
- **Integración futura:** es el evento de mayor prioridad para FF1.4.
  **Advertencia:** el modelo **no tiene campo de impuesto**. `subtotal` es un
  monto único sin base imponible ni IVA, mientras la plantilla contable sí tiene
  cuentas de IVA. Ver riesgo R-01.

### CJ-08 · Emisión de RECIBO

- **Disparador:** `issueCashDocumentAction` con `type = RECIBO`
- **Descripción:** comprobante de dinero recibido (abono, prima, anticipo).
- **Implementación actual:** **Implementado** como hecho; sin efecto contable.
- **Impacto contable esperado:** Efectivo/Banco · CxC (cancelación) o Pasivos
  (anticipo de cliente). **Cuál de las dos depende del concepto**, y el concepto
  es texto libre: R-05.
- **Requisitos:** BORRADOR, turno ABIERTO; **no exige ítems**; el subtotal se
  captura directo; `canOperateCaja`.
- **Evento FF1.0:** `CAJA_RECIBO` (componentes `TOTAL` y `PAGO_*`).

### CJ-09 · Emisión de NOTA DE DÉBITO
### CJ-10 · Emisión de NOTA DE CRÉDITO

- **Disparador:** `issueCashDocumentAction` con `type = NOTA_DEBITO` /
  `NOTA_CREDITO`
- **Descripción:** ajustes al alza o a la baja sobre un documento previo
  (`relatedDocumentId` / `relatedDocumentNumber`).
- **Implementación actual:** **Parcial.** El documento se emite, pero **no
  modifica el saldo del documento relacionado**: la relación es informativa y no
  hay concepto de «documento saldado».
- **Impacto contable esperado:** Ingresos (o su deducción) · CxC · Impuestos ·
  Efectivo/Banco si se devuelve dinero.
- **Requisitos:** documento relacionado indicado; BORRADOR; turno ABIERTO; **no
  aceptan pagos**; `canOperateCaja`.
- **Eventos FF1.0:** `CAJA_NOTA_DEBITO`, `CAJA_NOTA_CREDITO` (componentes
  `SUBTOTAL` y `TOTAL`).
- **Integración futura:** la nota de crédito es el vehículo natural de la
  devolución de venta (VT-06), que hoy no existe.

### CJ-11 · Anulación de documento de caja

- **Disparador:** `cancelCashDocumentAction`
- **Descripción:** anulación interna con motivo obligatorio.
- **Implementación actual:** **Parcial.** Exige turno ABIERTO, así que un
  documento de un turno ya cerrado **no se puede anular**; y anula documentos ya
  EMITIDOS cambiando su estado en sitio.
- **Impacto contable esperado:** reversión completa del asiento de emisión.
- **Requisitos:** no anulado; turno ABIERTO; motivo obligatorio;
  `canOperateCaja`.
- **HALLAZGO H-01:** `AccountingEventType` **no tiene evento de anulación de
  caja**. Si un documento emitido ya generó asiento, anularlo debe producir una
  **reversión referenciada** (motor 4.0S-C2), no borrar el asiento. Falta
  decidir si se modela como evento de mapeo propio o como reversión automática
  del asiento origen.

### CJ-12 · Preparación del cierre (arqueo)

- **Disparador:** `createCashClosingAction`
- **Descripción:** el cajero digita el efectivo, transferencias, cheques y
  tarjetas contados; el sistema calcula la diferencia.
- **Implementación actual:** **Parcial. Aritmética corregida en el Parche
  FF1.1-B.**

  Fórmula anterior (incorrecta):

  ```txt
  recibido   = efectivo + transferencia + cheque + tarjeta   (digitado)
  facturado  = Σ total de documentos EMITIDO de tipo FACTURA (del turno)
  diferencia = recibido − facturado
  ```

  Ignoraba los `CashPayment` realmente registrados, ignoraba recibos y
  notas, y contaba una factura parcialmente pagada por su valor total.

  Fórmula vigente (FF1.1-B):

  ```txt
  esperado[m]   = Σ pagos de método m registrados en documentos EMITIDO del turno
  contado[m]    = lo que el cajero cuenta de método m
  diferencia[m] = contado[m] − esperado[m]
  diferencia    = Σ contado − Σ esperado
  ```

  El esperado por método se **almacena** en el cierre, de modo que un pago
  corregido después no reescriba en silencio una diferencia ya revisada. Lo
  facturado y las retenciones se conservan como cifras **informativas** y ya
  no participan en la diferencia.

  **Sigue pendiente** el fondo inicial del turno (CJ-15) y los movimientos de
  efectivo (CJ-16): mientras no existan, el efectivo esperado es únicamente lo
  cobrado, y un fondo de cambio contado al cierre aparecería como sobrante.
- **Impacto contable esperado:** Efectivo · Banco · sobrantes (Ingresos) ·
  faltantes (Gastos o CxC al cajero).
- **Requisitos:** turno ABIERTO; sin cierre previo (`cashSessionId` único);
  montos válidos; `canOperateCaja`.
- **Evento FF1.0:** `CAJA_CIERRE`, componentes `DIFERENCIA_SOBRANTE` y
  `DIFERENCIA_FALTANTE`.
- **Integración futura:** la aritmética ya es correcta (FF1.1-B), así que
  FF1.4 puede consumir la diferencia del cierre. Lo que aún la desvía es el
  fondo inicial y los movimientos de efectivo, ambos ausentes: hasta que
  existan, contabilizar la diferencia de un turno con fondo de cambio
  registraría un sobrante inexistente.

### CJ-13 · Cierre del turno

- **Disparador:** `closeCashSessionAction`
- **Implementación actual:** **Implementado.** Recalcula totales y cierra la
  sesión; después no se pueden emitir ni anular documentos del turno.
- **Impacto contable esperado:** ninguno propio; consolida CJ-12.
- **Requisitos:** turno ABIERTO; cierre preparado; `canOperateCaja`.

### CJ-14 · Revisión contable del cierre

- **Disparador:** `reviewCashClosingAction`
- **Descripción:** un supervisor marca el cierre como
  `REVISADO_CONTABILIDAD`.
- **Implementación actual:** **Parcial.** Es una etiqueta: no produce registro
  contable, no acepta ni rechaza explícitamente un faltante o sobrante.
- **Impacto contable esperado:** es el momento natural para contabilizar la
  diferencia del turno.
- **Permisos:** `canReviewCaja` (Administrador, Gerente) — nunca el Cajero.
- **Integración futura:** candidato a ser el disparador de `CAJA_CIERRE` en
  FF1.4. FF1.1-B ya dejó determinista la diferencia que se contabilizaría; la
  aceptación explícita de faltante/sobrante sigue pendiente.

### CJ-15 · Saldo inicial del turno — **Ausente** (pendiente tras FF1.1-B)

Sin saldo inicial no existe «efectivo esperado»: la diferencia sólo puede
compararse contra documentos, que es justo el error de CJ-12. Impacto: Efectivo.

### CJ-16 · Movimiento de efectivo (entrada/salida) — **Ausente** (pendiente tras FF1.1-B)

Salidas de caja, gastos menores, depósitos bancarios, retiros y entregas de
fondos. Hoy **el dinero solo puede entrar**. Impacto: Efectivo · Banco · Gastos ·
CxC. Requiere modelo `CashMovement` (cambio de esquema, fuera de esta fase).

### CJ-17 · Cobro posterior a la emisión — **Ausente** (planificado FF1.2)

Un documento emitido con saldo pendiente no puede recibir abonos. Impacto:
Efectivo · Banco · CxC.

### CJ-18 · Reversión o devolución de un cobro — **Ausente** (planificado FF1.2)

Hoy un pago se edita o se borra. Un cobro contabilizado nunca podrá borrarse.
Impacto: Efectivo · Banco · CxC · Ingresos.

### CJ-19 · Traspaso de fondos entre cajas o a tesorería — **Ausente**, sin patch asignado

Impacto: Efectivo · Banco. Depende de un módulo de Tesorería inexistente.

---

## 3. Módulo Contabilidad

Ruta: `/panel/contabilidad`. Roles: Administrador y Contador operan; Gerente
solo lee inventario valorado y resúmenes de su sucursal.

**Integración futura común del módulo:**
todo evento contabilizable se resolverá contra el conjunto de mapeo vigente a la
fecha del documento · el asiento generado nacerá `CONTABILIZADO` con
`source = DOCUMENTO` y `accountingDocumentId` poblado · la unicidad de
`accountingDocumentId` impedirá contabilizar dos veces · el bloqueo de período
(4.0S-C1) y la reversión referenciada (4.0S-C2) ya rigen · toda corrección será
una reversión, nunca una edición.

---

### CT-01 · Alta, edición, desactivación y archivado de cuenta contable
### CT-02 · Aprobación de cuenta de plantilla
### CT-03 · Alta, edición y desactivación de tercero

- **Disparadores:** `createChartAccountAction`, `updateChartAccountAction`,
  `moveChartAccountAction`, `deactivateChartAccountAction`,
  `activateChartAccountAction`, `archiveChartAccountAction`,
  `restoreChartAccountAction`, `approveTemplateChartAccountsAction`,
  `createThirdPartyAction`, `updateThirdPartyAction`,
  `deactivateThirdPartyAction`
- **Implementación actual:** **Implementado** (catálogo reforzado en FF1.1-A).
- **Impacto contable esperado:** **ninguno.** Son datos maestros. Se listan
  porque condicionan a todos los demás: una cuenta no aprobada, de agrupación,
  archivada o fuera de vigencia **bloquea** cualquier evento que la use.
- **Permisos:** Administrador y Contador con alcance contable global.

### CT-04 · Creación de documento contable (borrador)

- **Disparador:** `createAccountingDocumentAction`
- **Implementación actual:** **Implementado.**
- **Impacto contable esperado:** ninguno (borrador).
- **Requisitos:** sucursal válida; tipo válido; montos válidos; número único;
  `canOperateContabilidad`.
- **Nota:** los campos de trazabilidad (`cashDocumentId`, `cashClosingId`,
  `saleId`, `reservationId`, `customerId`) existen pero **la UI no los llena
  nunca**, así que `origin` siempre es CONTABILIDAD (hallazgo H-02).

### CT-05 · Emisión de documento contable
### CT-06 · Revisión de documento contable

- **Disparadores:** `issueAccountingDocumentAction`,
  `reviewAccountingDocumentAction`
- **Implementación actual:** **Implementado** como máquina de estados
  (BORRADOR → EMITIDO → REVISADO).
- **Impacto contable esperado:** ninguno propio; habilitan CT-07.
- **Permisos:** operar / `canReviewContabilidad`.

### CT-07 · Contabilización de documento contable ⭐

- **Disparador:** `postAccountingDocumentAction`
- **Descripción:** el documento pasa a CONTABILIZADO. **Es el evento central de
  FF1.4:** aquí debe nacer el asiento.
- **Implementación actual:** **Parcial.** Cambia el estado y bloquea la edición
  posterior; **no genera ningún asiento**.
- **Impacto contable esperado (según tipo):**
  - FACTURA → Ingresos · CxC · Impuestos (+ Inventario y Costo si es venta)
  - NOTA_DEBITO → Ingresos · CxC · Impuestos
  - NOTA_CREDITO → deducción de Ingresos · CxC · Impuestos
  - RECIBO_OFICIAL_CAJA → Efectivo/Banco · CxC
- **Requisitos:**
  - *Precondiciones:* estado REVISADO; período contable **abierto** para la
    sucursal y fecha del documento (4.0S-C1).
  - *Validaciones futuras del motor:* existir mapeo para el evento y **cada**
    componente con importe distinto de cero; todas las cuentas del mapeo aptas
    para recibir movimiento en la fecha del documento; asiento cuadrado
    (garantizado por construcción, FF1.0); documento no contabilizado antes.
  - *Entidades:* `AccountingDocument`, `AccountMappingSet` + `AccountMappingRule`
    vigentes, `ChartAccount`, `AccountingClosing`, `JournalEntry`.
  - *Permisos:* `canReviewContabilidad` (Administrador, Contador).
  - *Fallos:* período cerrado; sin mapeo (**debe detener la contabilización, no
    inventar cuenta**); cuenta inactiva/archivada/de agrupación/plantilla sin
    aprobar; documento ya contabilizado; carrera de doble contabilización.
- **Eventos FF1.0:** `DOCUMENTO_FACTURA`, `DOCUMENTO_NOTA_DEBITO`,
  `DOCUMENTO_NOTA_CREDITO`, `DOCUMENTO_RECIBO_OFICIAL_CAJA`.
- **Integración futura:** requiere una restricción de unicidad sobre
  `JournalEntry.accountingDocumentId` (hoy no existe) para que la idempotencia
  sea una garantía de base de datos y no un `if`.

### CT-08 · Conciliación de documento contable

- **Disparador:** `reconcileAccountingDocumentAction`
- **Implementación actual:** **Implementado** (CONTABILIZADO → CONCILIADO), con
  bloqueo de período.
- **Impacto contable esperado:** ninguno propio; es una marca de control.

### CT-09 · Anulación de documento contable

- **Disparador:** `cancelAccountingDocumentAction`
- **Implementación actual:** **Implementado con salvaguarda:** desde 4.0S-B un
  documento CONTABILIZADO **no puede anularse directamente**; exige reversión.
- **Impacto contable esperado:** reversión del asiento de CT-07.
- **HALLAZGO H-01 (mismo caso que CJ-11):** falta el evento de anulación en el
  enum. La decisión pendiente es si la anulación genera un evento de mapeo
  propio o reutiliza el motor de reversión del asiento origen. **Recomendación
  técnica:** reversión del asiento origen, porque ya garantiza espejo exacto,
  unicidad y cadena imposible.

### CT-10 · Creación de asiento manual
### CT-11 · Alta, edición y retiro de líneas de asiento

- **Disparadores:** `createJournalEntryAction`, `addJournalEntryLineAction`,
  `updateJournalEntryLineAction`, `removeJournalEntryLineAction`
- **Implementación actual:** **Implementado**, solo sobre BORRADOR.
- **Impacto contable esperado:** cualquiera; es el asiento libre del contador.
- **Requisitos:** cada línea exige cuenta apta **en la fecha del asiento**
  (FF1.1-A); una línea no puede tener debe y haber a la vez ni ambos en cero;
  montos no negativos; `canOperateContabilidad`.
- **Integración futura:** el asiento manual seguirá existiendo después de FF1.4;
  es la vía de los eventos sin mapeo (depreciación, provisiones, ajustes).

### CT-12 · Contabilización de asiento

- **Disparador:** `postJournalEntryAction`
- **Implementación actual:** **Implementado.** Valida cuadre, revalida **todas**
  las líneas contra el estado actual de las cuentas y aplica el bloqueo de
  período.
- **Impacto contable esperado:** el que declaren sus líneas.
- **Permisos:** `canReviewContabilidad`.
- **Fallos:** sin líneas; descuadre; cuenta no apta; período cerrado.

### CT-13 · Conciliación de asiento
### CT-15 · Anulación de asiento borrador

- **Implementación actual:** **Implementado.** Un asiento contabilizado ya no se
  anula en sitio (4.0S-B).

### CT-14 · Reversión de asiento contabilizado

- **Disparador:** `reverseJournalEntryAction`
- **Implementación actual:** **Implementado** (4.0S-C2): asiento espejo,
  `reversalOfId` único, una reversión por original, sin cadenas, bloqueo de
  período sobre la **fecha de la reversión**, y excepción acotada para reutilizar
  cuentas históricas desactivadas.
- **Impacto contable esperado:** inverso exacto del original.
- **Integración futura:** es el mecanismo de corrección de **todo** lo que
  FF1.4 genere. Ningún evento automático debe poder borrar su asiento.

### CT-16 a CT-21 · Comprobantes (ingreso, egreso, cheque, transferencia, reembolso, ajuste)

- **Disparador:** `createAccountingVoucherAction` con `type` correspondiente
- **Descripción:** comprobantes de tesorería/caja general con beneficiario,
  concepto, banco, referencia y monto.
- **Implementación actual:** **Parcial.** Se registran y se listan; **no tienen
  efecto contable**. Llevan `debit`, `credit` y una única `accountId` de
  contrapartida — una estructura de asiento simplificada que no cuadra por
  construcción.
- **Impacto contable esperado:**
  - INGRESO → Efectivo/Banco · CxC · Ingresos
  - EGRESO / CHEQUE / TRANSFERENCIA → Efectivo/Banco · CxP · Gastos
  - REEMBOLSO → Efectivo/Banco · Gastos · CxC a empleados
  - AJUSTE → cualquiera (por definición)
- **Requisitos:** sucursal válida; monto > 0; número único; cuenta contable
  opcional y **apta** si se indica; `canOperateContabilidad`.
- **Eventos FF1.0:** `COMPROBANTE_INGRESO`, `COMPROBANTE_EGRESO`,
  `COMPROBANTE_CHEQUE`, `COMPROBANTE_TRANSFERENCIA`, `COMPROBANTE_REEMBOLSO`,
  `COMPROBANTE_AJUSTE` — todos con un único componente `TOTAL`.
- **Riesgo:** un comprobante de AJUSTE con un solo componente `TOTAL` y un par
  debe/haber fijo **no puede representar un ajuste arbitrario**. Ver R-06.

### CT-22 · Conciliación y anulación de comprobante

- **Disparadores:** `reconcileAccountingVoucherAction`,
  `cancelAccountingVoucherAction`
- **Implementación actual:** **Implementado** como cambio de estado.
- **Impacto contable esperado:** la anulación de un comprobante contabilizado
  exigirá reversión (mismo hallazgo H-01).

### CT-23 · Registro de gasto
### CT-24 · Revisión de gasto

- **Disparadores:** `createExpenseAction`, `updateExpenseAction`,
  `reviewExpenseAction`
- **Descripción:** gasto por categoría (combustible, servicios básicos,
  mantenimiento, papelería, viáticos, repuestos internos, administrativos,
  compras varias, otros) con proveedor, factura, subtotal, impuesto y total.
- **Implementación actual:** **Parcial.** Se registra y se revisa
  (REGISTRADO → REVISADO); **no se contabiliza, no afecta caja ni banco, no se
  puede anular ni revertir**.
- **Impacto contable esperado:** Gastos · Impuestos (`tax`) · CxP · Efectivo o
  Banco según forma de pago.
- **Requisitos:** sucursal válida; montos válidos; cuenta contable opcional y
  apta; comprobante opcional; `canOperateContabilidad` / revisar con
  `canReviewContabilidad`.
- **Evento FF1.0:** `GASTO` (componentes `SUBTOTAL`, `RETENCION_1`,
  `RETENCION_2`, `TOTAL`).
- **Inconsistencia I-03:** el modelo `Expense` tiene `tax`, pero el evento
  `GASTO` de FF1.0 sólo ofrece retenciones, **no un componente de impuesto
  acreditable**. El mapeo actual no puede expresar el IVA de una compra.
- **Prioridad alta para FF1.4:** es el evento más simple con impacto real y sin
  dependencias de inventario ni de caja.

### CT-25 · Registro de planilla
### CT-26 · Preparación de planilla
### CT-27 · Pago de planilla

- **Disparadores:** `createPayrollRecordAction`, `preparePayrollRecordAction`,
  `markPayrollRecordPaidAction`
- **Descripción:** registro por empleado y período con salario base, comisiones,
  bonos, deducciones, adelantos y neto.
- **Implementación actual:** **Parcial.** Registros planos con máquina de estados
  BORRADOR → PREPARADA → PAGADA; **sin efecto contable, sin cálculo de aportes
  patronales, sin relación con `User`** (el empleado es texto libre).
- **Impacto contable esperado:** Gastos (sueldos, comisiones, bonos) · Pasivos
  (INSS laboral, retenciones, aguinaldo, vacaciones, indemnización) · Efectivo o
  Banco al pagar · CxC por adelantos.
- **Requisitos:** sucursal válida; período `AAAA-MM`; montos válidos;
  `canOperateContabilidad`.
- **Evento FF1.0:** `PLANILLA` (componentes `PLANILLA_NETO` y
  `PLANILLA_DEDUCCIONES`).
- **Inconsistencia I-04:** faltan componentes para **aportes patronales**
  (INSS patronal, INATEC), que son gasto de la empresa y no deducción del
  empleado. El plan de cuentas de FF1.1-A sí los tiene; el mapeo no puede
  expresarlos. **Requiere validación del contador.**

### CT-28 · Catálogo de costo de inventario

- **Disparadores:** `createAccountingInventoryCostAction`,
  `updateAccountingInventoryCostAction`
- **Descripción:** costo unitario y stock mínimo por modelo y sucursal.
- **Implementación actual:** **Parcial.** Es un catálogo mantenido a mano, por
  **modelo**, no por unidad física. No se conecta con `MotorcycleUnit` ni con
  `InventoryMovement`.
- **Impacto contable esperado:** ninguno propio; es el **insumo del costo de
  ventas** (ver riesgo R-02).
- **Permisos:** doble predicado (`canViewAccountingCosts` +
  `canOperateContabilidad`) → sólo Administrador y Contador.

### CT-29 a CT-32 · Cierre contable: creación, revisión, cierre y reapertura

- **Disparadores:** `createAccountingClosingAction`,
  `reviewAccountingClosingAction`, `closeAccountingClosingAction`,
  `reopenAccountingClosingAction`
- **Descripción:** control de período `AAAA-MM` por sucursal.
- **Implementación actual:** **Parcial.** Como **control sí funciona**: desde
  4.0S-C1 un cierre CERRADO bloquea contabilizar y conciliar, sin excepción para
  Administrador. Como **registro no**: los totales (ingresos, gastos,
  retenciones, aplicado, caja, diferencia) se **digitan a mano** en vez de
  derivarse del libro.
- **Impacto contable esperado:** ninguno hoy. En el futuro, el cierre anual
  deberá generar el asiento de traslado de resultados (ver CT-36).
- **Requisitos:** período válido; sucursal válida; `canReviewContabilidad`.
- **Integración futura:** FF1.5 debe **calcular** estos totales desde asientos
  contabilizados y dejar de aceptarlos digitados.

### CT-33 · Depreciación y amortización periódica — **Ausente**, sin patch asignado

La plantilla de FF1.1-A tiene siete cuentas de depreciación acumulada y las
cuentas de gasto correspondientes, pero **no existe registro de activo fijo**
(no hay modelo de activo, vida útil ni método). Impacto: Gastos · Activos.
Hoy sólo puede hacerse como asiento manual (CT-10).

### CT-34 · Provisiones y estimaciones periódicas — **Ausente**, sin patch asignado

Garantías de motocicletas, mantenimientos incluidos, cuentas incobrables,
obsolescencia de inventario, vacaciones, aguinaldo, indemnización. La plantilla
las contempla; el sistema no las calcula. Impacto: Gastos · Pasivos · Activos
(estimaciones contra-activo).

### CT-35 · Ajuste por diferencial cambiario — **Ausente**, bloqueado por decisión de negocio

`currency` es texto libre en ocho modelos, sin moneda funcional declarada ni
tabla de tipos de cambio. Impacto: Ingresos · Gastos · Activos · Pasivos.
**Bloqueante para operar en dos monedas.** Ver riesgo R-03.

### CT-36 · Cierre anual y traslado de resultados — **Ausente**, sin patch asignado

Impacto: Ingresos · Gastos · Costos · Patrimonio. Depende de que los reportes
deriven del libro (FF1.5).

---

## 4. Módulo Bancos

Submódulo de Contabilidad (`/panel/contabilidad/bancos`, `/conciliacion`).

**Integración futura común:** ningún movimiento bancario llega hoy al libro; la
conciliación deberá enlazarse con los pagos de caja (método TRANSFERENCIA,
CHEQUE, TARJETA) y con los comprobantes de egreso.

### BN-01 · Alta de cuenta bancaria
### BN-02 · Actualización de cuenta y saldo
### BN-03 · Desactivación de cuenta bancaria

- **Disparadores:** `createBankAccountAction`, `updateBankAccountAction`,
  `deactivateBankAccountAction`
- **Implementación actual:** **Parcial.** `balance` se **edita a mano** y nada
  lo mueve: no es un saldo contable, es una anotación.
- **Impacto contable esperado:** ninguno propio. El saldo real debe derivarse de
  la cuenta contable de banco, no de esta columna.
- **Permisos:** `canOperateContabilidad`.
- **HALLAZGO H-03:** mantener un saldo editable a mano junto a un libro mayor
  crea dos verdades. Debe pasar a ser derivado o marcarse explícitamente como
  «saldo de referencia».

### BN-04 · Registro de movimiento a conciliar
### BN-05 · Revisión / conciliación
### BN-06 · Anulación de conciliación

- **Disparadores:** `createBankReconciliationAction`,
  `updateBankReconciliationAction`, `reviewBankReconciliationAction`,
  `cancelBankReconciliationAction`
- **Implementación actual:** **Parcial.** Es un registro de coincidencia de un
  solo movimiento: sin períodos de estado de cuenta, sin saldos, sin
  importación, sin coincidencias parciales. Un movimiento **sin documento
  enlazado se auto-certifica como CONCILIADO**.
- **Impacto contable esperado:** ninguno propio; es control. Los cargos y
  comisiones bancarias detectados sí generarán Gastos.
- **Requisitos:** cuenta bancaria válida; monto válido; documento contable
  opcional; `canOperateContabilidad` / revisar con `canReviewContabilidad`.

### BN-07 · Importación de estado de cuenta — **Ausente** (planificado FF1.5)
### BN-08 · Depósito bancario del efectivo de caja — **Ausente** (requiere CJ-16)

Impacto: Efectivo · Banco. Es el puente que hoy no existe entre Caja y Bancos.

---

## 5. Módulo Ventas (reservas, ventas y entregas)

Ruta: `/panel/reservas`, `/panel/ventas`. Roles: Administrador, Gerente y
Vendedor. Persistencia real desde el Parche 3.2B.

**Hecho central:** `src/server/operations` **no contiene ninguna referencia a
Caja ni a Contabilidad**. Una venta completada no reconoce ingreso, no genera
cuenta por cobrar, no mueve efectivo, no reconoce costo y no crea documento
contable. Clasificación: **DESCONECTADO**.

**Integración futura común:** requiere primero un importe monetario en `Sale`
(hoy inexistente) y una decisión sobre si la venta contabiliza por sí misma o
sólo a través del documento de caja que la factura.

### VT-01 · Creación de reserva

- **Disparador:** `createReservation`
- **Descripción:** se reserva una unidad disponible para un cliente; la unidad
  pasa a RESERVED y se registra un `InventoryMovement` de tipo RESERVA.
- **Implementación actual:** **Implementado** (sin importe).
- **Impacto contable esperado:** **ninguno** si no hay depósito. Con depósito
  (VT-07) → Efectivo/Banco · Pasivos (anticipo de cliente).
- **Requisitos:** unidad AVAILABLE; cliente existente; sucursal del actor
  (`canAccessBranch`); un vendedor sólo opera clientes propios;
  `canManageReservations`.
- **Fallos:** unidad no disponible; reserva activa existente; cliente ajeno.

### VT-02 · Cancelación de reserva
### VT-03 · Completar reserva

- **Disparadores:** `cancelReservation`, `completeReservation`
- **Implementación actual:** **Implementado.** La cancelación devuelve la unidad
  a AVAILABLE.
- **Impacto contable esperado:** ninguno hoy. Con depósito: devolución
  (Efectivo/Banco · Pasivos) o aplicación a la venta (Pasivos · CxC).

### VT-04 · Registro de venta ⭐

- **Disparador:** `createSale`
- **Descripción:** se registra la venta de una unidad (CONTADO o
  FINANCIAMIENTO_EXTERNO); la unidad pasa a SOLD y se registra un movimiento
  VENTA. Si venía de reserva, la reserva se completa.
- **Implementación actual:** **Parcial. `Sale` no tiene ningún campo monetario.**
  No hay precio, ni descuento, ni impuesto, ni forma de pago.
- **Impacto contable esperado:** Ingresos · CxC (o Efectivo/Banco) · Impuestos ·
  **Inventario y Costo de ventas** (baja de la unidad vendida).
- **Requisitos:**
  - *Precondiciones:* unidad AVAILABLE o RESERVED; sin venta previa
    (`motorcycleUnitId` único); cliente existente; expediente coherente.
  - *Validaciones futuras:* importe de venta; costo de la unidad; período
    abierto; mapeo del evento.
  - *Entidades:* `Sale`, `MotorcycleUnit`, `Customer`, `Branch`, `User`,
    `InventoryMovement`, y en el futuro `AccountingInventoryCost` o un costo por
    unidad.
  - *Permisos:* `canManageSales` (Administrador, Gerente, Vendedor).
  - *Fallos:* unidad ya vendida; unidad de otra sucursal; cliente ajeno al
    vendedor.
- **HALLAZGO H-04:** `AccountingEventType` **no contempla la venta**. Los
  diecisiete eventos de FF1.0 cubren documentos y comprobantes, no la operación
  comercial. Contabilizar la venta exige, como mínimo, dos eventos nuevos
  (reconocimiento de ingreso y reconocimiento de costo) o la decisión explícita
  de que **la venta sólo se contabiliza a través de la factura de caja**.
  **Es la decisión de diseño más importante pendiente para FF1.4.**

### VT-05 · Entrega de la unidad

- **Disparador:** `markSaleDelivered`
- **Implementación actual:** **Implementado.** Estado ENTREGADA + unidad
  DELIVERED + movimiento ENTREGA.
- **Impacto contable esperado:** depende de la política de reconocimiento: si el
  ingreso se reconoce a la entrega y no a la venta, **éste** es el evento
  contable y VT-04 no lo es. **Requiere decisión del contador.**

### VT-06 · Anulación o devolución de venta — **Ausente**, sin patch asignado

`SaleStatus` sólo tiene COMPLETADA y ENTREGADA: **una venta no se puede
cancelar**. Impacto: Ingresos · CxC · Inventario · Costo. Vehículo natural: nota
de crédito (CJ-10).

### VT-07 · Depósito o prima de reserva — **Ausente**

`Reservation` no tiene importe. Hoy se instrumenta a mano como recibo de caja
(CJ-08) sin vínculo con la reserva. Impacto: Efectivo/Banco · Pasivos.

---

## 6. Módulo Inventario

Ruta: `/panel/inventario`, `/panel/traslados`. Roles: Administrador y Gerente
registran ingresos y egresos; el Vendedor puede solicitar traslados.

**Hecho central:** `MotorcycleUnit` e `InventoryMovement` **no almacenan costo
alguno**. El inventario es físico, no valorado.

### IN-01 · Ingreso de unidad al inventario ⭐

- **Disparador:** `registerIngress`
- **Descripción:** se crea la unidad física (chasis, motor, modelo, color,
  sucursal, fecha de entrada) y su movimiento INGRESO.
- **Implementación actual:** **Parcial.** El hecho físico se registra; **sin
  costo, sin proveedor, sin documento de compra**.
- **Impacto contable esperado:** Inventario · CxP · Impuestos (IVA acreditable
  en compra e importación) · Efectivo/Banco si se paga de contado.
- **Requisitos:**
  - *Precondiciones:* chasis único; sucursal válida; el Gerente sólo en su
    sucursal.
  - *Validaciones futuras:* costo unitario, proveedor y documento de compra.
  - *Entidades:* `MotorcycleUnit`, `InventoryMovement`, `Branch`; faltarían
    proveedor (`ThirdParty`) y documento de compra.
  - *Permisos:* `canRegisterMotorcycleIngress` (Administrador, Gerente).
  - *Fallos:* chasis duplicado; sucursal ajena; año inválido.
- **HALLAZGO H-05:** éste es, de facto, el **evento de compra** de MotoMas, y no
  existe módulo de Compras. Sin costo en el ingreso no puede haber inventario
  valorado ni costo de ventas. **Es el bloqueo real de VT-04.**

### IN-02 · Egreso o baja de unidad

- **Disparador:** `registerEgress`
- **Descripción:** salida de la unidad por uno de seis motivos configurados:
  venta, entrega, traslado a otra sucursal, ajuste de inventario, cancelación y
  otro/baja.
- **Implementación actual:** **Implementado** como hecho físico; sin valor.
- **Impacto contable esperado (según motivo):**
  - Venta / Entrega → Inventario · Costo de ventas
  - Traslado → **ninguno** (sólo cambia de sucursal, no sale del patrimonio)
  - Ajuste / Otro / Cancelación → Inventario · Gastos (merma, faltante, baja)
- **Requisitos:** unidad existente; el Gerente sólo en su sucursal; motivo
  válido; fecha válida; `canRegisterMotorcycleEgress`.
- **Riesgo:** el mismo movimiento sirve para hechos con impacto contable muy
  distinto. El motor **no puede** mapear «egreso» como un solo evento: debe
  mapear por motivo.

### IN-03 a IN-07 · Traslados entre sucursales

- **Disparadores:** `createTransfer`, `approveTransfer`, `dispatchTransfer`,
  `receiveTransfer`, `cancelTransfer`
- **Descripción:** PENDIENTE → APROBADO → EN_TRANSITO → RECIBIDO, con
  cancelación posible; al recibir, la unidad cambia de sucursal y se registran
  los movimientos TRASLADO_SALIDA y TRASLADO_ENTRADA.
- **Implementación actual:** **Implementado** (flujo físico completo).
- **Impacto contable esperado:** **ninguno a nivel de empresa.** El inventario
  no sale del patrimonio. Sólo tendría efecto si la empresa llevara inventario
  por sucursal **como cuenta contable separada**, lo que hoy no hace: el plan de
  cuentas es global y `allowsBranchDetail` es una bandera declarativa sin
  consumidor. **Requiere confirmación del contador.**
- **Permisos:** solicitar `canManageTransfers` (incluye Vendedor); aprobar,
  despachar, recibir y cancelar `canApproveTransfers` (Administrador, Gerente).
- **Nota:** existe la cuenta de plantilla «Inventario en traslado entre
  sucursales», pensada para el caso en que sí se decida contabilizarlo.

### IN-08 · Costeo de la unidad en el ingreso — **Ausente**, bloqueante para VT-04

### IN-09 · Ajuste de inventario valorado y mermas — **Ausente**

Existe el movimiento AJUSTE sin valor. Impacto: Inventario · Gastos.

---

## 7. Módulo Expedientes y Créditos

Ruta: `/panel/expedientes`, `/panel/creditos`. Roles: Administrador, Gerente,
Vendedor.

### EX-01 · Emisión de cotización / proforma
### EX-02 · Cambio de estado de la cotización

- **Disparadores:** `saveQuoteAction`, `changeQuoteStatusAction`
- **Descripción:** proforma con precio, prima y cuota estimada; estados
  BORRADOR → EMITIDA → ACEPTADA / VENCIDA / CANCELADA.
- **Implementación actual:** **Implementado.**
- **Impacto contable esperado:** **ninguno.** Una cotización no es un hecho
  económico. Se documenta explícitamente para que el motor **no** la consuma.
- **Nota:** el esquema advierte que `price`, `downPayment` y `estimatedPayment`
  son cifras comerciales de cara al cliente, **no costos de inventario**.

### EX-03 · Registro de solicitud de crédito
### EX-04 · Cambio de estado del crédito

- **Disparadores:** `saveCreditApplicationAction`, `changeCreditStatusAction`
- **Descripción:** seguimiento manual con financiera externa; estados PENDIENTE
  → EN_REVISION → DOCUMENTACION_PENDIENTE → PREAPROBADO → APROBADO / RECHAZADO /
  CANCELADO.
- **Implementación actual:** **Implementado** como seguimiento; sin efecto
  económico.
- **Impacto contable esperado:** ninguno mientras el financiamiento sea externo.
  El tipo `CREDITO_INTERNO` existe en `CreditFinancingType` pero **no está
  implementado**; si se activara, sí generaría CxC y cartera propia.
- **Permisos:** `canOperateExpedientes`.

### EX-05 · Desembolso de la financiera — **Ausente**

Cuando la financiera paga a MotoMas por el cliente. Impacto: Efectivo/Banco ·
CxC. Hoy se instrumenta como recibo de caja sin vínculo con el crédito.

### EX-06 · Cartera propia / crédito interno — **Ausente**, decisión de negocio

Impacto: CxC · Ingresos financieros (intereses) · estimación de incobrables.

---

## 8. Módulo Usuarios y Autenticación

### US-01 · Creación de usuario
### US-02 · Inicio y cierre de sesión

- **Disparadores:** `createUserAction`, `loginAction`, `logoutAction`
- **Implementación actual:** **Implementado** (sesión firmada HMAC, hashing
  scrypt, `UserAuditLog`).
- **Impacto contable esperado:** **ninguno.** Se incluyen porque el actor de
  **todo** evento contable proviene de la sesión firmada y nunca del cliente:
  sin autenticación no hay auditoría financiera atribuible.
- **Integración futura:** el motor FF1.4 heredará el actor del llamante; el
  asiento generado automáticamente deberá registrar **quién disparó el evento de
  negocio**, no un usuario de sistema.

---

## 9. Módulos que NO existen

No se inventan. Se listan porque su ausencia condiciona el alcance de FF1.4.

| Módulo | Estado | Consecuencia |
|---|---|---|
| **Compras** | No existe. Ni modelo, ni acción, ni ruta. | El ingreso de inventario (IN-01) hace de compra sin costo ni proveedor. Sin esto no hay inventario valorado. |
| **POS** | No existe. | Caja cumple parcialmente el rol, sin catálogo de productos ni control de existencias de repuestos. |
| **Facturación fiscal / DGI** | No existe y está **fuera de alcance declarado** (PROJECT_RULES §4). | La «factura» de Caja es un documento interno. FF1.4 no debe asumir numeración fiscal. |
| **Tesorería** | No existe. | Sin traspasos entre cajas, sin flujo de caja, sin gestión de bancos más allá del registro. |
| **Activo fijo** | No existe. | Depreciación (CT-33) sólo por asiento manual. |
| **Repuestos y taller** | No existe como inventario. | La plantilla contable ya tiene sus cuentas; el sistema sólo maneja motocicletas por unidad. |

---

## 10. Cobertura frente a `AccountingEventType` (FF1.0)

Los diecisiete valores del enum se contrastaron contra los eventos descubiertos.

**Cubiertos (17/17 tienen evento de negocio real):**

| Valor del enum | Evento | Estado del hecho |
|---|---|---|
| `CAJA_FACTURA` | CJ-07 | Implementado |
| `CAJA_RECIBO` | CJ-08 | Implementado |
| `CAJA_NOTA_DEBITO` | CJ-09 | Parcial |
| `CAJA_NOTA_CREDITO` | CJ-10 | Parcial |
| `CAJA_CIERRE` | CJ-12 / CJ-14 | Parcial (aritmética incorrecta) |
| `DOCUMENTO_FACTURA` | CT-07 | Parcial |
| `DOCUMENTO_NOTA_DEBITO` | CT-07 | Parcial |
| `DOCUMENTO_NOTA_CREDITO` | CT-07 | Parcial |
| `DOCUMENTO_RECIBO_OFICIAL_CAJA` | CT-07 | Parcial |
| `GASTO` | CT-23 | Parcial |
| `COMPROBANTE_INGRESO` … `COMPROBANTE_AJUSTE` (6) | CT-16 a CT-21 | Parcial |
| `PLANILLA` | CT-25 a CT-27 | Parcial |

**Eventos de negocio reales SIN valor en el enum (9):**

| Evento | Por qué importa |
|---|---|
| Venta de motocicleta (VT-04) — ingreso | El hecho comercial central de la empresa |
| Venta de motocicleta (VT-04/VT-05) — costo | Sin él no hay margen ni inventario valorado |
| Entrega (VT-05) | Si el reconocimiento es a la entrega, es **el** evento |
| Ingreso de inventario / compra (IN-01) | Origen del inventario y de las CxP |
| Baja o merma de inventario (IN-02, IN-09) | Pérdida real de patrimonio |
| Anulación de documento de caja (CJ-11) | Corrección de un asiento ya emitido |
| Anulación de documento contable (CT-09) | Ídem |
| Depreciación (CT-33) | Gasto periódico obligatorio |
| Provisiones y estimaciones (CT-34) | Garantías, incobrables, obsolescencia, laborales |

**Componentes monetarios faltantes en `AccountingEventComponent`:**

- Impuesto acreditable en compras y gastos (`Expense.tax` no tiene componente).
- Aportes patronales de planilla (INSS patronal, INATEC).
- Costo de ventas / baja de inventario.
- Depósito o anticipo de cliente aplicado.

---

## 11. Inconsistencias entre documentación e implementación

| ID | Inconsistencia | Evidencia |
|---|---|---|
| I-01 | `PROJECT_RULES.md` §4 dice que MotoMas «no debe ser un ERP contable o financiero completo», mientras la serie 4.0S/FF construye deliberadamente un núcleo financiero. | Ya marcada en el propio documento tras FF1.0; **sigue requiriendo decisión formal del negocio**. |
| I-02 | `ARCHITECTURE.md` §14 describe Caja y Contabilidad como demos en `localStorage`. | Migradas a PostgreSQL en 3.4A y 3.5A; la sección está marcada como obsoleta pero el texto histórico convive con el vigente. |
| I-03 | El evento `GASTO` de FF1.0 no puede expresar el impuesto que `Expense.tax` sí almacena. | `src/server/finance/account-mapping/shared.ts` vs `model Expense`. |
| I-04 | El evento `PLANILLA` no puede expresar aportes patronales. | Componentes `PLANILLA_NETO` y `PLANILLA_DEDUCCIONES` únicamente. |
| I-05 | La plantilla contable (FF1.1-A) tiene cuentas de IVA, aranceles e importación; ni Caja ni el ingreso de inventario modelan impuestos. | `CashDocument` no tiene campo de impuesto; `MotorcycleUnit` no tiene costo. |
| I-06 | `FINANCIAL_FOUNDATION.md` §4 afirma que ninguna acción usa el servicio de numeración; sigue siendo cierto y los números se generan con sufijo aleatorio. | `generateNumber()` en Caja y Contabilidad. |
| I-07 | `AccountingDocument` tiene cinco columnas de trazabilidad hacia Caja, ventas y reservas; la UI no llena ninguna. | `origin` siempre CONTABILIDAD; la lista de documentos enlazados a Caja está permanentemente vacía. |
| I-08 | `CashClosingStatus.ANULADO` y `CashSessionStatus.ANULADO` existen pero ninguna acción los alcanza. | Estados inalcanzables. |

---

## 12. Análisis final

### 12.1 Totales

| Módulo | Eventos | Implementado | Parcial | Planificado | Ausente |
|---|---:|---:|---:|---:|---:|
| Caja | 19 | 7 | 7 | 4 | 1 |
| Contabilidad | 36 | 15 | 17 | 0 | 4 |
| Bancos | 8 | 0 | 6 | 1 | 1 |
| Ventas | 7 | 4 | 1 | 0 | 2 |
| Inventario | 9 | 6 | 1 | 0 | 2 |
| Expedientes y créditos | 6 | 4 | 0 | 0 | 2 |
| Usuarios | 2 | 2 | 0 | 0 | 0 |
| **Total** | **87** | **38** | **32** | **5** | **12** |

Lectura honesta de la tabla: «Implementado» significa que **el hecho de negocio**
se registra correctamente en PostgreSQL con sus permisos y su auditoría.
**Ninguno de los 87 genera un asiento contable hoy.**

De los 87, **47 tienen impacto contable esperado** y **40 no lo tienen de forma
directa**: datos maestros, borradores, cotizaciones, sesión, traslados físicos y
cambios de estado que sólo habilitan a otro evento (emitir y revisar un documento
no contabilizan; contabilizarlo sí).

### 12.2 Eventos de mayor prioridad para FF1.4

Ordenados por relación valor/riesgo, no por volumen:

1. **CT-23 · Gasto contabilizado.** Impacto real, un solo documento, sin
   dependencia de inventario ni de caja, componentes ya definidos. Es el mejor
   primer evento del motor.
2. **CT-16 a CT-21 · Comprobantes.** Un componente (`TOTAL`), estructura
   existente, alto volumen operativo.
3. **CJ-07 · Factura de caja.** El evento más frecuente del negocio; requiere
   antes decidir el tratamiento del impuesto (R-01).
4. **CT-07 · Contabilización de documento contable.** Es el punto de entrada
   diseñado para el motor; requiere la unicidad de `accountingDocumentId`.
5. **CJ-08 · Recibo de caja.** Simple, pero exige distinguir cobro de CxC de
   anticipo de cliente (R-05).
6. **VT-04 / IN-01 · Venta y compra valoradas.** Máximo valor contable y máximo
   trabajo previo: requieren importe en `Sale` y costo en el ingreso.
7. **CJ-12 · Diferencias de caja.** Desbloqueado en parte: FF1.1-B corrigió la
   aritmética y el esperado por método ya es determinista. Falta el fondo
   inicial y los movimientos de efectivo para que la diferencia represente todo
   el efectivo del turno.

### 12.3 Riesgos arquitectónicos descubiertos

| ID | Riesgo | Severidad |
|---|---|---|
| R-01 | **No existe modelado de impuestos en ningún documento operativo.** `CashDocument` tiene subtotal, abono y dos retenciones, pero ninguna base imponible ni IVA; la plantilla contable sí tiene esas cuentas. Contabilizar facturas sin resolverlo produce un libro que no puede sustentar una declaración. | Crítico |
| R-02 | **El inventario no está valorado.** Ni la unidad ni el movimiento llevan costo; `AccountingInventoryCost` es un catálogo manual por modelo, no por unidad. No hay costo de ventas posible ni valuación de existencias. | Crítico |
| R-03 | **Moneda funcional indefinida.** `currency` es texto libre en ocho modelos, sin tipos de cambio ni consistencia. Un asiento con importes en dos monedas cuadraría numéricamente y sería falso. | Crítico |
| R-04 | **La venta y la facturación están desconectadas.** No hay forma automática de saber si una factura de caja corresponde a una venta de unidad. `CashDocument.saleId` existe pero la UI no lo llena. Riesgo de reconocer ingreso dos veces o ninguna. | Alto |
| R-05 | **El concepto económico es texto libre.** Un recibo puede ser cobro de cartera o anticipo; un egreso puede ser gasto o pago a proveedor. El mapeo por evento/componente no distingue lo que sólo vive en una cadena de texto. | Alto |
| R-06 | **El comprobante de AJUSTE no es representable.** Un único componente `TOTAL` con un par debe/haber fijo no puede expresar un ajuste arbitrario. Debe canalizarse por asiento manual o ampliarse el modelo. | Medio |
| R-07 | **Dos planos de datos.** Los paneles heredados en `localStorage` conviven con los de base de datos en las mismas rutas, incluidos todos los reportes formales. Un contador puede leer cifras de un plano y contabilizar en el otro. Retiro planificado (FF1.6). | Alto |
| R-08 | **Idempotencia sin respaldo de base de datos.** `JournalEntry.accountingDocumentId` no es único; la protección contra doble contabilización sería un `if` dentro de una transacción, no una restricción. | Alto |
| R-09 | **Fecha del asiento vs fecha del hecho.** El bloqueo de período usa la fecha del documento; si un hecho de un mes cerrado se contabiliza tarde, el motor lo rechazará sin ofrecer alternativa automática. Falta política de «reconocimiento en período abierto». | Medio |
| R-10 | **Cierres sin derivación.** Mientras los totales de cierre se digiten, ningún reporte podrá conciliarse contra el libro (FF1.5). | Medio |

---

## 13. Preguntas que requieren validación del contador de la empresa

Ninguna de estas es una decisión técnica.

1. **¿Cuándo se reconoce el ingreso de una venta: al registrarla (VT-04) o al
   entregar la unidad (VT-05)?** Determina cuál de los dos es el evento
   contable.
2. **¿La venta se contabiliza por sí misma o exclusivamente a través de la
   factura de caja?** Si es lo segundo, VT-04 nunca genera asiento y hay que
   garantizar que toda venta se facture.
3. **¿Cómo se trata el IVA en la factura de caja?** ¿El `subtotal` actual es con
   o sin impuesto? Sin esta respuesta no puede contabilizarse CJ-07.
4. **¿Los traslados entre sucursales deben tener efecto contable?** Sólo si el
   inventario se controla por sucursal a nivel de cuenta.
5. **¿El faltante de caja es gasto del período o cuenta por cobrar al cajero?**
6. **¿Un recibo de caja cancela cartera o registra un anticipo?** ¿Cómo se
   distinguirá si el concepto es texto libre?
7. **¿Qué método de costeo de inventario se usará** (identificación específica
   por chasis, promedio ponderado, PEPS)? La identificación específica es la
   natural para motocicletas con chasis único.
8. **¿Cuál es la moneda funcional y qué tipo de cambio se aplica?**
9. **¿Los aportes patronales (INSS, INATEC) se contabilizan junto con la
   planilla o como asiento separado?**
10. **¿Qué provisiones se calculan mensualmente** (garantías, vacaciones,
    aguinaldo, indemnización, incobrables) y con qué base?
11. **¿La anulación de un documento contabilizado genera un evento propio o una
    reversión del asiento original?**
12. **¿El ingreso de inventario requiere documento de compra formal antes de
    contabilizarse?**

---

## 14. ¿Está FF1.4 completamente especificado?

**No todavía.** Este documento define **qué** eventos existen y **qué** deben
afectar; FF1.4 necesita además tres insumos que no son técnicos y uno que sí.

**Listo para especificar el motor:**

- El catálogo completo de eventos, su estado real y sus precondiciones.
- Las validaciones y permisos de cada disparador.
- El contrato de resolución de mapeo (`resolveAccountMapping`, FF1.0) y la regla
  de elegibilidad de cuentas (FF1.1-A).
- El mecanismo de corrección: reversión referenciada (4.0S-C2).
- El bloqueo de período (4.0S-C1) y la auditoría atómica (4.0S-B).

**Falta antes de escribir el motor:**

1. **Decisiones del contador** — las doce preguntas de §13. Bloqueante.
2. **Aprobación del catálogo de cuentas** de FF1.1-A por la empresa. Bloqueante.
3. **El contenido del mapeo** evento/componente → par de cuentas. Bloqueante.
4. **Ampliación del enum de eventos y componentes** para cubrir los nueve
   eventos y cuatro componentes faltantes de §10. Requiere migración, por tanto
   pertenece a un patch de esquema, no a este.
5. **Resolver R-01, R-02 y R-03** (impuestos, costo de inventario, moneda). Sin
   ellos, FF1.4 sólo puede contabilizar gastos, comprobantes y cobros — un
   alcance legítimo para una primera versión, pero debe declararse como tal.

**Recomendación de alcance para FF1.4:** limitarlo a los eventos 1 a 5 de §12.2
(gastos, comprobantes, factura y recibo de caja, documento contable), dejar
venta, costo e inventario para un FF1.4-B posterior a resolver R-01/R-02, y
mantener CJ-12 fuera hasta que existan el fondo inicial y los movimientos de
efectivo. Es la porción que puede contabilizarse hoy
sin inventar información que el sistema no tiene.
