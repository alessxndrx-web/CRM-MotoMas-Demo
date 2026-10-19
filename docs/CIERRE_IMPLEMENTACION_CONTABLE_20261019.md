# Contabilidad del CRM: implementación y revisión final

Fecha: 19 de octubre de 2026. Alcance: CRM administrativo; POS excluido.

## Resultado de los seis bloques

| Bloque | Implementación entregada | Información de la empresa para la revisión final |
|---|---|---|
| 1. Catálogo | Los 372 códigos únicos del Excel están cargados en la base local. Se conserva la primera fila por código; las tres alternativas duplicadas quedan en la evidencia de cada cuenta y en auditoría. Clasificación y jerarquía editables. | Completar 42 descripciones pendientes y revisar naturaleza, agrupación, vigencia y cuentas auxiliares antes de aprobar y activar. |
| 2. Apertura y datos | Importación CSV de saldos por cuenta y sucursal, evidencia, borrador, revisión independiente y asiento único. Se rechaza una apertura adicional en una sucursal con historia contabilizada. Confirmación explícita de moneda y principal histórico de cartera, respaldada por el mayor. | Introducir únicamente saldos y documentos reales revisados. No se copiaron los ejemplos del diario como movimientos reales. |
| 3. Liquidaciones y bancos | Pagos y cobros de hasta 100 obligaciones del mismo tercero y moneda; anticipos a proveedores y de clientes; aplicación parcial o múltiple; saldo disponible; diferencias cambiarias y redondeos con principal funcional conservado; conciliación de un extracto contra varias líneas del libro. | Vincular cada banco y caja a su cuenta; confirmar la base de cartera extranjera y clasificar los movimientos históricos. |
| 4. Activos, estados y cierre | Venta de activos con recuperación, costo y depreciación histórica, ganancia/pérdida e impuesto opcional según regla configurada. Estados con agrupaciones, subtotales y comparación con el intervalo anterior de igual duración. Movimiento patrimonial y flujo de efectivo del histórico de cuentas vinculadas, con conciliación contra el mayor. Cierre anual y reapertura por reversión enlazada. | Configurar vida útil, residual, cuentas y tratamiento fiscal. Vincular todas las cuentas de efectivo y revisar los movimientos sin clasificación antes de emitir un flujo definitivo. |
| 5. Parámetros tributarios | Entidad, RUC y régimen editables; reglas por código, régimen, tasa, cuentas y vigencia sin solapamiento; constancia y evidencia; exportación de auxiliar tributario con la moneda de la base identificada. | Completar datos y reglas correspondientes al negocio. No hay tasas legales supuestas, transmisión de declaraciones ni certificación DGI. |
| 6. Activación y validación | Respaldo de la base local, restauración en copia de revisión, migraciones verificadas y aplicadas a la base habitual, catálogo cargado, pruebas de servicios, navegador, exportaciones y pantalla móvil. | Aceptación operativa con los datos reales después de la revisión final. No se publicó a un servidor externo. |

## Estado exacto de la base local

- Base habitual: `motomas_db`, únicamente en el entorno local de este proyecto.
- 61 migraciones aplicadas; las seis últimas pertenecen a la ampliación contable del CRM.
- Catálogo del Excel: **372 cuentas únicas**, de las cuales **366 son nuevas** y **6 reutilizan códigos raíz ya existentes sin movimientos**.
- **42 nombres pendientes**, marcados expresamente como pendientes; no se inventaron nombres definitivos.
- **0 cuentas del Excel aprobadas automáticamente y 0 activadas automáticamente**.
- **0 movimientos contables creados a partir de ejemplos o saldos supuestos**. La base habitual no tenía asientos antes de este trabajo.
- La plantilla genérica anterior no se convierte en el catálogo definitivo por sí sola. Las cuentas del archivo se identifican con versión `XLSX-45db84ee30f4b857` y el resumen de Configuración muestra su progreso de revisión.
- Libro y registros previos conservados; coincidencia de datos de las **18 tablas POS** frente a la copia del respaldo.

El archivo original y los materiales sincronizados de `sources/` permanecen intactos. SHA-256 del Excel: `45db84ee30f4b857202842076c53ff209c19e985ca2c14889dfb685c6a1b0b74`.

## Controles que protegen la historia

- No se aplica un pago mayor que el saldo de su obligación ni un anticipo mayor que su disponible.
- Una liquidación nueva no puede preceder a una reversión que restauró su saldo.
- La aplicación de un anticipo de cliente usa su cobro original en la cartera; no registra dinero recibido dos veces. Su reversión restituye el disponible y conserva el ingreso original.
- Los principales funcionales aplicados quedan conservados y se contrastan con las líneas contabilizadas para absorber correctamente el último centavo.
- La conciliación agrupada valida cuenta, sucursal, moneda, signo y suma. Un fallo revierte todos los vínculos. Ninguna línea del grupo puede revertirse sin desconciliar.
- Una cuenta sin descripción real no puede aprobarse por lote.
- El cierre mensual comprueba pendientes y la igualdad entre debe y haber. El anual exige doce meses cerrados, revalida los saldos y descarga resultados contra la cuenta patrimonial elegida.
- Los estados de resultados excluyen los asientos de cierre anual y sus reversiones; el mayor y la situación patrimonial sí conservan esos movimientos.
- Las vistas previas de comprobantes calculan el detalle antes de aprobar sin crear cobros, aplicaciones ni asientos.

## Respaldo y recuperación

Se conservó un respaldo completo anterior a la activación en `.audit/backups/motomas-before-accounting-20261019.dump`, dentro del repositorio y excluido de Git. SHA-256: `F6D7D4D0CFE35D5D3A6BECF12E033B3D52C4EEF29C6045BDE147A2AC1C09EA0D`.

El respaldo fue restaurado en `motomas_finance_local_review`, dentro del contenedor aislado de pruebas, y recibió las migraciones correctamente antes de aplicarlas a la base habitual. Una recuperación debe restaurar una copia consistente completa o preservar la historia existente; no se deben borrar tablas ni asientos para deshacer una actualización después de comenzar a operar.

## Validación

- Nueva ampliación: **41 comprobaciones** de apertura, aplicaciones múltiples, anticipos, vista previa, cambio histórico, conciliación agrupada, recuperación de activos, impuesto configurado, comparativos, cierre anual y catálogo fuente.
- Gestión CRM anterior: **54 comprobaciones**.
- Regresiones sin POS: importación y libro **27**, integridad del diario **7**, contabilización/reversión **41**, documentos **37**, gastos **39**, planilla **50**.
- Total de servicios y regresión: **296 comprobaciones correctas**.
- Navegador: flujo de factura con revisión independiente, comprobante/PDF, once módulos y Excel; adicionalmente pago múltiple persistido, formularios de apertura y base histórica, conciliación agrupada, flujo, cierre anual, exportación financiera de cinco hojas y configuración móvil.
- Las pruebas de escritura usan exclusivamente datos sintéticos en la base aislada. La activación de la base habitual se comprobó sin inventar operaciones.

Los registros de verificación están en `.audit/crm-final-*.log`, `.audit/crm-completion-browser*.log` y `.audit/crm-local-activation.json`. Calidad final: TypeScript y compilación Next correctos; ESLint con cero errores y 21 advertencias preexistentes; Knip sin incidencias. La navegación base también se verificó en la versión compilada, sin solicitudes a POS. Se desactivó la precarga de otros módulos desde el menú cuando se está en Contabilidad. Las diez verificaciones adicionales de navegador pasaron en el servidor de revisión; su repetición compilada se registra por separado.

## Orden de revisión en el CRM

1. Abrir Contabilidad → Configuración. Completar entidad, RUC, moneda funcional y régimen.
2. Revisar el catálogo, completar los 42 nombres y confirmar clasificación, naturaleza, agrupaciones y vigencias. Aprobar y activar las cuentas que correspondan.
3. Vincular bancos y cajas; cargar únicamente saldos de apertura respaldados y documentos reales.
4. Confirmar bases históricas de cartera antes del primer cobro extranjero; revisar reglas tributarias y activos.
5. Probar una operación representativa revisada por otra persona, contrastar mayor y auxiliares, y emitir estados después de clasificar el efectivo.

La programación de estos flujos y su disponibilidad local son distintas de la aprobación de las decisiones contables de la empresa. Estas últimas permanecen editables para la revisión final, según lo solicitado.

GitHub recibe código, pruebas, documentación y migraciones. El respaldo y la base local no se publican; otro entorno debe cargar el Excel original y completar su propia configuración revisada.
