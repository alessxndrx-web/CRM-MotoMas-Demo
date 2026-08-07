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

## 20. Qué verificó la suite

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

**[E] La corrida combinada `npm run e2e` terminó en 108/108 (10,6 min)**, la
primera limpia en tres parches, y la base quedó **sin un solo resto de fixture**.
**[I]** No prueba que la inestabilidad anterior esté resuelta: esta corrida partió
de un `.next` borrado, así que una caché envenenada pasa a ser sospechosa junto
con la carga. El conjunto de mapeo `${TAG}-A` sigue compartido.
