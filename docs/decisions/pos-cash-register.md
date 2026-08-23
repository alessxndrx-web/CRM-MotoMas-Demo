# CB4 — Caja del mostrador: qué está decidido y qué falta

**Estado: PARCIALMENTE BLOQUEADO.** La mayor parte del ciclo de turno **ya está
determinada** por el dominio de Caja que el repositorio implementó en FF1.1. Lo
que falta son **tres decisiones concretas**, y una de ellas es la que hace que un
arqueo del mostrador dé una cifra correcta o una sistemáticamente equivocada.

Este documento es el resultado de auditar `src/server/caja/`, el esquema, las
migraciones y los smokes. No propone interfaz.

Documentos relacionados: [POS.md](../POS.md) (PL-4, P-39, P-43),
[pos-sale-return.md](pos-sale-return.md), `docs/CASH_OPERATIONAL_AUDIT.md`.

---

## 1. Lo que Caja ya resuelve, y que CB4 puede copiar sin decidir nada

Caja tiene un ciclo de turno **completo y maduro**. Estos puntos **no son
decisiones de negocio**: son reglas que el repositorio ya tomó.

| Regla | Dónde vive | Qué dice |
|---|---|---|
| Un turno abierto por cajero y sucursal | `openCashSessionAction` + índice parcial (CB4-A) | Reabrir con turno abierto se rechaza. |
| Lo esperado se deriva **por método de pago** | `collectCashClosingInputs` | `cashPayment.groupBy(["method"])`. |
| Lo esperado se **almacena**, no se recalcula al leer | `CashClosing.expected*` | «Un pago corregido después no debe reescribir la diferencia que un supervisor ya revisó». |
| Un turno **puede cerrar con diferencia** | `closeCashSessionAction` | Calcula `difference` y cierra. Nada lo bloquea. |
| La diferencia la **revisa un supervisor** | `reviewCashClosingAction`, `CashClosingStatus` | Estado propio y revisor propio. |
| Lo contado es del cajero y **nunca se recalcula** | `closeCashSessionAction` | Comentario explícito en el código. |
| Los borradores bloquean el cierre | `closeCashSessionAction` | `draftCount` → `DRAFTS_EXIST`. |
| Concurrencia por bloqueo optimista | `updateMany({where:{status:'ABIERTO'}})` + `count !== 1` | Gana uno; el otro falla limpiamente. |
| Auditoría obligatoria | `recordFinancialAuditEvent` | `CASH_SESSION_OPENED`, `CASH_CLOSING_SUBMITTED`. |

### 1.1 El pago mixto ya está resuelto

La pregunta «¿una venta de C$1,000 pagada con C$400 efectivo y C$600 tarjeta
mueve C$400 o C$1,000 en el cajón?» **no es una decisión de negocio**. Caja ya la
contestó: lo esperado se agrupa **por método**, no por total de documento. El
cajón espera la suma de los pagos `EFECTIVO`, y punto.

`PosPayment` ya guarda `method` (reutiliza `CashPaymentMethod`), así que la misma
fórmula se aplica al mostrador sin inventar nada. La invariante es de la base, no
de la interfaz: se deriva agrupando pagos, no sumando totales de venta.

---

## 2. Lo que Caja **no** tiene, y el mostrador sí necesita

Aquí está el hueco real. Se comprobó buscando en todo `src/server/caja/` y en el
esquema:

| Pieza | Resultado de la búsqueda |
|---|---|
| Fondo inicial / apertura con monto | **Cero coincidencias.** `CashSession` tiene `openedAt`, `closedAt`, `notes`. No hay importe de apertura en ninguna parte. `openCashSessionAction` recibe solo sucursal y notas. |
| Movimientos libres de efectivo (entradas, salidas, gastos, retiros) | **Cero coincidencias.** No existe `CashMovement`. Todo `CashPayment` cuelga de un `CashDocument`. |

**Por qué Caja no los necesita y el mostrador sí.** Caja factura motocicletas:
emite documentos y registra los pagos que los liquidan. No opera un cajón con
menudo. Un mostrador de repuestos sí: abre con cambio, da vuelto, y a veces sale
dinero para un gasto.

**La consecuencia es aritmética, no de opinión:** sin fondo inicial, la
diferencia de un arqueo del mostrador está **equivocada exactamente por el monto
del fondo**. El cajero cuenta el cajón —que incluye el cambio con el que abrió— y
lo compara contra «ventas en efectivo». Aparece un sobrante que no existe.

Un arqueo así no está incompleto: **está mal**. Por eso CB4 no puede
implementarse eligiendo «lo mismo que Caja».

---

## 3. Defecto encontrado y corregido (CB4-A)

El comentario del esquema admitía la brecha:

> «One open session per cashier/branch is enforced later in the service layer;
> PostgreSQL partial uniqueness is not represented by a plain Prisma unique.»

Bajo `READ COMMITTED` eso es un `check-then-act`. **Se comprobó contra la base de
datos real**: dos aperturas concurrentes del mismo cajero dejaron **dos turnos
abiertos**.

Corregido en la migración `20260824000000_cash_session_single_open` con un índice
único parcial, y probado en `npm run smoke:cash-session` con control negativo
—retirar el índice hace fallar tres aserciones—.

No es una regla nueva: es la que el código ya afirmaba, ahora cierta.

---

## 4. Las decisiones que faltan

### D1 — ¿Hay fondo inicial en el mostrador? *(bloqueante)*

**Por qué el código no puede deducirlo.** No existe en ninguna parte del
repositorio. Caja abre turno sin monto porque no maneja cambio.

| Opción | Consecuencia |
|---|---|
| **Sin fondo** (copiar Caja) | El arqueo miente por el monto del cambio. **Descartable por aritmética.** |
| **Fondo declarado por el cajero** | Simple. El cajero declara con cuánto abre; el esperado es `fondo + ventas efectivo − salidas`. Riesgo: nadie verifica el declarado. |
| **Fondo fijo por sucursal** | Verificable, pero exige modelar el fondo asignado y quién lo cambia. |
| **Fondo autorizado por supervisor** | Más control, más fricción; exige una identidad administrativa en la apertura del mostrador. |

**Recomendación: fondo declarado por el cajero**, con el monto guardado en el
turno y visible en el arqueo. Es el mínimo que hace correcta la diferencia, y no
exige inventar una entidad de fondo ni un flujo de autorización.

**Impacto exacto:** `openingFloat Decimal @db.Decimal(12,2)` en el turno del POS;
`openPosShiftAction` lo recibe y lo valida `>= 0`; el esperado pasa a ser
`openingFloat + ventasEfectivo − salidas + entradas`.

**Pruebas exigidas después:** abrir con fondo y comprobar que el esperado lo
incluye; abrir con fondo 0; rechazar fondo negativo; arqueo con fondo y sin
ventas debe dar diferencia 0 al contar el fondo.

---

### D2 — ¿Existen entradas y salidas de efectivo? *(bloqueante para el arqueo)*

**Por qué el código no puede deducirlo.** No hay ningún movimiento de efectivo
libre en el repositorio; todo pago cuelga de un documento.

| Opción | Consecuencia |
|---|---|
| **No existen** | El cajero no puede sacar dinero para un gasto ni depositar el excedente. Cualquier salida real aparece como faltante en el arqueo. |
| **Solo salidas a depósito** | Cubre el caso frecuente —retirar excedente— sin abrir la puerta a gastos. |
| **Entradas y salidas con motivo** | Cubre la operación real. Exige decidir si un gasto de caja llega a Contabilidad o se queda operativo. |

**Recomendación: entradas y salidas con motivo obligatorio, operativas y sin
contabilización**, coherente con que el POS entero no contabiliza. El día que el
mostrador contabilice, esos movimientos son el primer candidato.

**Impacto exacto:** modelo `PosCashMovement` con `shiftId`, `direction`
(`ENTRADA|SALIDA`), `amount`, `reason` obligatorio, `createdByUserId`,
`idempotencyKey @unique`.

**Pruebas exigidas después:** una salida reduce el esperado; una entrada lo
aumenta; motivo vacío se rechaza; movimiento sobre turno cerrado se rechaza;
reenvío con la misma clave no duplica.

---

### D3 — ¿Puede venderse sin turno abierto? *(bloqueante, y toca el cobro)*

**Por qué el código no puede deducirlo.** Hoy **sí se puede**: PL-4 dice que una
venta POS no pertenece a ningún `CashSession`, y lo marca como intencional.
Cambiarlo modifica `checkoutPosSaleAction`, que es núcleo protegido.

| Opción | Consecuencia |
|---|---|
| **Turno obligatorio** | El arqueo cuadra siempre. Pero un cajero que olvidó abrir **no puede vender**, y eso detiene el mostrador. Modifica el cobro y todas las suites que cobran sin turno. |
| **Turno opcional** | El cobro no se toca. Pero una venta en efectivo fuera de turno es efectivo que entró al cajón y **no aparece en ningún arqueo**. |
| **Turno obligatorio solo si hay pago en efectivo** | Cuadra el cajón sin bloquear ventas con tarjeta. Regla condicional, más difícil de explicar en el mostrador. |

**Recomendación: turno obligatorio para pagos en efectivo**, adoptada *después*
de D1 y D2, y con la venta enlazada al turno (`shiftId` en `PosSale`). Es la
única que hace el arqueo completo sin detener la venta con tarjeta.

**Advertencia:** esta es la única decisión de CB4 que obliga a tocar el cobro. No
debe implementarse hasta que D1 y D2 estén resueltas, o el cobro se modificaría
dos veces.

---

### D4 — ¿Qué es una caja: la sucursal, el operador, o un puesto físico? *(ya documentada como P-43)*

POS.md P-43 ya lo dice: el terminal físico «no existe ni se ha pedido» como
entidad. Mientras siga así, **la única clave disponible es (sucursal, operador)**,
que además es la que Caja usa. Esto es *derivable*, no una decisión pendiente —
pero deja de serlo el día que una sucursal tenga dos cajones físicos y quiera
arquearlos por separado.

---

### D5 — ¿Quién revisa el arqueo del mostrador?

Caja tiene `reviewCashClosingAction` con `canReviewCaja` sobre la **sesión
administrativa**. Un operador de mostrador no pasa por ahí. Si el arqueo del POS
debe revisarse, hace falta decir con qué identidad. **No bloquea la apertura ni
el cierre**: bloquea solo la revisión, y puede resolverse después.

---

## 5. Clasificación completa

| Requisito CB4 | Clase |
|---|---|
| Turno persistente en servidor | **B** — implementable, patrón de `CashSession` |
| Un turno abierto por (sucursal, operador) | **A** — regla existente, ya reforzada en CB4-A |
| Alcance por sucursal desde la sesión | **A** — `authorizePos` ya lo hace |
| Esperado por método de pago | **A** — fórmula de `collectCashClosingInputs` |
| Pago mixto: solo efectivo al cajón | **A** — se deriva de lo anterior |
| Cierre con diferencia permitido | **A** — Caja ya lo permite |
| Contado no se recalcula | **A** — regla explícita de Caja |
| Concurrencia en cierre | **A** — `updateMany` + guardia de estado |
| Identidad de la caja | **C** — derivable hoy (P-43 la reabre mañana) |
| **Fondo inicial** | **D** — decisión D1 |
| **Entradas y salidas** | **D** — decisión D2 |
| **Venta sin turno** | **D** — decisión D3, y depende de D1/D2 |
| Revisión del arqueo | **D** — decisión D5, no bloqueante |
| Contabilización del efectivo | **E** — bloqueada: el POS no contabiliza nada |

---

## 6. Por qué no se implementó el turno en esta sesión

Se puede escribir hoy un modelo de turno con apertura, cierre y alcance por
sucursal. **Lo que no se puede es hacerlo dar la cifra correcta**, porque la
diferencia depende de D1 y D2.

Un turno que abre y cierra pero cuya diferencia está equivocada por el fondo es
peor que no tenerlo: da una cifra con aspecto de arqueo que nadie debe creer.

Lo implementable sin decidir nada era exactamente una cosa —la invariante de
unicidad— y está hecho.

---

## 7. Pregunta a responder para desbloquear

> ¿Con cuánto efectivo abre el cajero el cajón por la mañana, y puede sacar
> dinero de él durante el turno?

De la primera mitad sale D1; de la segunda, D2. Con las dos respondidas, CB4 pasa
entero a clase B y se implementa sin más preguntas, salvo D3, que debe decidirse
al final porque es la única que toca el cobro.
