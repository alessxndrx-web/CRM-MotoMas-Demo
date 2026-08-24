# Contrato contable del motor de contabilización

**Parche FF1.4-G.** Documento de arquitectura. No introduce comportamiento: no
hay cambio de esquema, de motor, de pipeline, de estrategia ni de UI.

Formaliza el contrato que emergió entre FF1.4-A y FF1.4-F, entre cinco piezas
que hasta ahora se coordinaban por convención tácita:

    Estrategia  →  Motor  →  Mapeo  →  AccountingEventComponent  →  Matriz

Complementa `POSTING_ENGINE.md`, que describe *cómo* funciona el motor. Este
describe *qué significa* lo que produce.

---

## Notación epistémica

Cada afirmación lleva su origen. **Nunca se mezclan.**

| Marca | Significado |
|---|---|
| **[R]** | Verificado por inspección del repositorio. Cita archivo y línea. |
| **[E]** | Verificado en ejecución contra PostgreSQL (suites SMOKE-FF1.3-C … FF1.4-F). |
| **[I]** | Inferencia lógica a partir de [R]/[E]. Puede ser incorrecta si cambia una premisa. |
| **[C]** | Supuesto contable. **No demostrable desde el repositorio.** |
| **[D]** | Decisión de negocio pendiente. Requiere al contador. |

Donde no hay marca, es prosa organizativa sin contenido factual.

---

## Fase 0 — Auditoría completa de eventos y componentes

**[R]** El enum `AccountingEventType` tiene **17 valores**
([schema.prisma:505-522](../prisma/schema.prisma#L505-L522)). El enum
`AccountingEventComponent` tiene **13**
([schema.prisma:527-541](../prisma/schema.prisma#L527-L541)). La matriz
`eventComponentMatrix`
([account-mapping/shared.ts:106-149](../src/server/finance/account-mapping/shared.ts#L106-L149))
cubre los 17 eventos.

**[R]** Hay **11 estrategias registradas**
([strategies/index.ts](../src/server/finance/posting/strategies/index.ts)):
1 comprobante, 4 documentos contables, 4 documentos de caja, 1 gasto, 1 planilla.
**6 eventos no tienen estrategia.**

### La distinción que este documento existe para fijar

**[R]** La matriz declara qué componentes pueden **mapearse**, no qué
componentes se **emiten**. Son conjuntos distintos, y en 9 de 17 eventos no
coinciden.

**[I]** Consecuencia directa: un contador puede crear una regla de mapeo
perfectamente válida —pasa `isComponentAllowedForEvent`, pasa la validación del
conjunto, se activa sin advertencia— que **ninguna estrategia consultará jamás**.
La regla queda muerta y silenciosa.

### Matriz de auditoría

| Evento | Componentes permitidos **[R]** | Emitidos por la estrategia **[R]** | Ambigüedad de negocio | Limitación del modelo |
|---|---|---|---|---|
| `CAJA_FACTURA` | SUBTOTAL, RET_1, RET_2, ABONO, TOTAL, PAGO×4 | SUBTOTAL + deducciones ≠0 + PAGO ≠0. **Nunca TOTAL** | — | Sobrecobro no validado |
| `CAJA_RECIBO` | TOTAL, PAGO×4 | PAGO ≠0. **Nunca TOTAL** | **[D]** ¿PAGO por método o TOTAL agregado? §12 de POSTING_ENGINE | — |
| `CAJA_NOTA_DEBITO` | SUBTOTAL, TOTAL | SUBTOTAL | **[D]** dirección de la nota la fija el mapeo | — |
| `CAJA_NOTA_CREDITO` | SUBTOTAL, TOTAL | SUBTOTAL | **[D]** ídem | — |
| `CAJA_CIERRE` | DIF_SOBRANTE, DIF_FALTANTE | **ninguno — sin estrategia** | — | Falta fondo inicial (CJ-15) y movimientos de efectivo (CJ-16) |
| `DOCUMENTO_FACTURA` | SUBTOTAL, RET_1, RET_2, ABONO, TOTAL | SUBTOTAL + deducciones ≠0. **Nunca TOTAL** | — | — |
| `DOCUMENTO_NOTA_DEBITO` | SUBTOTAL, TOTAL | SUBTOTAL | **[D]** dirección | — |
| `DOCUMENTO_NOTA_CREDITO` | SUBTOTAL, TOTAL | SUBTOTAL | **[D]** dirección | — |
| `DOCUMENTO_RECIBO_OFICIAL_CAJA` | TOTAL | TOTAL | — | Rechaza si trae retención o abono |
| `GASTO` | SUBTOTAL, RET_1, RET_2, TOTAL | SUBTOTAL + retenciones ≠0. **Nunca TOTAL** | — | **Sin componente de impuesto** |
| `COMPROBANTE_INGRESO` | TOTAL | **ninguno — sin estrategia** | — | — |
| `COMPROBANTE_EGRESO` | TOTAL | TOTAL | — | — |
| `COMPROBANTE_CHEQUE` | TOTAL | **ninguno** | — | — |
| `COMPROBANTE_TRANSFERENCIA` | TOTAL | **ninguno** | — | — |
| `COMPROBANTE_REEMBOLSO` | TOTAL | **ninguno** | — | — |
| `COMPROBANTE_AJUSTE` | TOTAL | **ninguno** | — | — |
| `PLANILLA` | PLANILLA_NETO, PLANILLA_DEDUCCIONES | ambos ≠0 | — | **Sin componente de anticipo. Sin evento de pago. Sin componente bruto.** |

**[R]** `TOTAL` está permitido en 9 eventos y se emite en 2
(`DOCUMENTO_RECIBO_OFICIAL_CAJA`, `COMPROBANTE_EGRESO`). En `GASTO`,
`DOCUMENTO_FACTURA`, `CAJA_FACTURA` y las cuatro notas es **mapeable y nunca
emitido**.

---

## Fase 1 — Contrato de componentes

Para cada componente: significado, clase, coexistencia, exclusión, valor cero y
comportamiento esperado del mapeo.

**[R] Comportamiento de valor cero, uniforme y doble.** El builder omite todo
componente cuyo importe redondee a cero
([builder.ts:48](../src/server/finance/posting/builder.ts#L48)), y además cada
estrategia filtra los ceros antes de emitirlos. Un componente en cero **nunca
produce líneas y nunca exige regla de mapeo**. `validatePostingPlan` exige
además que la suma del plan sea > 0
([validator.ts:86](../src/server/finance/posting/validator.ts#L86)).

**[R] Ningún componente admite importes negativos.**
`validatePostingPlan` los rechaza
([validator.ts:68-91](../src/server/finance/posting/validator.ts#L68-L91)) con
una razón explícita: un importe negativo significaría "invierte los lados", y
esa decisión pertenece al mapeo.

### Clase: bruto declarado

#### `SUBTOTAL`

- **Semántica** — el hecho económico bruto, antes de toda deducción.
- **Contable** — el importe que debe reconocerse íntegro en la cuenta de
  resultado o de gasto del evento.
- **Coexiste con** — `RETENCION_1`, `RETENCION_2`, `ABONO_APLICADO`, `PAGO_*`.
- **Nunca coexiste con** — `TOTAL`. **[R]** Ninguna estrategia los emite juntos.
  **[I]** Emitir ambos reconocería el mismo dinero dos veces, porque cada
  componente genera un par débito/crédito independiente
  ([builder.ts:62-79](../src/server/finance/posting/builder.ts#L62-L79)).
- **Mapeo esperado [C]** — debita la cuenta de resultado/gasto y acredita la
  cuenta de balance del tercero (por cobrar o por pagar), o a la inversa según
  la naturaleza del evento.

#### `IMPUESTO` — parche FF2.0-A

- **Semántica** — impuesto cargado sobre el subtotal.
- **Contable** — **[I] el único modificador que SUMA** al saldo del tercero. Toda
  retención resta; el impuesto añade, porque **[R]** `calculateExpenseTotal` es
  `subtotal + impuesto − retenciones`.
- **Clase** — modificador aditivo. No es bruto (no reemplaza a `SUBTOTAL`) ni
  deducción (no reduce nada).
- **Coexiste con** — `SUBTOTAL` **obligatoriamente**, y con las retenciones.
- **Nunca coexiste con** — `TOTAL`.
- **Valor cero** — **[E] verificado**: un gasto sin impuesto no emite el
  componente y **no necesita regla de mapeo**. Contabiliza exactamente el mismo
  asiento que antes de FF2.0-A.
- **Mapeo esperado [C]** — debita la cuenta que reciba el impuesto y acredita la
  misma cuenta de balance del tercero que acredita `SUBTOTAL`. **Que esa cuenta
  sea IVA acreditable (activo) o un gasto hundido es decisión del contador**: el
  motor y la estrategia no saben qué es un impuesto.
- **[R] Invariante ejecutable (X3)** — no puede cancelar a `SUBTOTAL` en ninguna
  de las dos direcciones. Ver Fase 4.
- **[R] Alcance actual** — `GASTO` (FF2.0-A); `DOCUMENTO_FACTURA`,
  `DOCUMENTO_NOTA_DEBITO`, `DOCUMENTO_NOTA_CREDITO` (FF2.0-B); `CAJA_FACTURA`,
  `CAJA_NOTA_DEBITO`, `CAJA_NOTA_CREDITO` (FF2.0-C). **Siete de diecisiete
  eventos.** Fuera quedan los dos recibos (§L-9), los seis `COMPROBANTE_*` y
  `PLANILLA`, cuyos modelos no llevan impuesto, y `CAJA_CIERRE`.
- **[I] La dirección del impuesto la fija el mapeo, no el componente.** En un
  gasto el impuesto suele ser acreditable (activo: se debita); en una factura de
  venta suele ser por pagar (pasivo: se acredita). **El mismo componente sirve
  para ambos** porque solo declara un importe. **[E]** Verificado en las dos
  direcciones: SMOKE-FF2.0-A debita IVA acreditable, SMOKE-FF2.0-B acredita IVA
  por pagar.

#### `TOTAL`

- **Semántica** — el hecho económico completo **cuando no existe descomposición**.
- **Contable** — dos usos distintos, y conviene no confundirlos:
  - en `COMPROBANTE_*` es el único componente del evento: es el bruto **[R]**;
  - en `DOCUMENTO_RECIBO_OFICIAL_CAJA` es el importe cobrado, que constituye el
    hecho entero porque un recibo no reconoce ingreso bruto **[R]**.
- **Coexiste con** — nada. **[R]** En todo evento donde se emite, es el único
  componente emitido.
- **Nunca coexiste con** — `SUBTOTAL`, ni con deducciones, ni con `PAGO_*`.
- **Mapeo esperado [C]** — un único par que representa el movimiento completo.

### Clase: deducción sobre un bruto declarado

Las tres se comportan igual y comparten contrato.

#### `RETENCION_1`, `RETENCION_2`

- **Semántica** — importe retenido a un tercero por mandato fiscal.
- **Contable** — no reduce el bruto reconocido: **traslada** parte del saldo del
  tercero a un pasivo con la administración tributaria.
- **Coexiste con** — `SUBTOTAL` obligatoriamente. **[R]** Ninguna estrategia
  emite una retención sin `SUBTOTAL`.
- **Nunca coexiste con** — `TOTAL`.
- **Mapeo esperado [C]** — debe tocar la cuenta de balance del tercero **en el
  lado opuesto** al que la tocó `SUBTOTAL`, y su contrapartida es el pasivo por
  retenciones. **[E]** Verificado en ambas direcciones: en documento contable
  `SUBTOTAL` debita CxC y la retención la acredita (SMOKE-FF1.4-C); en gasto
  `SUBTOTAL` acredita CxP y la retención la debita (SMOKE-FF1.4-E).

#### `ABONO_APLICADO`

- **Semántica** — anticipo del cliente aplicado contra el documento.
- **Contable** — cancela parte del saldo del tercero contra el pasivo por
  anticipos recibidos. No es un cobro: el dinero entró antes.
- **Coexiste con** — `SUBTOTAL`, retenciones, `PAGO_*`.
- **Nunca coexiste con** — `TOTAL`.
- **Mapeo esperado [C]** — igual que las retenciones, con la contrapartida en
  anticipos de clientes.

### Clase: cobro efectivo

#### `PAGO_EFECTIVO`, `PAGO_TRANSFERENCIA`, `PAGO_CHEQUE`, `PAGO_TARJETA`

- **Semántica** — dinero efectivamente recibido, discriminado por medio.
- **Contable** — incrementa un activo líquido y cancela saldo del tercero.
- **Coexiste con** — `SUBTOTAL` y deducciones (factura de caja parcialmente
  cobrada), o entre sí (recibo con cobro mixto).
- **Nunca coexiste con** — `TOTAL`. **[R]** En `CAJA_RECIBO` la matriz permite
  ambos; la estrategia emite solo `PAGO_*`, porque declarar los dos duplicaría
  el mismo dinero ([cash-document.ts:37-51](../src/server/finance/posting/strategies/cash-document.ts#L37-L51)).
- **Mapeo esperado [C]** — debita caja/banco y acredita la cuenta de balance del
  tercero que `SUBTOTAL` debitó.
- **[R] Regla adicional, solo para recibos**: la estrategia exige que los cobros
  sumen **exactamente** el total; con diferencia, rechaza en vez de elegir
  interpretación. **[R] No existe esa validación para `CAJA_FACTURA`**: un cobro
  superior al total dejaría la cuenta del tercero en signo contrario y nada lo
  impide.

### Clase: ajuste

#### `DIFERENCIA_SOBRANTE`, `DIFERENCIA_FALTANTE`

- **Semántica** — descuadre de arqueo de caja, en cada sentido.
- **Contable** — reconoce un ingreso o una pérdida por diferencia de efectivo.
- **Coexiste con** — nada. Son los dos únicos componentes de `CAJA_CIERRE`.
- **Mutuamente excluyentes entre sí [I]** — un mismo arqueo no puede sobrar y
  faltar. **No verificable en ejecución: no existe estrategia para `CAJA_CIERRE`.**
- **Mapeo esperado [C]** — sin uso hoy.

### Clase: neto residual — la anomalía del catálogo

#### `PLANILLA_NETO`

- **Semántica** — lo que el trabajador recibe después de deducciones.
- **Contable** — **[I] es el único componente del enum que representa un residuo
  que no puede reconstruir por sí mismo el hecho bruto.** Todos los demás son o
  bien el bruto, o bien modificadores de un bruto ya declarado.
- **Coexiste con** — `PLANILLA_DEDUCCIONES`, y **debe** hacerlo cuando hay
  deducciones, o el devengado queda incompleto.
- **Nunca coexiste con** — ningún otro componente del enum.
- **Mapeo esperado [C]** — debita el **gasto de salarios** y acredita el pasivo
  con el trabajador.

#### `PLANILLA_DEDUCCIONES`

- **Semántica** — retenciones practicadas sobre la remuneración.
- **Contable** — **[I] a diferencia de `RETENCION_*`, no traslada saldo: debe
  sumar al gasto**, porque no existe componente bruto que ya lo haya reconocido.
- **Coexiste con** — `PLANILLA_NETO`.
- **Mapeo esperado [C]** — debita **la misma cuenta de gasto de salarios que
  `PLANILLA_NETO`** y acredita el pasivo por retenciones laborales.
- **[E] Verificado** con ese mapeo: salario 20 000 y deducciones 3 000 producen
  gasto 20 000, por pagar 17 000, retenciones 3 000 (SMOKE-FF1.4-F §3).
- **[I] Con otro mapeo el asiento cuadra y es incorrecto.** Ver Fase 4, C2.

---

## Fase 2 — Contrato de eventos

Semántica, no código. Para la implementación, ver cada estrategia.

### `DOCUMENTO_FACTURA` y `CAJA_FACTURA`

- **[R] Aritmética del modelo**, idéntica en ambos desde FF2.0-C:
  `total = max(subtotal + impuesto − abono − ret1 − ret2, 0)`.
- **Hecho económico**: `SUBTOTAL`.
- **Modificadores**: `IMPUESTO` ≠0 (aditivo); deducciones ≠0; en caja además
  `PAGO_*` ≠0.
- **[E] Interacción de los cuatro en caja**: subtotal 10 000, impuesto 1 500,
  retención 200, cobro en efectivo 5 000 ⇒ ingreso 10 000 · IVA 1 500 · caja
  5 000 · CxC pendiente 6 300. El total del modelo es 11 300 y lo cobrado lo
  reduce a 6 300 **sin componente propio**: el saldo vive en la cuenta que el
  mapeo nombró.
- **Prohibido**: `TOTAL` — el residuo ya está implícito en el saldo de la cuenta
  del tercero. **[I]** Declararlo duplicaría el bruto.
- **Combinación válida**: `SUBTOTAL` + (deducciones ≠0) + (`PAGO_*` ≠0).
- **Fuera de la contabilización**: el saldo pendiente de cobro. No tiene
  componente: **[I]** vive como saldo de la cuenta que el mapeo nombró, lo cual
  es correcto y no requiere regla adicional.

### `DOCUMENTO_RECIBO_OFICIAL_CAJA`

- **Hecho económico**: `TOTAL`.
- **Prohibido**: todo lo demás. **[R]** La estrategia rechaza el documento si
  trae retención o abono, porque la deducción no tendría componente donde viajar.
- **Fuera de la contabilización**: la imputación del cobro a facturas concretas.

### `CAJA_RECIBO`

- **Hecho económico**: `PAGO_*` por método.
- **[D] Ambigüedad no resuelta**: la matriz permite también `TOTAL`. Se
  implementó `PAGO_*` por dominancia —mueve el mismo importe y conserva más
  información— pero **si la empresa no quiere cuentas por medio de cobro, la
  lectura correcta es `TOTAL` y la estrategia debe cambiar.** Sigue sin decidirse.
- **[R] Rechazo explícito** cuando los cobros no cubren exactamente el total.

### `GASTO`

- **[R] Aritmética**: `total = max(subtotal + impuesto − ret1 − ret2, 0)`. El
  impuesto **suma**, a diferencia de todos los demás eventos.
- **Hecho económico**: `SUBTOTAL`.
- **Modificadores**: `IMPUESTO` ≠0 (aditivo) y retenciones ≠0 (sustractivas).
- **Prohibido**: `TOTAL`.
- **Fuera de la contabilización**: nada desde FF2.0-A.
- **[R] Rechazos**: subtotal ≤ 0; retenciones > subtotal **+ impuesto** — el
  umbral cambió con FF2.0-A porque el impuesto forma parte de lo adeudado.
- **[E] Interacción entre los tres**: subtotal 10 000, impuesto 1 500,
  retención 200 ⇒ gasto 10 000 · IVA 1 500 · CxP 11 300, que es el `total` del
  modelo. El impuesto **nunca infla el gasto** y las retenciones **nunca tocan
  el impuesto**: cada componente es un par independiente.

### `PLANILLA`

- **[R] Aritmética**: `neto = max(salario + comisiones + bonos − deducciones − anticipos, 0)`.
- **Hecho económico**: **emergente**, no declarado —
  `PLANILLA_NETO + PLANILLA_DEDUCCIONES` = devengado, identidad que **solo se
  sostiene si `anticipos = 0`** **[R]**.
- **Combinación válida**: ambos componentes, omitiendo el que valga cero.
- **Prohibido**: cualquier otro componente del enum.
- **Fuera de la contabilización**: **el pago**. Ver Fase 3, L-3.
- **[R] Rechazos**: anticipos > 0; deducciones > devengado; neto inconsistente
  con sus partes.

### `LIQUIDACION_IVA` (FF2.0-D)

- **Hecho económico**: `IMPUESTO`, y nada más. Una cifra: el IVA neto que se
  debe a la administración o que se recupera de ella.
- **Prohibido**: todo lo demás. No hay bruto que reconocer, nada se cobró y
  nada se retuvo.
- **[R] Es el único evento del catálogo cuyo componente único es `IMPUESTO`**, y
  el único donde `IMPUESTO` **no** modifica a otro componente. De ahí que **X3
  no le aplique**: sin `SUBTOTAL` en el evento no hay nada que cancelar, y
  `validateAdditiveModifiers` retorna vacío. **[E]** Verificado: un conjunto con
  solo la regla de liquidación es válido.
- **[R] Modelo de negocio (FF2.0-E)**: `VatSettlement`, con ciclo
  `BORRADOR → EJECUTADA`, sin anulación y sin transición hacia atrás. La
  ejecución es el punto de reconocimiento: exige permiso `review` y congela el
  registro.
- **[R] La identidad es sucursal+período, no el id de la fila.**
  `@@unique([branchId, period])` y la clave de idempotencia
  `LIQUIDACION_IVA:VAT_SETTLEMENT:<sucursal>:<período>` dicen lo mismo desde los
  dos lados. Se eligió el período —y no el id— porque **sobrevive a que un
  borrador se elimine y se vuelva a crear**; el id haría que «el mismo período»
  fuera un hecho distinto cada vez. **[E]** Verificado, incluso en concurrencia.
- **Fuera de la contabilización**: **el cálculo del importe**. La estrategia
  **no lee el mayor** para averiguar cuánto se debe; recibe la cifra ya
  determinada. Conciliarla contra los saldos acumulados de IVA es un asunto de
  reportes que este parche no toca — ver §L-10.
- **[C] Dirección**: un período puede cerrar debiendo o a favor. El componente
  solo declara un importe; qué cuenta se debita y cuál se acredita lo decide el
  mapeo. **[E]** Verificado en ambos sentidos con dos conjuntos opuestos.

### `COMPROBANTE_EGRESO` (y los cinco `COMPROBANTE_*` sin estrategia)

- **Hecho económico**: `TOTAL`, único componente permitido.
- **[I]** Es el contrato más simple del catálogo y por eso fue el primero
  implementado (FF1.3-B): con un solo componente no hay nada que derivar.
- Los otros cinco resuelven a un evento sin estrategia y fallan con
  `STRATEGY_NOT_FOUND` **[R]** — respuesta honesta, no silenciosa.

### `CAJA_CIERRE`

- **Hecho económico**: la diferencia de arqueo.
- **Deliberadamente fuera del motor** **[R]**: mientras el efectivo esperado sea
  solo lo cobrado, un turno con fondo de cambio produce un sobrante inexistente.

---

## Fase 3 — Limitaciones del modelo

No se resuelven aquí. Se documentan.

### ~~L-1 · No existe componente de impuesto~~ → **CERRADA en FF2.0-A**

- **Resuelta** — `IMPUESTO` se añadió al enum
  (`20260807120000_tax_component`) y a la fila `GASTO` de la matriz. **[E]** Un
  gasto de 1000 con impuesto 150 produce gasto 1000, IVA 150 y CxP 1150.
- **Lo que la migración NO resolvió [R]** — `AccountingDocument` y
  `CashDocument` **no tienen columna de importe de impuesto**: solo `subtotal`,
  `retention1`, `retention2`, `appliedPayment` y `total`. Sus `taxId` son el
  número de identificación tributaria, un string. Así que documentos y facturas
  de caja gravados siguen sin poder existir — no por falta de componente, sino
  porque **el dato no existe en el modelo de negocio**.
- **Qué requeriría** — columnas nuevas en esas dos tablas, cambiar
  `calculateAccountingDocumentTotal` y `calculateCashDocumentTotal`, y con ello
  el significado de los totales ya almacenados. **Es una expansión del modelo de
  negocio, no del contable**, y queda como L-8.

### ~~L-8 · Documentos y caja no llevan importe de impuesto~~ → **CERRADA**

- **FF2.0-B** — `AccountingDocument.tax` (`20260808120000_document_tax_amount`).
- **FF2.0-C** — `CashDocument.tax` (`20260809120000_cash_document_tax_amount`).
- **[R] Las dos fórmulas volvieron a coincidir**:
  `subtotal + impuesto − abono − retenciones`, piso 0, en documento contable y
  en caja. La asimetría que FF2.0-B introdujo duró un parche y está cerrada.
- **[E]** Una factura de caja de 1000 con impuesto 150 produce ingreso 1000,
  IVA por pagar 150 y CxC 1150 — las mismas cifras que su gemela contable.
- **[E] Lo predicho en FF2.0-A se cumplió dos veces**: habilitar el impuesto
  costó una línea por evento en la matriz y una entrada en la lista de
  modificadores. **Sin migración de enum, sin tocar el motor.**
- **[R] Caja tiene dos implementaciones de la fórmula** —
  `calculateDocumentTotalDecimal` (Decimal, escribe la columna) y
  `calculateCashDocumentTotal` (número, el resto de la capa). **Ambas llevan el
  término.** Es duplicación preexistente, señalada aquí porque ahora hay dos
  sitios que mantener en paso.

### L-10 · La liquidación no se calcula, se declara

- **Problema [R]** — `LIQUIDACION_IVA` recibe el importe ya determinado. Nada en
  el repositorio calcula el IVA neto de un período a partir de los saldos que
  FF2.0-A…C acumulan, ni comprueba que la cifra declarada coincida con ellos.
- **Por qué el modelo no lo expresa [R]** — no hay tabla de liquidaciones, ni
  consulta de saldos por cuenta y período, ni reporte de IVA. Calcularlo exigiría
  saber **qué cuentas** son de IVA, y eso es precisamente C7: la correspondencia
  entre componente y cuenta nunca se definió.
- **¿Migración?** — no necesariamente; sí un modelo de reporte y **[D]** la
  decisión contable de qué cuentas componen la posición de IVA.
- **Consecuencia operativa [I]** — una liquidación puede declararse por un
  importe que no corresponde a lo acumulado, y el sistema la contabilizará sin
  protestar. **La corrección del importe es responsabilidad humana.**
- **[R] FF2.0-E no cambió esto.** El modelo `VatSettlement` guarda el importe
  declarado; nada lo deriva ni lo contrasta. El flujo hace la liquidación
  *alcanzable*, no *correcta*.

### L-9 · Los recibos no admiten impuesto

- **Problema [R]** — ni `DOCUMENTO_RECIBO_OFICIAL_CAJA` ni `CAJA_RECIBO` tienen
  componente bruto al que el impuesto pueda sumarse.
- **Por qué no se añadió [I]** — un recibo no reconoce ingreso bruto; su total
  **ya incluye** cualquier impuesto que el documento original cobró. Declarar
  `IMPUESTO` ahí lo contaría dos veces.
- **[E] Comportamiento actual**: un recibo con impuesto se **rechaza** con el
  mensaje de componente no admitido. No se pierde el movimiento en silencio.
- **[D]** Si el negocio necesita recibos que discriminen impuesto, es un cambio
  de semántica del evento, no una fila de matriz.

### L-2 · No existe componente de anticipo de planilla

- **Problema** — una planilla con anticipos no puede contabilizarse.
- **Por qué [R]** — un solo componente de deducción para dos deducciones
  económicamente distintas. Una regla nombra un solo par de cuentas, así que
  compartir componente mandaría la recuperación del anticipo a la cuenta de
  retenciones; omitirlo subestima el gasto.
- **¿Migración?** — **Sí**, más decisión contable sobre la cuenta de destino.
- **Consecuencia operativa** — **[R]** planilla con anticipos bloqueada en
  `BORRADOR`.

### L-3 · No existe evento de pago de planilla

- **Problema** — el pago de la nómina no genera asiento.
- **Por qué [R]** — `PLANILLA` es el único evento de planilla y sus componentes
  describen el devengo. No hay evento que exprese *debitar salarios por pagar
  contra banco*.
- **¿Migración?** — **Sí.** Valor nuevo en `AccountingEventType` y componentes.
- **Consecuencia operativa** — **[E] verificado**: marcar `PAGADA` no crea
  asiento. **[I]** El mayor acumula `Salarios por pagar` que nada cancela; el
  saldo crece cada mes indefinidamente y **el cierre mensual no cuadrará con la
  realidad bancaria**.

### L-4 · Caja sin fondo inicial ni movimientos de efectivo

- **Problema** — `CAJA_CIERRE` no es contabilizable.
- **Por qué [R]** — no existen los campos de fondo inicial (CJ-15) ni de
  movimientos de efectivo (CJ-16); el esperado es solo lo cobrado.
- **¿Migración?** — **Sí**, en los modelos de caja.
- **Consecuencia operativa** — las diferencias de arqueo no llegan al mayor.

### L-5 · Planilla sin columna de fecha

- **Problema** — el asiento necesita fecha; `PayrollRecord` solo tiene `period`.
- **Por qué [R]** — el modelo no tiene columna de fecha contable.
- **¿Migración?** — no imprescindible: **[R]** se deriva el último día del
  período en UTC, y como `accountingPeriodOf` compara el prefijo `YYYY-MM`
  ([periods.ts:41-44](../src/server/finance/periods.ts#L41-L44)), cualquier día
  del mes bloquea igual.
- **Consecuencia operativa [C]** — la fecha del asiento es una elección razonada
  sin confirmar por el contador.

### L-6 · `Expense.accountId` ignorado

- **Problema** — el modelo deja elegir cuenta por gasto; el motor resuelve por
  mapeo. **[R]** La columna no se usa al contabilizar.
- **¿Migración?** — no; requiere mecanismo de anulación por origen que el motor
  no tiene.
- **Consecuencia operativa** — quien eligió una cuenta en el formulario verá
  otra en el mayor, sin aviso.

### L-7 · `Expense.voucherId` — doble contabilización posible

- **Problema [R]** — un gasto puede apuntar a un comprobante. Si el comprobante
  de egreso ya se contabilizó, el mismo hecho puede quedar registrado dos veces.
- **Por qué el motor no lo detecta [R]** — son dos orígenes distintos
  (`EXPENSE`, `ACCOUNTING_VOUCHER`) con claves de idempotencia distintas.
- **¿Migración?** — no; requiere decisión de negocio sobre cuál es el asiento.
- **Consecuencia operativa** — gasto duplicado en resultados. **No hay defensa
  implementada.**

---

## Fase 4 — Invariantes de arquitectura

### Invariantes que el repositorio **sí** enforza

Verificadas por inspección, con cita.

| # | Invariante | Dónde |
|---|---|---|
| R1 | El componente pertenece a la matriz del evento | [validation.ts:42](../src/server/finance/account-mapping/validation.ts#L42), [service.ts:431](../src/server/finance/account-mapping/service.ts#L431) |
| R2 | Débito ≠ crédito en toda regla | [validation.ts:48](../src/server/finance/account-mapping/validation.ts#L48) |
| R3 | Ambas cuentas existen y admiten movimiento (FF1.1) | [validation.ts:57-64](../src/server/finance/account-mapping/validation.ts#L57-L64) |
| R4 | Una sola regla por (conjunto, evento, componente) → resolución determinista | `@@unique([setId, event, component])`, [schema.prisma:2161](../prisma/schema.prisma#L2161) |
| R5 | Un componente sin mapeo aborta **toda** la contabilización | [mapping.ts:90](../src/server/finance/posting/mapping.ts#L90) |
| R6 | Importes negativos rechazados | [validator.ts:68-91](../src/server/finance/posting/validator.ts#L68-L91) |
| R7 | Componente en cero no produce líneas ni exige mapeo | [builder.ts:48](../src/server/finance/posting/builder.ts#L48) |
| R8 | El asiento cuadra o no se escribe | [validator.ts:121](../src/server/finance/posting/validator.ts#L121) |
| R9 | Un conjunto vacío no se activa | [validation.ts:79-81](../src/server/finance/account-mapping/validation.ts#L79-L81) |

**[I] Propiedad estructural**: R2 + R4 + R7 hacen que todo asiento del motor esté
**cuadrado por construcción**. R8 es red de seguridad, no la única defensa.

### Invariantes de conjunto ahora ejecutables — parche FF1.5-A

**[R]** La causa raíz que documentó FF1.4-G era que la validación del mapeo era
**regla por regla**. FF1.5-A añadió `validateSetRelationships`
([validation.ts](../src/server/finance/account-mapping/validation.ts)), invocada
desde el mismo `validateMappingSet` que la activación ya consultaba
([service.ts:307](../src/server/finance/account-mapping/service.ts#L307)). No
hubo pipeline nuevo ni DTO nuevo: el punto de rechazo ya existía.

| # | Invariante ejecutable | Evidencia que la sostiene |
|---|---|---|
| **X1** | Si un evento tiene reglas, debe tener la de su **componente base**: `SUBTOTAL` donde la matriz lo contiene, `PLANILLA_NETO` en planilla | **[R]** Las tres fábricas de estrategias construyen su lista empezando por `SUBTOTAL` y solo añaden modificadores ≠0. Un conjunto sin la base **no puede contabilizar el evento en absoluto**: el motor falla cerrado ante el primer componente sin mapeo |
| **X2** | En `PLANILLA`, ningún componente puede debitar la cuenta que el otro acredita | **[R]** `PLANILLA` no tiene componente bruto; el devengado solo existe como suma de los dos. Si se cancelan, el devengado nunca llega al mayor **y el asiento cuadra igual** |
| **X3** | `IMPUESTO` no puede cancelar a `SUBTOTAL` en ninguna dirección | **[R]** `calculateExpenseTotal` **suma** el impuesto. Si el impuesto debita lo que el subtotal acredita, el saldo queda en `subtotal − impuesto` y contradice el `total` almacenado; si acredita lo que el subtotal debita, el gasto se encoge por el impuesto. Ambas cuadran y ambas mienten |

**[E] Verificado** (SMOKE-FF1.5-A, 34 aserciones): X1 y X2 rechazan; la
activación se rechaza y el conjunto **queda en `BORRADOR`** sin `activeBranchKey`
ni `activatedAt`; y los mapeos exactos de FF1.4-C/D/E/F siguen siendo válidos.

**[I] X1 no rechaza nada que hoy funcione.** Un conjunto sin su componente base
ya fallaba al contabilizar; ahora falla al activar. Es detección más temprana de
una configuración que nunca pudo servir, no una prohibición nueva.

**[R] `TOTAL` no se trata como base**, deliberadamente: `CAJA_RECIBO` lo permite
y ninguna estrategia lo emite, así que exigirlo obligaría a crear una regla
muerta. **[E]** El escenario 13 del smoke fija esa decisión: un recibo mapeado
solo con `PAGO_*` es válido.

### Invariantes que siguen siendo **solo** contrato

**Pueden violarse creando un mapeo que se activa sin protesta.** Cada una lleva
la razón por la que FF1.5-A **no** la hizo ejecutable.

| # | Invariante | Si se viola | Por qué no se enforza |
|---|---|---|---|
| **C1** | `TOTAL` y `SUBTOTAL` nunca se emiten para el mismo evento | Doble reconocimiento del bruto | **[R]** Ninguna estrategia los emite juntos, así que mapear ambos produce una regla muerta, no un asiento doble. Rechazarlo invalidaría configuraciones previsoras |
| **C2′** | `PLANILLA_NETO` y `PLANILLA_DEDUCCIONES` **comparten** cuenta de débito | Gasto de salarios repartido donde el contador no lo espera | **[C]** Repartir el gasto entre dos cuentas de gasto es presentación legítima y el repositorio no prueba nada en contra. **X2 cubre la parte demostrable**: la cancelación |
| **C3** | Una deducción toca la cuenta de balance del tercero **en el lado opuesto** a `SUBTOTAL` | El bruto se reconoce bien, el reparto queda mal | **[I]** No pude demostrar que ninguna configuración legítima toque otras cuentas. Rechazar por inferencia arriesga bloquear una activación válida |
| **C4** | `PAGO_*` acredita la cuenta que `SUBTOTAL` debitó | El cobro no reduce la cuenta por cobrar | Igual que C3 |
| **C5** | En `CAJA_FACTURA`, Σ`PAGO_*` ≤ `TOTAL` | Cuenta del tercero en signo contrario | **[R]** Depende del documento, no de la configuración. Un validador de mapeo no puede verlo |
| **C6** | No mapear componentes que ninguna estrategia emite | Reglas muertas y silenciosas | **[R]** Requeriría que cada estrategia declarase su conjunto emisible — una modificación de las 11 estrategias, fuera del alcance de un parche de validación |
| **C7** | Tipo y naturaleza de la cuenta corresponden a la semántica del componente | Gasto mapeado contra un pasivo, etc. | **[D]** Nadie ha definido nunca esa correspondencia. Inventarla sería política contable |

**[R] Dato que sigue agravando todo lo anterior**: no existe **ninguna**
`AccountMappingRule` en ningún seed del repositorio. No hay configuración de
referencia contra la cual contrastar. Todo el contrato de la Fase 1 se aplica a
configuraciones que aún no existen.

---

## Fase 5 — Revisión crítica: ¿sigue siendo cierto "la estrategia decide importes, el mapeo decide cuentas"?

**[R] El principio está escrito** en el diagrama del pipeline
([pipeline.ts:52-68](../src/server/finance/posting/pipeline.ts#L52-L68)):
estrategia = *"which components, how much"*; mapeo = *"components → accounts"*.

### Corrección de una afirmación previa

En la revisión de FF1.4-F sostuve que planilla era **el primer evento donde el
mapeo determina un importe**. **Es demasiado fuerte y hay que corregirlo.**

**[I]** En todo evento multicomponente el mapeo influye en cuánto queda en cada
cuenta. En `DOCUMENTO_FACTURA`, mapear `RETENCION_1` con crédito a la cuenta de
ingreso en vez de a la de CxC reduce el ingreso reconocido de 10 000 a 9 800.
El mapeo siempre pudo redistribuir importes.

### La distinción que sí se sostiene

**[I]** La diferencia real es **dónde vive el bruto**:

| | Bruto | Garantía que ofrece el mapeo |
|---|---|---|
| Todos los eventos salvo planilla | **Declarado** por un componente (`SUBTOTAL` o `TOTAL`) | Mapear bien **ese** componente garantiza la cifra bruta. Un error en las deducciones desvía el reparto, no el bruto |
| **`PLANILLA`** | **Emergente** de dos componentes | **Ningún componente individual puede mapearse "bien".** La corrección es una restricción *entre* dos reglas |

**[I] Conclusión.** El principio sigue siendo válido para 16 de 17 eventos.
`PLANILLA` lo viola de una forma que la capa de mapeo **no tiene vocabulario para
expresar**: valida reglas, no relaciones entre reglas.

**Clasificación de la violación** — es una **limitación de la matriz**, no de la
estrategia ni del motor. **[I]** `PLANILLA` es el único evento portador de valor
sin `SUBTOTAL` ni `TOTAL` (`CAJA_CIERRE` tampoco los tiene, pero es un evento de
diferencias). Esa asimetría sugiere que la fila está **incompleta**, no
deliberadamente mínima. **No es demostrable**: no hay comentario, documento ni
commit que declare la intención del autor de FF1.0.

### Qué prueban los smokes

**[E] Corrección mecánica**: atomicidad, rollback, idempotencia, concurrencia,
bloqueo de período, mecánica de reversión, rechazos, derivación de fecha.
231 aserciones sobre PostgreSQL real.

**No prueban corrección contable.** **[I]** Cada suite crea su propio mapeo y
afirma sobre las cuentas que ella misma configuró: fixture y aserción los
escribió la misma mano. Donde el contrato es contract-only (C1-C7), el smoke
confirma la configuración que eligió, no la que usará el contador.

---

## Fase 6 — Bloqueantes de producción

### BLOQUEANTES · requeridos antes de producción

| # | Asunto | Por qué bloquea |
|---|---|---|
| ~~B-1~~ | ~~Sin contrato de mapeo verificable para `PLANILLA`~~ | **Parcialmente cerrado por FF1.5-A.** X2 rechaza la configuración que pierde el devengado. **Queda abierto C2′**: el reparto del gasto entre cuentas sigue sin validar y sigue necesitando al contador |
| B-2 | **Sin camino de reversión para gasto y planilla** | **[R]** `reversePosting` no tiene ningún llamador en `src/`. Comprobantes y documentos de caja revierten por anulación; gasto y planilla no tienen anulación. Contabilizado + inmutable + irreversible = error permanente |
| ~~B-3~~ | ~~L-1: gastos con impuesto bloqueados~~ | **Cerrado por FF2.0-A.** Los gastos gravados se contabilizan. **Sustituido por L-8**: documentos y facturas de caja siguen sin poder llevar impuesto, y ese volumen es mayor que el de gastos |

### DEUDA TÉCNICA · puede esperar

| Asunto | Nota |
|---|---|
| `journalSource: "MANUAL"` en planilla | **[R]** Solo etiqueta; no gobierna lógica. Mezcla asientos de máquina con ajustes manuales en el único eje que los separa |
| Un asiento y un `PostingRecord` por empleado | **[R]** Sin acción masiva. 200 empleados = 200 transacciones/mes |
| Superficie muerta en los seams | `postAccountingVoucher`, `postAccountingDocument`, `postExpense`, `postPayrollRecord` sin llamadores. Cuarta repetición del patrón |
| `markPayrollRecordPaidAction` con `$transaction` crudo | Devuelve `{ok:false}` desde dentro de transacción interactiva — la trampa FF1.0. Hoy inocuo |
| Guard de consistencia del neto inalcanzable | **[I]** Con `anticipos=0` y `deducciones≤devengado` siempre se satisface. Red de integridad, no validación de negocio |
| **Comentarios engañosos en el seam** | **[R]** [posting.ts:487](../src/server/contabilidad/posting.ts#L487) y [:653](../src/server/contabilidad/posting.ts#L653) afirman que la reversión "queda disponible por el motor". **Es falso**: no hay llamador. **No se corrigen en este parche porque prohíbe tocar código**; deben corregirse en el siguiente |

### DECISIONES DE NEGOCIO · requieren al contador

| Asunto |
|---|
| **[D]** Contrato de mapeo de `PLANILLA` (C2) — el más urgente |
| **[D]** `CAJA_RECIBO`: ¿`PAGO_*` por método o `TOTAL` agregado? |
| **[D]** Dirección de las notas de débito y crédito (la fija el mapeo, no el código) |
| **[D]** Tratamiento del IVA acreditable en gastos |
| **[D]** Cuenta de recuperación de anticipos de planilla |
| **[D]** ¿Un asiento por empleado o consolidado por período? |
| **[D]** Fecha contable de la planilla (hoy: último día del período) |
| **[D]** `Expense.voucherId`: cuál de los dos es el asiento (L-7) |

### LIMITACIONES DEL MODELO · requieren migración

| # | Migración necesaria |
|---|---|
| ~~L-1~~ | ~~Componente de impuesto~~ — **hecha**: `20260807120000_tax_component` |
| **L-8** | **Columnas de importe de impuesto en `AccountingDocument` y `CashDocument`**, más el cambio de su aritmética de totales. La de mayor impacto pendiente |
| L-2 | Componente de anticipo de planilla |
| L-3 | Evento de pago de planilla en `AccountingEventType` + componentes |
| L-4 | Fondo inicial y movimientos de efectivo en los modelos de caja |

---

## Autorrevisión crítica

### Verificado por inspección del repositorio

Los 17 eventos, los 13 componentes y la matriz completa. Las 11 estrategias
registradas y los 6 eventos sin estrategia. Las 9 invariantes R1-R9 con su
ubicación. Que la validación del mapeo es regla por regla y no cruza
componentes. Que no existe ninguna `AccountMappingRule` en ningún seed. Que
`reversePosting` no tiene llamadores. Que `TOTAL` es mapeable en 9 eventos y
emitido en 2.

### Verificado en ejecución

Solo lo que las seis suites ejercen: mecánica del motor, rechazos, atomicidad,
idempotencia, reversión, bloqueo de período. **231 aserciones.** Las cifras
contables citadas (20 000/17 000/3 000 en planilla, 9 700 en gasto, 8 200 en
documento) son reales, **bajo el mapeo que cada suite configuró**.

### Inferencia — puede ser incorrecta

Que la fila `PLANILLA` de la matriz esté incompleta y no sea deliberada. Que
C1-C7 sean las únicas invariantes cruzadas relevantes: **las derivé de seis
eventos implementados; los 6 eventos sin estrategia podrían añadir más.** Que
las reglas muertas (C6) confundan al configurador — plausible, no observado.

### Supuestos cuestionables que asumo explícitamente

**El "mapeo esperado" de la Fase 1 es `[C]`, no `[R]`.** Lo derivé de la
aritmética de cada modelo y de los mapeos de mis propios smokes. **Un contador
podría rechazar varios.** Es la parte más débil del documento y la que más
necesita revisión externa — en particular C3, cuya dirección se invierte entre
eventos de cobro y de pago, y C7, que nadie ha definido nunca.

### No verificable desde el repositorio

La intención del autor de FF1.0 al escribir la matriz. Cuál es el mapeo
correcto para cualquier evento —no existe ninguno—. Si el asiento por empleado
es lo deseado. Si la fecha derivada es la correcta. **Si la autorización
funciona en estos flujos: ninguna suite la ejerce**, todas reproducen el cuerpo
transaccional porque las acciones autorizan contra cookie de sesión.

### Trabajo futuro que este documento no hace

No resuelve ninguna limitación —por instrucción explícita—. No propone el
validador cruzado que C2 necesita. No corrige los comentarios falsos del seam.
No añade seeds de mapeo de referencia, que **[I]** sería probablemente la
intervención de mayor valor por unidad de esfuerzo: convertiría siete
invariantes de contrato en un artefacto verificable.
