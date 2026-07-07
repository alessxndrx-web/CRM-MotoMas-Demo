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
