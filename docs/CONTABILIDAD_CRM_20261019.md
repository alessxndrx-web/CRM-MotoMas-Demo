# Contabilidad administrativa del CRM — 19 de octubre de 2026

## Alcance y exclusión permanente en este trabajo

La ampliación se ejecutó en `C:\Users\lesli\Desktop\CRM MotoMas Demo`, sobre la rama `feat/finance-workbook-reconciliation`, partiendo del commit `e0fb8f4` sin cambios pendientes. Los archivos sincronizados del proyecto ChatGPT se usaron únicamente como referencias y no se modificaron.

Se excluye el POS: no se modifican sus pantallas, rutas, servicios, modelos de turno, ventas, compras ni devoluciones. Las pruebas nuevas no invocan el mostrador y verifican que el navegador no envía solicitudes a sus rutas. La compilación general del repositorio incluye las rutas ya existentes por la naturaleza del proyecto; esto no representa modificación ni validación funcional del POS.

El único libro contable sigue siendo `JournalEntry` / `JournalEntryLine`. Las obligaciones, liquidaciones y operaciones administrativas se vinculan a ese libro, sin almacenar balances independientes. Se conserva el servicio de cuentas por cobrar y sus asignaciones; no se creó otra cartera paralela.

## Estructura y navegación

La entrada de Contabilidad para Administrador y Contador muestra la gestión financiera del CRM. Un menú contable persistente conecta once áreas nuevas con catálogo, diarios, documentos de origen, terceros, gastos, planilla, liquidaciones IVA, inventario contable, comprobantes, bancos y reportes existentes.

Rutas nuevas: `/panel/contabilidad/gestion/{resumen,obligaciones,cobros,tesoreria,caja,activos,impuestos,aprobaciones,cierres,documentos,configuracion}`. Cada ruta proporciona datos persistidos y acciones pertinentes; no hay métricas simuladas. Los permisos de Gerente y otros roles siguen los límites existentes; el nuevo libro administrativo completo exige Administrador o Contador.

## Funciones implementadas

| Área | Comportamiento implementado |
|---|---|
| Configuración | Entidad, identificación fiscal y moneda funcional explícitas; separación entre creador y revisor configurable. Entidad y moneda no se sustituyen después de contabilizar historia. |
| Documentos administrativos | Numeración legible y secuencial; borrador, corrección, envío, aprobación, devolución, contabilización y reversión enlazada. Referencias, respaldo HTTPS, responsable y revisor. |
| Cuentas por pagar | Facturas por proveedor y sucursal; vencimiento; unicidad de factura; pagos parciales; saldo por movimientos; rechazo de sobrepago. El pago usa la cuenta de control y proveedor del origen. |
| Cuentas por cobrar | Incorporación desde documentos originales de Contabilidad; lectura de cartera existente; cobro parcial con asignación y asiento en una sola transacción; reversión conjunta del cobro y del asiento. La vía anterior de reversión no puede separar ambos efectos. |
| Multimoneda | NIO/USD con importe original, moneda funcional, tipo histórico de seis decimales e importe convertido Decimal. Pagos de proveedores reconocen diferencias cambiarias realizadas usando una cuenta de ganancia/pérdida explícita y liquidan el principal al cambio original. |
| Bancos | Vinculación explícita de banco con cuenta del mayor; saldo funcional derivado del libro; importación CSV por identificador bancario estable; detección de duplicados/conflictos; conciliación por cuenta, moneda, signo e importe. Un asiento conciliado debe desvincularse antes de revertirse. |
| Caja administrativa | Varias cajas físicas con cuentas de efectivo exclusivas; reutilización de `CashSession` del CRM; un turno abierto por caja; ingresos/egresos aprobados; rechazo de salidas sin efectivo; conteo por denominaciones; esperado y contado históricos; justificación de diferencias. No se modifica el turno POS. |
| Activos | Alta con costo, residual, vida útil y cuentas explícitas; depreciación lineal mensual con límite del depreciable y ajuste de remanente al final de vida útil; exclusión de duplicados mensuales; baja sin recuperación descargando costo y depreciación acumulada. |
| Auxiliar tributario | Base, tasa informada, importe calculado, referencia y constancia; validación aritmética; exportación y comprobante. Se conservan las liquidaciones IVA existentes. |
| Cierres | Comprobación de borradores, operaciones pendientes, extractos sin conciliar y turnos administrativos abiertos; cierre mensual y reapertura motivada. La vía anterior de cierre consulta también estos pendientes. |
| Documentos y exportación | Comprobantes HTML imprimibles y guardables como PDF desde el navegador, con datos del documento y evidencia de revisión; Excel de documentos y auxiliar tributario; filtros de sucursal, período, moneda y búsqueda; paginación visual. |
| Flujo administrativo | Clasificación de operaciones con banco/caja en operación, inversión, financiación o traspaso interno; importes sin clasificación visibles por separado. No se confunde resultado contable con flujo de efectivo. |

La conciliación bancaria es de un movimiento del extracto contra una línea del libro. La incorporación de cartera usa la deuda y moneda del documento original; no inventa obligaciones o valores de apertura. El arqueo conserva fondos de turnos anteriores según el saldo del libro de la cuenta exclusiva de la caja; el fondo nuevo se registra como un ingreso con su contrapartida aprobada.

## Integridad y controles

- Transacciones con auditoría atómica y validación de cuentas activas, auxiliares y vigentes.
- Serialización de operaciones administrativas y coordinación con el cierre de períodos para impedir carreras entre contabilizar y cerrar.
- Clave de solicitud única: los reintentos no duplican documentos ni asientos.
- Documento contabilizado protegido contra edición o eliminación también en PostgreSQL. La corrección se realiza mediante un asiento inverso relacionado.
- Restricciones de unicidad para factura de proveedor, caja abierta y depreciación mensual.
- Revisión independiente por defecto. Una desactivación de esta separación requiere configuración explícita de un usuario autorizado.
- Pagos, depreciaciones y bajas conservan su origen. Se bloquea revertir un origen con dependencias vigentes y se protege el arqueo cerrado.
- Importes Decimal, redondeo a dos decimales y tipo de cambio histórico; no hay consulta de cambio vivo que reescriba movimientos.
- El saldo manual anterior de un banco vinculado al libro no admite actualización por la acción anterior; los saldos nuevos proceden del mayor.

## Migraciones y recuperación

Se agregaron tres migraciones: `20261019000000_crm_finance_workspace`, `20261019000100_crm_finance_controls` y `20261019000200_crm_asset_disposal`. Añaden documentos, configuración, cajas administrativas y líneas de extracto; referencias opcionales en modelos del CRM; restricciones y protección de inmutabilidad. No hay ALTER de tablas POS ni backfill histórico.

Se aplicaron en la base aislada `motomas_finance_test` del contenedor de esta tarea, publicada únicamente en `127.0.0.1:55438`. Además, las 58 migraciones completas se aplicaron desde cero en `motomas_finance_fresh_check`. No se aplicaron a la base ordinaria ni a producción.

Antes de una aplicación real: respaldar la base, comprobar versión del código y catálogo, aplicar en una copia de revisión y validar los parámetros contables. Si ya existen documentos nuevos contabilizados, una recuperación debe preservar esas tablas y el libro mediante copia consistente o restauración completa; no se deben retirar columnas/tablas con historia ni borrar movimientos para retroceder el código. La secuencia de borradores puede presentar huecos por transacciones rechazadas; no es un folio fiscal DGI.

## Validación ejecutada

- Suite CRM nueva: 54 comprobaciones de políticas, duplicados, aprobación, concurrencia, inmutabilidad, pagos, extractos, caja, cambio realizado, activos, cartera, correcciones y cierres.
- Regresiones sin POS: importación/libro 27, integridad manual 7, posting/reversal 41, documentos contables 37, gastos 39 y planilla 50. Total de servicios/regresión: 255 comprobaciones correctas.
- Navegador real: factura creada desde formulario, revisión por otra persona, contabilización y asiento persistido; comprobante y PDF generado; once módulos navegables; descarga de Excel; ausencia de errores de ejecución y de solicitudes al POS.
- Revisión visual de la pantalla de cuentas por pagar con datos exclusivamente sintéticos.
- Los registros se conservan en `.audit/crm-finance-*.log` y `.audit/crm-regression-*.log`. El resultado final de compilación, tipos, lint y Knip se adjunta al cierre de la entrega.

Se añadieron `smoke:crm-finance` y `smoke:crm-finance-browser`. Los scripts rechazan conexiones distintas de la base de pruebas, host y puerto previstos. La prueba de navegador requiere el servidor de revisión del CRM en `127.0.0.1:5187`, firmado con el mismo secreto efímero del proceso de prueba.

## Parámetros y límites operativos que deben permanecer explícitos

1. No se aprobó automáticamente el catálogo del Excel ni se resolvieron por suposición sus códigos duplicados. La entidad, cuentas, tasas, moneda funcional y vidas útiles deben ser confirmadas por el responsable contable.
2. La cartera histórica sin moneda explícita, sin asiento de origen o sin conversión documentada no se liquida automáticamente mediante una conversión inventada. Requiere saneamiento de datos y apertura/migración revisada.
3. Los cobros de este flujo asignan cada documento a una obligación existente. La conciliación bancaria uno-a-varios, anticipos con compensaciones complejas y diferencias cambiarias de cartera histórica requieren un flujo específico adicional; no se simulan con un saldo editable.
4. La caja administrativa incorporada trabaja en moneda funcional y está operada por roles contables. La caja operativa anterior del CRM conserva sus accesos y funcionamiento; no se amplió el acceso del Cajero al libro global ni se cambió el mostrador.
5. La depreciación implementada es lineal configurable; las bajas implementadas son sin recuperación. La venta de un activo con recuperación y su tratamiento fiscal requieren registro de los componentes correspondientes, sin presumir tasas ni utilidad.
6. El auxiliar de flujo abarca operaciones administrativas nuevas con banco/caja identificados. No se presenta como estado completo del histórico mientras falten clasificaciones y saldos de apertura validados. El mayor y la balanza existentes siguen siendo la fuente contable global.
7. Se consultaron fuentes públicas de la DGI, incluida su publicación de catálogo de retenciones: [DGI](https://www.dgi.gob.ni/pdfNoticia/365). La aplicación no transmite declaraciones ni certifica una exportación oficial DGI. La elegibilidad fiscal del negocio y sus tratamientos requieren revisión contable; no se codificó una tasa universal a partir de ejemplos.
8. Las verificaciones se realizaron con datos sintéticos en entorno aislado. No equivalen a migración, puesta en producción, aceptación de datos reales ni prueba de cargas/dispositivos de todas las sucursales.

No se hizo push ni despliegue y no se modificaron archivos sincronizados bajo `sources/`.

Resultado final de calidad: TypeScript y compilación Next de producción correctos, ESLint con cero errores y 21 advertencias preexistentes, Knip sin incidencias. Los tres cambios de esquema también se validaron aplicando las 58 migraciones desde cero. Se comprobó que no hay diferencias en los directorios de rutas, pantallas ni servicios del POS.

