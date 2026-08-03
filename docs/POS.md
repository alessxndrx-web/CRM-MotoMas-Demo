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

---

## 7. Limitaciones del modelo, registradas

| # | Limitación |
|---|---|
| **PL-1** | **Sin inventario.** Una venta completada no descuenta existencias. `PosProduct` no tiene stock y `InventoryMovement` no se toca. **[E]** Verificado: cero movimientos. |
| **PL-2** | **Sin contabilidad.** Ningún asiento, ninguna contabilización, ningún documento de caja. **[E]** Verificado contando antes y después. Es la promesa central del parche. |
| **PL-3** | **Sin costo.** `PosProduct` guarda precio de venta, no de adquisición. El costo vive en `AccountingInventoryCost` y no está enlazado. |
| **PL-4** | **Sin turno.** A diferencia de `CashDocument`, una venta POS no pertenece a un `CashSession`. **[I]** Cuando emita documentos de caja hará falta, porque el documento sí exige turno abierto. |
| **PL-5** | **Sin impresión ni comprobante**, por exclusión explícita. |

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

## 11. Qué verificó la suite

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

**[E] La corrida combinada `npm run e2e` terminó en 108/108 (10,6 min)**, la
primera limpia en tres parches, y la base quedó **sin un solo resto de fixture**.
**[I]** No prueba que la inestabilidad anterior esté resuelta: esta corrida partió
de un `.next` borrado, así que una caché envenenada pasa a ser sospechosa junto
con la carga. El conjunto de mapeo `${TAG}-A` sigue compartido.
