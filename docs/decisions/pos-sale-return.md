# Devolución de venta del mostrador — decisión pendiente

**Estado: BLOQUEADO.** No por falta de infraestructura, sino porque falta una
decisión de negocio que el repositorio no contiene y que no se puede deducir de
él.

Este documento es el resultado de una auditoría forense del ciclo de vida de una
venta del POS. No propone código: dice exactamente qué hay, qué falta y qué
consecuencia tiene cada salida posible.

Documentos relacionados: [POS.md](../POS.md) (P-4, P-13, P-15, P-39 a P-47),
[FINANCIAL_FOUNDATION.md](../FINANCIAL_FOUNDATION.md),
[ACCOUNTS_RECEIVABLE.md](../ACCOUNTS_RECEIVABLE.md).

---

## 1. El hallazgo que ordena todo lo demás

**El POS no contabiliza nada.**

No es una omisión: es el contrato declarado de POS1.0-A y está fijado por una
prueba que lo comprueba en el camino que sí escribe
(`e2e/pos-sale.spec.ts` → «cobrar no crea asientos, contabilizaciones ni
documentos de caja»):

```ts
expect(await prisma.journalEntry.count()).toBe(before.entries);
expect(await prisma.postingRecord.count()).toBe(before.postings);
expect(await prisma.cashDocument.count()).toBe(before.cash);
```

Evidencia complementaria:

| Comprobación | Resultado |
|---|---|
| Miembros POS en `AccountingEventType` | **Ninguno**. Solo `CAJA_*`, `DOCUMENTO_*`, `COMPROBANTE_*`, `GASTO`, `PLANILLA`, `LIQUIDACION_IVA`. |
| Referencias a `PosSale` en `src/server/finance/` | **Cero**. |
| `ReceivableOrigin` | `CAJA`, `CONTABILIDAD`. **No hay POS.** |
| `ReceivableDocument` | Enlaza `cashDocumentId` y `accountingDocumentId`. **No tiene `posSaleId`.** |

**Consecuencia:** una devolución del mostrador **no tiene asientos que
revertir**, porque la venta nunca los creó. Esto no es un problema a resolver
antes de las devoluciones; es la razón por la que P-4 dice literalmente «sin
contabilización no hay nada que revertir». La parte contable de una devolución
está *resuelta por ausencia*, y seguirá estándolo mientras el POS no emita
documentos.

Lo que **no** está resuelto es el dinero.

### 1.1 La venta es hoy absolutamente inmutable

Un rastreo de todas las escrituras sobre `posSale` en `src/` devuelve **una
sola**:

```
src/server/pos/actions.ts:2573:      const sale = await tx.posSale.create({
```

Cero `update`, cero `updateMany`, cero `delete`. Una venta del mostrador se crea
dentro de la transacción del cobro y **nunca se vuelve a tocar**.

Esto importa más de lo que parece: implementar una devolución significa
introducir el **primer camino de mutación sobre una venta** en la historia del
sistema. La forma de ese camino —qué escribe, contra qué se bloquea, qué estado
deja— la determina el tratamiento del dinero. Elegirla antes de saberlo es
elegirla mal.

---

## 2. Lo que el repositorio ya resuelve

### 2.1 Inventario: mecánicamente listo

`applyPosInventoryMovement` (`src/server/pos/actions.ts`) es genérico y **opera
con signo**:

```ts
/** Ya saneada por el llamador. Con signo: positivo suma, negativo resta. */
quantity: number;
```

Hace lo correcto ya hoy: bloquea el saldo con `FOR UPDATE` (`lockPosInventory`),
calcula en `Decimal`, y escribe `quantityBefore`/`quantityAfter` con motivo y
autor. Una devolución de cliente solo necesitaría aportar **signo positivo**.

**Pero no debe reutilizar `DEVOLUCION`.** Ese miembro del enum ya tiene dueño:
`returnPosPurchaseOrderAction` lo usa para el **retorno a proveedor**, con
cantidad negada — devolver mercancía al proveedor *consume* existencias. Usar el
mismo tipo para el movimiento opuesto haría que la bitácora de inventario no
pudiera distinguir una entrada de una salida por su tipo.

### 2.2 Autorización: el patrón existe y es correcto

- `authorizePos()` resuelve la identidad desde la **sesión de mostrador**, no de
  la petición, y devuelve `branchCode`.
- `assertWarehouseBelongsToBranch()` se aplica **dentro** de la transacción.
- El alcance por sucursal ya es la política de todo el POS.

### 2.3 Anulación con motivo: patrón establecido dos veces

`cancelCashDocumentAction` (Caja) y `cancelPosPurchaseOrderAction` (compras)
comparten forma: motivo obligatorio, comprobación de estado **dentro** de la
transacción, escritura de auditoría, y guardia en el `WHERE` para que dos
anulaciones concurrentes no ganen las dos.

POS.md §18 lo deja escrito: *«el repositorio ya decidió que una anulación sin
motivo declarado no se registra»*.

---

## 3. Lo que el repositorio NO tiene

| Pieza | Estado |
|---|---|
| Modelo de documento de devolución | **No existe.** Ni `PosSaleReturn`, ni `PosRefund`, ni nota de crédito del POS. |
| Reverso de pago | **No existe en ninguna parte del repositorio.** |
| Crédito a favor del cliente | No existe. `ReceivableDocument` no admite origen POS. |
| `PosSaleStatus` intermedio | Solo `BORRADOR`, `COMPLETADA`, `ANULADA`. No hay `PARCIALMENTE_DEVUELTA`. |
| Escritor de `ANULADA` para ventas | **Ninguna acción la escribe.** El miembro está en el enum sin uso. |
| Relación movimiento → venta | `PosInventoryMovement` **no tiene `saleId`**. La única traza es el texto del motivo (`Venta {saleNumber}`). Es **P-13**, y POS.md ya advierte que sin ella «no hay forma de revertirlos cuando exista devolución». |
| Dominio de auditoría POS | `FinancialAuditDomain` es `CAJA \| CONTABILIDAD`. El POS no tiene bitácora financiera. |
| Ventana de devolución / aprobación | No existe ninguna política, en ningún módulo. |
| Datos fiscales del cliente | **P-40**: `Customer` no tiene RUC, razón social ni dirección fiscal. |
| Serie de numeración para comprobantes POS | **P-41**: `allocateDocumentNumber` falla cerrado sin serie configurada. |

---

## 4. La decisión que bloquea

> **¿Qué pasa con el dinero cuando un cliente devuelve mercancía?**

No es una pregunta de interfaz ni de esquema. Es la única pieza sin la cual el
resto no se puede escribir sin mentir.

### Por qué no se puede deducir

`PosPayment` registra **lo que se cobró**. Es un hecho histórico. Hay tres formas
de tocarlo y las tres son incorrectas sin una decisión previa:

1. **Escribir un `PosPayment` negativo.** `calculatePosPaidTotal` suma sin mirar
   el signo, así que el «pagado» y el «saldo» de la venta original cambiarían
   retroactivamente. La venta dejaría de decir cuánto entró por caja el día que
   ocurrió. Corrompe el histórico.
2. **No tocar los pagos.** Entonces la venta afirma que se cobraron C$ 1,554,
   la mercancía volvió al almacén, y **el dinero devuelto no existe en ninguna
   parte**. Son libros que cuadran describiendo un negocio que no ocurrió.
3. **Marcar la venta `ANULADA`.** Dice «esta venta no ocurrió», que es falso: sí
   ocurrió, se cobró y se imprimió un papel. Además no admite devolución
   parcial, que es el caso frecuente en repuestos.

### Lo que ya se puede hacer hoy, honestamente

Si lo único que hace falta es **que las existencias vuelvan a cuadrar**, eso ya
existe y es alcanzable: `adjustPosInventoryAction`, desde `/pos/inventario`, con
motivo obligatorio, autor, bloqueo transaccional y bitácora
`quantityBefore`/`quantityAfter`.

Un ajuste de inventario **no finge ser una devolución** y por eso es seguro. Lo
que no hace —y no debe fingir— es representar dinero devuelto.

---

## 5. Opciones y consecuencias

### Opción A — Devolución con reembolso en efectivo

El cajero devuelve dinero del cajón.

- **Necesita:** modelo `PosSaleReturn` + `PosSaleReturnItem` + `PosRefund`;
  miembro nuevo en `PosInventoryMovementType`; `saleId` en
  `PosInventoryMovement` (P-13).
- **Consecuencia:** el efectivo del cajón deja de ser deducible de las ventas.
  **Arrastra CB4**: sin turno de caja no hay de dónde salga el dinero ni contra
  qué cuadrarlo al cerrar. Hoy `/pos/reportes` ya advierte que lo que muestra es
  *lo cobrado*, no el saldo del cajón; con reembolsos esa advertencia pasa de
  precisa a insuficiente.
- **Riesgo:** alto si se implementa antes que CB4.

### Opción B — Devolución con crédito a favor del cliente

No sale dinero; el cliente queda con saldo.

- **Necesita:** todo lo de A salvo el reembolso, más una forma de representar el
  crédito. `ReceivableDocument` existe pero su origen es `CAJA | CONTABILIDAD` y
  su autorización es `authorizeFinancialFoundation` —**que no acepta una sesión
  de mostrador**—. Meter el POS ahí es exactamente el colapso de contextos que
  CLAUDE.md prohíbe para `CashDocument`.
- **Consecuencia:** exige decidir quién es dueño del saldo del cliente y cómo se
  consume en una venta futura.
- **Riesgo:** medio. No arrastra CB4, pero sí abre la frontera POS ↔ finanzas.

### Opción C — Solo reposición de inventario, sin tratamiento del dinero

Registrar la devolución como hecho de inventario y nada más.

- **Necesita:** nada nuevo. **Ya existe** (`adjustPosInventoryAction`).
- **Consecuencia:** es lo que hay hoy. No es una devolución y no debe llamarse
  así en la interfaz.
- **Riesgo:** bajo, siempre que no se le ponga la etiqueta «Devolver».

### Opción D — No hacer nada hasta que el POS emita documentos

Es lo que P-4 propone: *«Cuando el POS emita documentos, habrá que decidirlo»*.

- **Consecuencia:** el mostrador sigue sin poder corregir un error de cobro. Es
  una carencia operativa real y diaria.
- **Riesgo:** bajo técnicamente, alto operativamente.

---

## 6. Recomendación

**Opción A es el destino, y ya solo falta su decisión de dinero.** CB4 y P-13
—los dos prerequisitos técnicos— están hechos y verificados; lo que resta no es
ingeniería.

El orden importa y no es negociable:

1. **CB4 (turno de caja)** — sin él, un reembolso en efectivo no tiene origen ni
   forma de cuadrarse. Implementar devoluciones antes que CB4 crea un agujero de
   efectivo auditable como tal.
2. ~~**P-13 (`saleId` en el movimiento de inventario)**~~ — **HECHO.**
   `PosInventoryMovement.saleId` es una clave foránea a `PosSale`, la escribe
   `checkoutPosSaleAction` dentro de su transacción, y solo ella: recepciones de
   compra, ajustes y retornos a proveedor se quedan en `NULL`. Probado en
   `npm run smoke:p13` y `npm run e2e:pos-p13`. **La consulta que este paso
   existía para habilitar —`findMany({ where: { saleId } })`— ya funciona.**
3. **Devolución** — **desbloqueada técnicamente.** CB4 modeló el dinero del cajón
   y D3 lo ató a la venta; P-13 ató los movimientos a la venta. Lo que queda es
   **la decisión de §4**: qué pasa con el dinero cuando el cliente devuelve
   —reembolso en efectivo, crédito a favor o cambio—. Eso sigue siendo política y
   no se deduce del repositorio.

Implementar la devolución ahora significaría elegir la Opción C y **rotularla**
como devolución. Eso es precisamente lo que este repositorio ha evitado durante
siete fases.

---

## 7. Impacto exacto cuando se decida (Opción A)

### Esquema

```prisma
enum PosInventoryMovementType {
  // ...
  DEVOLUCION_CLIENTE   // + existencias. DEVOLUCION sigue siendo del proveedor.
}

model PosSaleReturn {
  id            String   @id @default(cuid())
  returnNumber  String   @unique
  saleId        String
  branchId      String
  warehouseId   String
  operatorId    String
  reason        String            // obligatorio, como toda anulación del repo
  createdByUserId String
  createdAt     DateTime @default(now())
  idempotencyKey String? @unique  // mismo contrato que el cobro
}

model PosSaleReturnItem {
  id           String  @id @default(cuid())
  returnId     String
  saleItemId   String
  quantity     Decimal @db.Decimal(12, 3)
  @@unique([returnId, saleItemId])
}

model PosInventoryMovement {
  saleId   String?   // P-13
  returnId String?
}
```

Y un estado nuevo en `PosSaleStatus` (`PARCIALMENTE_DEVUELTA`) **o** —preferible—
derivar el estado de la suma de `PosSaleReturnItem`, que evita una migración de
enum y no puede quedar desincronizado.

### Invariantes a imponer en la base, no en la interfaz

- `SUM(returnItem.quantity) <= saleItem.quantity`, comprobado **dentro** de la
  transacción con las líneas bloqueadas.
- `@@unique([returnId, saleItemId])` contra la doble línea.
- `idempotencyKey @unique` contra el reenvío, igual que el cobro.
- Bloqueo `FOR UPDATE` del saldo antes de reponer.

### API

Una sola acción, `returnPosSaleAction`, con `authorizePos()` +
`assertWarehouseBelongsToBranch()`, transacción única. **El cobro no se toca.**

### Interfaz

En `/pos/ventas/[saleId]`: cantidad devuelta por línea, motivo obligatorio,
confirmación, y estado de devolución visible al recargar.

---

## 8. Qué se puede implementar con seguridad hoy

| Cosa | ¿Segura? | Por qué |
|---|---|---|
| Reponer existencias con motivo | **Sí, ya existe** | `adjustPosInventoryAction`, alcanzable desde `/pos/inventario`. |
| `saleId` en `PosInventoryMovement` (P-13) | Sí, pero **toca el cobro** | Aditivo y sin decisión de negocio, pero escribirlo obliga a modificar `checkoutPosSaleAction`, que está fuera del alcance mientras no exista la devolución. |
| Botón «Devolver» | **No** | No hay operación detrás. |
| Marcar `ANULADA` | **No** | Afirma que la venta no ocurrió. |
| Nota de crédito | **No** | P-39, P-40 y P-41 abiertas: sin datos fiscales del cliente ni serie, un comprobante sería papel con pretensión fiscal. |

---

## 9. Pregunta a responder para desbloquear

> Cuando un cliente devuelve un repuesto en el mostrador, ¿el negocio le
> **devuelve efectivo del cajón**, le deja un **crédito a favor**, o le
> **cambia el artículo** sin que salga dinero?

De esa respuesta —y solo de ella— se derivan el modelo, el estado de la venta,
el comprobante y si CB4 es prerequisito.

---

## 10. P-13 en concreto (investigado en CB4, no implementado)

**CB4 no depende de P-13.** Se comprobó: lo que la caja necesita es enlazar la
**venta con el turno** (decisión D3 en
[pos-cash-register.md](pos-cash-register.md)), no el **movimiento de inventario
con la venta**. Son dos relaciones distintas y solo la segunda es P-13. Por eso
aquí queda documentada y no escrita: la secuencia sigue siendo CB4 → P-13 →
devolución.

### Estado actual

`PosInventoryMovement` guarda `warehouseId`, `productId`, `type`, `quantity`,
`quantityBefore`, `quantityAfter`, `reason`, `notes`, `createdByUserId`. La única
traza hacia la venta es **texto**: `reason = "Venta {saleNumber}"`, escrito en
`checkoutPosSaleAction`. Un texto no se puede unir ni indexar con garantías.

### Cambio de esquema exacto

```prisma
model PosInventoryMovement {
  // ...
  saleId String? @map("sale_id")
  sale   PosSale? @relation(fields: [saleId], references: [id], onDelete: Restrict)

  @@index([saleId])
}
```

**Anulable y sin relleno retroactivo**, igual que las instantáneas de POS3.0: los
movimientos anteriores no lo registraron y no se les inventa una venta. `NULL`
significa «no se tomó», no «no hubo».

`onDelete: Restrict` por coherencia con el resto del POS: una venta con
movimientos no se borra.

### Tipos de movimiento afectados

**Solo `VENTA`.** Es el único que hoy nace dentro del cobro. `INICIAL`, `COMPRA`,
`AJUSTE`, `TRASLADO_*` y `DEVOLUCION` no tienen venta que referenciar y deben
quedarse en `NULL`. El día que exista devolución de cliente, su movimiento
llevará `saleId` **y** `returnId`.

### Frontera transaccional

`saleId` se escribe **dentro de la transacción del cobro**, en la misma llamada
que ya crea el movimiento — hoy `runPosInventoryMutation` desde
`checkoutPosSaleAction`. No es una escritura nueva: es una columna más en una
fila que ya se inserta ahí. **Esto obliga a tocar el cobro**, que es núcleo
protegido, y es la razón por la que P-13 no se hace suelto sino junto a la
devolución que lo necesita.

### Pruebas exigidas

1. Cobrar deja el movimiento con `saleId` igual a la venta creada.
2. Una venta de varias líneas deja un movimiento por línea, todos con el mismo
   `saleId`.
3. Los movimientos de ingreso y ajuste siguen naciendo con `saleId` nulo.
4. Los movimientos anteriores a la migración siguen en `NULL` y las lecturas no
   se rompen.
5. La reconstrucción funciona: dada una venta, sus movimientos se recuperan por
   relación y no por el texto del motivo.
