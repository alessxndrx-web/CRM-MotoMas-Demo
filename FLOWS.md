# MotoMas — Flujos operativos

## 1. Objetivo

Este documento resume cómo debe funcionar MotoMas en escenarios reales.

No describe pantallas exactas.

Describe el comportamiento esperado del sistema.

---

## 2. Flujo completo de la demo

```txt
Cliente ve anuncio
↓
Cliente llena formulario
↓
Selecciona sucursal
↓
Lead entra a bandeja de sucursal
↓
Gerente asigna vendedor
↓
Vendedor contacta prospecto
↓
Vendedor crea cotización
↓
Vendedor crea expediente
↓
Lead se convierte en cliente
↓
Vendedor crea solicitud de crédito
↓
Vendedor reserva unidad
↓
Si no hay stock local, solicita traslado
↓
Gerente aprueba traslado
↓
Unidad viaja a sucursal destino
↓
Sucursal receptora confirma recepción
↓
Crédito se marca como aprobado
↓
Venta se completa
↓
Cliente consulta que su moto está lista para entrega
```

Este flujo debe poder demostrarse dentro de la demo funcional.

---

## 3. Flujo de entrada de lead

### Escenario

Juan Pérez ve un anuncio de Facebook Ads de una Pulsar NS200.

Ingresa al Portal Cliente.

Completa formulario:

```txt
Nombre: Juan Pérez
Teléfono: 8888-0000
Correo: juan@example.com
Moto de interés: Pulsar NS200
Sucursal: Plaza Inter
Origen: Facebook Ads
```

### Resultado esperado

El sistema crea un lead:

```txt
Estado: Nuevo Lead
Sucursal: Plaza Inter
Vendedor: Sin asignar
```

El lead entra a la bandeja de Plaza Inter.

No se asigna automáticamente.

---

## 4. Flujo de asignación manual

### Escenario

El gerente de Plaza Inter entra al Centro de Operaciones.

Ve:

```txt
Leads pendientes
- Juan Pérez
- Carlos Ruiz
- María López
```

También ve carga de trabajo:

```txt
Roberto
Leads activos: 24
Ventas del mes: 8

María
Leads activos: 12
Ventas del mes: 6
```

El gerente decide asignar Juan Pérez a María.

### Resultado esperado

El lead cambia a:

```txt
Estado: Asignado
Vendedor: María
Sucursal: Plaza Inter
```

El historial registra:

```txt
Lead asignado a María por gerente de Plaza Inter
```

---

## 5. Flujo comercial Lead → Cliente

Estados recomendados:

```txt
Nuevo Lead
↓
Asignado
↓
Contactado
↓
Interesado
↓
Cotización
↓
Expediente
↓
Cliente
↓
Crédito
↓
Venta
```

### Escenario

María llama a Juan Pérez.

Registra:

```txt
Contacto realizado.
Cliente interesado en Pulsar NS200.
Solicita cotización.
```

Después crea cotización.

Más adelante crea expediente.

En ese momento el lead se convierte en cliente formal.

### Resultado esperado

La información original no se pierde.

El cliente conserva:

- Origen del lead.
- Sucursal seleccionada.
- Vendedor asignado.
- Historial.
- Cotizaciones.
- Expediente.
- Créditos.
- Reserva.
- Venta.

---

## 6. Flujo cliente multi-sucursal

### Escenario

Juan Pérez solicita información en Plaza Inter.

Más tarde visita Ciudad Sandino.

Después escribe por WhatsApp a Masaya.

Interacciones:

```txt
Plaza Inter
Vendedora: María
Moto: Pulsar NS200
Estado: Cotización creada

Ciudad Sandino
Vendedor: Roberto
Moto: Boxer
Estado: Seguimiento

Masaya
Vendedor: José
Moto: Dominar
Estado: Contactado
```

### Resultado esperado

Juan Pérez existe una sola vez.

El sistema no debe crear tres clientes duplicados.

Debe mostrar historial multi-sucursal.

Ningún vendedor debe quedar bloqueado para atenderlo.

La venta puede cerrarse desde la sucursal donde el cliente decida comprar.

---

## 7. Flujo de crédito

### Escenario de la demo actual

Juan Pérez decide iniciar un seguimiento de crédito para Pulsar NS200.

María crea un seguimiento dentro del expediente y registra la financiera
seleccionada. Puede actualizar manualmente la financiera, la documentación
pendiente, el estado y las observaciones.

```txt
Expediente: EXP-20260619-025
Financiera: MongePay
Estado: En revisión
```

### Resultado esperado

Cada actualización conserva:

- Financiera.
- Estado.
- Fecha.
- Usuario.
- Observación.
- Historial.

No se requiere integración automática con financieras.

La actualización es manual.

Cada expediente admite un solo seguimiento de crédito activo en esta fase. Una
versión futura podrá modelar varias aplicaciones por expediente, pero no forma
parte de la demo actual.

---

## 8. Flujo de reserva

### Escenario

El crédito de Juan Pérez está avanzando.

María encuentra una Pulsar NS200 disponible.

Reserva una unidad específica:

```txt
Modelo: Pulsar NS200
VIN: VIN-DEMO-001
Sucursal: Plaza Inter
Estado anterior: Disponible
Estado nuevo: Reservada
Cliente: Juan Pérez
```

### Resultado esperado

La unidad deja de aparecer como disponible.

La reserva queda relacionada con:

- Cliente.
- Vendedor.
- Sucursal.
- Unidad.
- Fecha.
- Estado.

---

## 9. Flujo de inventario por sucursal

### Vista agregada

```txt
Pulsar NS200

Plaza Inter: 20
Rubenia: 12
Ciudad Sandino: 8

Total: 40
```

### Vista por unidad

```txt
VIN-DEMO-001
Modelo: Pulsar NS200
Sucursal actual: Plaza Inter
Estado: Reservada

VIN-DEMO-002
Modelo: Pulsar NS200
Sucursal actual: Rubenia
Estado: Disponible
```

### Resultado esperado

El usuario puede saber:

- Cuántas unidades existen.
- En qué sucursal se encuentran.
- Qué unidades están disponibles.
- Qué unidades están reservadas.
- Qué unidades están en tránsito.
- Qué unidades ya se vendieron.

---

## 10. Flujo de traslado

### Escenario

Juan Pérez quiere una Pulsar NS200 en Plaza Inter.

Plaza Inter no tiene stock disponible.

Rubenia sí tiene una unidad.

María solicita traslado:

```txt
Origen: Rubenia
Destino: Plaza Inter
Unidad: VIN-DEMO-002
Modelo: Pulsar NS200
Motivo: Reserva para cliente Juan Pérez
Estado: Pendiente
```

### Aprobación

El gerente revisa solicitud.

Marca:

```txt
Estado: Aprobado
```

### Despacho

La unidad sale de Rubenia.

Marca:

```txt
Estado: En tránsito
Sucursal actual: En tránsito
```

### Recepción

Plaza Inter confirma recepción.

Marca:

```txt
Estado: Recibido
Sucursal actual: Plaza Inter
```

### Resultado esperado

Se registra historial completo.

La unidad ya no aparece como disponible en Rubenia.

Ahora aparece en Plaza Inter.

---

## 11. Flujo de venta

### Escenario

MongePay aprueba crédito.

La unidad ya está disponible en Plaza Inter.

María completa venta.

Datos:

```txt
Cliente: Juan Pérez
Unidad: VIN-DEMO-002
Modelo: Pulsar NS200
Sucursal: Plaza Inter
Vendedor: María
Tipo: Crédito
Financiera: MongePay
Estado: Completada
```

### Resultado esperado

La unidad cambia a:

```txt
Vendida
```

Después, al entregarse:

```txt
Entregada
```

El historial permanece disponible.

---

## 12. Flujo Portal Cliente

### Escenario

Juan Pérez consulta su proceso.

El Portal Cliente debe mostrar:

```txt
Moto seleccionada: Pulsar NS200
Sucursal: Plaza Inter
Crédito: Aprobado
Reserva: Confirmada
Entrega: Lista para entrega
```

Timeline:

```txt
12 de junio
Lead registrado

13 de junio
Cotización creada

14 de junio
Expediente creado

15 de junio
Solicitud enviada a MongePay

17 de junio
Crédito aprobado

18 de junio
Unidad recibida en Plaza Inter

18 de junio
Moto lista para entrega
```

El cliente no debe ver información interna sensible.

---

## 13. Flujo de reasignación por salida de vendedor

### Escenario

María deja de trabajar en la empresa.

El gerente entra a su cartera.

Selecciona leads y clientes activos.

Los reasigna a Roberto.

### Resultado esperado

No se elimina historial.

Se conserva:

- Atención original de María.
- Fechas.
- Seguimientos.
- Cotizaciones.
- Expedientes.
- Créditos.
- Ventas.

El sistema registra:

```txt
Cartera reasignada de María a Roberto por gerente de Plaza Inter.
```

---

## 14. Flujo de reportes

### Vendedor

Ve únicamente información necesaria para su trabajo:

- Leads asignados.
- Seguimientos.
- Ventas propias.
- Créditos que gestiona.
- Reservas activas.

### Gerente

Ve:

- Ventas de sucursal.
- Leads pendientes.
- Conversión por vendedor.
- Inventario local.
- Traslados.
- Créditos.
- Reservas.

### Administrador

Ve:

- Ventas globales.
- Comparación de sucursales.
- Inventario consolidado.
- Traslados nacionales.
- Créditos por financiera.
- Ranking de sucursales.
- Ranking de vendedores.
- Actividad global.

---

## 15. Casos que el sistema debe evitar

### No duplicar clientes

No crear un nuevo cliente si ya existe.

Buscar por:

- Teléfono.
- Correo.
- Identificación cuando exista.

### No bloquear cliente por vendedor

Un cliente atendido por María puede ser atendido después por Roberto.

### No ocultar ubicación de unidades

Toda unidad debe tener sucursal actual o estado en tránsito.

### No actualizar inventario sin historial

Todo movimiento debe generar trazabilidad.

### No mostrar reportes a vendedores

La navegación y las rutas deben respetar permisos.

### No mezclar Portal Cliente y Centro de Operaciones

El cliente no debe entrar al mismo login que vendedor, gerente y administrador.

---

## 16. Flujo contable basico

### Escenario

El Contador entra al Centro de Operaciones y accede a `/panel/contabilidad`.

Puede registrar:

- Diario contable con columnas basadas en "Diarios JUNIO 2026".
- Comprobante de ingreso, egreso, cheque, transferencia, reembolso o ajuste.
- Gasto operativo por categoria.
- Documento contable base.
- Registro de planilla salarial basica.

### Resultado esperado

La informacion queda guardada en persistencia demo local separada:

```txt
motomas-accounting-journal-entries-v1
motomas-accounting-vouchers-v1
motomas-accounting-documents-v1
motomas-accounting-expenses-v1
motomas-accounting-payroll-v1
motomas-accounting-inventory-costs-v1
```

El Contador no crea leads, no asigna vendedores, no reserva unidades, no crea
traslados y no registra ventas comerciales.

### Inventario contable

La vista contable del inventario lee unidades existentes y agrega costos demo
por modelo y sucursal:

- item/modelo
- sucursal
- cantidad
- costo unitario
- costo total
- saldo minimo
- estado de saldo
- ultimo movimiento

El Gerente solo puede consultar costos de su sucursal. El Vendedor no ve costos.

### QA de navegacion contable

El Contador inicia en `/panel/contabilidad` y no participa en el flujo
comercial. Si intenta entrar a leads, clientes, expedientes, reservas,
traslados, ventas, marketing, vendedores, configuracion o reportes comerciales,
el Centro de Operaciones muestra acceso comercial restringido y ofrece volver a
contabilidad.

El Vendedor conserva su flujo comercial sin menu contable. Si entra
manualmente a `/panel/contabilidad`, recibe acceso restringido y no ve costos.
El Gerente puede consultar costos solo de su sucursal desde inventario/reportes
contables. Administrador y Contador tienen vista global de costos.

### Flujo documental contable base

El Contador prepara documentos base en `/panel/contabilidad/documentos` para
revision interna:

- Factura.
- Nota de Debito.
- Nota de Credito.
- Recibo Oficial de Caja.

Cada documento conserva numero, fecha, cliente o proveedor, RUC o cedula,
sucursal, concepto, documento origen si aplica, subtotal, retenciones, abono,
total, estado, observaciones, creado por, revisado por, fecha de revision y
motivo de anulacion interna si corresponde.

La factura de motocicleta usa una estructura fija para descripcion:

```txt
MARCA:
MODELO:
CHASIS:
MOTOR:
COLOR:
AÑO:
CASCO:
PÓLIZA:
CILINDRAJE:
```

Caja emite documentos operativos demo desde `/panel/caja`. Contabilidad prepara
documentos internos cuando corresponde, revisa, contabiliza y concilia los
registros demo; no se generan PDFs, no se integra DGI y no se implementa
facturacion fiscal completa.

---

## 17. Flujo Caja -> Contabilidad

### Escenario

El Cajero entra al Centro de Operaciones y accede a `/panel/caja`.

Puede emitir:

- Factura operativa demo.
- Recibo Oficial de Caja demo.
- Nota de Debito demo.
- Nota de Credito demo.

Tambien puede registrar:

- Abonos.
- Forma de pago.
- Banco y referencia si aplica.
- Retencion 1%.
- Retencion 2%.
- Cierre diario de caja.

### Resultado esperado

La informacion queda guardada en persistencia demo local separada:

```txt
motomas-cashier-invoices-v1
motomas-cashier-receipts-v1
motomas-cashier-notes-v1
motomas-cashier-closures-v1
```

Cuando Caja emite una factura, recibo o nota, el documento queda disponible en
`motomas-accounting-documents-v1` para revision contable interna.

### Separacion de responsabilidades

Caja emite documentos operativos y prepara cierres.
Contabilidad revisa, contabiliza y concilia.

El Cajero no crea leads, no asigna vendedores, no crea reservas, no crea
traslados, no modifica inventario, no ve costos, no registra ventas
comerciales y no accede a contabilidad completa.

No se implementa DGI, PDF, numeracion fiscal oficial, anulacion fiscal real,
Prisma ni base de datos real en esta fase.

### QA del flujo Caja -> Contabilidad

Al emitir Factura, Recibo Oficial de Caja, Nota de Debito o Nota de Credito,
Caja crea el registro operativo y sincroniza un documento interno compatible
con `motomas-accounting-documents-v1`.

El documento sincronizado conserva tipo, numero, fecha, tercero, RUC o cedula,
sucursal, concepto, documento origen, subtotal, abono, retencion 1%, retencion
2%, total, estado, creado por y observaciones.

Contabilidad puede revisar y contabilizar esos documentos desde
`/panel/contabilidad/documentos`. Caja no puede entrar a esa ruta, no ve costos
y no puede ejecutar acciones contables.

### Flujo de revisión, contabilización y conciliación

Los documentos internos sincronizados o creados por Contabilidad usan estos
estados:

```txt
Borrador
Emitido
Revisado
Contabilizado
Conciliado
Anulado
```

QA 2.22.1: los documentos creados manualmente en Contabilidad solo inician como
Borrador o Emitido. Revisado, Contabilizado, Conciliado y Anulado quedan
reservados para acciones contables autorizadas. No se puede conciliar antes de
contabilizar, no se puede contabilizar o revisar un documento anulado y no se
puede anular sin motivo.

Flujo esperado:

```txt
Caja emite documento operativo
↓
Documento queda disponible para Contabilidad
↓
Contabilidad marca Revisado
↓
Contabilidad marca Contabilizado
↓
Contabilidad marca Conciliado cuando aplica
```

La conciliación conserva banco, referencia, forma de pago, fecha y observación
contable de demo. No integra bancos reales ni estados de cuenta.

La anulación disponible en Contabilidad es interna y requiere motivo. No es una
anulación fiscal ni se conecta con DGI.

Los cierres diarios se preparan en Caja. Caja puede cerrarlos y Contabilidad
puede marcarlos como Revisado por Contabilidad desde reportes contables. El
Gerente conserva visibilidad limitada a su sucursal.

---

## 18. Flujo contable avanzado demo

El Contador inicia en `/panel/contabilidad` y trabaja desde un centro contable
organizado por dashboard, catalogo de cuentas, diarios, comprobantes,
documentos, gastos, inventario valorizado, planilla, bancos, conciliacion,
cierres, terceros y reportes.

El flujo mantiene esta separacion:

```txt
Caja emite documentos operativos
Contabilidad revisa documentos
Contabilidad contabiliza
Contabilidad concilia cuando aplica
Contabilidad revisa cierres y reportes
```

La conciliacion bancaria, catalogo de cuentas, cierres y terceros son datos
demo locales. No conectan bancos reales, no generan PDFs, no implementan DGI,
no calculan impuestos legales automaticamente y no reemplazan una base de datos
real.
---

## 19. Patch 2.24 - Flujo diario del Vendedor

El Vendedor inicia en "Mi trabajo de hoy" y resuelve una cola comercial:

```txt
Lead nuevo o asignado
↓
Contacto y registro de actividad
↓
Interesado
↓
Expediente
↓
Proforma y documentos
↓
Reserva de unidad disponible
↓
Venta desde reserva o expediente
↓
Seguimiento hasta entrega
```

El registro manual de lead es secundario frente a la bandeja de atencion. Las
reservas y ventas muestran guia para preferir expediente o reserva activa, sin
bloquear los casos demo existentes de cliente sin expediente.

La agenda comercial se organiza por Vencidas, Hoy, Proximas y Completadas. El
inventario del Vendedor se usa para consultar disponibilidad y ofrecer opciones,
no para gestionar costos ni datos administrativos de inventario.

---

## 20. Patch 2.25 - Flujo de supervision del Gerente

El Gerente inicia en "Operacion de sucursal" y resuelve decisiones de trabajo:

```txt
Revisar leads nuevos y sin asignar
↓
Balancear carga de vendedores
↓
Asignar o reasignar leads de la sucursal
↓
Supervisar actividades vencidas y seguimientos sin contacto
↓
Revisar reservas, ventas y entregas pendientes
↓
Aprobar o dar seguimiento a traslados
↓
Detectar inventario bajo y oportunidades entre sucursales
```

La bandeja de leads del Gerente prioriza asignacion y supervision. Muestra
leads pendientes, filtros por vendedor/origen/fecha/sucursal, carga comercial y
una recomendacion de asignacion basada en menor carga, conversion, sucursal y
disponibilidad.

Vendedores se lee como rendimiento y carga de trabajo. Traslados muestra la
linea Solicitud -> Aprobado -> En transito -> Recibido. Reservas y Ventas
exponen riesgos y progreso comercial sin cambiar reglas de negocio.

El Administrador usa la misma experiencia con visibilidad global. El Gerente
permanece limitado a sucursal y el Vendedor conserva su flujo personal.

---

## 21. Patch 2.26 - Flujo operativo del Cajero

El Cajero inicia en la estacion de caja y resuelve la jornada del turno:

```txt
Revisar estado del turno (Abierto / Cerrado)
↓
Emitir factura, recibo o nota segun el pago
↓
Registrar forma de pago, abono, retencion 1% y retencion 2%
↓
Revisar totales, documentos emitidos y diferencia del dia
↓
Preparar el cierre contando el dinero por forma de pago
↓
Cerrar la caja del turno
↓
Contabilidad revisa cierres y documentos sincronizados
```

El dashboard prioriza el estado del turno, el resumen de la jornada, la cola de
trabajo con acciones principales (emitir factura, emitir recibo, crear nota,
cerrar caja) y la actividad reciente. La jornada mostrada corresponde a la
fecha con actividad de caja mas reciente para el alcance del Cajero.

La emision de documentos usa un composer por secciones (cliente / documento
origen, concepto o items, pago / abono / retenciones) con una vista previa en
vivo del documento, sus totales, retenciones, descripcion de motocicleta y
trazabilidad. Al emitir, el documento se guarda en la persistencia demo de Caja
y se sincroniza como documento contable interno para revision.

El cierre cuenta el dinero por efectivo, transferencia, cheque y tarjeta,
sugiere los totales facturados y de retenciones de la jornada y calcula la
diferencia. Caja puede cerrar el turno; Contabilidad marca la revision. El
Cajero no puede marcar un cierre como Revisado por Contabilidad.

Se conservan las claves de `localStorage` de Caja, la sincronizacion Caja ->
Contabilidad, `buildMotorcycleInvoiceDescription`, el orden obligatorio de la
descripcion de motocicleta y las formulas de retencion y total. No se
implementa DGI, PDF, numeracion fiscal ni cambios de base de datos.

---

## 22. Patch 2.27 - Flujo de control del Contador

El Contador inicia en el centro de control contable y resuelve el trabajo por
prioridad:

```txt
Revisar el trabajo critico del dashboard
↓
Revisar documentos emitidos por Caja o registrados en Contabilidad
↓
Contabilizar los documentos revisados (llevar a asiento)
↓
Conciliar los documentos contabilizados con banco/referencia
↓
Revisar los cierres de caja cerrados por Caja
↓
Registrar y cuadrar asientos, comprobantes y gastos
↓
Consultar reportes y controlar la salud contable
```

El dashboard prioriza una cola de trabajo critico con enlaces directos:
documentos por revisar, por contabilizar y por conciliar; cierres de caja por
revisar; asientos descuadrados; comprobantes por contabilizar; gastos por
revisar; y planilla por preparar. Debajo muestra el resumen financiero del
periodo, la salud contable, las acciones rapidas y la actividad reciente.

La revision de documentos conserva la secuencia de estados Borrador -> Emitido
-> Revisado -> Contabilizado -> Conciliado, con anulacion interna que exige
motivo. Los asientos agregan filtros por periodo, estado, cuenta, banco y
busqueda, mas un indicador de balance Cuadrado/Descuadrado. Los reportes se
presentan como un catalogo de tarjetas con alcance y acciones preparadas.

La separacion se mantiene:

```txt
Caja emite documentos operativos y cierra caja
Contabilidad revisa documentos y cierres
Contabilidad contabiliza
Contabilidad concilia cuando aplica
Contabilidad controla cuentas, cierres y reportes
```

El Cajero no puede contabilizar, conciliar ni marcar la revision contable de
cierres. El Gerente conserva su consulta contable por sucursal. No se conecta
DGI, PDF, bancos reales, impuestos legales automaticos ni base de datos real.

---

## 23. Patch 2.28 - Flujo de supervision global del Administrador

El Administrador inicia en "Supervisión global" y trabaja de arriba hacia abajo:

```txt
Revisar el resumen global de la compañia
↓
Atender la cola global de decisiones (leads sin asignar, traslados,
actividades vencidas, carga de vendedores, reservas con riesgo, inventario
bajo y ventas por entregar)
↓
Comparar el desempeño por sucursal
↓
Supervisar vendedores destacados y los que requieren atencion
↓
Revisar alertas operativas y actividad reciente
↓
Entrar a reportes globales o a configuracion cuando corresponde
```

El dashboard agrega datos de todas las sucursales. La cola de decisiones enlaza
a leads, traslados, actividades, vendedores, reservas, inventario y ventas. El
comparativo por sucursal muestra leads, reservas, ventas del mes, disponibles,
traslados pendientes, actividades vencidas, conversion y un estado por sucursal.

La configuracion se organiza en usuarios y roles, sucursales, reglas de negocio,
alcances de datos y auditoria, con el reinicio de datos demo aislado como accion
destructiva. La operacion diaria (asignacion de leads, aprobacion de traslados,
etc.) se mantiene en gerentes y vendedores; el Administrador supervisa y decide
a nivel global sin cambiar las reglas de negocio.

El Gerente conserva el flujo de sucursal (Patch 2.25), el Vendedor su flujo
personal (Patch 2.24), el Cajero su estacion de caja (Patch 2.26) y el Contador
su centro contable (Patch 2.27).

---

## 24. Patch 2.29 - Flujo de exportacion contable

El Contador (o Administrador, o Gerente en inventario/reportes) puede exportar
lo que ya esta viendo en pantalla, en dos formatos:

```txt
Revisar/filtrar la lista en pantalla (documentos, diarios, comprobantes,
gastos, inventario, planilla, bancos, conciliacion, cierres, terceros o
reportes)
↓
Exportar Excel -> descarga un CSV compatible con Excel (BOM UTF-8, filtros
aplicados, nombre de archivo con fecha)
↓
Exportar PDF -> abre una vista imprimible con encabezado MotoMas, alcance,
totales y pie de pagina, lista para "Guardar como PDF" desde el dialogo de
impresion del navegador
```

Un documento de Caja o Contabilidad (Factura, Recibo Oficial de Caja, Nota de
Debito o Nota de Credito) seleccionado en `/panel/contabilidad/documentos`
puede exportarse individualmente a PDF con la descripcion de motocicleta en el
orden fijo existente cuando aplica.

En `/panel/contabilidad/cierres`, el cierre de caja se cruza con las facturas,
recibos y notas que Caja emitio el mismo dia y sucursal para mostrar/exportar
cuantos documentos y cuanta retencion 1%/2% corresponden a cada cierre.

Ningun boton de exportacion cambia el flujo de revision, contabilizacion,
conciliacion o cierre existente. Si la exportacion falla (por ejemplo, un
bloqueador de ventanas emergentes impide abrir la vista de impresion), se
muestra un aviso breve sin interrumpir la pagina.

El alcance de cada exportacion respeta el alcance ya vigente: el Contador y el
Administrador exportan de forma global; el Gerente solo exporta inventario y
reportes de su sucursal; el Vendedor y el Cajero no llegan a estas rutas y por
lo tanto no tienen boton de exportacion contable.

---

## 25. Patch 3.0 - Flujo de acceso, usuarios e inventario real

### Acceso e inicio de sesion

```txt
Usuario abre /panel
↓
middleware verifica la cookie de sesion firmada
↓
sin sesion -> redirige a /login
↓
/login valida credenciales (base de datos o cuentas de desarrollo)
↓
crea cookie de sesion + refleja la sesion en el panel
↓
redirige segun rol:
  ADMIN/GERENTE -> /panel/dashboard
  VENDEDOR      -> /panel/leads
  CAJERO        -> /panel/caja
  CONTADOR      -> /panel/contabilidad
```

Cerrar sesion limpia la cookie y el espejo local y regresa a `/login`.

### Creacion de usuarios

```txt
Administrador o Gerente entra a /panel/configuracion
↓
completa nombre, correo, contraseña, rol y sucursal
↓
el servidor valida:
  - el actor puede crear ese rol (Gerente solo VENDEDOR)
  - el actor puede asignar esa sucursal (Gerente solo la suya)
↓
crea el usuario con contraseña hasheada (scrypt) + registro en UserAuditLog
```

### Alta y baja de motocicletas

```txt
Gerente o Administrador entra a /panel/inventario/movimientos
↓
Ingreso: nombre, marca, modelo, año, chasis, motor, color, sucursal, fecha
↓
el servidor valida chasis unico y sucursal permitida
↓
crea la unidad (Disponible) + movimiento INGRESO
---
Egreso: selecciona unidad, motivo (venta, entrega, traslado, ajuste, baja)
↓
el servidor bloquea unidades ya dadas de baja
↓
actualiza estado + fecha de salida + movimiento de egreso
```

El Administrador ve/gestiona todas las sucursales; el Gerente solo la suya. Cada
ingreso y egreso queda en el historial de movimientos.

### Persistencia en esta fase

Sucursales, usuarios, unidades de motocicleta y movimientos de inventario usan
PostgreSQL cuando `DATABASE_URL` esta configurado. El resto de modulos (leads,
clientes, expedientes, reservas, ventas, actividades, caja y contabilidad) sigue
en `localStorage` y se migrara en fases posteriores. Sin `DATABASE_URL` el
sistema opera en modo demo (login de desarrollo y consulta), y las altas/bajas y
la creacion de usuarios muestran que requieren base de datos.

---

## 26. Patch 4.0F - Flujo interno de Tickets / Ayuda

### Reportar un problema

```txt
Usuario interno abre /panel/ayuda o la accion persistente Reportar problema
↓
completa titulo, categoria, impacto, modulo y descripcion
↓
el servidor deriva usuario, rol y sucursal de la sesion; sanitiza el contenido
↓
crea el ticket y redirige a /panel/ayuda/tickets/TKT-YYYY-NNNNN
```

La prioridad tecnica se deriva en el servidor y no puede seleccionarse en el
formulario. El usuario no envia un `branchId`, una sesion ni credenciales. La
referencia de un registro relacionado se conserva como codigo opaco y este flujo
no consulta automaticamente datos privados del negocio.

La accion compartida de creacion tampoco acepta un alcance de visibilidad
elegido por el cliente: todo reporte nuevo se guarda siempre con alcance `USER`
derivado por el servidor. Un valor `USER`, `BRANCH`, `MODULE` o `GLOBAL` agregado
manualmente al payload no controla el alcance almacenado.

La clasificacion de incidentes amplios queda diferida a controles autorizados
del Patch 4.0G para Administrador y Soporte Tecnico: `USER` representa el reporte
personal predeterminado, `BRANCH` una incidencia operativa de sucursal, `MODULE`
una incidencia que afecta un modulo y `GLOBAL` una incidencia de todo el sistema.
El flujo compartido Reportar problema no realiza esa promocion.

### Consultar y responder

```txt
Usuario abre Mis tickets
↓
el servidor devuelve solo tickets propios o participados autorizados
↓
usuario abre el detalle por codigo publico
↓
si el ticket es mutable, agrega una respuesta PUBLIC
↓
el servidor sanitiza, autoriza y registra el evento
```

Si el codigo no existe o no esta autorizado, la respuesta visual es siempre
`Ticket no disponible`. Las notas `INTERNAL` no se solicitan ni se serializan
para roles no privilegiados. Administrador y Soporte Tecnico pueden verlas en
una seccion separada cuando el DTO autorizado las incluye.

### Cancelar o reabrir

El creador puede cancelar un ticket propio elegible mientras no este resuelto,
cerrado o cancelado. Un ticket resuelto o cerrado puede solicitarse como
reabierto por su creador mediante la accion dedicada. Un ticket cerrado mantiene
la conversacion bloqueada hasta completar el flujo de reapertura. La interfaz no
ofrece cambios arbitrarios de estado ni controles tecnicos.

### Visibilidad de Gerente

Gerente ve sus tickets propios/participados y una seccion separada con incidencias
operativas autorizadas de su sucursal. La consulta de servidor excluye tickets
personales de acceso o seguridad de otros empleados; la interfaz no reconstruye
ni amplia ese alcance.

---

## 27. Patch 4.0G - Flujo de la bandeja operativa de soporte

### Ingreso y clasificación

```txt
Soporte Técnico o Administrador abre /panel/soporte/tickets
↓
el servidor aplica filtros, paginación acotada y métricas autorizadas
↓
el operador abre un código TKT-YYYY-NNNNN o crea un ticket operativo
↓
clasifica USER, BRANCH, MODULE o GLOBAL con referencias validadas
↓
el servidor guarda el cambio y agrega eventos auditables
```

`GLOBAL` descarta cualquier sucursal enviada; `BRANCH` exige una sucursal activa
resuelta por código; `MODULE` exige una etiqueta de módulo y admite una sucursal
válida opcional; `USER` usa un solicitante interno activo cuando corresponde. La
identidad y el rol creador siempre proceden de la sesión. El flujo compartido
`Reportar problema` continúa creando exclusivamente `USER`.

### Asignación, prioridad y estado

La asignación solo acepta usuarios activos con rol Soporte Técnico o
Administrador y mantiene el participante `ASSIGNEE`; retirar la asignación
también queda auditado. La prioridad admite únicamente `P1_CRITICA`, `P2_ALTA`,
`P3_MEDIA` o `P4_BAJA`. El estado avanza solo si la tabla de transiciones del
servidor acepta el salto; `resolvedAt` y `closedAt` se controlan en el servidor y
un ticket cerrado permanece inmutable hasta una reapertura explícita.

### Respuesta pública y nota interna

```txt
Respuesta al usuario -> comentario PUBLIC -> visible a participantes autorizados
Nota interna         -> comentario INTERNAL -> solo Admin/Soporte Técnico
```

Los formularios son separados y etiquetados; ninguno convierte silenciosamente
una nota interna en pública. Ambos sanitizan texto y crean eventos. El DTO
compartido no selecciona notas internas ni expone un conteo de ellas.

### Duplicados e incidentes globales

Marcar un duplicado conserva el reporte original, guarda el código del ticket
principal y rechaza el propio ticket o una cadena circular evidente. Vincular un
incidente global conserva ambos tickets, exige que el destino tenga alcance
`GLOBAL` y rechaza autorrelaciones, destinos no globales y ciclos. La interfaz
muestra la relación, pero no existe propagación automática de estado en este
patch.

### Causa raíz

Cada registro de causa raíz crea un nuevo evento privilegiado
`ROOT_CAUSE_RECORDED` con resumen, acción correctiva y notas de prevención
sanitizadas. Los eventos son inmutables y solo aparecen en el DTO y detalle del
operador; `/panel/ayuda` los excluye. La publicación en Knowledge Base queda
diferida y no se agregó un modelo ni un flujo editorial.

---

## 28. Patch 4.0S-B - Flujo financiero auditado e inmutable

### Borrador, contabilización e inmutabilidad

```txt
Crear documento/asiento en BORRADOR
↓
Editar valores o líneas permitidos
↓
Cada escritura y su FinancialAuditEvent confirman en una sola transacción
↓
Documento revisado -> CONTABILIZADO / asiento balanceado -> CONTABILIZADO
↓
Cabecera, importes y líneas quedan inmutables
↓
Corrección futura -> reversión contable de 4.0S-C (todavía no implementada)
```

El servidor vuelve a leer y bloquea el estado vigente dentro de la transacción.
Una llamada directa, incluso de Administrador o Contador, no puede editar líneas,
agregar o retirar líneas ni cambiar directamente un asiento contabilizado a
`ANULADO`. Un documento `CONTABILIZADO` o `CONCILIADO` tampoco admite edición ni
anulación directa. La conciliación controlada `CONTABILIZADO -> CONCILIADO`
permanece como transición existente y no modifica sus valores financieros.

### Anulación elegible y preservación histórica

```txt
Borrador o estado previo a contabilización elegible
↓
Actor autorizado indica un motivo válido
↓
El servidor conserva notes/observations originales
↓
Actualiza el estado + agrega evento con reason separado
↓
Si falla cualquiera de las dos escrituras, ambas se revierten
```

Los motivos de anulación, revisión o reapertura no se concatenan ni sustituyen
notas históricas. El historial devuelve únicamente etiquetas en español y los
campos allowlisted que cambiaron; no devuelve IDs ni el JSON almacenado.

### Caja y Contabilidad

Caja audita apertura/cierre de turno, documentos, ítems y pagos de borrador,
emisión/anulación y preparación/revisión del cierre. Contabilidad audita sus
maestros, documentos, asientos y líneas, comprobantes, gastos, planilla, costos,
bancos, conciliaciones y cierres en cada mutación PostgreSQL existente.

El registro es append-only: no existe acción de actualización o eliminación de
`FinancialAuditEvent`. El motor de reversión, bloqueo de períodos, movimientos
de efectivo, cobros posteriores a emisión, traspaso Caja -> Contabilidad,
documento -> asiento, ventas/COGS y estados financieros confiables continúan
diferidos. Los paneles legacy en `localStorage` siguen presentes y Caja y
Contabilidad no están declarados listos para producción.

---

## 29. Patch 4.0S-C1 - Bloqueo de períodos y cuentas activas

### Cierre de período como barrera real

```txt
Cierre contable de sucursal (AAAA-MM) ABIERTO / EN_REVISION / REABIERTO
↓
Contador o Admin lo revisa y lo cierra -> CERRADO
↓
Contabilizar un asiento con fecha dentro del período CERRADO -> rechazado
Contabilizar o conciliar un documento con fecha dentro del período -> rechazado
↓
Reapertura autorizada con motivo -> REABIERTO
↓
Las contabilizaciones del período vuelven a estar disponibles
```

El bloqueo se valida dentro de la misma transacción que contabiliza, releyendo
el estado vigente del cierre en la base de datos. Solo el estado `CERRADO`
bloquea; los límites del período son inclusivos (del primero al último día del
mes `AAAA-MM`, comparados como fecha UTC sin desplazamiento de zona horaria).
El cierre es por sucursal: un cierre de otra sucursal no bloquea asientos
ajenos, y un asiento sin sucursal falla cerrado ante cualquier cierre CERRADO
del período. Ningún rol, incluido el Administrador, evita el bloqueo. Solo
existe un cierre por sucursal y período (restricción única en base de datos),
por lo que no hay períodos duplicados ni traslapados.

### Revalidación al contabilizar

```txt
Bloquear y releer el asiento (FOR UPDATE)
↓
Validar que sigue en BORRADOR
↓
Validar que la fecha contable cae en período abierto
↓
Cargar líneas actuales y validar cuenta existente y activa en cada una
↓
Validar debe = haber
↓
Actualización guardada por estado + FinancialAuditEvent en la misma transacción
```

Si cualquier paso falla, no se contabiliza y no se escribe un evento de éxito.

### Cuentas inactivas

Una línea de asiento nueva o editada exige una cuenta existente y activa. La
contabilización revalida todas las líneas vigentes: si una cuenta se desactivó
después de crear la línea del borrador, el asiento no puede contabilizarse
hasta corregirlo. La desactivación de una cuenta no modifica ni elimina
historial contabilizado ni líneas de borradores; solo impide nuevos
movimientos. Los borradores siguen siendo editables (incluida su fecha); la
regla se aplica siempre al contabilizar.

---

## 30. Patch 4.0S-C2 - Motor de reversión de asientos

### Corrección de un asiento contabilizado

```txt
Asiento CONTABILIZADO o CONCILIADO
↓
Contador o Admin elige "Revertir" e indica la fecha de la reversión
↓
El servidor bloquea y relee el original dentro de la transacción
↓
Valida elegibilidad, ausencia de reversión previa y período abierto
↓
Copia las líneas invirtiendo debe y haber sobre las mismas cuentas
↓
Crea el asiento de reversión ya CONTABILIZADO, enlazado por reversalOfId
↓
Escribe los dos eventos de auditoría en la misma transacción
```

El asiento original permanece intacto: no cambia de estado, de fecha, de
importes ni de líneas. La corrección es siempre un asiento nuevo, y la relación
`reversalOfId` -- no el texto libre -- es la fuente de verdad del vínculo.

### Elegibilidad y unicidad

```txt
BORRADOR    -> se anula con motivo, no se revierte
ANULADO     -> no se revierte
CONTABILIZADO / CONCILIADO -> reversible una sola vez
Asiento de reversión        -> no se revierte (sin cadenas)
```

La columna `reversalOfId` es única en base de datos, de modo que dos intentos
simultáneos dejan exactamente una reversión: el intento perdedor recibe un error
de negocio y toda su transacción se revierte, sin líneas huérfanas ni eventos de
auditoría parciales. Un origen sin líneas, descuadrado o con una línea que tiene
debe y haber a la vez se rechaza en lugar de generar una reversión parcial.

### Período y cuentas históricas

El bloqueo de período se evalúa contra la fecha de la reversión, no contra la
del asiento original. Un asiento de un mes ya `CERRADO` sigue siendo corregible
hacia el período abierto vigente; en cambio, una reversión fechada dentro de un
período `CERRADO` de su sucursal se rechaza, con los mismos límites inclusivos y
la misma comparación UTC del Patch 4.0S-C1. Una reversión sin sucursal hereda esa
condición y falla cerrada ante cualquier cierre `CERRADO` del período.

La reversión reutiliza las cuentas del asiento original aunque alguna se haya
desactivado después de contabilizarlo, porque debe reproducir las dimensiones
contables históricas; sin esa excepción, desactivar una cuenta dejaría sus
asientos contabilizados sin vía legal de corrección. La cuenta debe seguir
existiendo. Fuera de este flujo controlado no cambia nada: las líneas manuales y
la contabilización ordinaria siguen exigiendo cuentas activas.
