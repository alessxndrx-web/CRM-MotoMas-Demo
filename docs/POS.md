# Punto de venta (POS)

**Parche POS1.0-A.** Contexto acotado del punto de venta: modelo, aritmética y
ciclo de vida. **No contabiliza, no mueve inventario y no emite documentos.**

---

## Notación epistémica

| Marca | Significado |
|---|---|
| **[R]** | Verificado por inspección del repositorio. |
| **[E]** | Verificado en ejecución contra PostgreSQL (SMOKE-POS1.0-A). |
| **[I]** | Inferencia lógica. |
| **[D]** | Decisión de negocio pendiente. |

---

## 1. Por qué un agregado propio, y por qué casi no lo hubo

La Fase 0 de este parche empezó con una objeción: **`CashDocument` de tipo
`FACTURA` ya modela casi todo lo que un POS necesita.**

**[R]** Lo comprobado antes de decidir:

| Concepto | `CashDocument` |
|---|---|
| Sucursal, cajero, turno | `branchId`, `issuedByUserId`, `cashSessionId` |
| Estados | `BORRADOR → EMITIDO → ANULADO` |
| Importes | subtotal, impuesto, retenciones, abono, total |
| Líneas | `CashDocumentItem` (cantidad, precio, total) |
| Pagos | `CashPayment` por método |
| Edición | solo en `BORRADOR` |
| Contabilidad | contabiliza al emitir (FF1.4-D), revierte al anular |

**[R] `Sale` es otro contexto**: `motorcycleUnitId @unique`, atado a reserva y
expediente. Es la venta de vehículos, no el mostrador.

La decisión de negocio fue crear un contexto separado porque el POS resuelve un
problema distinto —cobro rápido, catálogo con código de barras, carrito,
inventario— y porque **el POS no contabiliza**. Esa última condición es lo que
hace legítima la separación: sin ella habría **dos caminos de asiento para el
mismo hecho económico**, que es exactamente el riesgo registrado como §L-7 en
`POSTING_CONTRACT.md`.

**El contrato, entonces:** un contexto nuevo se justifica **mientras no
contabilice**. Cuando una venta completada llegue a emitir un documento de caja,
será ese documento el que contabilice, nunca el POS.

---

## 2. Lo que hubo que crear y no estaba en el encargo

**[R] No existe catálogo de productos.** El único catálogo del repositorio es
`MotorcycleCatalogModel`, y las motocicletas se venden por `Sale`. Sin un modelo
de producto, `PosSaleItem.product` no tiene a qué apuntar.

`PosProduct` es deliberadamente mínimo —SKU, código de barras, nombre, precio,
activo— porque inventario y costo están excluidos de este parche. El código de
barras existe porque la búsqueda por código es **la razón** por la que el POS
necesita un catálogo.

---

## 3. Aritmética

**Línea:**

    total = max(cantidad × precio − descuento + impuesto, 0)

El impuesto suma y el descuento resta, la misma forma que ya usan gasto y
documento. **[E]** Una línea cuyo descuento supera su bruto se acota en cero: una
línea negativa significaría «invierte los lados», que no es algo que una venta de
mostrador exprese.

**Venta — todas sus cifras son la suma de sus líneas:**

    subtotal  = Σ (cantidad × precio)
    descuento = Σ descuentos de línea
    impuesto  = Σ impuestos de línea
    total     = max(subtotal − descuento + impuesto, 0)

**[I] Por qué así.** El agregado tiene `discount` y las líneas también. Tratar el
del encabezado como algo distinto de la suma de las líneas exigiría inventar un
orden entre dos capas de descuento, y un descuento de cabecera no es algo que
este parche debiera definir. Es la única lectura que no requiere una decisión de
negocio.

**[R] El agregado nunca acumula**: se reescribe desde las líneas cada vez que
cambian, así que un total almacenado no puede desviarse de lo que dicen sus
líneas. **[E]** Verificado agregando y quitando artículos.

**[R] La aritmética monetaria reutiliza `finance/money`**, los mismos helpers de
la capa contable. TD-01 dedicó un parche a eliminar helpers de dinero duplicados
y este contexto no los reintroduce.

---

## 4. Ciclo de vida

    BORRADOR → COMPLETADA
       └────→ ANULADA

Sin vuelta atrás. **[E]** Una venta completada no admite artículos, ni pagos, ni
anulación, ni una segunda compleción. Una anulada tampoco admite artículos.

**[R] Los estados están en español** —`BORRADOR`, `COMPLETADA`, `ANULADA`—
aunque el encargo los enunció en inglés. Todos los enums de estado del
repositorio están en español y `SaleStatus` ya usa `COMPLETADA`; mezclar idiomas
sería una marca permanente. La correspondencia es exacta y el cambio, si se
prefiere en inglés, es una migración de renombrado.

**[R] Completar exige al menos un artículo**, la misma regla que Caja aplica a
una factura antes de emitirla.

**[R] Completar NO exige que los pagos cubran el total.** Ver §6.

**[R] POS1.0-D añadió una entrada directa a `COMPLETADA`** para la venta de
mostrador, que no pasa por `BORRADOR`. No es un estado nuevo ni una transición
nueva: es que el borrador ya ocurrió, en el navegador. Ver §10.

---

## 5. Identidad y autorización

**[R] La identidad de negocio es `saleNumber`**, generado dentro del POS con el
formato `POS-AAAAMMDD-XXXXXXXX` y **único a nivel global**, independiente de la
numeración de documentos contables como pide el contrato. **[E]** El índice único
impide un duplicado.

**[R] Autorización**: el POS reutiliza `canOperateCaja` (ADMIN o CAJERO) del
módulo compartido `auth/access`. Importa el predicado de rol, no nada de
`server/caja`: los contextos siguen separados. **[D]** Si el POS necesita su
propio permiso —por ejemplo un rol de mostrador que no opere caja—, es una
decisión de negocio que nadie ha tomado.

**[R] El método de pago reutiliza `CashPaymentMethod`** en vez de declarar un
gemelo: el vocabulario de cobro es compartido, y cuando una venta completada
emita un documento de caja no hará falta tabla de traducción.

---

## 6. Decisiones pendientes del negocio

| # | Asunto |
|---|---|
| **P-1** | **¿Puede completarse una venta cuyos pagos no cubren el total?** Hoy sí: los pagos se registran y nadie exige cobertura. Y si el cobro supera el total, ¿es vuelto o sobrecobro? Caja rechaza el sobrecobro; el POS no opina. Inventar la regla sería política. |
| **P-2** | **¿Descuento de cabecera además del de línea?** Hoy el del agregado es la suma de los de línea (§3). |
| **P-3** | **¿Permiso propio del POS** o basta con el de caja? |
| **P-4** | **¿Qué pasa con una venta completada que fue un error?** No hay anulación después de completar, y por diseño: sin contabilización no hay nada que revertir. Cuando el POS emita documentos, habrá que decidirlo. Desde POS1.0-D toda venta de mostrador nace completada, así que esta decisión pasó de teórica a cotidiana. |
| **P-5** | **¿Necesita el cobro idempotencia de servidor?** Hoy la protección es de interfaz. Una clave exigiría un identificador de negocio del cobro que hoy no existe. |
| **P-6** | **¿Cuándo y dónde se aplica `defaultTaxRate`?** Hoy se guarda y nadie lo lee. ¿Prefija la línea del carrito? ¿Lo recalcula el servidor al cobrar? ¿Y qué manda si el cajero lo corrige? Ninguna respuesta está en el repositorio. Y **qué tasa corresponde** es política fiscal que nadie ha enunciado. |
| **P-7** | **¿Costo y umbrales por sucursal?** `AccountingInventoryCost` ya los trata como hechos de sucursal para motocicletas; en el POS son globales porque `PosProduct` no tiene sucursal. Con saldo por bodega (§12) la contradicción se vuelve visible: un umbral global comparado contra saldos locales. |
| **P-32** | **¿Necesita el cobro un timeout de transacción explícito?** Las seis transacciones del ciclo de compra declaran 20 s desde POS1.2-E, porque el defecto se manifestó ahí. `checkoutPosSaleAction` tiene la misma forma —N movimientos de inventario en una transacción— y sigue con el defecto de 5 s de Prisma. |
| **P-31** | **¿Cómo se dimensiona la concurrencia del mostrador?** Con suficientes cobros simultáneos del mismo artículo, algunos abortan esperando conexión del pool. No se pierde inventario y el cajero ve un mensaje sano, pero cuántos cobros paralelos debe soportar una sucursal —y con qué tamaño de pool— es una decisión de operación. |
| **P-28** | **¿Reabre una devolución lo pendiente de la línea?** Hoy no: lo pendiente sigue siendo `pedido − recibido` y lo devuelto se registra aparte. Si el proveedor debe reponer, lo pendiente debería crecer; si la compra se da por perdida, no. Nadie lo ha dicho. |
| **P-29** | **¿Cambia el estado de la orden al devolver?** Hoy no. Devolver todo lo recibido de una `RECIBIDA` la deja `RECIBIDA`. Las transiciones que harían falta —¿a `APROBADA`?, ¿a `RECIBIDA_PARCIAL`?— no están especificadas. |
| **P-30** | **¿Puede devolverse mercancía ya vendida**, dejando el saldo negativo? Hoy nada lo comprueba, que es la misma ausencia de P-8. |
| **P-27** | **¿Puede anularse una orden parcialmente recibida?** Hoy no. Responderlo exige decidir antes qué pasa con lo ya recibido: ¿se queda en inventario sin documento que lo explique?, ¿se devuelve?, ¿la orden se cierra por lo recibido? Tres preguntas distintas que nadie ha respondido. |
| **P-23** | **¿Puede una recepción entrar productos en varias bodegas a la vez?** Hoy toda la recepción va a una sola bodega. Un camión que descarga en dos sitios exigiría decidir si es una recepción o dos. |
| **P-24** | **¿Debe recibir personal de bodega y no de compras?** Hoy recibir usa el mismo permiso que crear y aprobar (`canManageInventory`). Un control interno suele separar quien pide de quien confirma que llegó. |
| **P-25** | **¿Puede editarse una línea ya recibida?** Hoy no: la orden deja de ser editable al aprobarse, y recibir no la reabre. Corregir una recepción equivocada no tiene camino. |
| **P-26** | **¿Pueden sustituirse productos al recibir?** Si el proveedor manda una referencia equivalente, hoy no hay forma de registrarlo contra esa orden. |
| **P-16** | **¿Aprobar una orden de compra exige un supervisor?** Hoy usa el mismo permiso que crearla (`canManageInventory`), así que quien redacta puede aprobar. Un control interno suele separar esas dos manos. Nadie lo ha dicho. |
| **P-17** | **¿Puede restaurarse una orden anulada?** Hoy `ANULADA` es terminal. |
| **P-18** | **¿Puede anularse una orden parcialmente recibida**, dejando lo ya recibido? Hoy no, porque habría mercancía que la orden dejaría de explicar. |
| **P-19** | **¿Puede una orden recibirse en varias entregas y en varias bodegas?** El estado `RECIBIDA_PARCIAL` existe pero nada lo alcanza; qué significa exactamente lo decidirá el parche de recepción. |
| **P-20** | **¿Debe el proveedor ser de la misma sucursal que la orden?** `ThirdParty` es de sucursal y la orden también, pero no se exige que coincidan: una orden no mueve nada, así que un proveedor de otra sucursal no corrompe ningún saldo. Distinto del caso de la bodega (P-14), donde el cruce sí descuadraría existencias. |
| **P-21** | **¿Necesitan las órdenes de compra serie fiscal correlativa?** Hoy usan numeración propia del contexto. `allocateDocumentNumber` existe pero falla cerrado sin serie configurada y su clave es de series financieras. |
| **P-12** | **¿Debe consumir existencias la vía incremental?** `completePosSaleAction` lleva un borrador a `COMPLETADA` sin descontar, porque una venta no guarda bodega y no puede decir de dónde. Resolverlo exige decidir si `PosSale` almacena bodega, o si esa vía deja de existir. |
| **P-13** | **¿Debe el movimiento referenciar la venta?** Hoy la única traza es el texto del motivo. Sin relación no hay forma de preguntar qué movimientos generó una venta, ni de revertirlos cuando exista devolución. |
| **P-14** | **¿Puede una bodega surtir a varias sucursales?** Hoy se exige que la bodega sea de la sucursal donde se cobra, porque lo contrario movería existencias entre sucursales sin traslado. Una bodega central quedaría bloqueada. |
| **P-15** | **¿Debe una venta anulada devolver existencias?** Una venta de mostrador nace completada e inmutable, así que hoy no hay anulación. Cuando exista devolución habrá que decidir si repone. |
| **P-10** | **¿Requieren los ajustes de inventario autorización de un supervisor**, o puede hacerlos cualquier operario de bodega? Hoy basta con `canOperateCaja` (ADMIN o CAJERO), que es el permiso del mostrador, no uno de inventario. Un ajuste cambia existencias sin contrapartida documental: es exactamente la operación que un control interno suele reservar a un segundo par de ojos. El repositorio no dice nada. |
| **P-9** | **¿Sobreviven los ingresos manuales al módulo de compras?** ¿O todo ingreso de inventario debería nacer de una recepción de compra? Hoy el ingreso manual es la única vía y se registra como `COMPRA` a falta de un valor mejor. Si el negocio quiere trazabilidad total contra una factura de proveedor, el ingreso manual pasa a ser una puerta trasera; si quiere agilidad de mostrador, es imprescindible. Nadie lo ha dicho. |
| **P-8** | **¿Puede el saldo quedar negativo?** ¿Puede una venta consumir inventario que no hay? El repositorio no contiene ninguna regla. Prohibirlo bloquea al mostrador cuando la carga inicial va con retraso; permitirlo admite vender lo que no existe. Es política de operación. |
| **P-33** | **¿Qué debe registrar la bitácora cuando se edita un borrador?** `updatePosPurchaseOrderAction` reemplaza las líneas y los totales sin escribir evento: es el único cambio del ciclo que la historia no ve. Registrar «orden editada» a secas dice poco; registrar el diferencial de líneas es otro modelo de evento. Nadie ha dicho cuál. Por eso editar sigue siendo la única acción sin pantalla (§21). |
| **P-36** | **¿Debe el tablero de mostrador mostrar cuentas por cobrar?** `ReceivableDocument` existe, pero **el POS no crea ninguna**: PL-2 sigue vigente y una venta de mostrador no contabiliza ni genera deuda. Las cuentas por cobrar del repositorio son de Caja y Contabilidad, con su propio permiso. Mostrarlas aquí mezclaría dos contextos acotados y exigiría decidir qué rol del mostrador puede ver deuda ajena. Nadie lo ha dicho. |
| **P-37** | **¿Cómo se calcula el margen de una venta de mostrador?** `PosProduct.cost` existe y el propio esquema dice que **se guarda y no se contabiliza**; no hay método de valoración decidido (PL-8). Restar ese costo del precio produciría una cifra de rentabilidad que nadie ha validado como política. |
| **P-38** | **¿Dónde se administran las bodegas?** `createPosWarehouseAction` y `updatePosWarehouseAction` existen desde POS1.1-B y siguen **sin pantalla**. Crear y editar una bodega es configuración, no operación diaria: mezclarlo con los saldos habría convertido una pantalla en dos. Dónde vive esa configuración —¿en `/panel/configuracion`?, ¿en una pestaña propia del POS?— nadie lo ha dicho. |
| **P-39** | **¿Puede el POS emitir un comprobante?** El repositorio tiene `CashDocument`, `AccountingDocument` y `ReceivableDocument`, pero **los tres son de Caja y Contabilidad**: exigen turno abierto y contabilizan. Usarlos desde el mostrador fusionaría los dos productos que POS2.4 acaba de separar. Un comprobante propio del POS exigiría decidir antes qué es —¿interno?, ¿fiscal?— y quién lo numera. Nadie lo ha dicho. |
| **P-40** | **El cliente no tiene datos de facturación.** `Customer` guarda nombre, teléfono y correo: **no hay RUC, ni razón social, ni dirección fiscal**. Cualquier comprobante con pretensión fiscal necesita esos campos, y cuáles son obligatorios en Nicaragua es una decisión de negocio, no de esquema. |
| **P-41** | **¿Qué serie numera un comprobante del POS?** `DocumentSequence` y `allocateDocumentNumber` existen, pero sus claves son series financieras y la función falla cerrado sin serie configurada. Es la misma pregunta que P-21 dejó abierta para las órdenes de compra, ahora con consecuencia fiscal. |
---

## 7. Limitaciones del modelo, registradas

| # | Limitación |
|---|---|
| **PL-1** | ~~**Sin inventario.**~~ **Resuelto en POS1.1-E** (§15): una venta cobrada en el mostrador **sí** descuenta existencias, del inventario propio del POS. El inventario serializado de motocicletas sigue sin tocarse. Sigue abierto el camino incremental (`completePosSaleAction`), que no consume — ver P-12. |
| **PL-2** | **Sin contabilidad.** Ningún asiento, ninguna contabilización, ningún documento de caja. **[E]** Verificado contando antes y después. Es la promesa central del parche. |
| **PL-3** | **Sin costo.** `PosProduct` guarda precio de venta, no de adquisición. El costo vive en `AccountingInventoryCost` y no está enlazado. |
| **PL-4** | **Sin turno.** A diferencia de `CashDocument`, una venta POS no pertenece a un `CashSession`. **[I]** Cuando emita documentos de caja hará falta, porque el documento sí exige turno abierto. |
| **PL-5** | **Sin impresión ni comprobante**, por exclusión explícita. |
| **PL-6** | **El inventario existente es serializado y no sirve al mostrador.** `InventoryMovement.motorcycleUnitId` es obligatorio y no hay ningún campo de cantidad en el modelo: representa motos con chasis único, no artículos fungibles. **Resuelto en POS1.1-B** creando un modelo aparte (§12), no reutilizando aquel. |
| **PL-7** | **Ningún flujo escribe todavía en el inventario del mostrador.** Las tres tablas existen y nacen vacías; no hay compra, ni descuento por venta, ni ajuste. El modelo existe para que los parches siguientes tengan dónde escribir. |
| **PL-8** | **Sin valoración de existencias.** `PosProduct.cost` es descriptivo. No hay promedio ponderado, PEPS ni costo específico, y el método no está decidido. |

---

## 8. El catálogo desde la aplicación (POS1.0-B)

`/panel/pos/productos`, con entrada de menú en el grupo **Finanzas** y los mismos
roles que Caja, porque el POS reutiliza `canOperateCaja`.

**[R] Un producto no tiene estados**, así que no hay borrador que proteger ni
transición que respetar: cualquier campo se corrige en cualquier momento. Lo que
sí tiene es `isActive`, y **desactivar es como el catálogo retira un artículo sin
borrarlo** — una línea de venta pasada lo referencia y la clave foránea es
`ON DELETE RESTRICT`. Borrar no es una operación que este modelo ofrezca.

**[R] La búsqueda se resuelve en el servidor**, no filtrando lo ya cargado: el
término viaja en la URL (`?q=`) y `searchPosProducts` lo contrasta contra SKU
exacto, código de barras exacto y nombre parcial. **[I]** Es la única forma de
que un lector de códigos encuentre un artículo que no esté entre los que la
pantalla ya trajo. **[E]** Verificado con los tres modos de búsqueda.

**[R] La lista incluye los inactivos**, porque desactivar es reversible y hay que
poder volver a activarlos.

**[E] La unicidad de SKU y de código de barras**, que POS1.0-A dejaba solo en la
base de datos, ahora es alcanzable: el intento duplicado muestra el mensaje del
servidor y no crea nada.

---

## 9. El carrito (POS1.0-C)

`/panel/pos/venta`, con su propia entrada de menú.

**[R] El carrito vive en el navegador y nada se guarda.** Un mostrador arma la
venta en segundos —escanea, corrige cantidad, quita una línea— y persistir cada
pulsación crearía borradores basura por cada cliente que se arrepiente.
**Recargar lo vacía, por diseño.** **[E]** Verificado, igual que el hecho de que
armar un carrito de 5 000 no crea ninguna venta, línea ni pago.

**[R] Buscar es una acción, no una navegación.** Buscar por URL recargaría la
página y tiraría el carrito en cada escaneo, así que `searchPosProductsAction`
devuelve los productos y la pantalla se queda donde está. **[E]** Una prueba
comprueba que la URL no cambia. Es lo contrario de lo que hace el catálogo
(§8), donde la búsqueda **sí** viaja en la URL porque allí no hay estado que
perder — dos pantallas, dos contratos, cada uno por su razón.

**[R] El navegador no tiene fórmulas propias**: usa `calculatePosLineTotal` y
`calculatePosSaleTotals`, las mismas de POS1.0-A, así que lo que ve el cajero no
puede discrepar de lo que se guardará. **[E]** Verificado incluyendo el piso en
cero cuando el descuento supera la línea.

**[R] Un artículo repetido suma cantidad** en vez de abrir otra línea, que es lo
que espera quien escanea dos veces el mismo producto.

**[R] La búsqueda del carrito excluye los inactivos**, porque el mostrador no
puede vender un artículo retirado y `addPosSaleItemAction` lo rechazaría igual.

**[R] No había botón de cobro** en POS1.0-C, y la pantalla lo decía. POS1.0-D lo
añadió; ver §10.

---

## 10. El cobro (POS1.0-D)

**El primer parche del POS que escribe datos desde el navegador.** Hasta aquí la
pantalla de venta no guardaba nada; ahora el cobro es la frontera exacta donde el
carrito deja de ser la fuente de verdad.

### La venta nace `COMPLETADA`

**[R] `checkoutPosSaleAction` no pasa por `BORRADOR`.** El carrito del navegador
**es** el borrador: ya hubo fase de armado, y persistir un borrador para
completarlo en la misma transacción sería ceremonia sin lector. **[R] `BORRADOR`
sigue alcanzable** por `createPosSaleAction` para un flujo que lo necesite; el
ciclo de vida de §4 no cambió, se le añadió una entrada directa al estado final.

**[I]** Esto significa que una venta de mostrador nunca es observable a medias.
Es deseable —no hay borradores abandonados que conciliar— y a la vez es la razón
por la que un cobro interrumpido se pierde entero.

### Por qué una acción nueva y no las que ya había

**[R]** `createPosSaleAction` + `addPosSaleItemAction` × n + `addPosPaymentAction`
× n + `completePosSaleAction` son **2 + n + m** transacciones separadas. Un
mostrador que abandona a mitad dejaría una venta y sus líneas huérfanas. El cobro
escribe venta, líneas y pagos **en una sola transacción**: o está todo o no está
nada. **[E]** Verificado: desactivar un producto entre el armado y el cobro hace
fallar el cobro y no deja ninguna venta.

Las acciones incrementales **no se tocaron**: siguen sirviendo a un flujo de venta
armada en el tiempo, y su regla de inmutabilidad es la misma.

### Los totales se derivan, no se aceptan

**[R] La entrada de `checkoutPosSaleAction` no tiene campo de total.** Ni de
subtotal, ni de impuesto, ni de descuento de cabecera. El servidor recalcula todo
desde las líneas recibidas con `calculatePosSaleTotals` —la misma función que usa
el navegador para mostrar— y con `calculatePosLineTotal` línea por línea.

**Esto no es una validación: es una ausencia.** No hay una comprobación que
compare el total del navegador contra el del servidor, porque no hay total del
navegador que comparar. Un cliente manipulado no tiene dónde poner la cifra.
**[E]** Verificado: 2 000 + 250 con descuento 200 e impuesto 307,50 se guarda
como 2 357,50 exacto, y el precio corregido a mano en el carrito sí viaja porque
es un dato de la línea, no un total.

**[R] El precio de línea sí lo fija el navegador**, igual que en
`addPosSaleItemAction`, que ya admitía precio manual. Es una decisión de negocio
existente, no una laguna: el mostrador negocia precio.

### La sucursal no se elige en silencio

**[R] Quien tiene sucursal cobra en la suya; solo un rol global recibe un
selector** y debe decir en qué mostrador registra la venta. Es el mismo criterio
con el que `caja/page.tsx` abre un turno, y reutiliza `desiredBranches` en vez de
inventar otra lista. **[E]** Verificado que la venta queda en la sucursal
elegida.

**[R]** La página no importa nada de `server/caja`: comparte el predicado de rol
de `auth/access`, no el contexto de Caja.

### El cliente y las notas

**[R] El cliente es opcional** y se busca por nombre o teléfono con
`searchPosCustomers`, que lee `Customer` directamente. **[R] No reutiliza
`listCustomers` de CRM** porque exige un `CrmScope`: acoplaría el mostrador al
modelo de autorización de otro contexto para una lectura que el POS ya hace por
`PosSale.customer`. **[E]** Verificado: sin cliente se cobra igual, y con cliente
la venta lo guarda.

### Los pagos se capturan en el cobro

**[R]** Si vivieran en el carrito, una venta abandonada dejaría pagos huérfanos
que nadie podría conciliar. **[E]** Verificado el pago mixto: efectivo 600 +
tarjeta 400 sobre un total de 1 000.

**[R] La cobertura del total sigue sin exigirse** — P-1 de §6 sigue abierta. El
saldo se muestra, y nada más: decidir si un mostrador puede cerrar corto, y qué
significa cobrar de más, es política contable que nadie ha enunciado. La pantalla
lo expone para que el cajero decida, no para que el sistema opine.

### Idempotencia

**[R] No hay clave de idempotencia.** Un doble clic no puede duplicar porque el
carrito se vacía en el éxito y el botón queda deshabilitado sin líneas. **[I]**
Eso es defensa de interfaz, no del servidor: dos peticiones idénticas enviadas
fuera del navegador crearían dos ventas con números distintos. **[D]** Si el
mostrador necesita garantía de servidor, hace falta una clave de negocio que
identifique el cobro, y hoy no existe: `saleNumber` se genera después. Se registra
como **P-5**.

### Cuatro defectos que encontró la revisión, no las pruebas

**[E] Un monto de pago mal tecleado desaparecía en silencio.** El panel filtraba
con `parseAmount(monto) > 0`, así que una fila con `abc` se descartaba sin avisar
y la venta se cobraba corta. Ahora solo se descarta la fila **vacía**; lo tecleado
llega al servidor y este lo rechaza.

**[E] El `catch` filtraba texto crudo de Prisma al mostrador.** Devolvía
`error.message` de cualquier error, así que una restricción de base de datos le
habría enseñado al cajero un nombre de tabla. Una clase `PosCheckoutError` marca
los mensajes que esta acción escribió; lo demás es un fallo genérico.

**[E] La fila de pago no cabía en un teléfono.** `w-40 + w-36 + botón` son unos
360 px dentro de una tarjeta que a 390 px deja ~342. La prueba móvil pasaba solo
porque nunca agregaba un pago; ahora agrega uno y los anchos son flexibles.

**[E] El botón nuevo «Buscar cliente» rompía la suite de POS1.0-C**, que
localizaba «Buscar» sin exigir coincidencia exacta. Tres localizadores corregidos.

### Lo que el cobro sigue sin hacer

**[E] Ni asientos, ni contabilizaciones, ni documentos de caja, ni movimientos de
inventario.** PL-1 y PL-2 de §7 se mantienen intactas, y ahora están verificadas
en el camino que **sí** escribe, no solo en el que no escribía nada.

---

## 11. Metadatos del catálogo (POS1.1-A)

Cimiento del futuro módulo de inventario. **No mueve existencias**: solo le da al
producto los datos que inventario, compras y costeo necesitarán después.

### Fase 0 — qué había ya

| Concepto | ¿Existía? | Qué se hizo |
|---|---|---|
| Producto genérico fuera del catálogo de motos | **No.** Solo `MotorcycleCatalogModel` (motos) y `PosProduct` (mostrador). | Se amplió `PosProduct`. |
| Categoría | **No.** `TicketCategory` y `ExpenseCategory` son enums de otros dominios y no describen artículos. | Tabla `PosCategory` nueva. |
| Marca | **No hay tabla.** `MotorcycleCatalogModel.brand` y `MotorcycleUnit.brand` son texto libre sobre otro agregado. | Tabla `PosBrand` nueva. |
| Unidad de medida | **No.** Nada en el repositorio. | Enum `PosProductUnit`. |
| Tasa de impuesto | **No.** Ver abajo. | Campo `defaultTaxRate`, inerte. |
| Proveedor de compras | **Sí**, `ThirdParty` con `type = PROVEEDOR`, por sucursal. No hay módulo de compras. | **No se tocó.** Este parche no enlaza proveedores. |
| Inventario | **Sí, pero serializado.** Ver abajo. | **No se tocó.** |

### El inventario que existe no sirve para el mostrador

**[R] `MotorcycleUnit` + `InventoryMovement` es inventario serializado.** Cada
moto es una unidad individual con `chassisNumber` único, y
`InventoryMovement.motorcycleUnitId` es **obligatorio**. **No existe ningún campo
de cantidad en todo el modelo de inventario.**

Un artículo de mostrador es fungible: hay doce cascos, no doce cascos
individualmente identificados. **[I]** El inventario actual no puede
representarlo sin un cambio de esquema, y por eso este parche no lo reutiliza ni
lo extiende: hacerlo sería rediseñar el inventario de motocicletas de paso.
Registrado como **PL-6**.

### La tasa de impuesto es el primer porcentaje del repositorio

**[R] El repositorio no declara ninguna tasa en ninguna parte.** Todo el impuesto
introducido en FF2.0 es un **importe**: `AccountingDocument.tax`,
`CashDocument.tax`, `PosSaleItem.tax`, y el componente `IMPUESTO` del motor de
contabilización consume importes, no tasas.

**[D] Por eso el valor por defecto es 0 y no 15.** Poner la tasa nicaragüense
sería inventar política fiscal en un repositorio que deliberadamente nunca la ha
escrito. El tope de 100 del saneador es aritmético, no fiscal.

**[R] Nada deriva impuesto de este campo.** El cobro sigue tomando el importe que
recibe línea por línea. Calcularlo automáticamente cambiaría el comportamiento
del cobro en silencio, y este parche no cambia ningún flujo. Cuándo y dónde
aplicar la tasa es **P-6**.

### Costo y existencia mínima ya existían — por sucursal

**[D] `AccountingInventoryCost` guarda `unitCost` y `minimumStock`** con
`@@unique([branchId, modelSlug])`. El negocio ya trató estas cifras como hechos
**de sucursal**.

No se pueden reutilizar: esa tabla está atada a `modelSlug`/`catalogModelId`, que
son de motocicleta. Pero su existencia importa, porque `PosProduct` es **global**
y no tiene sucursal. Las cifras de aquí son por tanto **valores por defecto del
catálogo**, no cifras de sucursal. Si el POS necesita costo o umbral distintos por
sucursal, hará falta una tabla de anulación. **P-7**, no inventada aquí.

### Umbral no es saldo

**[R] `minimumStock` y `reorderPoint` son cosas distintas.** El primero es el piso
por debajo del cual la existencia es un problema; el segundo, el nivel al que
conviene volver a pedir, normalmente más alto porque cubre el plazo de entrega.

**Ninguno es un saldo, y ninguno se lee.** **[E]** El smoke consulta
`information_schema` para comprobar que `pos_products` no tiene columna `stock`,
`quantity` ni `on_hand` — la ausencia de existencias es verificada, no prometida.

**[I]** Ambos son `Decimal(12,3)` como `PosSaleItem.quantity`, porque un artículo
puede venderse en litros. Diverge del `Int` de `AccountingInventoryCost`, donde la
unidad es una motocicleta y las fracciones no significan nada.

### Decisiones menores, con su razón

**[R] La unidad es un enum, no una tabla.** El encargo autorizó tablas solo para
categoría y marca. Y el repositorio resuelve así todos sus vocabularios cerrados;
una tabla invitaría a «unidad», «Unidad», «und», «u.» conviviendo. Ampliarla es
una migración, y esa fricción es deseada.

**[R] Las relaciones son `RESTRICT`, no `SET NULL`.** Borrar una categoría en uso
debe fallar, no vaciar en silencio el dato de los artículos que la referencian.
Retirar una categoría se hace con `isActive`, igual que con un producto. **[E]**
Verificado que el intento fallido no dejó rastro.

**[R] La marca del POS es tabla y la de las motos es texto.** Es una
inconsistencia real del repositorio. Normalizar el lado de motocicletas es una
migración de datos ajena a este parche, así que queda anotada en vez de resuelta:
cuando exista un catálogo de productos general habrá que fusionarlos.

**[R] Categorías y marcas comparten implementación** en las acciones, porque hoy
tienen forma idéntica. Duplicar dos funciones por si algún día divergen sería
inventar una diferencia que no existe.

### La migración es aditiva

**[R] Un tipo, dos tablas y nueve columnas**, todas anulables o con valor por
defecto. Ninguna columna, restricción o índice existente se modifica. **[E]** El
smoke crea un producto con **exactamente la forma anterior al parche** y comprueba
que sigue siendo válido y que adquiere valores por defecto inertes.

---

## 12. El inventario del mostrador (POS1.1-B)

**Nada de este parche mueve un saldo.** Las estructuras existen para que compras,
ventas y ajustes tengan dónde escribir legítimamente.

### Por qué no se pudo reutilizar el inventario que ya había

**[R] `MotorcycleUnit` + `InventoryMovement` es inventario serializado.** Cada moto
es una unidad identificada por su chasis, `InventoryMovement.motorcycleUnitId` es
**obligatorio**, y **no existe ningún campo de cantidad en todo ese modelo**.

Veinte filtros de aceite son veinte piezas intercambiables, no veinte activos
identificados. Extender el inventario actual —hacer anulable `motorcycleUnitId` y
añadir cantidad— rompería las tres restricciones que hoy protegen la venta de
motocicletas: `Sale.motorcycleUnitId @unique` («una venta por unidad»), el estado
terminal de `MotorcycleUnitStatus` y la irreversibilidad del egreso. **Sería
rediseñar el flujo de motocicletas disfrazado de ampliar el POS.**

Los dos modelos quedan independientes a propósito. **[E]** Verificado: la suite
consulta `information_schema` y comprueba que ninguna tabla nueva tiene una
columna que mencione motocicletas.

### Los cuatro agregados

**`PosWarehouse`** — una bodega o punto físico. **[R] No guarda existencias ni
información contable**: solo dice dónde. **[R] No puede existir sin sucursal**, a
diferencia del producto, que es global. Único **por sucursal**
(`@@unique([branchId, code])`), no global: «PRINCIPAL» debe poder existir en
Granada y en Rosita a la vez. **[E]** Ambas cosas verificadas.

**`PosInventory`** — el saldo de un producto dentro de una bodega. Identidad
`@@unique([warehouseId, productId])`. **[R] Todo saldo empieza en cero**, y
`openPosInventoryAction` **no acepta cantidad inicial**: un saldo inicial distinto
de cero es un movimiento `INICIAL`, y ese flujo no existe todavía. Aceptarlo aquí
crearía existencias sin bitácora que las explique.

**`PosInventoryMovement`** — un hecho de inventario, con saldo antes y después.
**[R] Sin `updatedAt`**, igual que `InventoryMovement`: es la forma en que este
esquema dice «solo se añade». **[E]** Verificado contra `information_schema`.

**`PosInventoryMovementType`** — el vocabulario. Ver abajo.

### Por qué se guarda el saldo

**[R] Es el primer valor de existencias desnormalizado del repositorio, y la
duplicación es intencionada.** Una bitácora pura obligaría a recorrer toda la
historia para responder «¿cuántos filtros tengo?». El inventario de motocicletas
se libra de ese costo porque cada unidad ya es una fila; el del mostrador no.

**A cambio, toda mutación futura debe actualizar movimiento y saldo en la misma
transacción.** Esa es la obligación que compra la decisión, y el parche que
introduzca la primera mutación tendrá que sostenerla.

### El enum va en español

**[R] El encargo enunció los tipos en inglés.** Se implementaron en español porque
`InventoryMovementType` ya lo está —`INGRESO`, `VENTA`, `AJUSTE`,
`TRASLADO_SALIDA`, `TRASLADO_ENTRADA`— y dos enums de movimiento en dos idiomas,
uno al lado del otro, sería una marca permanente. Es el mismo criterio de §4 con
los estados de venta.

| Encargo | Implementado |
|---|---|
| INITIAL | `INICIAL` |
| PURCHASE | `COMPRA` |
| SALE | `VENTA` |
| ADJUSTMENT | `AJUSTE` |
| TRANSFER_IN | `TRASLADO_ENTRADA` |
| TRANSFER_OUT | `TRASLADO_SALIDA` |
| RETURN | `DEVOLUCION` |

La correspondencia es exacta y el cambio, si se prefiere en inglés, es una
migración de renombrado.

**[R] Enum propio y no reutilización de `InventoryMovementType`.** Aquel tiene
`RESERVA` y `ENTREGA`, que solo significan algo para una unidad serializada, y
carece de `INICIAL`, `COMPRA` y `DEVOLUCION`. Reutilizarlo importaría vocabulario
muerto y dejaría fuera la mitad del necesario.

### La cantidad del movimiento lleva signo

**[R]** Para que `quantityAfter = quantityBefore + quantity` valga para todo tipo
sin que el tipo tenga que codificar la dirección. Una entrada es positiva, una
salida negativa, y **la invariante es comprobable por sí sola**. **[E]** Verificada
en ambos sentidos.

**[R] Un movimiento de cero se rechaza**: un movimiento que no mueve nada no es un
movimiento. Mismo criterio que el motor de contabilización, donde un componente en
cero no genera líneas.

### El saldo negativo sigue sin decidirse

**[D] El repositorio no contiene ninguna regla que diga si las existencias pueden
bajar de cero**, así que este parche no la inventa. Los saldos admiten cero, y el
saneador **tampoco rechaza el negativo** — esconder esa regla dentro de un
saneador de forma sería el peor sitio para enterrarla. Que una venta pueda consumir
inventario que no hay es **P-8**.

### El costo sigue siendo descriptivo

**[R]** POS1.1-A introdujo `cost` como metadato. Sigue siendo solo descriptivo:
**no hay valoración de existencias**, ni promedio ponderado, ni PEPS, ni costo
específico. Queda fuera de este parche.

### Todo `RESTRICT`

**[R]** Borrar una bodega con saldo o un producto con historial debe fallar, no
arrastrar filas ni vaciar datos en silencio. Retirar una bodega se hace con
`isActive`, igual que un producto. **[E]** Verificado que el intento fallido no
borró ni la bodega ni sus saldos.

### La migración es aditiva

**[R] Un tipo y tres tablas.** Ninguna tabla, columna, restricción, índice o enum
existente se modifica. En particular `motorcycle_units`, `inventory_movements` y
`InventoryMovementType` quedan intactos. Las relaciones inversas añadidas a
`Branch`, `User` y `PosProduct` son **campos virtuales de Prisma y no generan
SQL**.

---

## 13. Ingresos de inventario (POS1.1-C)

**El primer flujo del repositorio que cambia existencias del mostrador.** Su
alcance es estrecho a propósito: registrar un ingreso manual. Ni compras, ni
proveedores, ni facturas, ni costeo, ni contabilidad, ni caja, ni traslados, ni
ajustes, ni consumo por venta.

### El contrato de mutación

Dentro de **una sola transacción** y en este orden:

1. Bloquear y leer el saldo (`SELECT … FOR UPDATE`).
2. Crear el movimiento con `antes`, `cantidad` y `después`.
3. Actualizar el saldo al `después`.

**Nunca un saldo sin movimiento; nunca un movimiento sin saldo actualizado.** Al
compartir transacción no existe estado intermedio observable. **[E]** Verificado
forzando el fallo justo entre el paso 2 y el 3: ni el movimiento ni el saldo
sobreviven.

**[R] El `después` que se escribe en el movimiento es el mismo objeto que se
guarda en el saldo**, no un recálculo. Dos cálculos separados podrían divergir;
uno solo, no.

**[R] La aritmética es en `Decimal`, no en punto flotante.** Un saldo que se
arrastra movimiento a movimiento no puede permitirse el error de coma flotante.
**[E]** Verificado: 2,5 + 0,125 da exactamente 2,625.

### La concurrencia: por qué bloqueo pesimista

**[R] `lockPosInventory` copia `lockJournalEntry`** de `contabilidad/actions.ts`,
que ya resuelve así el mismo problema. No se inventa un segundo patrón de
concurrencia para el mismo repositorio.

PostgreSQL trabaja en READ COMMITTED, donde leer y luego escribir un valor
calculado **sí** pierde actualizaciones. `FOR UPDATE` serializa a los competidores
sobre esa fila: el segundo espera al COMMIT del primero y lee el saldo ya
actualizado.

**Se descartó el incremento atómico** (`SET quantity = quantity + n`), que también
sería inmune a la actualización perdida, por dos razones:

1. **`quantityBefore` quedaría derivado, no leído.** En una bitácora de auditoría,
   calcular el «antes» restando del «después» es una ficción que se sostiene solo
   mientras nadie más escriba el saldo por otra vía.
2. **El contrato tiene que servir a los flujos que vienen.** Una venta que consume
   existencias necesita **decidir** —«¿hay suficiente?»— antes de escribir, y una
   decisión exige bloqueo: un incremento no puede rechazarse a sí mismo. Este
   parche fija el contrato que heredará todo flujo de inventario, así que se
   construye sobre lo que sí generaliza.

**[E] La prueba tiene dientes.** Diez ingresos simultáneos dejan el saldo en 10
exacto, y ningún par de movimientos comparte `quantityBefore`: encadenan 0→1→…→9.
Quitando el `FOR UPDATE` la misma prueba **falla**, con el saldo en 3 y los
«antes» colisionando en `0,1,1,1,1,1,2,2,2,2`. Una prueba de concurrencia que
también pasara sin el bloqueo no probaría nada, así que se comprobó que no pasa.

### Reglas de negocio

**[R] La cantidad es estrictamente positiva.** Se sanea con `sanitizePosQuantity`,
que **ya existía desde POS1.0-A** y significa exactamente eso: tres decimales,
mayor que cero. No se añadió un saneador nuevo para una regla ya escrita. Cero y
negativo se rechazan.

**[R] La bodega y el producto deben existir y estar activos**, y se comprueban
**dentro** de la transacción: lo leído antes de abrirla puede haber cambiado, y un
producto desactivado a medio camino no debe entrar igualmente.

**[R] El motivo es obligatorio**, como en `InventoryMovement`.

**[R] El ingreso no crea el saldo.** Si la fila de `PosInventory` no existe, se
rechaza: abrirla es responsabilidad de `openPosInventoryAction` (§12). Crearla
aquí de paso escondería una decisión —«este producto ahora se guarda en esta
bodega»— dentro de una operación que dice hacer otra cosa. **[E]** Verificado que
el rechazo tampoco la crea.

### El tipo del movimiento

**[R] Un ingreso manual se registra como `COMPRA`.** **[I]** Es el valor del
vocabulario que más se le parece, pero **un ingreso manual no es necesariamente
una compra**: puede ser una carga inicial o una corrección. El vocabulario de §12
no tiene un valor para «entrada manual sin origen», y añadir uno sin saber si el
negocio distingue esos casos sería inventarlo. Queda ligado a **P-9**.

### El saldo negativo sigue sin decidirse

**[R]** Un ingreso solo suma, así que **la pregunta no se le plantea**. P-8 sigue
abierta y la resolverá el parche que consuma existencias.

### Nada más cambió

**[E]** Cero asientos, contabilizaciones, documentos de caja, unidades de
motocicleta, movimientos de inventario serializado y ventas POS. El inventario de
motocicletas sigue completamente independiente.

---

## 14. Ajustes de inventario (POS1.1-D)

**El segundo flujo que cambia existencias**, y la prueba de que el contrato de
§13 se reutiliza sin modificarlo.

### Un solo motor, dos entradas

**[R] `applyPosInventoryMovement` es el motor** y lo comparten ingreso y ajuste
byte por byte: mismo bloqueo `FOR UPDATE`, mismo orden, misma transacción, misma
invariante. **No hay un segundo algoritmo de mutación, y no debe haberlo**: dos
implementaciones del mismo contrato son dos sitios donde puede olvidarse el
bloqueo.

**[R] La transacción de POS1.1-C no era reutilizable tal cual**, y la razón es
precisa: tenía incrustadas tres cosas que pertenecen al *ingreso*, no al motor —
el saneador estrictamente positivo, el tipo `COMPRA` fijo y el mensaje de
rechazo. **La respuesta fue extraer el motor, no duplicarlo.** El contrato
transaccional no cambió ni una línea.

Cada flujo aporta solo lo suyo:

| | Ingreso (POS1.1-C) | Ajuste (POS1.1-D) |
|---|---|---|
| Saneador | `sanitizePosQuantity` (POS1.0-A) | `sanitizePosMovementQuantity` (POS1.1-B) |
| Cantidad | Estrictamente positiva | **Con signo**, distinta de cero |
| Tipo | `COMPRA` | `AJUSTE` |

**[R] Ninguno de los dos saneadores es nuevo.** Los dos ya existían y significan
exactamente lo que cada flujo necesita. No se añadió aritmética.

### Por qué no se reutilizó el ajuste de motocicletas

**[R] Ya existe uno**: `inventory/shared.ts` declara
`{ value: "ADJUSTMENT", label: "Ajuste de inventario", status: "EXITED", movement: "AJUSTE" }`,
consumido por `registerEgress`.

**No es reutilizable.** Opera sobre una `MotorcycleUnit` serializada, la deja en
estado **terminal** `EXITED`, escribe `InventoryMovement` —que exige
`motorcycleUnitId`— y **no tiene cantidad**. Allí «ajuste» significa «esta moto
concreta salió del inventario», no «la cuenta cambió en n». `VoucherType.AJUSTE`
es un comprobante contable, otro dominio todavía.

### Terminología reutilizada

**[R] `reason` obligatorio + `notes` opcional** es lo que el repositorio ya usa
(4 y ~30 apariciones respectivamente). `comment` solo existe como `TicketComment`,
que es otra entidad; `observations` aparece una vez en `CreditApplication`.
`PosInventoryMovement` ya traía ese par exacto, así que **no hubo cambio de
esquema**: `AJUSTE` ya estaba en el enum y `quantity` ya llevaba signo.

### El saldo negativo: **este parche no decide** (P-8)

Un ajuste negativo mayor que el saldo lo deja bajo cero, y **no hay ninguna línea
que lo compruebe**.

**Eso no es permisividad nueva.** El repositorio nunca ha contenido esa regla,
`sanitizePosInventoryQuantity` ya lo documentaba desde §12, y escribirla aquí —en
cualquiera de los dos sentidos— sería inventar política de operación dentro de un
parche que dice hacer ajustes. **Rechazarlo en silencio y permitirlo por política
nueva son el mismo error con distinto signo.**

Lo que se preserva es la **ausencia** de la regla, y el smoke la verifica como
ausencia: un ajuste de −10 sobre un saldo de 4 lo deja en −6, la invariante se
sostiene, y la aserción dice explícitamente que el motor **no comprueba el signo**,
no que el negativo sea correcto.

### La prueba de concurrencia hubo que rehacerla

**[E]** La aserción de §13 —«ningún par de movimientos leyó el mismo saldo
anterior»— **es válida solo para ingresos**, porque todos suman y el saldo crece
de forma monótona. Con ajustes de signo mezclado el saldo sube y baja, vuelve a
pasar por el mismo valor, y dos movimientos pueden leerlo legítimamente: doce
ajustes concurrentes dieron `100,102,104,106,108,110,112,111,110,109,108,107`,
donde 110 y 108 se repiten **sin que nada esté mal**.

La prueba correcta con signos mezclados es que **la cadena no tenga roturas**: se
recorre desde el saldo inicial consumiendo movimientos, y todos tienen que
encajar. **[E]** Doce ajustes concurrentes —seis de +2 y seis de −1— dejan el
saldo en 106 exacto y encadenan sin huecos. Quitando el `FOR UPDATE` la misma
prueba falla con el saldo en 102 y tres movimientos huérfanos.

### Nada más cambió

**[E]** Cero asientos, contabilizaciones, documentos de caja, unidades de
motocicleta, movimientos de inventario serializado y ventas POS.

---

## 15. Consumo de existencias por venta (POS1.1-E)

**El primer flujo que consume inventario**, y el tercero que entra al mismo motor.
Aquí se rompe PL-1: **una venta completada ya descuenta existencias.**

### Dónde vive el consumo, y dónde no

**[R] El consumo pertenece a la transición a `COMPLETADA`, no al «cobro».** Y hay
dos caminos a ese estado: `checkoutPosSaleAction` (el mostrador) y
`completePosSaleAction` (la venta armada en el tiempo, desde `BORRADOR`).

**[R] Solo el cobro consume.** No por descuido: `completePosSaleAction` recibe un
`saleId` y **una venta no guarda bodega**, así que ese camino no puede decir de
dónde descontar sin que alguien invente la respuesta. Registrado como **P-12**, no
tapado: hoy una venta completada por la vía incremental **no descuenta**, y eso es
una incoherencia real del repositorio.

### La bodega se elige; no se deduce

**[R] `PosSale` no guarda bodega y una sucursal puede tener varias**
(`@@unique([branchId, code])`). El consumo no puede deducirla, y elegir por el
cajero —«la primera activa»— sería inventar una regla de selección que el
repositorio no contiene.

Por eso `checkoutPosSaleAction` recibe `warehouseId` **obligatorio** y la pantalla
lo ofrece en un selector, igual que la sucursal en §10. **Quien cobra dice de qué
bodega descuenta.** Sin bodegas activas el cobro queda deshabilitado y la pantalla
lo explica.

### La bodega tiene que ser de la sucursal donde se cobra

**[R] Esto no es una regla inventada**: `PosWarehouse.branchId` es obligatorio,
todo lo que tiene existencias en este repositorio está atado a una sucursal, y
mover existencias entre sucursales exige un traslado —que §12 excluyó a
propósito—. Sin la comprobación, una venta en Rosita descontaría de Granada **en
silencio** y descuadraría las dos.

**[D]** Si el negocio tiene una bodega central que surte a varias sucursales,
esto lo bloquea. Ver **P-14**. **[E]** Verificado que el cruce se rechaza y no
toca el saldo ajeno.

### El motor se reutiliza sin modificarlo

**[R] `applyPosInventoryMovement` no cambió ni una línea.** La venta es la tercera
entrada:

| | Ingreso | Ajuste | **Venta** |
|---|---|---|---|
| Saneador | `sanitizePosQuantity` | `sanitizePosMovementQuantity` | `sanitizePosQuantity` (la línea ya viene saneada) |
| Cantidad | Positiva | Con signo | **Negada al entrar**: consume |
| Tipo | `COMPRA` | `AJUSTE` | `VENTA` |

**No se añadió aritmética.** El signo lo pone el llamador negando la cantidad de
la línea, que es exactamente lo que el motor espera de todos.

### Todo dentro de la transacción del cobro

**[R] El consumo ocurre en la misma transacción que persiste la venta**, así que
no puede existir una venta completada sin su consumo ni un consumo sin su venta.
**[E]** Verificado forzando el fallo **después** de escribir el primer movimiento
de una venta de dos líneas: no sobrevive la venta, ni el movimiento ya escrito, ni
ningún saldo.

### Orden determinista de bloqueos

**[R] Las líneas se ordenan por `productId` antes de consumir.** Dos cobros
simultáneos que compartan artículos bloquearían sus saldos en el orden en que
llegan sus líneas; si un cajero vende A,B y otro B,A, cada transacción esperaría
al bloqueo que tiene la otra y PostgreSQL abortaría una por interbloqueo. Ordenar
hace que todos los cobros pidan los bloqueos en la misma secuencia, que es la
forma estándar de que un interbloqueo no pueda formarse.

### La concurrencia hereda las mismas garantías

**[E]** Diez cobros simultáneos del mismo artículo dejan el saldo en 90 exacto y
los diez consumos encadenan sin roturas. **Quitando el `FOR UPDATE` la prueba
falla**, con el saldo en 96 y seis consumos perdidos.

### Lo que no se decidió

**[R] Si hay existencias suficientes, no se comprueba.** Una venta puede dejar el
saldo bajo cero, exactamente como un ajuste negativo, porque **P-8 sigue sin
respuesta** y decidirla aquí sería inventarla. Es la misma ausencia de §12 y §14,
no una permisividad nueva.

**[R] El movimiento no referencia la venta.** No existe relación de
`PosInventoryMovement` a `PosSale`; la única traza es el `reason`, que dice
`Venta POS-…`. Es legible por una persona y **no es una clave foránea**: no se
puede preguntar «¿qué movimientos generó esta venta?» por relación. El encargo lo
listó como decisión de negocio, así que queda como **P-13**.

**[R] Anular una venta no devuelve existencias**, porque una venta de mostrador
nace `COMPLETADA` y es inmutable (§4). Cuando exista devolución habrá que
decidirlo: **P-15**.

### Nada más cambió

**[E]** Cero asientos, contabilizaciones, documentos de caja, unidades de
motocicleta y movimientos de inventario **serializado**. Los dos inventarios
siguen sin conocerse.

---

## 16. Órdenes de compra (POS1.2-A)

**Una orden de compra es solo una intención de comprar.** No mueve existencias,
no contabiliza, no genera caja, no crea cuenta por pagar y no registra factura.
Es el documento que la recepción consumirá.

### Fase 0

| Pregunta | Hallazgo |
|---|---|
| ¿Existe módulo de compras? | **No.** Ni modelo `Purchase*` ni `src/server/purchasing`. Los únicos «COMPRA» del repositorio son `ExpenseCategory.COMPRAS_VARIAS` —una categoría de gasto— y `PosInventoryMovementType.COMPRA` —un tipo de movimiento—. Ninguno es un documento de compra. |
| ¿Es `ThirdParty(PROVEEDOR)` el proveedor? | **Sí.** Con `taxId`, `isActive` y sucursal, ya referenciado por documentos contables y cuentas por cobrar. **Se reutiliza.** |
| ¿Se reutiliza la numeración de Contabilidad? | **Técnicamente sí, con un costo.** Ver abajo. |
| ¿Infraestructura de aprobación? | **No hay helper compartido.** El patrón es por modelo: `TransferOrder.approvedById/approvedAt` + enum. Se replica el patrón. |
| ¿Autorización por sucursal? | **Sí**: `canManageInventory` y `canAccessBranch`. |
| ¿Enum de estado reutilizable? | **No.** `TransferStatus` no tiene borrador ni recepción parcial y describe el traslado de una moto; `CashDocumentStatus` no tiene recepción. |

### El proveedor no se duplicó

**[R] No se creó un modelo `Supplier`.** `ThirdParty` con `type = PROVEEDOR` ya
era el agregado de proveedor. **[E]** La suite verifica que un tercero de tipo
`CLIENTE` se rechaza aunque sea un `ThirdParty` válido: el tipo se comprueba, no
se supone.

**[I]** `Expense.supplier` sigue siendo texto libre — un duplicado preexistente
del concepto que este parche no toca, porque normalizarlo es una migración de
datos ajena.

### La numeración es propia del contexto

**[D] No usa `allocateDocumentNumber`.** Esa función existe, está documentada como
el contrato de numeración y **no tenía llamador**. Se descartó por dos razones
concretas:

1. **Falla cerrado.** Sin una `DocumentSequence` configurada para la sucursal y el
   año fiscal, no emite número. Crear una orden exigiría configurar series antes,
   una fricción operativa que nadie pidió.
2. **Su clave es `FinancialDocumentSeries`**, cuyos siete valores son todos
   `CAJA_*` y `CONTABILIDAD_*`. Una orden de compra **no tiene efecto contable**;
   meterla ahí acoplaría compras al contexto financiero.

**[R] Se sigue el precedente hermano**: `OC-AAAAMMDD-XXXXXXXX`, como
`PosSale.saleNumber`, que POS1.0-A ya declaró «deliberadamente independiente de la
numeración de documentos contables». **[E]** Ocho órdenes concurrentes producen
ocho números distintos y el índice único impide el repetido. Si el negocio necesita
serie fiscal correlativa, es **P-21**.

### Los totales se derivan, nunca se aceptan

**[R] La entrada de la acción no tiene campo de total**, igual que el cobro. El
servidor los recalcula desde las líneas. **[E]** Verificado: 8 000 + 150 con
descuento 500 e impuesto 1 147,50 guarda 8 797,50 exacto, y la suma de los totales
de línea coincide con el total de la cabecera.

**[R] La aritmética se reutiliza tal cual.** `calculatePosLineTotal` y
`calculatePosSaleTotals` ya expresan `cantidad × precio − descuento + impuesto`,
que es la misma fórmula se compre o se venda. **El nombre dice «sale» porque
nacieron en la venta, no porque la operación sea distinta**; duplicarlas con otro
nombre sería la duplicación que TD-01 pasó un parche entero eliminando.

**[R] `unitCost`, no `unitPrice`.** Se compra a un costo; el precio es lo que se
cobra. La línea guarda el **negociado**, que puede diferir del `PosProduct.cost`
de catálogo — igual que `PosSaleItem` guarda el precio acordado.

### Solo un borrador es editable

**[R] La guarda vive en el `WHERE` de la escritura**, no solo en la lectura: si
otra transacción aprueba la orden entre la comprobación y la edición,
`updateMany` afecta cero filas y la operación se aborta. Mismo patrón que
`completePosSaleAction`.

**[E]** Verificado que una orden aprobada no admite cambio de cantidades, ni de
proveedor, ni de totales, y que no se puede aprobar dos veces. **[E]** Tres
aprobaciones concurrentes: gana exactamente una.

**[R] Las líneas se reemplazan, no se parchean.** Un borrador es un documento en
redacción; reemplazar evita inventar una semántica de fusión que nadie pidió.

### Anular

**[R] Una orden aprobada sí puede anularse mientras no haya llegado nada.** No es
invención: anular no deshace nada porque la recepción todavía no existe, y dejar
una orden aprobada sin forma de cerrarla sería una decisión peor tomada
igualmente. **Una orden recibida —total o parcialmente— no se anula**, porque
habría mercancía que la orden dejaría de explicar.

**[R] No hay acción de borrado.** El repositorio no borra en duro en ninguna
parte: retira con estado o con `isActive`. **[E]** Verificado que proveedor,
producto, sucursal y autor están protegidos por `RESTRICT`, y que borrar la orden
sí arrastra sus líneas, porque son su composición.

### Estados en español

**[R]** El encargo los enunció en inglés. `PosSaleStatus`, `TransferStatus`,
`CashDocumentStatus` y `ExpenseStatus` son todos españoles.

| Encargo | Implementado |
|---|---|
| DRAFT | `BORRADOR` |
| APPROVED | `APROBADA` |
| PARTIALLY_RECEIVED | `RECIBIDA_PARCIAL` |
| RECEIVED | `RECIBIDA` |
| CANCELLED | `ANULADA` |

Femenino porque «orden» lo es, igual que `PosSaleStatus` usa `COMPLETADA`.

**[R] `RECIBIDA_PARCIAL` y `RECIBIDA` existen pero nada las alcanza todavía.** Las
escribirá el parche de recepción; declararlas ahora evita una migración de enum
cuando llegue. **[E]** Los cinco son escribibles en el enum de PostgreSQL.

### Autorización

**[R] Reutiliza `canManageInventory` (ADMIN o GERENTE)**, el predicado que ya
responde «quién administra existencias». Comprar es traer existencias. Inventar un
permiso propio obligaría a concederlo en algún sitio y a mantener dos respuestas
para una pregunta — el mismo criterio con el que POS1.0-A reutilizó
`canOperateCaja`.

**[R] Un rol no global solo opera su sucursal**, con `canAccessBranch`.

### Nada más cambió

**[E]** Cero movimientos de inventario del mostrador, cero saldos creados, cero
asientos, contabilizaciones, documentos de caja, movimientos serializados y ventas
POS. Y `information_schema` confirma que `pos_purchase_orders` **no tiene ninguna
columna de pago, factura ni cuenta por pagar**.

---

## 17. Recepción de órdenes de compra (POS1.2-B)

**El cuarto llamador del motor de inventario**, y el primero que además avanza un
documento.

### Fase 0

| Pregunta | Hallazgo |
|---|---|
| ¿Cómo se persiste una orden? | Saneado fuera, `$transaction` con proveedor y productos verificados, totales derivados y `create` anidado. Las transiciones usan `updateMany` con el estado en el `WHERE`. |
| ¿Cómo se mutan existencias? | `applyPosInventoryMovement`: verifica bodega y producto, `FOR UPDATE`, lee, calcula en `Decimal`, escribe movimiento, actualiza saldo. |
| ¿Reutilizable sin modificar? | **Sí, sin tocar una línea.** |
| ¿Existe la recepción parcial? | **A medias.** `RECIBIDA_PARCIAL` estaba en el enum desde §16, pero **nada la alcanzaba**. |
| ¿Se exige bodega de la sucursal? | **Sí, pero solo en el cobro**, en línea dentro de `checkoutPosSaleAction`. |
| ¿Guarda la orden lo recibido? | **No.** Único cambio de esquema, e inevitable. |

### Una recepción es su propio flujo

**No es un ajuste, no es un ingreso manual y no es una venta.** Lo que la
distingue no es cómo mueve existencias —eso lo hace el mismo motor que los otros
tres— sino que además **avanza un documento**: actualiza lo recibido por línea y
recalcula el estado de la orden.

**[R] Esas tres cosas viven en una sola transacción.** Nunca inventario sin orden,
nunca orden sin inventario. **[E]** Verificado forzando el fallo tras mover las
existencias de la primera línea de dos: no sobrevive el movimiento, ni el saldo,
ni la cantidad recibida, ni el cambio de estado.

### Lo pendiente se deriva, no se guarda

**[R] La única columna nueva es `receivedQuantity`.** Lo pendiente es
`quantity − receivedQuantity` y se calcula en la capa de consultas: **dos cifras
que deben sumar siempre lo mismo son dos sitios donde pueden divergir**. **[E]**
`information_schema` confirma que la línea tiene `received_quantity` y **no** tiene
`pending_quantity`.

**[E]** 40 de 100 deja 60 pendientes; 61 se rechaza; los 60 restantes cierran la
orden; y una orden ya recibida no admite nada más. Con decimales exactos: 2,25
sobre 7,5 deja 5,25.

### El estado se deriva de las líneas

**[R] No lo declara quien llama.** Tras aplicar lo recibido se releen las líneas:
todas completas → `RECIBIDA`; alguna con algo recibido → `RECIBIDA_PARCIAL`. **Es
la única implementación que no puede mentir**: un estado declarado podría decir
«recibida» con líneas pendientes.

**[I] Una orden recibida entera de una sola vez pasa de `APROBADA` a `RECIBIDA`
directamente.** El encargo dibujó `APROBADA → RECIBIDA_PARCIAL → RECIBIDA` y dijo
«sin atajos»; marcar como parcial una entrega que llegó completa sería escribir un
hecho falso. Se leyó «sin atajos» como **«no se puede saltar a `RECIBIDA` mientras
quede algo pendiente»**, que es lo que el código garantiza. Es una desviación
consciente del dibujo literal.

### Por qué se bloquea también la orden

**[R] Bloquear el inventario no basta**, y el smoke lo demuestra **quitando** el
bloqueo de la cabecera. Dos recepciones simultáneas de la misma línea leen ambas
`recibido = 0` de una orden de 100, calculan ambas que caben 60 y pasan las dos la
validación. Después se serializan sobre el saldo —el `FOR UPDATE` del motor
funciona— pero **cada una escribe `0 + 60 = 60` en la línea**: una actualización
perdida.

El resultado medido es peor que recibir de más:

- el inventario sube **120**, con su bitácora cuadrando;
- la orden dice **60 recibidos y 40 pendientes**.

**La bitácora y el documento se descuadran entre sí**, y esos 40 «pendientes»
fantasma permitirían recibir hasta 160 unidades de una orden de 100.

**[R] El dato a proteger es lo pendiente, y vive en la orden**, así que la
cabecera se bloquea con `FOR UPDATE` **antes de leer las líneas**. **[E]** Con el
bloqueo, dos recepciones concurrentes de 60 sobre 100: gana exactamente una, lo
recibido queda en 60 y el inventario sube exactamente 60.

**[R] Orden de bloqueos: primero la orden, después los saldos**, estos ordenados
por producto. Una secuencia global fija es lo que impide el interbloqueo.

### La comprobación de bodega se extrajo, no se duplicó

**[R]** POS1.1-E metió «la bodega debe ser de la sucursal» en línea dentro del
cobro. La recepción la necesita igual, así que se extrajo a
`assertWarehouseBelongsToBranch` en vez de copiarla: **dos copias de la misma
regla son dos sitios donde una puede relajarse**.

**[R] Vive fuera del motor a propósito.** Un ingreso manual y un ajuste no tienen
sucursal propia contra la que comparar; una venta y una recepción sí, porque su
documento la lleva. Meterla en `applyPosInventoryMovement` obligaría al motor a
conocer documentos que no le incumben.

### Reglas de negocio

Se rechaza: cantidad cero o negativa, más de lo pendiente, bodega inactiva,
producto inactivo, proveedor inactivo, orden en borrador, orden anulada, orden ya
recibida, bodega de otra sucursal, línea que no pertenece a la orden, y **saldo no
abierto**. **[E]** Todo verificado, incluido que el rechazo por saldo inexistente
**no lo crea**: abrirlo sigue siendo responsabilidad de §12.

**[R] No se añadió ningún saneador.** `sanitizePosQuantity` ya significa
«estrictamente positiva, tres decimales».

**[R] El movimiento es de tipo `COMPRA`**, con motivo obligatorio que nombra la
orden y autor obligatorio. La traza hacia la orden sigue siendo **texto, no clave
foránea** — P-13 sigue abierta y ahora afecta también a la recepción.

### Nada más cambió

**[E]** Cero asientos, contabilizaciones, documentos de caja, movimientos de
inventario serializado y unidades de motocicleta. Ni facturas de proveedor, ni
cuentas por pagar, ni costeo, ni pagos, ni devoluciones.

---

## 18. Anulación de órdenes de compra (POS1.2-C)

Cierra el ciclo de vida del documento de compra.

### Fase 0

| Pregunta | Hallazgo |
|---|---|
| Estados | `BORRADOR`, `APROBADA`, `RECIBIDA_PARCIAL`, `RECIBIDA`, `ANULADA`. |
| Terminales | `RECIBIDA` y `ANULADA`. **`RECIBIDA_PARCIAL` no lo es**: aún admite recepciones. |
| ¿Existía la anulación? | **Sí**, desde §16. La mayor parte ya estaba implementada. |
| ¿`updateMany` con estado en el `WHERE`? | **Sí, es el patrón**: 7 usos en `pos`, 4 en `caja`, 15 en `contabilidad`. |
| ¿Transición optimista en aprobaciones? | **Sí**: leer → comprobar → `updateMany` guardado → `count === 1`. |
| ¿Algún flujo restaura inventario? | **Ninguno.** `DEVOLUCION` sigue siendo inalcanzable. |

### Anular solo cambia el estado del documento

**[R] No mueve inventario, no contabiliza, no genera caja y no crea deuda.**
Tampoco restaura existencias. **[E]** Verificado: el saldo de la bodega sigue en
cero tras anular, y cero asientos, contabilizaciones, documentos de caja y
movimientos serializados.

**[R] Las líneas de una orden anulada quedan intactas**: anular no borra el
documento, lo cierra.

### Un defecto de §16, corregido

**[R] El motivo se anexaba a `notes`**, que es un campo del usuario: mutarlo
destruía lo que hubiera escrito y dejaba el motivo imposible de leer por
separado. Ahora vive en `cancelledReason`, **columna propia**, como ya lo eran
quién y cuándo.

**[R] Caja guarda el motivo en `FinancialAuditEvent.reason`**, pero el POS no
tiene auditoría: `FinancialAuditDomain` solo admite `CAJA` y `CONTABILIDAD`
(inconsistencia I-2 de §12). Añadir un valor a ese enum para un contexto sin
efecto financiero acoplaría compras a la capa financiera.

### El motivo pasó a ser obligatorio

**[R] Siguiendo a `cancelCashDocumentAction`** de Caja, que lo exige con el
mensaje «Indica el motivo de la anulación interna». No es regla inventada aquí:
el repositorio ya decidió que una anulación sin motivo declarado no se registra.
§16 lo había dejado opcional.

### Defensa en profundidad sobre lo recibido

**[R] La comprobación de mercancía recibida es explícita**, aunque el estado ya la
implique. **La regla no debe depender de que la derivación del estado sea
correcta**: si un flujo futuro dejara una orden en `APROBADA` con líneas
recibidas, esta comprobación seguiría protegiendo. **[E]** El smoke construye a
propósito esa orden imposible y verifica que se rechaza por las cantidades.

### Concurrencia

**[R] Transición guardada, exactamente como la aprobación.** **[E]** Tres
anulaciones concurrentes: gana una, las otras fallan limpiamente sin excepción.

**[R] No hace falta `FOR UPDATE`**, a diferencia de la recepción (§17). Aquella
decide a partir de las **cantidades de las líneas**, que el `WHERE` del
`updateMany` no puede filtrar; anular decide a partir del **estado**, que sí está
en el `WHERE`. Añadir un bloqueo que la guarda ya cubre sería ceremonia.

### La pantalla, y por qué existe

**[R] Compras no tenía ninguna interfaz**: §16 y §17 fueron solo de servidor. Una
anulación que nadie puede alcanzar no es un flujo, y **la autorización es lo único
que las suites Prisma no pueden cubrir**, porque las acciones autorizan contra
cookie y los smokes reproducen el cuerpo transaccional sin ella.

`/panel/pos/compras` lista y anula. Nada más: no crea órdenes, no las aprueba y no
recibe. **[R] La regla de qué se puede anular no se reimplementa en la pantalla**:
viene resuelta en `cancellable`, derivada en la capa de consultas desde la misma
condición que aplica el servidor.

**[R] Autorización con `canManageInventory` (ADMIN o GERENTE)**, no con el permiso
del mostrador: comprar es traer existencias, no cobrar.

---

## 19. Devoluciones a proveedor (POS1.2-D)

**El primer flujo del repositorio que revierte existencias después de
recibirlas**, y el quinto llamador del mismo motor.

### Fase 0

| Pregunta | Respuesta |
|---|---|
| ¿Se reutiliza `applyPosInventoryMovement` sin cambios? | **Sí.** Recibe cantidad con signo y tipo; la devolución solo aporta el signo negativo y `DEVOLUCION`. |
| ¿`DEVOLUCION` está en el enum? | **Sí, desde §12 — y nada la escribía.** Los cuatro tipos en uso eran `COMPRA`, `VENTA` y `AJUSTE`. Llevaba cuatro parches declarada e inalcanzable; este es el que la alcanza. |
| ¿Se guardan cantidades devueltas? | **No.** La línea solo tenía `quantity` y `receivedQuantity`. |
| ¿Puede haber varias devoluciones? | Nada lo impide, y el esquema acumula. **[E]** Verificado con tres devoluciones sucesivas. |
| ¿Puede devolverse más de lo recibido? | Hoy nada lo impedía porque no existían devoluciones. Ahora se rechaza. |
| ¿Algún flujo restauraba inventario? | **Ninguno.** |

### Lo devuelto no se puede derivar

**[R] La única fuente sería sumar los movimientos `DEVOLUCION` de la orden, pero
`PosInventoryMovement` no tiene relación con la orden** — **P-13**, abierta desde
§15. Su única traza es el texto del motivo. Calcular una cantidad de control
parseando texto libre sería peor que guardarla.

De ahí la única columna nueva: `returnedQuantity`. **[E]** `information_schema`
confirma que la línea guarda **pedido, recibido y devuelto**, y ninguno de los dos
derivados (`pendingQuantity`, `returnableQuantity`), que se calculan en la capa de
consultas.

### Las tres cantidades no se contradicen

```
pedido      quantity
recibido    receivedQuantity        ≤ pedido
devuelto    returnedQuantity        ≤ recibido
pendiente   quantity − recibido     (derivado)
devolvible  recibido − devuelto     (derivado)
```

**[R] Devolver se limita a lo recibido, no a lo pedido.** **[E]** Verificado: sobre
una línea de 20 pedidos con 12 recibidos, lo devolvible es 12 y un intento de 13
se rechaza.

### Dos cosas que este parche **no** decide

**[D] Lo pendiente no cambia. — P-28.** `quantity − receivedQuantity` sigue siendo
la fórmula de §17. Si una devolución **reabre** la línea —el proveedor debe
reponer— o la **cierra** —se da por perdida—, es una decisión de negocio; cambiar
la fórmula aquí alteraría en silencio lo que la recepción ya significa. **[E]**
Verificado que devolver 10 de 100 recibidos deja lo pendiente en 0.

**[D] El estado de la orden no cambia. — P-29.** Devolver todo lo recibido de una
orden `RECIBIDA` la deja `RECIBIDA`. Introducir una transición que nadie
especificó —¿vuelve a `APROBADA`?, ¿a `RECIBIDA_PARCIAL`?— sería inventar la
máquina de estados. Preservarla no es decidir.

**[D] El saldo puede quedar negativo** si se devuelve algo ya vendido: la misma
ausencia de **P-8**, no permisividad nueva.

### Por qué también se bloquea la orden

**[R] Idéntico a §17, y por la razón exacta.** Lo que hay que proteger es cuánto
queda devolvible, y ese dato vive en la **orden**, no en el saldo: el `FOR UPDATE`
del motor serializa el saldo, no la línea.

**[E] Comprobado quitando el bloqueo de la cabecera.** Dos devoluciones
simultáneas de 30 sobre 50 recibidos leen ambas `devuelto = 0`, ambas creen que
caben, y ambas escriben `0 + 30 = 30`:

- el inventario baja **60**, con su bitácora cuadrando;
- el documento registra **30 devueltos**.

**Bitácora y documento se descuadran entre sí**, exactamente el fallo de §17. Con
el bloqueo, gana una: devuelto 30 e inventario −30.

**[R] Orden de bloqueos: primero la orden, después los saldos ordenados por
producto** — la misma secuencia global que el cobro y la recepción, que es lo que
impide interbloqueos entre los tres.

### Reglas de negocio

**[R] El motivo es obligatorio**, como en la anulación (§18) y en todo movimiento
de inventario. Mercancía que sale sin motivo declarado no se registra.

Se rechaza: cantidad cero o negativa, más de lo recibido, línea ya devuelta por
completo, motivo vacío, bodega inactiva, bodega de otra sucursal, producto
inactivo, proveedor inactivo, línea de otra orden, saldo no abierto, orden en
borrador o aprobada —**todavía no ha recibido mercancía**— y orden anulada, que
por §18 nunca llegó a recibir nada.

**[R] Ningún saneador nuevo.** `sanitizePosQuantity` ya significa «estrictamente
positiva, tres decimales»; el signo lo pone el llamador.

### Nada más se mueve

**[E]** Cero asientos, contabilizaciones, documentos de caja, cuentas por cobrar o
pagar, movimientos de inventario serializado y unidades de motocicleta. Ni nota
de crédito, ni ajuste de precio de compra, ni valoración, ni pago, ni saldo de
proveedor.

---

## 20. Historial y trazabilidad de compras (POS1.2-E)

Hace observable el ciclo de vida de una orden. No añade flujo, no cambia reglas de
inventario, no toca totales, no contabiliza y no crea deuda.

### Fase 0: qué se podía reconstruir y qué no

| Hecho | ¿Reconstruible con lo que había? |
|---|---|
| Orden creada | **Sí** — `createdAt` + `createdByUserId`. |
| Orden aprobada | **Sí** — `approvedAt` + `approvedById`. |
| Orden anulada | **Sí** — `cancelledAt` + `cancelledById` + `cancelledReason`. |
| Recepción parcial | **No.** |
| Recepción total | **No.** |
| Devolución | **No.** |

**[R] `receivedQuantity` y `returnedQuantity` son acumulados.** Tres recepciones de
40, 40 y 20 dejan un 100 que **no dice cuándo ocurrió cada una, quién la hizo ni de
cuánto fue**. La otra fuente posible —los movimientos de inventario— no sirve:
`PosInventoryMovement` no referencia la orden (**P-13**) y su única traza es el
texto del motivo, que está descartado como fuente. `updatedAt` tampoco: marca el
último cambio, no un hecho.

### Por qué una tabla, y por qué registra también lo reconstruible

**[R] `PosPurchaseOrderEvent`**, una bitácora por agregado. Fue necesaria porque
tres de los seis hechos no se podían reconstruir sin adivinar.

**[R] Registra los seis, no solo los tres que faltaban.** Si guardara únicamente
recepciones y devoluciones, una orden anterior a este parche mostraría su creación
y su aprobación —datos reales— y **ninguna recepción**: una línea de tiempo que
aparenta estar entera y no lo está. Con la bitácora uniforme, una orden sin eventos
dice exactamente eso, y la pantalla lo enuncia.

**[I] La duplicación es de tres marcas de tiempo inmutables**, no de estado
mutable: aprobar y anular ocurren una sola vez y no pueden divergir de su columna.
No es el caso de «pendiente», que se deriva siempre.

**[R] Copia la forma de `TicketEvent`** —la bitácora por agregado que el
repositorio ya tenía—: atada al padre con `Cascade`, solo-añadir, indexada por
padre y fecha. **[R] Diverge en una cosa**: tipo enumerado y columnas tipadas en
vez de `action String` + `metadata Json`, porque una cantidad de inventario dentro
de un blob no la valida nadie.

**[R] Ningún concepto financiero.** **[E]** `information_schema` confirma que no hay
columna que case con importe, costo, precio, deuda ni saldo.

### Dos tipos de recepción, y por qué

**[R] `RECEPCION_PARCIAL` y `RECEPCION_TOTAL` son dos tipos, no uno con un campo
derivado.** Que una recepción cerrara la orden es un hecho **de ese momento** que
deja de ser recuperable: una devolución posterior cambia las cantidades y entonces
ya no hay forma de saberlo. Guardarlo al escribir conserva información que si no se
perdería.

**[R] Un evento por línea.** Una recepción de 10 cascos y 2,5 litros no tiene un
total con sentido. Todos los eventos de una operación comparten su tipo y su
instante.

### Atomicidad e idempotencia

**[R] El evento se escribe en la transacción de la operación, y siempre después de
su guarda.** Las dos cosas importan:

- **Dentro de la transacción**, para que un fallo posterior se lo lleve: una
  bitácora que registra lo que no ocurrió es peor que no tenerla. **[E]** Verificado
  con una creación y una recepción forzadas a fallar.
- **Después del `updateMany` con `count === 1`**, para que **una transición que
  pierde una carrera no deje rastro**. **[E]** Verificado: tres aprobaciones
  concurrentes dejan **un** evento `APROBADA`; dos anulaciones, **un** `ANULADA`.

### La consulta

**[R] Determinista**: fecha ascendente y, a igualdad de milisegundo, id. El empate
es normal —una recepción de dos líneas escribe dos eventos en la misma
transacción— y sin el segundo criterio la pantalla mostraría un orden distinto en
cada carga. **[E]** Verificado que dos consultas devuelven la misma secuencia.

**[R] No expone internos.** Devuelve nombres, etiquetas y cantidades: ni ids de
movimiento, ni tipos de Prisma, ni el ledger. **La pantalla no reconstruye nada.**

### La pantalla

**[R] Deliberadamente pequeña**: la fila de `/panel/pos/compras` se despliega y
muestra el historial. No es una pantalla nueva ni un rediseño; el rediseño del
módulo es POS2.0-B/C. Reutiliza la forma visual de `FinancialAuditTimeline` sin
extraer un componente compartido: los dos consumen DTOs distintos, y abstraer dos
usos con campos diferentes cuesta más de lo que ahorra.

### Limitación registrada

**[R] Las órdenes anteriores a este parche no tienen historial, y no se les
fabricó.** La bitácora empieza aquí. **[E]** Verificado: una orden escrita con la
forma anterior —con `approvedAt` y `receivedQuantity` poblados— devuelve cero
eventos, y la pantalla lo dice en vez de mostrar una lista vacía.

### El límite de 5 s de Prisma, que este parche hizo visible

**[E] La suite de navegador falló donde ninguna suite Prisma podía fallar.** La
anulación abortó con `P2028`: *«The timeout for this transaction was 5000 ms,
however 5253 ms passed»*, justo al escribir el evento — la última sentencia de su
transacción.

**[I] La causa no es la bitácora, aunque la disparara.** Una recepción de diez
líneas hace del orden de **sesenta consultas dentro de la transacción**: bloqueo de
la cabecera, lectura de las líneas y, por cada línea, dos lecturas del motor, el
bloqueo del saldo, el movimiento, la actualización del saldo, la de la línea y su
evento. A 80 ms por consulta —lo que cuesta un servidor cargado— eso ya son 4,8 s.
**El límite estaba al borde antes de este parche**; añadir una consulta lo cruzó.

**[R] Las seis transacciones del ciclo de compra pasan a declarar `timeout:
20_000`.** Veinte segundos, no «mucho»: un techo alto sobre transacciones que
sostienen `FOR UPDATE` alarga el bloqueo de las demás cuando una se atasca. Veinte
da margen de sobra al caso legítimo más pesado y sigue cortando una colgada.

**[R] `maxWait` no se toca.** Es otro problema —esperar conexión del pool, no
ejecutar— y subirlo solo alargaría la espera ante un pool saturado. Ver **P-31**.

**[D] El cobro (`checkoutPosSaleAction`) tiene la misma forma y el mismo riesgo
latente**, y **no se cambió**: este parche no le añadió trabajo, y tocar su
transacción merece su propia justificación. Registrado como **P-32**.

### Un hallazgo de las pruebas, ajeno a este parche

**[E] Bajo la corrida secuencial de las 23 suites, tres pruebas de concurrencia
fallaban de forma intermitente** con `Transaction API error: Unable to start a
transaction in the given time`. Es el `maxWait` de Prisma —el tiempo que una
transacción espera **una conexión del pool**—, no el bloqueo: la cadena quedaba
intacta y el saldo cuadraba con las aceptadas.

**Las aserciones eran mías y eran demasiado fuertes.** «Las diez concurrentes se
aceptan» es una afirmación sobre la capacidad del pool, no sobre la corrección.
Ahora las tres comprueban lo que el bloqueo sí garantiza: **lo aceptado cuadra
exactamente**, para cualquier número de ganadoras.

**[I] El límite de capacidad es real y queda registrado como P-31**: con suficiente
concurrencia sobre el mismo artículo, algunos cobros fallan por conexión y el
cajero ve «No se pudo registrar la venta». No se pierde inventario, pero el
dimensionamiento del pool es una decisión de operación que nadie ha tomado.

**[E] Y una prueba mía estaba mal escrita.** El recorrido de la cadena de POS1.1-D
era voraz: con signos mezclados el saldo revisita valores, hay varias
continuaciones en cada paso, y elegir mal lleva a un callejón sin salida **aunque
exista una cadena válida** — búsqueda con retroceso disfrazada de bucle. Se
reemplazó por una igualdad de multiconjuntos: **los «antes» más el final deben
igualar a los «después» más el inicio**, que no recorre nada y detecta la
actualización perdida igual. Verificado quitando el bloqueo.

---

## 21. Cierre del módulo de compras (POS1.2-F)

No añade capacidades. Cierra POS1.2: audita lo que POS1.2-A..E dejaron, arregla
las contradicciones internas que encontró, hace alcanzable lo que solo existía en
el servidor y fija todo con pruebas.

### Fase 0: lo que la auditoría encontró

**Dos contradicciones internas reales**, ambas corregidas aquí:

1. **La edición no se defendía como la anulación.** `cancelPosPurchaseOrderAction`
   comprobaba, además del estado, que ninguna línea tuviera mercancía recibida.
   `updatePosPurchaseOrderAction` solo comprobaba el estado — y edita haciendo
   `deleteMany` de las líneas. Una orden en `BORRADOR` con recepciones (estado que
   ninguna transición legítima produce, pero que la base admite) habría perdido en
   silencio el registro de lo recibido, dejando existencias sin documento. Ahora
   rechaza igual que la anulación. **[E]** Es defensa en profundidad, no una
   regla nueva: por las transiciones normales el caso no ocurre.

2. **Cuatro de las seis acciones no tenían forma de ejecutarse.** Solo anular
   llegaba a la aplicación. Crear, aprobar, recibir y devolver eran código de
   servidor sin puerta. Un flujo que nadie puede ejecutar no está cerrado.

**Un hueco de trazabilidad, registrado y no tapado**: `updatePosPurchaseOrderAction`
no escribe evento. Editar un borrador es el único cambio del ciclo que la bitácora
no ve. **[I]** No se inventó un tipo de evento para taparlo: qué debe registrar la
edición de un borrador —¿el hecho?, ¿el diferencial de líneas?— es decisión de
negocio. Queda como **P-33**.

**Lo que la auditoría confirmó sano**: un solo motor de inventario, autorización
uniforme en las seis acciones, contabilización nula, y ninguna regla de negocio
duplicada entre acción y consulta.

### Matriz del ciclo de vida

Refleja la implementación, no el encargo.

| Acción | Estados admitidos | Cambia documento | Cambia inventario | Escribe historia |
|---|---|---|---|---|
| **Crear** | — (nace en `BORRADOR`) | Sí: cabecera, líneas y totales derivados | No | `CREADA` |
| **Editar** | `BORRADOR` **y sin mercancía movida** | Sí: reemplaza líneas y totales | No | **No** (P-33) |
| **Aprobar** | `BORRADOR` con ≥1 línea | Sí: `APROBADA`, aprobador y fecha | No | `APROBADA` |
| **Recibir** | `APROBADA`, `RECIBIDA_PARCIAL` | Sí: `receivedQuantity`, y estado derivado de las líneas | **Sí**: `COMPRA` positiva | `RECEPCION_PARCIAL` o `RECEPCION_TOTAL`, **una por línea** |
| **Devolver** | `RECIBIDA`, `RECIBIDA_PARCIAL` | Sí: `returnedQuantity`. **No toca el estado ni lo pendiente** | **Sí**: `DEVOLUCION` negativa | `DEVOLUCION`, una por línea, con motivo |
| **Anular** | `BORRADOR`, `APROBADA`, **y sin mercancía recibida** | Sí: `ANULADA`, anulador, fecha y motivo | No | `ANULADA`, con motivo |

Dos comportamientos **intencionales y hasta ahora sin documentar**:

- **Una orden recibida entera de una vez pasa de `APROBADA` a `RECIBIDA`**, sin
  escala en `RECIBIDA_PARCIAL`. Marcar como parcial una entrega completa sería
  escribir un hecho falso.
- **El estado se deriva releyendo las líneas**, nunca lo declara quien llama. Es
  la única implementación que no puede mentir.

`ANULADA` es terminal (P-17). Devolver no reabre lo pendiente (P-28) ni cambia el
estado (P-29): ambas siguen abiertas y **la conducta actual queda fijada por
pruebas**, que no es lo mismo que aprobarla.

### Matriz de autorización

**[E]** Leída del código, no del encargo. Las seis acciones llaman a
`authorizePurchasing()`, que exige `canManageInventory` — `ADMIN` o `GERENTE` — y
además `canAccessBranch` sobre la sucursal del documento.

| Operación | Permiso | Quién |
|---|---|---|
| Crear | `canManageInventory` | ADMIN, GERENTE |
| Editar | `canManageInventory` | ADMIN, GERENTE |
| Aprobar | `canManageInventory` | ADMIN, GERENTE |
| Recibir | `canManageInventory` | ADMIN, GERENTE |
| Devolver | `canManageInventory` | ADMIN, GERENTE |
| Anular | `canManageInventory` | ADMIN, GERENTE |
| Ver historial | `canManageInventory` (la página del detalle) | ADMIN, GERENTE |

**El modelo de permisos no distingue entre estas operaciones.** No se introdujo un
permiso nuevo: separarlas es política de control interno, no una carencia técnica.
La limitación ya estaba registrada en **P-16** (¿aprobar exige supervisor?) y
**P-24** (¿debe recibir bodega y no compras?), y ahí sigue.

**La interfaz no es la frontera de seguridad.** El detalle decide qué botones
enseña con `derivePosPurchaseAbilities`, que viaja al navegador; cada acción
reautoriza y revalida en el servidor. **[E]** Comprobado en navegador: un contador
no obtiene el formulario de creación ni el detalle, y el HTML que emite el
servidor no contiene ni las marcas de la pantalla ni el número de la orden.

### Alcanzabilidad de la interfaz

| Flujo | Antes de POS1.2-F | Ahora |
|---|---|---|
| Lista | `/panel/pos/compras` | igual |
| Detalle | **inalcanzable** | `/panel/pos/compras/[orderId]` |
| Crear | **inalcanzable** | `/panel/pos/compras/nueva` |
| Aprobar | **inalcanzable** | detalle |
| Recibir | **inalcanzable** | detalle, con bodega y cantidad por línea |
| Devolver | **inalcanzable** | detalle, con bodega, motivo y cantidad por línea |
| Anular | lista | lista **y** detalle |
| Historial | lista (desplegable) | lista **y** detalle |

**Editar sigue siendo solo de servidor**, a propósito: es la única acción cuya
pantalla exigiría decidir antes qué registra la bitácora al editar (P-33).
Exponerla sin esa respuesta dejaría un cambio de documento sin rastro.

Sin rediseño: primitivas existentes, sin tarjetas de indicadores, sin gráficos,
sin filtros. El lenguaje visual es trabajo de POS2.0.

### Invariantes de cantidad

`0 ≤ devuelto ≤ recibido ≤ pedido`, en toda línea y en todo momento.

Se sostienen **donde se producen**, no repetidas por capas: recibir valida contra
`pedido − recibido` y devolver contra `recibido − devuelto`, ambas bajo el bloqueo
de la cabecera. Lo pendiente y lo devolvible **siguen derivándose** en la capa de
consultas; no se almacenan. **[E]** La suite las comprueba sobre *todas* las
líneas que dejó, no solo sobre las que manipuló.

### Invariante del inventario

**[E] Comprobado estructuralmente, leyendo el código fuente desde la prueba**:
en todo `src/server/pos/actions.ts` hay **exactamente una** escritura de
movimiento, **una** actualización de saldo y **un** bloqueo de saldo, las tres
dentro de `applyPosInventoryMovement`. Ninguna acción de compra toca Prisma para
mover existencias. Recepción → `COMPRA` positiva; devolución → `DEVOLUCION`
negativa; compras no escribe ningún otro tipo.

Y **el saldo de cada par bodega+producto es la suma de su bitácora**, comprobado
tanto en la suite Prisma como después de operar por la pantalla.

### Fronteras transaccionales

Las seis transacciones declaran `PURCHASE_TX` (20 s). Orden de bloqueos
preservado: cabecera primero, líneas ordenadas por `productId` después.

**[E] El rollback se probó con un fallo posterior a la primera escritura**, no con
un rechazo de validación previa: una recepción de dos líneas donde la segunda es
un producto sin saldo abierto en la bodega. La primera ya había creado su
movimiento y actualizado su saldo cuando el motor rechaza la segunda; al terminar
no queda movimiento, ni saldo cambiado, ni evento, ni cantidad recibida, y la
orden sigue `APROBADA`. **Un rechazo por validación previa no prueba rollback: no
había nada que deshacer.**

### Integridad de la bitácora

**[E]** Cada evento tiene orden, autor, fecha y tipo; solo recepciones y
devoluciones llevan cantidad y producto; la devolución conserva su motivo; **la
suma de los eventos de recepción de una línea iguala lo que la línea acumuló**; y
una operación deshecha no deja ninguno, porque el evento se escribe en la misma
transacción. Bajo tres aprobaciones concurrentes gana una y **queda un solo evento
`APROBADA`**, porque el evento se escribe después del guardia de transición.

Las órdenes anteriores a POS1.2-E siguen **sin historia fabricada**, y la pantalla
lo enuncia en vez de fingir una lista vacía.

### P-8 sigue sin resolverse

No se añadió comprobación de existencia suficiente. **[E]** La suite lo verifica
como ausencia: ninguna acción de compra contiene una validación de saldo
insuficiente. El inventario puede quedar negativo, que es la política vigente del
repositorio. Cerrar el módulo no era ocasión para decidir política de negocio.

### Clasificación de las decisiones abiertas

| Estado | P-items |
|---|---|
| **Resueltas por implementación** | **P-19** (una orden se recibe en varias entregas; `RECIBIDA_PARCIAL` ya se alcanza — *una bodega por recepción*, ver P-23) |
| **Siguen abiertas, dentro de compras** | P-16, P-18, P-20, P-21, P-23, P-24, P-25, P-26, P-27, P-28, P-29, P-30, **P-33** |
| **Siguen abiertas, transversales** | P-8, P-13, P-17, P-31 |
| **Fuera del alcance de POS1.2** | P-14, P-15 (venta), P-32 (cobro) |

**P-13** —¿debe el movimiento referenciar el documento?— es la única que el cierre
vuelve más visible: la recepción nombra la orden en el texto del motivo, no por
relación. Preguntar «qué movimientos generó esta orden» sigue sin tener respuesta
consultable. Se deja abierta: crear la relación es modelado de dominio, no cierre.

### El límite exacto de POS1.2

**Dentro**: catálogo de órdenes, aprobación, recepción total y parcial,
devolución a proveedor, anulación, historial por agregado, y el efecto sobre el
inventario propio del POS.

**Fuera, y sin una sola línea escrita**: factura de proveedor, cuentas por pagar,
pagos, saldo de proveedor, contabilización, costeo y valoración, notas de crédito,
traslados entre bodegas, y analítica de compras. **[E]** Comprobado contando
asientos, contabilizaciones, documentos de caja, cuentas por cobrar, pagos,
movimientos serializados y unidades de motocicleta antes y después del ciclo
completo, y confirmando con `information_schema` que ninguna tabla del módulo
tiene columna de pago, factura ni deuda.

---

## 22. Qué verificó la suite

**[E] SMOKE-POS1.0-A — 52 aserciones, 0 fallas** contra PostgreSQL real:
aritmética de línea y de venta incluido el piso en cero · borrador sin importes y
sin cliente · agregar artículos recalcula el agregado · el precio sale del
catálogo cuando no se indica y admite precio manual · producto inactivo
rechazado · quitar un artículo recalcula · varios pagos por método · completar
sella la fecha · **una completada es inmutable en las cuatro vías** · completar
sin artículos rechazado · anular un borrador · número de venta duplicado
impedido por el índice · SKU y código de barras únicos · compleción concurrente
con una sola ganadora · rollback sin rastro · **y el POS no crea asientos,
contabilizaciones, documentos de caja ni movimientos de inventario**.

**No cubierto**: la autorización, como en todas las suites Prisma — reproducen el
cuerpo transaccional porque las acciones autorizan contra cookie de sesión.

**[E] SUITE-POS1.0-D — 22 pruebas, 22 en verde** en navegador real contra base
real, con inicio de sesión real como administrador: cobro en efectivo · número de
venta generado por el servidor con el formato esperado · pago mixto de dos
métodos · **totales guardados iguales a los derivados de las líneas**, no a los
que mostró el navegador · descuento e impuesto por línea · precio corregido a
mano · venta sin cliente · venta con cliente · notas · **el carrito se vacía tras
cobrar** · un segundo cobro seguido no duplica · sin artículos no se puede cobrar
· **producto desactivado a media venta: el cobro falla y no deja nada** · la venta
aparece tras recargar por la capa de consultas · el saldo se muestra mientras se
cobra · **cero asientos, contabilizaciones, documentos de caja y movimientos de
inventario** medidos antes y después · un rol global elige sucursal y ahí queda la
venta · cobro activable con teclado · usable en móvil sin desbordamiento
horizontal.

· un monto de pago inválido se rechaza en vez de descartarse · una fila de pago
vacía no impide cobrar.

Esta suite **sí** cubre la autorización: entra por el formulario de acceso real.

**[E] SMOKE-POS1.1-A — 66 aserciones, 0 fallas** contra PostgreSQL real: **un
producto con la forma anterior al parche sigue siendo creable** y adquiere los
diez valores por defecto inertes · categorías y marcas con unicidad de nombre ·
creación con los nueve metadatos, incluido un punto de reposición mayor que la
existencia mínima · edición, reasignación y desasignación de categoría y marca ·
**`RESTRICT` verificado**: no se borra una categoría en uso y el intento fallido
no vacía el dato · categoría inexistente rechazada por la clave foránea · **SKU y
código de barras siguen siendo únicos**, y varios productos sin código conviven ·
saneadores de tasa (0, 15, 100, 101, negativa, no finita, redondeo) y de umbral
(cero válido, negativo no) · **las ocho unidades del vocabulario TypeScript son
escribibles en el enum de PostgreSQL** · y **nada de inventario, contabilidad,
caja ni ventas**, con `information_schema` comprobando que `pos_products` no
tiene columna `stock`, `quantity` ni `on_hand`.

**[E] SMOKE-POS1.1-B — 51 aserciones, 0 fallas** contra PostgreSQL real: bodega
creada, activa por defecto y atada a sucursal · **código duplicado rechazado en la
misma sucursal y aceptado en otra** · dos bodegas por sucursal · retiro con
`isActive` · fila de saldo creada **en cero** · **un producto no puede tener dos
saldos en la misma bodega** y sí en bodegas distintas · varios productos por
bodega · movimiento con motivo y autor obligatorios · **la invariante
`después = antes + cantidad` en entrada y en salida** · tres decimales
sobrevivientes · los siete tipos escribibles en el enum de PostgreSQL ·
**`RESTRICT` verificado**: no se borra bodega en uso ni producto con saldo, y el
intento fallido no borra nada · claves foráneas rechazando bodega y producto
inexistentes · saneadores (movimiento de cero rechazado, saldo negativo
**aceptado** porque P-8 sigue abierta) · **cero unidades de motocicleta y cero
`InventoryMovement`**, con `information_schema` confirmando que ninguna tabla
nueva menciona motocicletas · cero asientos, contabilizaciones, documentos de caja
y ventas · la bitácora **sin `updated_at`** · y **ningún saldo movido: todos
siguen en cero al terminar**, que es la promesa central del parche.

**[E] SMOKE-POS1.1-C — 50 aserciones, 0 fallas** contra PostgreSQL real: primer
ingreso sobre saldo cero · ingresos sucesivos que acumulan · **decimales exactos
(2,5 + 0,125 = 2,625)** · productos y bodegas independientes · cantidad cero y
negativa rechazadas · bodega inactiva y producto inactivo rechazados · motivo
vacío rechazado · **sin saldo abierto el ingreso se rechaza y no lo crea** ·
claves foráneas y `RESTRICT` sobre bodega, producto y autor · **la invariante
`después = antes + cantidad` en todos los movimientos** · **el saldo guardado
coincide con la suma de su bitácora** · **un fallo forzado entre el movimiento y
el saldo no deja ninguno de los dos** · **diez ingresos concurrentes dejan el
saldo en 10 exacto, sin dos movimientos que compartan `quantityBefore`** · y cero
asientos, contabilizaciones, documentos de caja, unidades de motocicleta,
movimientos serializados y ventas POS.

**[E] La prueba de concurrencia se validó quitando el bloqueo**: sin `FOR UPDATE`
la misma suite falla, con el saldo en 3 en vez de 10 y los «antes» colisionando en

**[E] SMOKE-POS1.1-D — 53 aserciones, 0 fallas** contra PostgreSQL real: ajuste
positivo y **ajuste negativo** · decimales exactos (10 − 0,375 = 9,625) · ajuste
sobre saldo cero sin ingreso previo · ajustes sucesivos encadenados · **P-8
preservada como ausencia**: −10 sobre 4 deja −6 y el motor no comprueba el signo ·
cantidad cero y motivo vacío rechazados · bodega inactiva y producto inactivo
rechazados · **sin saldo abierto se rechaza y no lo crea** · claves foráneas y
`RESTRICT` sobre bodega, producto y autor · **la invariante en todos los
movimientos, también bajo cero** · **el saldo coincide con la suma de su bitácora
en tres productos** · **un fallo forzado entre movimiento y saldo no deja
ninguno** · **doce ajustes concurrentes mezclados (+2 × 6, −1 × 6) dejan 106
exacto y encadenan sin roturas** · **ingreso y ajuste comparten motor**,
verificado porque ambos tipos cumplen la misma invariante y llevan motivo y autor,
y ningún ingreso es negativo · y cero asientos, contabilizaciones, documentos de
caja, unidades de motocicleta, movimientos serializados y ventas POS.

**[E] También aquí se validó la prueba quitando el bloqueo**: sin `FOR UPDATE` el
saldo termina en 102 en vez de 106 y la cadena queda rota con tres movimientos
huérfanos.

**[E] SMOKE-POS1.1-E — 49 aserciones, 0 fallas** contra PostgreSQL real: venta de
una línea que descuenta · venta de varias líneas · **decimales exactos
(20 − 1,5 = 18,5)** · bodegas independientes · el saldo coincide con su bitácora
en tres pares · movimiento de tipo `VENTA` con cantidad negativa · autor guardado ·
motivo obligatorio que nombra la venta · producto inactivo y bodega inactiva
rechazados · **bodega de otra sucursal rechazada** · **sin saldo abierto se
rechaza y no lo crea** · **un fallo tras el primer consumo no deja venta, ni
movimiento, ni saldo cambiado** · **diez cobros concurrentes dejan 90 exacto y
encadenan sin roturas** · **los tres flujos comparten motor** · y cero asientos,
contabilizaciones, documentos de caja, unidades de motocicleta y movimientos
serializados.

**[E] También aquí se validó quitando el bloqueo**: sin `FOR UPDATE` el saldo
termina en 96 en vez de 90, con seis consumos perdidos y la cadena rota.
`0,1,1,1,1,1,2,2,2,2`.

**[E] SMOKE-POS1.2-F — 78 aserciones, 0 fallas** contra PostgreSQL real. Es la
prueba de cierre, y comprueba invariantes, no pasos: ciclo completo con cantidades
realistas (120 filtros a 145,50 y 55,5 litros a 78,25) crear → aprobar → recibir
80/30,25 → recibir 40/25,25 → devolver 12 · **decimales exactos, con 25,25
pendientes y saldo 55,5** · una orden en borrador ni se recibe ni se devuelve ·
no se aprueba dos veces · una recibida no se anula · no se recibe más de lo
pendiente ni se devuelve más de lo recibido · **una línea de otra orden se rechaza,
comprobado sobre una orden abierta** para que el guardia de estado no dispare antes
· **las cuatro invariantes de cantidad sobre todas las líneas** · **el saldo es la
suma de su bitácora** y `antes + cantidad = después` en todos los movimientos ·
**un solo motor, comprobado leyendo el código fuente**: una escritura de
movimiento, una de saldo, un bloqueo · **la bitácora es exactamente
`CREADA, APROBADA, RECEPCION_PARCIAL ×2, RECEPCION_TOTAL ×2, DEVOLUCION`**, y la
suma de sus cantidades iguala lo recibido en la línea · órdenes y productos
independientes · **rollback con fallo posterior a la primera escritura** ·
**tres aprobaciones concurrentes dejan una ganadora y un solo evento** · **dos
recepciones concurrentes de 6 sobre 10 pendientes: solo cabe una, y el inventario
sube exactamente 6** · P-8 preservada como ausencia · y cero contabilidad, caja,
cuentas por cobrar, pagos, inventario serializado, motocicletas y ventas POS, con
`information_schema` confirmando que el módulo no tiene columna de pago, factura ni
deuda.

**[E] La concurrencia se validó quitando el bloqueo**, con un control negativo
reproducible (`SMOKE_SIN_BLOQUEO=1`): sin bloquear la cabecera se aceptan **las
dos** recepciones y el inventario sube a 120 mientras el documento sigue diciendo
6 — la actualización perdida de POS1.2-B. El interruptor solo puede romper la
suite, nunca ablandarla.

**[E] SUITE-POS1.2-F — 30 pruebas en navegador, 30 en verde** (2,4 min) con sesión
real de administrador: las 13 de POS1.2-C/E siguen pasando, más lista → detalle ·
**crear una orden por la pantalla**, con totales derivados por el servidor
(7 × 125,50 = 878,50) y un solo evento `CREADA` · orden sin líneas rechazada por el
servidor · **aprobar desde el detalle** · **recibir parcialmente**, con movimiento
`COMPRA` de 4, invariante del movimiento y lo pendiente bajando a 6 en pantalla ·
**recepción completa que cierra la orden** con evento `RECEPCION_TOTAL` · recibir
de más rechazado sin tocar el saldo · **devolver**, con `DEVOLUCION` de −3, motivo
en el movimiento y **estado y pendiente sin cambiar (P-28, P-29)** · devolución sin
motivo rechazada sin mover nada · anular desde el detalle · **el detalle solo
ofrece lo que el estado permite**, incluida una anulada sin ningún botón · una
parcial ofrece recibir y devolver a la vez · **el historial escrito por las
operaciones reales**, no sembrado · recibir no toca contabilidad, caja ni
inventario serializado · **el saldo sigue siendo la suma de su bitácora tras
operar por pantalla** · y detalle y lista usables en móvil.

**[E] SUITE-POS1.2-F (denegada) — 4 pruebas, 4 en verde** con sesión de contador:
ni la lista, ni el formulario de creación, ni el detalle. **Se afirma sobre el HTML
que emite el servidor**, no sobre lo que el navegador acaba pintando.

**[E] La corrida combinada `npm run e2e` terminó en 108/108 (10,6 min)**, la
primera limpia en tres parches, y la base quedó **sin un solo resto de fixture**.
**[I]** No prueba que la inestabilidad anterior esté resuelta: esta corrida partió
de un `.next` borrado, así que una caché envenenada pasa a ser sospechosa junto
con la carga. El conjunto de mapeo `${TAG}-A` sigue compartido.

---

## 23. Tablero operativo de mostrador (POS2.1)

### Fase 0: había un dashboard, y no sabía nada del POS

`/panel/dashboard` existe desde antes y es **enteramente comercial**: leads,
expedientes, actividades, créditos, reservas y venta de motocicletas, todo bajo
`canViewCommercialAnalytics` y su alcance global/sucursal/personal.

Lo que POS1.0 a POS1.2 construyeron —ventas de mostrador, existencias por bodega,
órdenes de compra, bitácora de inventario— **no aparecía en ningún tablero**. Esa
es la mitad que este parche añade; no es una segunda versión de la que ya había.

| Área | Ya existía | Reutilizado | Faltaba |
|---|---|---|---|
| Ventas POS | `PosSale` con estado, total y `completedAt` | el modelo entero | toda métrica |
| Inventario POS | `PosInventory`, `PosProduct.minimumStock` | ambos | toda métrica |
| Compras | `PosPurchaseOrder` con estados | el modelo | toda métrica |
| Bitácora | `PosInventoryMovement` con tipo, autor y fecha | fuente explícita | su lectura |
| Clientes / leads | tablero comercial completo | intacto | nada |
| Caja / CxC | `CashDocument`, `ReceivableDocument` | **nada** | ver P-36 |
| Sucursales | `Branch` + alcance de sesión | el alcance | desglose POS |

### Una sola fuente de verdad

`getPosDashboard` en `src/server/pos/dashboard.ts`. **Una función, una llamada, un
rango.** El error que el encargo prohíbe —una tarjeta que dice «hoy» y otra
«últimos 30 días» sin declararlo— no puede ocurrir porque el rango se calcula una
vez y todas las cifras salen de él.

El período viaja en la URL (`?periodo=`), no en estado de cliente: el servidor
recalcula, el filtro se puede compartir pegando el enlace, y no hay estado que
sincronizar entre tarjetas.

**La comparación es la misma ventana desplazada**, no «el mes pasado»: comparar
30 días contra un mes de 28 produce una variación que no significa nada. Y cuando
el período anterior fue cero, la variación es `null` y la tarjeta lo dice —
«+100%» sobre cero es una cifra inventada.

### Métricas, y por qué estas

| Métrica | Fuente | Nota |
|---|---|---|
| Ventas del período | `SUM(pos_sales.total)` con `status = COMPLETADA` | |
| Nº de ventas | `COUNT` sobre lo mismo | |
| Ticket promedio | **derivado**, total ÷ nº | Almacenarlo lo desincronizaría al anular |
| Variación | misma ventana anterior | `null` sin base con que comparar |
| Ventas por día | `date_trunc` en SQL | Agrupar en memoria era lo prohibido |
| Cobros por método | `pos_payments` unido a ventas completadas | |
| Ventas por sucursal | `groupBy(branchId)` | **Solo para rol global** |
| Sin existencia | `pos_inventory.quantity <= 0` | Bodega y artículo activos |
| Bajo mínimo | `quantity <= minimum_stock AND minimum_stock > 0` | Ver abajo |
| Compras por recibir | `groupBy(status)` | `APROBADA` + `RECIBIDA_PARCIAL` |
| Movimientos recientes | `pos_inventory_movements` | Columnas, no texto interpretado |

**«Bajo mínimo» solo cuenta lo que tiene mínimo declarado.** `minimumStock` nace
en cero y hasta POS1.1-A nadie lo leía; contar los ceros marcaría como alerta
cualquier artículo agotado y duplicaría la cifra de «sin existencia». La pantalla
enuncia cuántos artículos tienen umbral configurado para que el número se pueda
interpretar.

### Sin librería de gráficos

**DS-1 sigue abierta y este parche no la resuelve.** La tendencia son columnas con
altura proporcional y cero dependencias nuevas. El total va como texto en la
cabecera del marco, cada columna lleva su valor en su nombre accesible, y el mejor
día se enuncia aparte: **la cifra nunca está solo en el dibujo**.

### Permisos

No se creó ninguno. Se componen los que ya existían, con su significado:

| Sección | Predicado | Roles |
|---|---|---|
| Ventas, tendencia, cobros, sucursales | `canAccessCaja` | ADMIN, GERENTE, CAJERO |
| Existencias, compras, bitácora | `canManageInventory` | ADMIN, GERENTE |

El alcance por sucursal se resuelve **en el servidor** y las consultas salen ya
filtradas. **[E]** Un contador no recibe ninguna de estas cifras en el HTML:
comprobado sobre la respuesta del servidor, no sobre lo que el navegador pinta.

### Rendimiento

Una llamada compuesta, un `Promise.all`, y **ninguna consulta que traiga filas
para contarlas en memoria**: se agrega en la base. Las tres agrupaciones que
Prisma no expresa —por día, por método, y el conteo bajo mínimo— van en SQL con
parámetros interpolados por Prisma. Sin Redis, sin vistas materializadas, sin
trabajos en segundo plano.

### Verificación

**[E] SUITE-POS2.1 — 20 pruebas de navegador, 20 en verde**, más 2 de denegación.
Las cifras se afirman **contra lo sembrado**: 1.500 + 2.500 hoy, 9.000 hace veinte
días, y el cambio de período mueve el total de una cosa a la otra · ticket promedio
derivado · un período inválido cae en el valor por omisión · **todas las tarjetas
declaran el mismo período** · la tendencia lleva su número como texto · lo que
requiere atención enlaza al módulo y navega · «bajo mínimo» solo cuenta lo que
tiene umbral · la bitácora muestra tipo, artículo y autor · un período sin ventas
lo dice · y sin desbordamiento horizontal a 1440, 1280, 1024, 768 y 390px.

---

## 24. Existencias del mostrador, alcanzables (POS2.3)

### Fase 0: cinco acciones sin puerta

La auditoría encontró la misma situación que POS1.2-F encontró en compras.
`createPosWarehouseAction`, `updatePosWarehouseAction`, `openPosInventoryAction`,
`registerPosInventoryReceiptAction` y `adjustPosInventoryAction` existen desde
POS1.1-B/C/D, están probadas por suites Prisma, y **ninguna tenía forma de
ejecutarse desde la aplicación**. `listPosInventory` y `listPosInventoryMovements`
no las consumía nadie.

| Capacidad | Existía | Alcanzable antes | Ahora |
|---|---|---|---|
| Abrir saldo | sí | **no** | `/panel/pos/inventario` |
| Ingreso manual | sí | **no** | igual |
| Ajuste con signo | sí | **no** | igual |
| Saldos por bodega | consulta | **no** | igual |
| Bitácora | consulta | **no** | igual |
| Crear/editar bodega | sí | **no** | **sigue sin puerta** (ver abajo) |

### Lo que no se construyó

**Nada de servidor.** La pantalla llama a las acciones tal cual y hereda lo que ya
garantizan: bloqueo `FOR UPDATE`, invariante `después = antes + cantidad`, motivo
obligatorio y autor.

**Ningún permiso nuevo.** Las cinco acciones usan `authorizePos`
(`canOperateCaja`), y el enlace de navegación declara los mismos roles. Que un
ajuste deba pedir un segundo par de ojos es **P-10** y sigue sin responderse.

**La gestión de bodegas se deja fuera a propósito.** Crear y editar bodegas es un
flujo de configuración, no de operación diaria; mezclarlo con los saldos habría
convertido esta pantalla en dos. Queda como **P-38**.

### P-8 sigue abierta, y ahora se puede ver

La pantalla **no valida existencia suficiente**. Un ajuste que deja el saldo bajo
cero se registra, exactamente como lo registra el motor desde POS1.1-D. **[E]** La
suite lo comprueba explícitamente: un ajuste de −30 sobre 20 deja −10 y se acepta.
Prohibirlo aquí habría sido decidir política de operación desde una pantalla.

### Verificación

**[E] SUITE-POS2.3 — pruebas de navegador** sobre datos sembrados: la pantalla es
alcanzable desde la navegación y marca su módulo · abrir un saldo lo crea en cero
**sin escribir movimiento** · un ingreso de 25,5 escribe su movimiento con
`antes = 0` y `después = 25,5` · un ajuste de −5,5 encadena desde 25,5 hasta 20 ·
**el saldo es la suma de su bitácora** y la invariante se sostiene en todos los
movimientos · **P-8 preservada**: −30 sobre 20 deja −10 · el motivo es obligatorio
y su error queda asociado al campo · un ingreso de cero se rechaza sin viajar · el
estado se calcula solo contra umbrales declarados · el detalle dice lo ausente ·
los filtros reducen y se limpian · y sin desbordamiento horizontal a 1440, 1280,
1024, 768 y 390px, con la tabla siguiendo siendo tabla en móvil.

---

## 25. El mostrador deja de ser Caja (POS2.4)

### El error que se corrige

Desde POS1.0-B, `authorizePos()` exigía `canOperateCaja` sobre la sesión
administrativa. Eso convertía «poder operar la caja» en «poder operar el punto de
venta», que son dos cosas distintas: la caja emite documentos contables desde el
back office; el mostrador cobra artículos desde una terminal. POS2.2 y POS2.3
hicieron el problema visible al exponer las pantallas.

### La frontera, en tres capas

```text
ruta /pos/*  →  sesión de POS  →  operador activo  →  sucursal  →  operación
```

**Identidad propia.** `PosOperator`: usuario, hash, sucursal, activo, versión de
sesión. Su contraseña no autentica el panel y la del panel no autentica el
mostrador.

**Sesión propia.** Cookie `motomas_pos_session`, distinta de `motomas_session`,
`HttpOnly`, `SameSite=Lax`, ocho horas, con carga que declara `kind: "pos"` — una
sesión administrativa no puede satisfacer esa validación aunque se firme con la
misma clave. **Se revalida contra la base en cada petición**: desactivar un
operador o cerrar su sesión surte efecto de inmediato, no cuando caduque el token.

**Autorización partida en tres.** `authorizePos` (mostrador, sesión de POS),
`authorizePosCatalogue` (catálogo y bodegas, sesión administrativa) y
`authorizePosLookup` (búsqueda de artículos, cualquiera de las dos). El catálogo
se queda en el panel porque administrar artículos siempre fue trabajo del panel.

### Por qué el operador enlaza a un usuario interno

`PosOperator.userId` **no autentica nada**. Existe porque las claves foráneas de
auditoría que POS1.x escribe —`cashierId`, `createdByUserId`— apuntan a `User` y
son inmutables. Cambiarlas habría sido reescribir el historial de ventas y de
movimientos, que es exactamente lo que un ERP no debe hacer.

### Alcance

MotoMas tiene una sola base y **no existe un modelo de inquilino**. La sucursal es
el alcance del operador, y el servidor la impone: en el mostrador **desapareció el
selector de sucursal**, porque una identidad de mostrador ya trae la suya.

### Credenciales

Se crean desde Configuración, con `canManageUsers` —el permiso que el repositorio
ya usa para dar acceso—, nunca desde el código. **La contraseña la genera el
servidor y se muestra una sola vez**; después solo se puede sustituir. Restablecer
o desactivar rotan la versión de sesión, así que cortan al operador que estuviera
dentro.

### Rutas

| Antes | Ahora |
|---|---|
| `/panel/pos/venta` | `/pos/venta` (la antigua redirige desde el borde) |
| `/panel/pos/inventario` | `/pos/inventario` (íd.) |
| — | `/pos/login` |
| `/panel/pos/productos` | sin cambios: es administración |
| `/panel/pos/compras` | sin cambios: usa `canManageInventory` |

La redirección vive en `proxy.ts` y no en una página: todo `/panel/*` pasa antes
por la comprobación de sesión administrativa, así que un operador con un marcador
antiguo acababa en el login del panel — justo donde no debe ir.

### Lo que no cambió

`PosCartPanel`, `checkoutPosSaleAction`, `applyPosInventoryMovement`, los totales
derivados en el servidor, las transacciones, los bloqueos, el autor de cada
movimiento y las formas de pago. **P-8, P-10, P-32, P-36 y P-37 siguen abiertas.**

### Verificación

**[E] SUITE-POS2.4 — 24 pruebas de navegador, 24 en verde.** Sin sesión, la venta
redirige y el HTML del servidor no trae nada del cobro · contraseña incorrecta y
usuario inexistente dan **el mismo** mensaje · una cuenta desactivada no emite
cookie · las credenciales válidas abren sesión y la cookie es `HttpOnly` e
invisible a `document.cookie` · **la sesión administrativa no autentica el
mostrador y la del mostrador no abre el panel** · la URL antigua redirige ·
cerrar sesión invalida la cookie incluso reinyectándola · desactivar corta la
sesión abierta · un token manipulado no vale · el operador solo ve su sucursal ·
ningún hash llega al navegador · y el login cabe en los cinco anchos.

---

## 26. Asignación de pagos en el mostrador (POS2.5)

### Fase 0: el pago mixto ya funcionaba

La auditoría encontró la capacidad completa, no ausente.

| Pregunta | Respuesta del código |
|---|---|
| ¿Varias filas de pago por venta? | **Sí.** `PosPayment` es uno-a-muchos con `saleId` |
| ¿Varios métodos en el esquema? | **Sí.** `CashPaymentMethod`: EFECTIVO, TRANSFERENCIA, CHEQUE, TARJETA |
| ¿El servidor exige que los pagos cubran el total? | **No, y a propósito** — es P-1 |
| ¿Métodos duplicados? | Permitidos; no se agrupan ni se rechazan |
| ¿Modelo de asignación? | No hay uno aparte: los pagos cuelgan de la venta |
| ¿Vuelto? | **No existe** en el modelo |
| ¿Efectivo distinto de electrónico? | No: mismo enum, misma forma |
| ¿Caja consume `PosPayment`? | **No.** Ninguna referencia fuera de `src/server/pos/` |
| ¿Contabilidad los consume? | **No.** PL-2 sigue vigente |

`pos-sale.spec.ts` ya persistía dos métodos en una venta desde POS1.0-D. **No
había nada que construir** en el pago mixto.

### Lo que faltaba, y es lo único que se añadió

La pantalla mostraba importe pagado y saldo, pero **no enunciaba el estado**: el
cajero tenía que restar. POS2.5 añade una línea que lo dice con palabras —«Sin
pagos registrados», «Faltan C$ X por cobrar», «Cobro exacto», «El cobro supera el
total en C$ X»— dentro de una región `role="status"`.

**El estado nunca se comunica solo con color**, y **no bloquea el cobro**.

### P-1 sigue abierta, y ahora se ve

El servidor **no exige cobertura**: una venta con cobro corto se registra, como
desde POS1.0-D. La pantalla lo avisa; imponerlo habría sido decidir por el
negocio si una caja puede cerrar corta, y qué significa cobrar de más. **[E]** La
suite lo fija explícitamente: con 1.000 sobre 3.703,68 el botón sigue habilitado y
la venta se persiste.

### Facturación: por qué no se construyó

No es que falte código, es que **faltan decisiones**. Los tres documentos que
existen —`CashDocument`, `AccountingDocument`, `ReceivableDocument`— son de Caja
y Contabilidad: exigen turno abierto y contabilizan. Emitir desde el mostrador con
ellos fusionaría los dos productos que POS2.4 acaba de separar. Y un comprobante
propio necesitaría RUC y razón social que `Customer` no tiene (**P-40**), una tasa
de impuesto que el repositorio no declara en ninguna parte (**P-6**), y una serie
que nadie ha asignado (**P-41**). Queda como **P-39**.

**No hay facturación fiscal en el repositorio, y este parche no la insinúa.**

### Verificación

**[E] SUITE-POS2.5 — 18 pruebas de navegador, 18 en verde**, con precio de
1.234,56 × 3 = 3.703,68 para que ningún total salga redondo: el estado dicho con
palabras en los cuatro casos · editar y quitar filas recalculan · **tres métodos
guardados con importes exactos** (1.000 + 2.000 + 703,68) y su suma igual al total
· dos filas del mismo método se guardan como dos · un importe negativo se rechaza
sin dejar venta · **P-1 preservada** · un fallo del servidor no deja pagos
huérfanos ni movimiento · teclado y `role="status"` · y sin desbordamiento a 1440,
1280, 1024, 768 y 390px.
