# Cobertura de auditoría financiera

Inventario de las mutaciones PostgreSQL reales de Caja y Contabilidad cubiertas
por `FinancialAuditEvent`. Este documento describe el servidor de Patch 4.0S-B;
no atribuye auditoría a los paneles heredados que todavía persisten en
`localStorage`.

Cobertura contrastada con la fuente: 14/14 mutaciones exportadas de Caja
(16 puntos de escritura de evento por los flujos compuestos) y 45/45
mutaciones exportadas de Contabilidad (45 puntos de escritura de evento).

## Convenciones

- **Operar Caja**: `canOperateCaja`, limitado a `ADMIN` y `CAJERO`; además se
  reaplica el alcance global, de sucursal, turno o documento correspondiente.
- **Revisar Caja**: `canReviewCaja`, limitado a `ADMIN` y `GERENTE`, con el
  alcance de Caja ya autorizado.
- **Operar/Revisar Contabilidad**: `canOperateContabilidad` o
  `canReviewContabilidad`, ambos limitados a `ADMIN` y `CONTADOR` en los flujos
  actuales. **Costos** exige además `canViewAccountingCosts`.
- **T1**: la mutación y su evento se ejecutan en la misma transacción Prisma;
  cuando el estado del ciclo de vida importa, también se relee y valida dentro
  de esa transacción. Si el evento falla, la mutación se revierte.
- **T2**: una transacción compuesta cambia más de un registro y escribe todos
  los eventos asociados antes de confirmar.
- Los `before/after` indicados son snapshots parciales allowlisted, no filas
  Prisma completas. `Decimal` se guarda como texto y `Date` como ISO.
- Una actualización sin diferencias significativas no muta el registro ni
  crea un evento duplicado. Los intentos rechazados no escriben un evento de
  éxito ni alteran datos.

## Caja

Todos los eventos de ítems y pagos se asocian al agregado `CASH_DOCUMENT`; el
ID del ítem o pago no se publica ni se guarda como metadata de navegación.

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `openCashSessionAction` | `CashSession` | Operar Caja; Cajero en su sucursal, Admin en sucursal validada | `CASH_SESSION_OPENED` | After: estado, apertura/cierre/anulación y notas sanitizadas | T1 |
| `createCashDocumentAction` | `CashDocument`, con ítems/pagos anidados opcionales | Operar Caja sobre turno abierto | `CASH_DOCUMENT_CREATED`; también `CASH_DOCUMENT_ISSUED` cuando `issueNow` es verdadero | After: tipo, código, estado, concepto/descripción, montos, moneda, notas, fechas; metadata solo con conteos | T2 |
| `updateCashDocumentAction` | `CashDocument` | Operar Caja; documento borrador en turno abierto | `CASH_DOCUMENT_UPDATED` | Before/after del encabezado financiero; cédula/referencias sensibles se reducen a marcadores de cambio | T1 |
| `issueCashDocumentAction` | `CashDocument` | Operar Caja; borrador válido en turno abierto | `CASH_DOCUMENT_ISSUED` | Before/after: estado, subtotal/total recalculados y fecha de emisión | T1 |
| `cancelCashDocumentAction` | `CashDocument` | Operar Caja; documento no anulado en turno abierto | `CASH_DOCUMENT_CANCELLED` | Before/after: estado y fecha de anulación; motivo separado en `reason`; `notes` originales se conservan | T1 |
| `addCashDocumentItemAction` | `CashDocumentItem` + totales de `CashDocument` | Operar Caja; factura borrador en turno abierto | `CASH_DOCUMENT_ITEM_ADDED` | Before/after: descripción, cantidad, precio, importe, posición y totales del documento | T2 |
| `updateCashDocumentItemAction` | `CashDocumentItem` + totales de `CashDocument` | Operar Caja; factura borrador en turno abierto | `CASH_DOCUMENT_ITEM_UPDATED` | Before/after del ítem y subtotal/total recalculados | T2 |
| `removeCashDocumentItemAction` | `CashDocumentItem` + totales de `CashDocument` | Operar Caja; factura borrador en turno abierto | `CASH_DOCUMENT_ITEM_REMOVED` | Before del ítem eliminado y before/after de los totales resultantes | T2 |
| `addCashPaymentAction` | `CashPayment` | Operar Caja; documento borrador en turno abierto | `CASH_PAYMENT_ADDED` | After: método, monto, moneda, fecha, banco sanitizado y marcador de detalles; no referencia completa | T1 |
| `updateCashPaymentAction` | `CashPayment` | Operar Caja; documento borrador en turno abierto | `CASH_PAYMENT_UPDATED` | Before/after de método, monto, moneda, fecha y campos seguros | T1 |
| `removeCashPaymentAction` | `CashPayment` | Operar Caja; documento borrador en turno abierto | `CASH_PAYMENT_REMOVED` | Before seguro del pago eliminado; nunca datos de tarjeta/CVV | T1 |
| `createCashClosingAction` | `CashClosing` | Operar Caja sobre turno abierto sin cierre existente | `CASH_CLOSING_CREATED` | After: estado, montos por método, facturado/recibido/retenciones, diferencia, moneda, notas y fechas | T1 |
| `closeCashSessionAction` | `CashClosing` + `CashSession` | Operar Caja; cierre abierto, sin documentos borrador | `CASH_CLOSING_SUBMITTED` y `CASH_SESSION_STATUS_CHANGED` | Before/after de cierre y sesión; totales recalculados y fechas de cierre | T2 |
| `reviewCashClosingAction` | `CashClosing` | Revisar Caja; turno y cierre cerrados | `CASH_CLOSING_REVIEWED` | Before/after de estado y fecha; observación sanitizada separada en `reason`; `notes` intactas | T1 |

## Contabilidad

### Catálogos y terceros

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `createChartAccountAction` | `ChartAccount` | Operar Contabilidad | `CHART_ACCOUNT_CREATED` | After: código, tipo, naturaleza, descripción, activo y marcadores de nombre/padre | T1 |
| `updateChartAccountAction` | `ChartAccount` | Operar Contabilidad | `CHART_ACCOUNT_UPDATED` | Solo campos cambiados: tipo, naturaleza, descripción y marcadores de nombre/padre | T1 |
| `deactivateChartAccountAction` | `ChartAccount` | Operar Contabilidad | `CHART_ACCOUNT_STATUS_CHANGED` | Before/after de `isActive` | T1 |
| `createThirdPartyAction` | `ThirdParty` | Operar Contabilidad; sucursal validada | `THIRD_PARTY_CREATED` | After: tipo, activo y marcadores de nombre/contacto/notas; no registro CRM completo | T1 |
| `updateThirdPartyAction` | `ThirdParty` | Operar Contabilidad | `THIRD_PARTY_UPDATED` | Before/after de tipo y marcadores de cambios descriptivos/notas | T1 |
| `deactivateThirdPartyAction` | `ThirdParty` | Operar Contabilidad | `THIRD_PARTY_STATUS_CHANGED` | Before/after de `isActive` | T1 |

### Documentos contables

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `createAccountingDocumentAction` | `AccountingDocument` | Operar Contabilidad; sucursal validada y relaciones opcionales sujetas a las FK existentes | `ACCOUNTING_DOCUMENT_CREATED` | After: tipo, estado, origen, número/fecha, concepto, montos, moneda, método, notas y fechas de ciclo | T1 |
| `updateAccountingDocumentAction` | `AccountingDocument` | Operar Contabilidad; únicamente `BORRADOR` | `ACCOUNTING_DOCUMENT_UPDATED` | Before/after allowlisted de encabezado y valores; campos sensibles se reducen a marcadores | T1 con `updateMany` guardado por estado |
| `issueAccountingDocumentAction` | `AccountingDocument` | Operar Contabilidad; `BORRADOR` | `ACCOUNTING_DOCUMENT_STATUS_CHANGED` | Before/after del snapshot; transición a `EMITIDO` | T1 con guard de estado |
| `reviewAccountingDocumentAction` | `AccountingDocument` | Revisar Contabilidad; `BORRADOR` o `EMITIDO` | `ACCOUNTING_DOCUMENT_STATUS_CHANGED` | Before/after de estado y fecha; observación sanitizada separada en `reason`; `notes` y `accountingNotes` intactas | T1 con guard de estado |
| `postAccountingDocumentAction` | `AccountingDocument` | Revisar Contabilidad; `REVISADO` | `ACCOUNTING_DOCUMENT_STATUS_CHANGED` | Before/after: estado y fecha de contabilización | T1 con guard de estado |
| `reconcileAccountingDocumentAction` | `AccountingDocument` | Revisar Contabilidad; `CONTABILIZADO` | `ACCOUNTING_DOCUMENT_STATUS_CHANGED` | Before/after: estado y fecha de conciliación | T1 con guard de estado |
| `cancelAccountingDocumentAction` | `AccountingDocument` | Operar Contabilidad; solo estados previos a contabilización | `ACCOUNTING_DOCUMENT_CANCELLED` | Before/after: estado/fecha; motivo separado; referencia fuente y `notes` originales intactos | T1 con guard que rechaza `CONTABILIZADO`/`CONCILIADO` |

### Asientos y líneas

Los eventos de línea se asocian al agregado `JOURNAL_ENTRY`; el ID interno de
la línea no se usa como código de negocio ni se expone en el DTO.

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `createJournalEntryAction` | `JournalEntry` + líneas iniciales | Operar Contabilidad | `JOURNAL_ENTRY_CREATED` | After: número/fecha, estado, origen, base imponible, notas, fecha de posteo; metadata con cantidad de líneas | T2 |
| `updateJournalEntryAction` | `JournalEntry` | Operar Contabilidad; solo `BORRADOR` | `JOURNAL_ENTRY_UPDATED` | Before/after del encabezado allowlisted; referencias bancarias/tributarias solo como marcador de detalles | T1 con guard de borrador |
| `addJournalEntryLineAction` | `JournalEntryLine` | Operar Contabilidad; asiento `BORRADOR` | `JOURNAL_LINE_ADDED` | Before/after de totales del asiento; after también contiene concepto, debe, haber y posición | T1 |
| `updateJournalEntryLineAction` | `JournalEntryLine` | Operar Contabilidad; asiento `BORRADOR` | `JOURNAL_LINE_UPDATED` | Before/after de concepto, debe, haber, posición y totales del asiento | T1 |
| `removeJournalEntryLineAction` | `JournalEntryLine` | Operar Contabilidad; asiento `BORRADOR` | `JOURNAL_LINE_REMOVED` | Before seguro de la línea eliminada y totales; after con los totales resultantes | T1 |
| `postJournalEntryAction` | `JournalEntry` | Revisar Contabilidad; borrador con líneas y debe = haber | `JOURNAL_ENTRY_POSTED` | Before/after: estado/fecha; metadata de balance y cantidad de líneas | T1 con validación y actualización guardadas |
| `reconcileJournalEntryAction` | `JournalEntry` | Revisar Contabilidad; `CONTABILIZADO` | `JOURNAL_ENTRY_STATUS_CHANGED` | Before/after de estado y marcador de detalles de conciliación | T1 con guard de estado |
| `cancelJournalEntryAction` | `JournalEntry` | Operar Contabilidad; únicamente `BORRADOR` | `JOURNAL_ENTRY_CANCELLED` | Before/after de estado; motivo separado; notas originales intactas | T1; posted/reconciled siempre rechazados |

### Comprobantes, gastos y planilla

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `createAccountingVoucherAction` | `AccountingVoucher` | Operar Contabilidad | `VOUCHER_CREATED` | After: tipo/estado/número/fecha, concepto, montos, moneda y notas | T1 |
| `updateAccountingVoucherAction` | `AccountingVoucher` | Operar Contabilidad; `REGISTRADO` | `VOUCHER_UPDATED` | Before/after de campos allowlisted y marcadores descriptivos | T1 |
| `reconcileAccountingVoucherAction` | `AccountingVoucher` | Revisar Contabilidad; `REGISTRADO` | `VOUCHER_STATUS_CHANGED` | Before/after de estado | T1 |
| `cancelAccountingVoucherAction` | `AccountingVoucher` | Operar Contabilidad; no anulado | `VOUCHER_CANCELLED` | Before/after de estado; motivo separado; notas intactas | T1 |
| `createExpenseAction` | `Expense` | Operar Contabilidad | `EXPENSE_CREATED` | After: categoría/estado/fecha, concepto, importes, retenciones, total, moneda, notas | T1 |
| `updateExpenseAction` | `Expense` | Operar Contabilidad; `REGISTRADO` | `EXPENSE_UPDATED` | Before/after de campos allowlisted y marcadores sensibles | T1 |
| `reviewExpenseAction` | `Expense` | Revisar Contabilidad; `REGISTRADO` | `EXPENSE_STATUS_CHANGED` | Before/after de estado y fecha de revisión | T1 |
| `createPayrollRecordAction` | `PayrollRecord` | Operar Contabilidad | `PAYROLL_RECORD_CREATED` | After: periodo/estado, componentes salariales, neto, moneda y notas; no objeto User/Empleado | T1 |
| `updatePayrollRecordAction` | `PayrollRecord` | Operar Contabilidad; `BORRADOR` | `PAYROLL_RECORD_UPDATED` | Before/after de importes, periodo, moneda/notas y marcadores descriptivos | T1 |
| `preparePayrollRecordAction` | `PayrollRecord` | Revisar Contabilidad; `BORRADOR` | `PAYROLL_RECORD_STATUS_CHANGED` | Before/after de estado | T1 |
| `markPayrollRecordPaidAction` | `PayrollRecord` | Revisar Contabilidad; `PREPARADA` | `PAYROLL_RECORD_STATUS_CHANGED` | Before/after de estado | T1 |

### Costos, bancos, conciliaciones y cierres

| Acción de servidor | Modelo afectado | Autorización | Evento | Before / after seguro | Límite |
| --- | --- | --- | --- | --- | --- |
| `createAccountingInventoryCostAction` | `AccountingInventoryCost` | Costos (`ADMIN`/`CONTADOR`) | `ACCOUNTING_INVENTORY_COST_CREATED` | After: modelo, costo unitario, mínimo y moneda | T1 |
| `updateAccountingInventoryCostAction` | `AccountingInventoryCost` | Costos (`ADMIN`/`CONTADOR`) | `ACCOUNTING_INVENTORY_COST_UPDATED` | Before/after de costo, mínimo y moneda | T1 |
| `createBankAccountAction` | `BankAccount` | Operar Contabilidad | `BANK_ACCOUNT_CREATED` | After: banco, saldo, moneda, activo y notas; nunca número de cuenta completo | T1 |
| `updateBankAccountAction` | `BankAccount` | Operar Contabilidad | `BANK_ACCOUNT_UPDATED` | Before/after de banco, saldo y notas allowlisted | T1 |
| `deactivateBankAccountAction` | `BankAccount` | Operar Contabilidad | `BANK_ACCOUNT_STATUS_CHANGED` | Before/after de `isActive` | T1 |
| `createBankReconciliationAction` | `BankReconciliation` | Operar Contabilidad; banco/documento y sucursal validados | `BANK_RECONCILIATION_CREATED` | After: estado/fecha, monto, método, moneda, notas; no número de cuenta/referencia completa | T1 |
| `updateBankReconciliationAction` | `BankReconciliation` | Operar Contabilidad; `PENDIENTE` | `BANK_RECONCILIATION_UPDATED` | Before/after de campos allowlisted y marcadores de referencia | T1 |
| `reviewBankReconciliationAction` | `BankReconciliation` | Revisar Contabilidad; `PENDIENTE` | `BANK_RECONCILIATION_STATUS_CHANGED` | Before/after de estado, fecha y diferencia derivada | T1 |
| `cancelBankReconciliationAction` | `BankReconciliation` | Operar Contabilidad; no anulada | `BANK_RECONCILIATION_CANCELLED` | Before/after de estado; motivo separado; notas intactas | T1 |
| `createAccountingClosingAction` | `AccountingClosing` | Operar Contabilidad | `ACCOUNTING_CLOSING_CREATED` | After: periodo/estado, totales capturados, diferencia, moneda, notas y fechas | T1 |
| `reviewAccountingClosingAction` | `AccountingClosing` | Revisar Contabilidad; abierto/reabierto | `ACCOUNTING_CLOSING_STATUS_CHANGED` | Before/after de estado y fecha; observación sanitizada separada en `reason`; `notes` intactas | T1 |
| `closeAccountingClosingAction` | `AccountingClosing` | Revisar Contabilidad; `EN_REVISION` | `ACCOUNTING_CLOSING_STATUS_CHANGED` | Before/after de estado y fecha de cierre | T1 |
| `reopenAccountingClosingAction` | `AccountingClosing` | Revisar Contabilidad; `CERRADO`, con motivo | `ACCOUNTING_CLOSING_STATUS_CHANGED` | Before/after de estado/fecha; motivo separado y notas originales intactas | T1 |

## Payload seguro y comportamiento append-only

- `recordFinancialAuditEvent` es el único writer y exige un
  `Prisma.TransactionClient`; no existe acción de update/delete de auditoría.
- El helper acepta únicamente acciones, dominios, entidades y campos de una
  allowlist central. Objetos anidados, filas Prisma completas y claves no
  permitidas se descartan.
- Texto libre se sanitiza y enmascara. No se guardan contraseñas, cookies,
  tokens, `DATABASE_URL`, trazas, CVV, números de tarjeta, registros completos
  de clientes/usuarios ni números de cuenta completos.
- `actorUserId` y `branchId` usan relaciones `SetNull`; borrar/desactivar un
  actor o sucursal no puede borrar el historial. `actorRole` conserva el rol
  histórico.
- No hay writer público para el modelo. La limpieza de fixtures de smoke usa
  acceso de prueba directo y no constituye una ruta de aplicación.

## Lectura y DTO

`listFinancialAuditHistory` autentica internamente y aplica estos límites:

- `ADMIN`: Caja y Contabilidad globales.
- `CONTADOR`: solo Contabilidad, bajo el permiso de ledger existente.
- `CAJERO`: solo Caja y únicamente un turno/documento/cierre que ya supere los
  predicados de alcance del Cajero.
- `GERENTE`: solo historial de Caja de su sucursal ya autorizada.
- `VENDEDOR`, `MARKETING` y `SOPORTE_TECNICO`: denegados.

La consulta devuelve como máximo 100 eventos, más recientes primero, con
`actionLabel`, actor seguro, motivo, cambios etiquetados, fecha y código de
negocio. Nunca devuelve ID de evento/entidad/actor/sucursal, rol interno,
`beforeData`, `afterData` ni `metadata` crudos.

## Flujos inexistentes o diferidos

No se documenta evento de éxito para flujos que el servidor no implementa:

- salidas de efectivo, reembolsos, devoluciones, reversión de pagos, depósitos
  bancarios, cobros posteriores a emisión o reapertura/anulación de cierre de
  Caja;
- motor de reversión contable, bloqueo de periodos, contabilización automática
  documento→asiento, traspaso Caja→Contabilidad, ventas/COGS, importación de
  estados bancarios o reportes financieros confiables;
- eliminación directa de documentos contabilizados o asientos publicados;
- mutaciones de los paneles heredados en `localStorage`.

Los intentos de editar/anular registros finalizados fallan antes del commit. No
se registra un evento de éxito y Patch 4.0S-B no fabrica una reversión.
