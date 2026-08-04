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
| **P-9** | **¿Sobreviven los ingresos manuales al módulo de compras?** ¿O todo ingreso de inventario debería nacer de una recepción de compra? Hoy el ingreso manual es la única vía y se registra como `COMPRA` a falta de un valor mejor. Si el negocio quiere trazabilidad total contra una factura de proveedor, el ingreso manual pasa a ser una puerta trasera; si quiere agilidad de mostrador, es imprescindible. Nadie lo ha dicho. |
| **P-8** | **¿Puede el saldo quedar negativo?** ¿Puede una venta consumir inventario que no hay? El repositorio no contiene ninguna regla. Prohibirlo bloquea al mostrador cuando la carga inicial va con retraso; permitirlo admite vender lo que no existe. Es política de operación. |

---

## 7. Limitaciones del modelo, registradas

| # | Limitación |
|---|---|
| **PL-1** | **Sin inventario.** Una venta completada no descuenta existencias. `PosProduct` no tiene stock y `InventoryMovement` no se toca. **[E]** Verificado: cero movimientos. |
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

## 14. Qué verificó la suite

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
`0,1,1,1,1,1,2,2,2,2`.

**[E] La corrida combinada `npm run e2e` terminó en 108/108 (10,6 min)**, la
primera limpia en tres parches, y la base quedó **sin un solo resto de fixture**.
**[I]** No prueba que la inestabilidad anterior esté resuelta: esta corrida partió
de un `.next` borrado, así que una caché envenenada pasa a ser sospechosa junto
con la carga. El conjunto de mapeo `${TAG}-A` sigue compartido.
