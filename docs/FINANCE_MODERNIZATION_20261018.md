# Modernización financiera — avance del 18 de octubre de 2026

Estado: implementación parcial. No satisface todavía la aceptación integral del encargo ni habilita producción. Rama de trabajo: `feat/finance-workbook-reconciliation`.

## Auditoría inicial y decisiones

Se revisaron esquema, scripts, acciones y consultas contables, catálogo, motor de contabilización, autorización, auditoría y decisiones de caja/devoluciones. La rama original era `crm-int-integracion`, sin cambios pendientes. Se conservaron los dos stashes existentes. Los documentos históricos contienen apartados superados; el estado se contrastó con código y pruebas.

Reutilizable: catálogo jerárquico, elegibilidad de cuentas, `runFinancialTransaction`, auditoría financiera, períodos, reversión enlazada, motor con estrategias, documentos contables, comprobantes, gastos, planilla, IVA, cuentas por cobrar y el dominio de turnos/movimientos POS. La contabilización manual ya bloquea la fila padre para serializar sus mutaciones. Los importes de base son Decimal.

Brechas observadas antes de este cambio: el catálogo carecía del flujo de conciliación del Excel adjunto; la página de reportes reutilizaba contadores operativos; el tablero mezcla estados y limita su lectura de asientos; el banco conserva un saldo manual; no existe dimensión de moneda en `JournalEntry`; el mínimo explícito para contabilizar manualmente era una línea. No se observan modelos dedicados de cuenta por pagar, activo fijo ni caja física múltiple. Las estrategias registradas incluyen documentos de caja/contabilidad, comprobantes, gastos, planilla e IVA; no se debe asumir por ello que toda venta/compra/variación de inventario ya produce asiento y costo contable.

La base configurada apunta a localhost y no estuvo accesible en la comprobación. No se puede certificar su catálogo, entidad jurídica, integridad histórica ni conflictos frente a sus datos actuales. No se modificó su configuración ni se migró esa base.

## Excel inspeccionado

Archivo original preservado: `FORMATO DE DIARIO 2026..xlsx`. Se leyeron las once hojas: un catálogo y diez diarios. El catálogo tiene 375 filas con código, 372 códigos distintos y cuatro filas descriptivas sin código. El importador muestra 379 filas de referencia y bloquea 52 por duplicidad, descripción ausente o código inválido. Las 327 restantes pasan la validación estructural contra un catálogo vacío; eso no equivale a aprobación contable.

| Código | Ubicación y conceptos | Resolución segura |
|---|---|---|
| 111-01-02 | A11:B11 Caja General Las Mercedes; A23:B23 Depósitos Pendientes | Bloquear ambas filas. Verificar el uso histórico del código en el ERP; conservarlo para el concepto que corresponda y asignar otro código aprobado al concepto diferente. No renumerar historia. |
| 111-01-04 | A13:B13 Caja General Multicentro; A24:B24 Aportación de Socios | Bloquear ambas. Determinar si la aportación describe patrimonio o un movimiento de efectivo con contrapartida; no inferir automáticamente su clasificación ni sustituir la caja. |
| 113-02-02 | A46:B46 LAFISE; A47:B47 BAC | Mantener bancos separados. Confirmar banco, moneda y referencia real antes de asignar códigos únicos y configurar sus cuentas de control. |

Además, descripciones en moneda extranjera aparecen bajo moneda nacional y viceversa: B41 indica dólar bajo el grupo nacional, y B45:B47 indican córdobas bajo el grupo extranjero. No se activa una regla por esos nombres. El encabezado C1 de los diarios identifica una entidad que requiere contraste con la entidad configurada en MotoMas.

Los diarios usan C:K para código de tercero, proveedor, factura, cuenta, descripción, débito, crédito, referencia bancaria y retención IR; D33 contiene observaciones; D37/F37/I37 son elaboración, revisión y autorización. H31/I31 suman las líneas 6:30 e I33 calcula la diferencia. I3 tiene dependencias entre hojas: no se convierte en política de períodos del ERP.

DIARIO # 001 y # 002 tienen tres líneas cada uno, fechadas el 7 de octubre de 2026, con observaciones sobre comisiones de septiembre. Sus débitos/créditos cuadran en 26.520,00 y 55.173,40 respectivamente. Los otros ocho son plantillas sin líneas contables. La cuenta `612-037`, descrita como impuestos sobre ventas y usada al haber, requiere validar el significado fiscal del registro; no se deduce una tasa o política desde ese ejemplo. No se importaron estos asientos históricos.

## Entrega implementada

### Catálogo y conciliación

`workbook.ts`, `import-actions.ts` y `chart-workbook-import.tsx`, integrados en `/panel/contabilidad/catalogo-cuentas`:

- Lectura de .xlsx, detección de hoja, conservación de filas de origen, duplicados y comparación contra las cuentas actuales.
- Vista previa de nuevas, sin cambios y conflictos; búsqueda, filtro y descarga CSV de la comparación.
- Clasificación y naturaleza explícitas por cuenta. Se infiere una jerarquía revisable por código; la confirmación exige incluir padres nuevos y respetar agrupaciones existentes.
- Importación de cuentas nuevas, inactivas, sin modificar cuentas previas. Activar sigue siendo una operación independiente del catálogo existente.
- Autorización en ambas acciones; relectura del archivo en confirmación; huellas del archivo y catálogo para detectar vistas obsoletas; rechazo de fórmulas como datos maestros.
- Lote atómico con auditoría por cuenta; bloqueo de tabla durante la confirmación para serializar contra otros escritores del catálogo. El bloqueo puede esperar operaciones concurrentes y debe medirse con cargas reales antes del despliegue.
- Límites de 2 MiB comprimidos, 24 MiB descomprimidos, 300 partes, 40 hojas, 2.000 filas y 500 cuentas por lote. Solo se acepta un catálogo reconocible en A:B.

No hay deduplicación automática, reasignación histórica, actualización masiva de nombres ni activación de mapeos.

### Libro y reportes

`ledger-reports.ts`, `ledger-report.tsx`, `/panel/contabilidad/reportes` y `/api/finance/trial-balance`:

- Diario y mayor con filtro de fechas/sucursal/cuenta, 100 líneas por página y orden estable.
- Saldo inicial, debe/haber del período, saldos finales deudores y acreedores, y saldo corrido según naturaleza de la cuenta, incluyendo páginas anteriores.
- Totales agregados de todo el libro filtrado, sin el límite de 200 del tablero anterior. Solo estados CONTABILIZADO/CONCILIADO, incluyendo asiento original y reversión.
- Lecturas dentro de una transacción RepeatableRead para que movimientos y totales compartan un corte.
- Resultado por tipo de cuenta y situación al corte con comprobación de activo − pasivo − patrimonio − resultado acumulado.
- Exportación de balanza a Excel, con totales completos, columnas numéricas y filas inmovilizadas; interfaz integrada con temas existentes.

Estos son estados básicos por clasificación, sin comparativos, subtotales jerárquicos, flujo de efectivo, PDF ni notas de estados financieros. No se atribuye moneda NIO o USD a importes cuya moneda no está registrada por asiento. Las cuentas sin movimiento directo no se duplican como sumas en la balanza. El resumen operativo previo se identifica como tal y no es fuente de estos reportes.

### Integridad de contabilización manual

Se reforzó `validateJournalEntryAccounts` y el mínimo de `postJournalEntryAction`: al menos dos líneas; debe o haber positivo en cada línea, exclusivamente; ningún negativo; cuadre Decimal exacto. Se conservan los controles de cuenta, período, autorización, bloqueo y auditoría existentes. No se modificaron asientos contabilizados.

## Base de pruebas y dependencias

Se creó un contenedor PostgreSQL 17 independiente, `motomas-finance-test-20261018`, expuesto solo en `127.0.0.1:55438`, con base `motomas_finance_test`. Las 55 migraciones existentes se aplicaron allí. No fue necesario cambiar el esquema ni crear migraciones para este avance. Los fixtures son sintéticos y esta base no representa la información de MotoMas. Los scripts nuevos rechazan la base ordinaria; `finance-workbook-ledger.ts` verifica además host y puerto.

Se agregaron ExcelJS y JSZip para lectura/exportación en servidor. `uuid` se fija mediante override de ExcelJS a una versión corregida de la familia 11; el uso inspeccionado de ExcelJS es `v4`. Ambas bibliotecas se mantienen externas al empaquetado del servidor. La instalación reportó vulnerabilidades preexistentes en otras dependencias, incluidas de severidad alta/crítica; no se realizó una actualización general del framework en este cambio.

## Validación

- `finance-workbook-ledger.ts`: 30 comprobaciones contra acciones auténticas y PostgreSQL; archivo real, duplicados, permisos, rollback, reintento, saldos, fechas, reversión, naturaleza, paginación y ecuación patrimonial.
- `finance-journal-integrity.ts`: siete comprobaciones de importes inválidos y contabilización simultánea con una sola auditoría.
- Regresiones existentes: posting/reversal 41, comprobantes 30, documentos 37, caja contable 34, turno POS 15, devolución 13, recepción de compras 61; todas sin fallos en las ejecuciones registradas.
- `finance-browser.ts`: flujo de importación desde navegador hasta persistencia, Excel original con conflictos, reporte y descarga de balanza. Solo el transporte de cookies de los smokes de servicio se sustituye; la prueba de navegador usa el servidor Next real.

Los registros de ejecución están en `.audit/finance-*.log` y en los archivos de regresión correspondientes. El entorno de desarrollo necesitó reiniciarse tras actualizar una dependencia; las pruebas durante esa actualización no constituyen evidencia de la versión final. Los resultados finales de compilación y navegador se anotan en la entrega.

Resultado final: TypeScript sin errores, ESLint con cero errores y 21 advertencias en archivos preexistentes, Knip sin incidencias y compilación Next de producción completa con salida 0. Se completaron 268 comprobaciones de servicios/regresión y las cinco comprobaciones del flujo de navegador, incluidas descarga y temas. Se revisaron visualmente las capturas claras y oscuras. En desarrollo apareció `The destination stream closed early` al cambiar de página; la repetición final del flujo completó sus verificaciones y no registró errores de ejecución del navegador. No se ha realizado una validación completa de producción ni de todo el ERP.

## Trabajo pendiente para las fases restantes

1. Validar entidad, catálogo real, moneda funcional y las resoluciones de códigos con el responsable contable. Sin acceso al catálogo configurado, los conflictos contra datos reales siguen sin certificar.
2. Completar espacios de trabajo y navegación financiera; aprobación configurable, anexos y comprobantes con estructura de la plantilla.
3. Modelar cajas físicas múltiples y conteo por denominaciones; completar traspasos/revisiones y conciliación de diferencias con contabilidad.
4. Auditar y completar exactamente una vez las integraciones POS, inventario, costo de venta, compras y devoluciones; no habilitar un backfill histórico sin autorización separada.
5. Cuentas por pagar, anticipos/asignaciones, conciliación CxC/CxP contra cuentas de control; bancos por movimientos y conciliación de extractos.
6. Moneda transaccional/funcional y tipo de cambio histórico; reemplazar los saldos bancarios manuales mediante una transición revisada al libro.
7. Activos fijos y depreciación configurables, auxiliares tributarios y validación normativa de Nicaragua, cierres integrales y generación PDF/documentos.
8. Prueba completa compra → inventario → POS → costo → caja → libro y dispositivos/cargas reales. Las regresiones parciales ejecutadas no sustituyen esa aceptación.

No se hizo push, despliegue, importación del libro a datos de negocio ni cambio de reglas tributarias. Los cambios permanecen revisables en la rama indicada.
