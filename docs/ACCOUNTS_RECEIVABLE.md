# MotoMas — Cuentas por cobrar (FF1.2-B)

Fundación de cuentas por cobrar: la posición financiera del cliente,
independiente de la caja.

> **No es facturación, no es el motor de contabilización, no implementa
> impuestos, POS ni conciliación bancaria.** Registra qué se debe, qué se cobró
> y cómo se aplicó cada cobro. Los asientos son FF1.4.

Documentos relacionados: [FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md)
(FF1.0), [CHART_OF_ACCOUNTS.md](CHART_OF_ACCOUNTS.md) (FF1.1-A),
[ACCOUNTING_EVENTS.md](ACCOUNTING_EVENTS.md) (FF1.2-A),
[FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md).

---

## 1. Verificación de compatibilidad arquitectónica

Antes de escribir código se contrastó el diseño contra cada fase previa. **No se
encontró ningún conflicto bloqueante.** Se detectaron dos tensiones reales, que
se resolvieron explícitamente en lugar de dejarlas implícitas.

| Fase | Compatibilidad | Cómo se resolvió |
|---|---|---|
| **FF1.0** Fundación financiera | ✅ | Usa `runFinancialTransaction`, `FinancialRuleError`, `sanitizeFinancialText` y la autorización `authorizeFinancialFoundation`. No duplica plomería. |
| **FF1.1-A** Catálogo de cuentas | ✅ | Cero referencias a cuentas contables. Asignar cuentas es FF1.4; esta capa solo produce los hechos que el mapeo consumirá. |
| **FF1.2-A** Eventos contables | ✅ | Implementa el sustrato de datos de CJ-17 (cobro posterior), CJ-18 (reversión de cobro), VT-07 (prima de reserva) y EX-05 (desembolso de financiera), sin inventar eventos nuevos en `AccountingEventType`. |
| **TD-01** Limpieza | ✅ | Reutiliza `money.ts` y `text.ts`; no reintroduce ningún saneador ni constante duplicada. |
| **FF1.1-B** Fundación de caja | ⚠️ resuelto | Ver §1.1. |
| Modelo existente | ⚠️ resuelto | Ver §1.2. |

### 1.1 Tensión con el arqueo de caja (FF1.1-B)

FF1.1-B definió: `esperado[m] = Σ CashPayment de método m registrados en
documentos EMITIDO del turno`. Un segundo concepto de cobro podía **duplicar
dinero** en el arqueo o hacerlo desaparecer.

Resolución, verificada contra el código de FF1.1-B:

1. El arqueo lee **exclusivamente `CashPayment`**. `ReceivablePayment` no lo
   toca. Un cobro registrado por el Contador (una transferencia recibida) no
   tiene turno y correctamente no altera ningún arqueo.
2. Cuando el dinero sí entra por ventanilla, `ReceivablePayment.cashPaymentId`
   es un **único nulable** que enlaza el cobro con el pago de caja que ya
   existe. El arqueo sigue contándolo una sola vez, desde `CashPayment`.
3. El colector de FF1.1-B filtra por `cashSessionId` **del pago**, no del
   documento. Un cobro de hoy contra una factura emitida la semana pasada ya
   entra en el arqueo de hoy, que es exactamente lo que FF1.2 necesitará cuando
   habilite el cobro posterior a la emisión.

**FF1.1-B no se modificó.** La compatibilidad es una propiedad del diseño, no un
parche.

### 1.2 Colisión conceptual con `appliedPayment`

`CashDocument.appliedPayment` y `AccountingDocument.appliedPayment` significan
«abono aplicado» **dentro de la fórmula del documento**
(`total = subtotal − abono − retenciones`). No son historial de pagos: son un
descuento por prepago incorporado al documento.

Resolución: `ReceivableDocument.originalAmount` copia el **total** del documento
de origen, que ya está neto de ese abono. Un prepago incorporado al documento
**no se cuenta dos veces**.

Deuda declarada: a mediano plazo ese campo debería dejar de existir y
convertirse en una aplicación de cobro. Es una migración de significado sobre
documentos históricos, fuera del alcance de esta fase.

---

## 2. Qué se reutilizó y qué fue inevitable crear

**Reutilizado sin duplicar:** `Customer`, `ThirdParty`, `Branch`, `User`,
`CashDocument`, `AccountingDocument`, `CashPayment`, `CashSession` y —
importante— el enum **`CashPaymentMethod`**: una forma de pago es un concepto,
no dos.

**Entidades nuevas (tres), cada una porque el esquema anterior no podía expresar
el hecho que guarda:**

| Entidad | Por qué era inevitable |
|---|---|
| `ReceivableDocument` | No existía la obligación. Espeja un documento ya emitido en lugar de crear un tercer plano documental: `cashDocumentId` y `accountingDocumentId` son únicos nulables, así que un documento de origen produce **exactamente una** cuenta por cobrar. |
| `ReceivablePayment` | Un `CashPayment` pertenece a un turno **y a un solo documento**. Un cobro puede llegar por transferencia sin turno, pagar varios documentos, o ninguno (un anticipo). |
| `ReceivableAllocation` | **El concepto que faltaba.** Sin él un cobro no se puede repartir y un anticipo no puede existir. |

**Lo que deliberadamente NO se creó:** ninguna tabla de saldo de cliente. La
posición del cliente se calcula sumando filas persistidas.

---

## 3. Ciclo de vida

### 3.1 Obligación (`ReceivableDocument`)

```txt
              registrar desde documento emitido
                            │
                            ▼
   ┌──────────────► PENDIENTE ──aplicar cobro parcial──► PARCIAL
   │                    │                                   │
   │                    └──────aplicar el saldo─────────────┤
   │                                                        ▼
   revertir aplicación ◄────────────────────────────── SALDADO
                                                    (settledAt)
   PENDIENTE / PARCIAL ──anular (sin aplicaciones)──► ANULADO
```

- **PENDIENTE / PARCIAL / SALDADO / SOBREPAGADO / ANULADO** son estados
  **derivados**, no columnas. Se calculan con `resolveSettlementStatus`.
- Lo único que la base guarda es `settledAt`: el **instante** en que el saldo
  llegó a cero. Es un evento, no un saldo en caché — ninguna suma posterior
  puede reconstruir *cuándo* se saldó.
- Revertir una aplicación **limpia `settledAt`**: una obligación que vuelve a
  deber nunca estuvo saldada en ese instante.
- `SOBREPAGADO` no lo puede producir el servicio (la sobreaplicación se
  rechaza). Existe para que un saldo corregido fuera del servicio se **reporte**
  en lugar de mostrarse como saldado.

### 3.2 Cobro (`ReceivablePayment`)

```txt
   registrar ──► REGISTRADO ──revertir (con motivo)──► REVERTIDO
                    │
                    ├─ sin aplicaciones      → es un ANTICIPO
                    ├─ aplicado parcialmente → anticipo remanente
                    └─ aplicado por completo → sin remanente
```

Un **anticipo no es un tipo de registro distinto**: es un cobro cuyo remanente
sin aplicar es mayor que cero. Por eso no puede desaparecer — no hay nada que
borrar, solo hay algo que aplicar.

### 3.3 Aplicación (`ReceivableAllocation`)

```txt
   aplicar ──► APLICADA ──revertir (con motivo)──► REVERTIDA
```

Revertir **conserva la fila** con quién, cuándo y por qué. El saldo es
`Σ amount WHERE status = APLICADA`, así que una reversión devuelve el dinero al
anticipo y la deuda a la obligación, sin borrar historia.

---

## 4. Reglas de negocio

1. **Ningún saldo se almacena.** Cada cifra se recalcula desde las filas de
   aplicación dentro de la transacción que la necesita. Un saldo no puede
   divergir de su propia historia, y una lectura obsoleta no puede autorizar una
   escritura.
2. **Una obligación espeja un documento existente.** Nunca inventa deuda. El
   documento debe estar emitido: un borrador no es un hecho y un documento
   anulado tampoco.
3. **Sobreaplicación imposible.** Una aplicación no puede exceder ni el saldo de
   la obligación ni el remanente del cobro. Ambos límites se leen **dentro de la
   transacción**, de modo que dos aplicaciones concurrentes no pueden creer
   ambas que el dinero está disponible.
4. **Monedas iguales o nada.** Una aplicación exige que la moneda del cobro y la
   de la obligación coincidan. No existe política de tipo de cambio en el
   proyecto (riesgo R-03 de FF1.2-A); mezclarlas inventaría una tasa en silencio.
5. **Nada se elimina.** No hay acción de borrado en toda la capa. Las claves
   foráneas hacia dinero y hacia documentos de origen son `RESTRICT`.
6. **Anular exige limpiar primero.** Una obligación con cobros aplicados no se
   anula: hay que revertir las aplicaciones, para que el dinero regrese al
   anticipo del cliente en vez de desaparecer con la obligación.
7. **El nombre del tercero se resuelve en el servidor.** Si se envía un
   `customerId` o un `thirdPartyId`, el nombre se lee de la base; un cliente no
   puede etiquetar un cobro con el nombre de otra persona. El texto libre solo se
   acepta cuando no hay ninguna de las dos referencias (cliente de mostrador).
8. **Reversión total en cascada.** Revertir un cobro revierte primero todas sus
   aplicaciones activas, cada una con su propio evento de auditoría.

---

## 5. Auditoría

Ocho acciones nuevas, todas escritas en la misma transacción que el cambio:

`RECEIVABLE_DOCUMENT_CREATED`, `RECEIVABLE_DOCUMENT_SETTLED`,
`RECEIVABLE_DOCUMENT_REOPENED`, `RECEIVABLE_DOCUMENT_CANCELLED`,
`RECEIVABLE_PAYMENT_REGISTERED`, `RECEIVABLE_PAYMENT_REVERSED`,
`RECEIVABLE_ALLOCATION_APPLIED`, `RECEIVABLE_ALLOCATION_REVERSED`.

Saldado y reapertura son eventos **distintos** a propósito: saber cuándo se
saldó una obligación, y cuándo dejó de estarlo, es justamente lo que pregunta
una auditoría de cobranza.

Dominio: **CONTABILIDAD**, incluso cuando el dinero entró por una caja. Registrar
y aplicar cobranza es un acto de administración contable de Administrador o
Contador, no una operación de turno.

---

## 6. Autorización

| Rol | Cuentas por cobrar |
|---|---|
| Administrador | lee y opera |
| Contador | lee y opera |
| Gerente | sin acceso (no lee el libro mayor, ROLES.md §12) |
| Cajero, Vendedor, Marketing, Soporte Técnico | sin acceso |

Se reutiliza `authorizeFinancialFoundation`, el mismo predicado de numeración,
mapeo y catálogo de cuentas. Ningún rol gana ni pierde permisos.

> Que el **Cajero** cobre en ventanilla contra una factura ya emitida es el
> flujo natural y **todavía no existe**: requiere habilitar el cobro posterior a
> la emisión en Caja (FF1.2-C) y decidir su alcance de permisos. Esta fase deja
> el sustrato listo, no el flujo.

---

## 7. Arquitectura

```txt
src/server/finance/receivables/
  shared.ts       # contratos puros: DTOs, etiquetas, derivación de saldo y estado
  repository.ts   # acceso a datos, sin reglas ni permisos
  service.ts      # ciclo de vida autorizado, transaccional y auditado
```

**Regla de dependencia:** `finance` es la capa base. Puede ser importada por
`caja` y `contabilidad`; **nunca al revés**. Esta capa no importa ninguna de las
dos: lee `cashDocument` y `accountingDocument` por el cliente de transacción,
no por sus servicios.

**Sin server actions.** Se siguió el precedente de FF1.0: ninguna pantalla
consume esto todavía y exponer endpoints RPC sin uso ampliaría la superficie de
ataque sin beneficio. El parche que introduzca la pantalla de cobranza los
envolverá.

### Decisiones que conviene preservar

1. **Una obligación por documento de origen, garantizada por la base.** Los dos
   únicos nulables hacen imposible duplicar la deuda, y permiten que el traspaso
   Caja → Contabilidad (FF1.3) **agregue el enlace contable a la obligación que
   ya existe** en vez de crear una segunda.
2. **`partyName` denormalizado y obligatorio.** Un documento de caja puede
   nombrar a un cliente de mostrador que no existe en ninguna tabla. Sin este
   campo, esa cobranza no tendría dueño.
3. **`XOR` de origen validado en el servicio, no en la base.** Un `CHECK` lo
   expresaría, pero Prisma no puede declararlo en el esquema: viviría solo en el
   SQL de la migración y cada `prisma migrate dev` posterior lo detectaría como
   deriva — la misma trampa que FF1.0 documentó al elegir columna en lugar de
   índice parcial.
4. **Saldo sin piso en cero**, a diferencia de `calculateCashBalance` de Caja.
   Aquella pone piso porque resume pagos de borrador sin validar; aquí la
   sobreaplicación se rechaza al escribir, así que un saldo negativo significa
   que algo evitó el servicio y debe **verse**, no ocultarse.
5. **Numeración propia provisional.** El cobro usa `COB-AAAAMMDD-XXXXXXXX`, la
   misma forma que el resto del proyecto. Adoptar el servicio secuencial de
   FF1.0 exige un valor nuevo en `FinancialDocumentSeries` (migración de enum) y
   una serie configurada por sucursal; una serie sin configurar falla cerrada
   por diseño, lo que dejaría una instalación nueva sin poder registrar cobros.
   Queda marcado con `TODO(FF1.0-numbering)`.

---

## 8. Integración futura

| Módulo | Qué consumirá |
|---|---|
| **FF1.2-C · Cobro en ventanilla** | Registrará un `CashPayment` (para el arqueo) y su `ReceivablePayment` espejo enlazado por `cashPaymentId`, en la misma transacción. |
| **FF1.3 · Traspaso Caja → Contabilidad** | Al materializar el `AccountingDocument` de un documento de caja, completará `accountingDocumentId` en la obligación **existente**; no creará otra. |
| **FF1.4 · Motor de contabilización** | Cada aplicación de cobro es el hecho económico que produce el asiento «banco/caja contra cartera». El componente `ABONO_APLICADO` de FF1.0 ya existe para esto; **falta un `AccountingEventType` para el cobro independiente**, que es una migración de enum de FF1.4. |
| **FF1.5 · Reportes** | Antigüedad de saldos, estado de cuenta por cliente y cartera por sucursal salen de estas tablas sin ningún cálculo adicional. |
| **POS / Facturación** | Emitirán el documento; la obligación se registra desde él. La cobranza no cambia. |
| **Créditos (EX-06)** | Si la empresa activa cartera propia, un plan de cuotas se modela como varias obligaciones con distintos `dueDate` sobre el mismo documento de origen — o como una entidad de plan que las genere. Decisión pendiente. |

---

## 9. Verificación pendiente

La migración `20260804120000_accounts_receivable_foundation` es **puramente
aditiva** (tres enums, tres tablas, sus índices y sus claves foráneas) y se
contrastó línea por línea contra la salida de
`prisma migrate diff --from-empty`: **cero divergencias**.

**No se aplicó a ninguna base de datos**: PostgreSQL no era alcanzable en la
máquina de entrega (`localhost:15432`), la misma situación de FF1.0, FF1.1-A y
FF1.1-B. Antes de dar FF1.2-B por cerrado hay que ejecutar `prisma migrate
deploy`, `prisma migrate status` y un `SMOKE-FF1.2-B` que ejercite al menos:

1. Registrar obligación desde documento de caja emitido.
2. Registrar la misma dos veces: la segunda se rechaza con mensaje de negocio.
3. Registrar desde documento en borrador: rechazado.
4. Cobro sin aplicaciones: queda como anticipo con remanente completo.
5. Aplicar el anticipo parcialmente: saldo y remanente cuadran.
6. Aplicar más que el saldo de la obligación: rechazado.
7. Aplicar más que el remanente del cobro: rechazado.
8. Aplicar con monedas distintas: rechazado.
9. Saldar por completo: `settledAt` se escribe una sola vez.
10. Revertir la aplicación: `settledAt` se limpia y el anticipo se recupera.
11. Revertir el cobro completo: todas sus aplicaciones quedan REVERTIDA y las
    obligaciones vuelven a deber.
12. Anular una obligación con aplicaciones activas: rechazado.
13. Dos aplicaciones concurrentes sobre el mismo saldo: solo una gana.
14. Posición del cliente: deuda, anticipos y neto cuadran con las filas.
15. Ningún evento de auditoría se pierde en ninguno de los casos anteriores.

---

## 10. Supuestos que requieren validación del contador

1. **Un anticipo es un pasivo con el cliente hasta que se aplica.** El modelo lo
   asume; el asiento correspondiente lo definirá el mapeo de FF1.4.
2. **La aplicación de un cobro puede cruzar sucursales.** Se permite porque los
   clientes pertenecen a MotoMas, no a una sucursal (PROJECT_RULES §5). Si
   contabilidad exige cartera por sucursal, esto debe restringirse.
3. **Una nota de crédito no reduce automáticamente la obligación.** Hoy debe
   registrarse como una obligación aparte o resolverse con una reversión. Cómo
   se compensa una nota contra su documento original sigue siendo la pregunta
   abierta que FF1.2-A dejó registrada.
4. **El vencimiento es opcional y no se calcula.** No hay condiciones de pago
   por cliente; `dueDate` se captura a mano.
5. **No hay intereses por mora ni recargos.** `overdue` es informativo.
6. **La retención no forma parte del saldo por cobrar**: `originalAmount` toma
   el total del documento, que ya está neto de retenciones. Si contabilidad
   espera cobrar el bruto y registrar la retención al cobrar, el modelo debe
   cambiar.
