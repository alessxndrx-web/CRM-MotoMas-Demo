# MotoMas — Motor de contabilización (FF1.3-A)

Fundación del motor de contabilización: la arquitectura que consumirá **todo**
evento contable futuro.

> **Alcance.** FF1.3-A entregó la infraestructura, FF1.3-B la primera estrategia
> ejecutable (`COMPROBANTE_EGRESO`) y **FF1.3-C la reversión**, con lo que el
> motor queda funcionalmente completo. Sigue sin contabilizar ventas,
> inventario, cobranza, impuestos, POS ni facturación: cualquier otro evento
> falla con `STRATEGY_NOT_FOUND` hasta que se escriba su estrategia.
>
> Verificado contra PostgreSQL real: **SMOKE-FF1.3-C, 41 aserciones, 0 fallas**
> (`npm run smoke:posting`).

Documentos relacionados: [FINANCIAL_FOUNDATION.md](FINANCIAL_FOUNDATION.md)
(FF1.0), [CHART_OF_ACCOUNTS.md](CHART_OF_ACCOUNTS.md) (FF1.1-A),
[ACCOUNTING_EVENTS.md](ACCOUNTING_EVENTS.md) (FF1.2-A),
[ACCOUNTS_RECEIVABLE.md](ACCOUNTS_RECEIVABLE.md) (FF1.2-B),
[FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md).

---

## 1. Arquitectura

```txt
   Evento de negocio
        │  validatePostingRequest ......... forma de la petición
        ▼
   PostingDispatcher ──► PostingStrategy .. qué componentes y por cuánto
        │  validatePostingPlan ............ los montos son dinero real
        ▼
   AccountMappingResolver ................. componentes → cuentas
        ▼
   PostingBuilder ......................... cuentas + montos → líneas
        │  validateJournalDraft ........... cuadrado y bien formado
        ▼
   Validadores de estado .................. período abierto, cuentas aptas,
        │                                   no contabilizado antes
        ▼
   PostingWriter .......................... asiento + registro + auditoría
```

Una responsabilidad por archivo:

| Archivo | Responsabilidad | Escribe en BD |
|---|---|---|
| `shared.ts` | Vocabulario: `PostingRequest`, `PostingResult`, `PostingPlan`, DTOs | — |
| `errors.ts` | Jerarquía `PostingError` sobre `FinancialRuleError` | — |
| `strategy.ts` | Interfaz `PostingStrategy` y su borrado de tipos | — |
| `registry.ts` | Registro por inscripción (`registerStrategy`) | — |
| `dispatcher.ts` | Evento → estrategia → plan | — |
| `mapping.ts` | Contrato del resolutor de mapeo + adaptador sobre FF1.0 | — |
| `builder.ts` | Plan resuelto → líneas de asiento | **nunca** |
| `validator.ts` | Invariantes genéricas | — |
| `repository.ts` | Acceso a datos | sí (solo para el writer) |
| `writer.ts` | **Único** componente que persiste | sí |
| `pipeline.ts` | Orquesta el orden de las etapas | vía writer |
| `service.ts` | Autorización + transacción financiera + lecturas | vía pipeline |

---

## 2. El punto de extensión

Agregar un evento contable **no modifica ningún archivo del motor**. Se escribe
una estrategia y se registra:

```ts
registerStrategy<GastoPayload>({
  event: "GASTO",
  description: "Gasto revisado",
  parse(payload) {
    // única frontera donde un payload se estrecha; null lo rechaza
    return isGastoPayload(payload) ? payload : null;
  },
  plan(payload) {
    // puro y síncrono: declara componentes y montos, nada más
    return [
      { component: "SUBTOTAL", amount: payload.subtotal },
      { component: "RETENCION_1", amount: payload.retencion1 },
      { component: "TOTAL", amount: payload.total },
    ];
  },
});
```

Lo que una estrategia **no puede hacer, por diseño y no por convención**:

- **No toca la base de datos.** `plan` es puro y síncrono, así que la forma
  contable de un evento se razona —y se prueba— sin transacción.
- **No elige cuentas.** Las cuentas salen del mapeo, de modo que la política
  contable vive en el catálogo que controla el contador y no compilada en
  código.
- **No decide debe ni haber.** El mapeo ya trae ambos lados; por eso todo
  asiento que el motor construye está **cuadrado por construcción**.

El registro rechaza inscribir dos veces el mismo evento. Sobrescribir en
silencio es como dos módulos terminan discrepando sobre cómo se contabiliza una
venta, y el ganador dependería del orden de importación.

---

## 3. Decisiones de diseño

### 3.1 Registro por inscripción, no `switch`

No hay `switch (event)` ni `if (eventType)` en ninguna etapa. El despachador
busca una estrategia en un `Map` y delega. Es lo que hace al motor abierto a
extensión y cerrado a modificación: diecisiete eventos futuros no engordan un
archivo central.

El registro por defecto es estado a nivel de módulo. Es seguro porque guarda
**funciones puras**, no datos de petición: nada por usuario, por sucursal ni por
transacción, así que no hay nada que se filtre entre requests. El pipeline
acepta además un registro explícito, que es lo que usarán las pruebas.

### 3.2 El builder jamás escribe

La separación construir/persistir no es estética: es lo que permite
**previsualizar** un asiento antes de que exista. `previewPosting` corre el
pipeline completo y se detiene antes del writer, y sale gratis precisamente
porque el builder no tiene efectos.

### 3.3 Idempotencia como garantía de base de datos

`posting_records.idempotency_key` es único. La clave se deriva de forma
determinista (`evento:tipoOrigen:idOrigen`), así que dos peticiones simultáneas
del mismo hecho colisionan en el índice.

La lectura previa en el pipeline es una **cortesía** para devolver un mensaje de
negocio limpio; la restricción es la garantía. Esto cierra el riesgo R-08 de
FF1.2-A: hasta ahora la protección contra doble contabilización habría sido un
`if` dentro de una transacción, que no sobrevive a la concurrencia.

Reintentar no es un error: por defecto una petición ya contabilizada **converge**
sobre el resultado existente (`alreadyPosted: true`) en vez de fallar. Un
llamante que reintenta tras un timeout debe poder llegar dos veces a la misma
respuesta. El modo estricto existe para quien prefiera el rechazo.

### 3.4 Sin mapeo no hay contabilización

Un componente sin regla de mapeo **detiene todo el asiento**, no produce uno
parcial. Un asiento a medias es peor que ninguno: cuadraría y estaría mal.

### 3.5 Montos sin signo

Un componente lleva un monto no negativo. Un monto negativo significaría
«invierte los lados», que es una decisión del **mapeo**; permitirlo aquí
devolvería la política contable al código.

### 3.6 El bloqueo de período bajó a `finance`

El motor debe aplicar el bloqueo de período de 4.0S-C1, pero `finance` no puede
importar `contabilidad`. Las alternativas eran duplicar la regla —justo lo que
TD-01 dedicó un parche a eliminar— o bajarla. Se bajó a
`src/server/finance/periods.ts` y `contabilidad/guards.ts` la **re-exporta con
sus nombres históricos**: ninguna llamada existente cambió, la regla es idéntica
y hay una sola implementación. Es el mismo patrón que TD-01 usó con el dinero y
FF1.1-A con el vocabulario del catálogo.

### 3.7 Reutilización, no reimplementación

| Necesidad | Qué se reutilizó |
|---|---|
| Transacción, auditoría atómica, traducción de errores | `runFinancialTransaction` (FF1.0) |
| Autorización | `authorizeFinancialFoundation` (FF1.0) |
| Resolución de mapeo | `resolveAccountMapping` (FF1.0) — **el módulo no se modificó** |
| Elegibilidad de cuentas | `describeChartAccountPostingBlock` (FF1.1-A) |
| Bloqueo de período | regla de 4.0S-C1, movida a `finance/periods` |
| Aritmética monetaria | `roundFinancialMoney`, `sanitizeFinancialMoney` (TD-01) |
| Asiento y líneas | `JournalEntry` / `JournalEntryLine` existentes |
| Reversión | `reversalOfId` de 4.0S-C2, sin duplicar |
| Auditoría | `FinancialAuditEvent` con dos acciones nuevas |

---

## 4. Invariantes que valida

**Solo genéricas.** Todo lo que hay en `validator.ts` es cierto de cualquier
evento contable que llegue a existir:

- el asiento cuadra (debe == haber);
- tiene al menos dos líneas y ninguna con debe y haber a la vez, ni en cero, ni
  negativa;
- el período contable de la fecha está abierto para el alcance de sucursal;
- toda cuenta del mapeo admite movimientos en esa fecha (activa, no archivada,
  no de agrupación, dentro de vigencia y —si es de plantilla— aprobada);
- el evento no fue contabilizado antes.

**No hay ninguna validación de negocio**: nada de «una factura necesita ítems»
ni «un cierre necesita monto contado». Eso pertenece al módulo dueño del evento
y, cuando concierne a la forma del payload, a su estrategia. Mezclarlas aquí es
como un validador se convierte en el `switch` que esta arquitectura evita.

---

## 5. Contrato de auditoría

Cada contabilización emite **dos** eventos en la misma transacción:

| Acción | Entidad | Por qué |
|---|---|---|
| `JOURNAL_ENTRY_POSTED` | `JOURNAL_ENTRY` | El libro conserva su propia historia: quien lee el diario no debería necesitar saber que existe un motor. |
| `POSTING_EXECUTED` | `POSTING_RECORD` | Registra que un **evento de negocio** produjo ese asiento. |

`POSTING_REVERSED` queda declarada para FF1.3-C. Dominio: **CONTABILIDAD**,
incluso cuando el hecho ocurrió en una caja.

Un rechazo **no se audita**: la transacción se revierte y con ella se iría el
propio registro de auditoría. Los rechazos son errores de negocio devueltos al
llamante, no historia.

---

## 6. Autorización

Sin cambios. `authorizeFinancialFoundation` → Administrador y Contador con
alcance contable global, el mismo predicado que ya usan numeración, mapeo,
catálogo de cuentas y cobranza. Ningún rol ganó ni perdió nada.

No se agregaron server actions, rutas, APIs ni pantallas: nada llama al motor
todavía, y exponer un endpoint capaz de escribir en el libro mayor antes de que
exista una sola estrategia sería superficie de ataque sin propósito.

---

## 7. Limitaciones conocidas

1. **Un solo evento es ejecutable** (`COMPROBANTE_EGRESO`, Parche FF1.3-B). Los
   otros cinco tipos de comprobante y el resto de eventos fallan con
   `STRATEGY_NOT_FOUND`: cada uno necesita su propia estrategia.
2. **La reversión existe (FF1.3-C).** `reversePosting` crea el asiento espejo
   enlazado por el único `reversalOfId`, marca el registro REVERTIDO y libera su
   clave activa. El asiento original nunca se modifica.
3. **Numeración provisional.** El asiento usa `AS-AAAAMMDD-XXXXXXXX` como el
   resto del proyecto. Adoptar el servicio secuencial de FF1.0 exige una serie
   configurada por sucursal y año, y una serie sin configurar falla cerrada por
   diseño: el motor no podría contabilizar en una instalación nueva. Marcado
   `TODO(FF1.0-numbering)`.
4. **Una sola moneda por asiento.** El motor arrastra `currency` pero no
   convierte: sigue sin existir moneda funcional ni tipo de cambio (riesgo R-03
   de FF1.2-A).
5. **Sin impuestos.** El motor no calcula ni separa impuestos; un componente de
   impuesto solo existirá cuando el modelo operativo lo almacene (riesgo R-01).
6. **`accountingDocumentId` no es único** en `JournalEntry`. La idempotencia del
   motor es la del `PostingRecord`; un asiento manual puede seguir apuntando al
   mismo documento. Unificar ambos caminos es trabajo de FF1.3-B/C.
7. **Sin pruebas automatizadas.** El repositorio no tiene runner de pruebas. El
   despachador, el builder y las validaciones estructurales son puras y
   trivialmente testeables — es la deuda más visible que deja esta fase.

---

## 8. Fases siguientes

| Fase | Alcance |
|---|---|
| **FF1.3-B (entregado)** | Primera estrategia ejecutable: `COMPROBANTE_EGRESO`, con su llamante en `contabilidad/posting.ts`. Valida la arquitectura de punta a punta. |
| **FF1.3-B.1** | Las cinco estrategias de comprobante restantes (ingreso, cheque, transferencia, reembolso, ajuste): un archivo cada una, sin tocar el motor ni el llamante. |
| **FF1.3-C (entregado)** | Reversión de contabilización: asiento espejo, registro REVERTIDO, clave activa liberada y bucle revertir → corregir → recontabilizar verificado contra PostgreSQL. |
| **FF1.3-D** | Vista previa del asiento en pantalla, sobre `previewPosting`. |
| **FF1.4** | Factura y recibo de caja, documento contable completo; ampliación del enum `AccountingEventType` con los nueve eventos faltantes de FF1.2-A §10. |
| **FF1.4-B** | Venta, costo de ventas e inventario, condicionado a resolver R-01 (impuestos) y R-02 (inventario valorado). |
| **FF1.5** | Reportes derivados exclusivamente de asientos contabilizados. |

---

## 9. Verificación pendiente

La migración `20260805120000_posting_engine_foundation` es **puramente aditiva**
(un enum, una tabla, sus índices y sus claves foráneas) y se contrastó línea por
línea contra `prisma migrate diff --from-empty`: **cero divergencias**.

**No se aplicó a ninguna base de datos** ni existe `SMOKE-FF1.3-A`: PostgreSQL
no era alcanzable en la máquina de entrega, la misma situación de FF1.0,
FF1.1-A, FF1.1-B y FF1.2-B. Cuando haya base, el smoke debe cubrir al menos:

1. Contabilizar sin estrategia registrada: `STRATEGY_NOT_FOUND`.
2. Estrategia registrada con payload inválido: `INVALID_PAYLOAD`.
3. Componente sin mapeo activo: `MAPPING_MISSING`, sin asiento escrito.
4. Cuenta mapeada inactiva, archivada, de agrupación o de plantilla sin aprobar:
   `ACCOUNT_NOT_POSTABLE`.
5. Período cerrado en la fecha del evento: `PERIOD_CLOSED`.
6. Contabilización válida: asiento CONTABILIZADO, líneas cuadradas, registro
   creado, dos eventos de auditoría.
7. Reintento del mismo evento: devuelve `alreadyPosted: true` sin crear nada.
8. Modo estricto sobre un evento ya contabilizado: `DUPLICATE_POSTING`.
9. Dos contabilizaciones concurrentes del mismo evento: una gana, la otra
   recibe el mensaje de la restricción única y revierte completa.
10. Fallo después de escribir el asiento: no queda asiento, registro ni
    auditoría (atomicidad).
11. Componente con monto cero: no genera líneas y no rompe el cuadre.
12. Estrategia que declara componentes cuya suma es cero: rechazada.

---

## 10. Reversión (FF1.3-C)

```txt
   Registro de contabilización
        │  existe · está CONTABILIZADO · motivo obligatorio
        ▼
   Asiento original + líneas          (se lee, jamás se escribe)
        ▼
   Builder ──► espejo                 (debe ⇄ haber)
        │  validateJournalDraft
        ▼
   Validadores de estado              (período abierto en la FECHA DE REVERSIÓN,
        │                              las cuentas todavía existen)
        ▼
   Writer ──► asiento espejo + registro REVERTIDO + auditoría
```

### Decisiones

**Un segundo pipeline, no un desvío por el primero.** Una reversión no tiene
estrategia que despachar ni mapeo que resolver: refleja lo que se contabilizó en
vez de recalcular lo que se contabilizaría hoy. Pasarla por
`runPostingPipeline` exigiría inventar una estrategia y un plan falsos — más
maquinaria y menos verdad. Reutiliza todas las etapas que sí tiene: el builder,
`validateJournalDraft`, el validador de período y el writer.

**El espejo no consulta el mapeo.** El mapeo pudo cambiar legítimamente desde
que se contabilizó el original; una reversión debe deshacer lo que ocurrió, no
lo que ocurriría hoy.

**El período se juzga por la fecha de reversión**, no por la del original: un
asiento de un mes cerrado sigue siendo corregible en el período abierto actual.
Es la regla de 4.0S-C2 aplicada por el motor.

**Cuentas históricas admitidas.** Una reversión puede reutilizar una cuenta
desactivada o archivada después del asiento original —de lo contrario desactivar
una cuenta dejaría sus asientos sin vía legal de corrección—, pero la cuenta debe
seguir **existiendo**. Es existencia, no política, y por eso no pasa por
`describeChartAccountPostingBlock`.

**Doble reversión converge.** Revertir dos veces devuelve `alreadyReversed: true`
en lugar de fallar, igual que la contabilización repetida. La garantía real es el
único `reversalOfId`: **solo puede existir un asiento espejo por original**.

### El defecto de FF1.3-A que esto corrigió

`posting_records.idempotency_key` era único de forma absoluta, mientras la
documentación del propio modelo prometía que marcar el registro REVERTIDO
permitiría volver a contabilizar el evento. Ambas cosas no podían ser ciertas: el
segundo intento chocaba contra el índice y el bucle **revertir → corregir →
recontabilizar** era imposible.

La regla que sí se sostiene es «como máximo una contabilización **activa** por
evento de negocio», y se expresa con `activeIdempotencyKey`: columna nulable
única que solo lleva valor mientras la contabilización está viva. Es el mismo
recurso que `account_mapping_sets.active_branch_key`, y por la misma razón: un
índice único parcial no se puede declarar en el esquema de Prisma.

Migración `20260806120000_posting_reversal`, aplicada y verificada.

---

## 11. Conflicto documental resuelto en FF1.4-C

**Ningún documento del proyecto dice qué componentes forman el asiento de un
documento contable.** `FINANCIAL_FOUNDATION.md` §5 y la matriz
`componentsForEvent` de FF1.0 declaran qué componentes cada evento *admite*;
`ACCOUNTING_EVENTS.md` CT-07 declara qué áreas *impacta*. Ninguno prescribe el
conjunto.

La aritmética del modelo sí lo decide. `calculateAccountingDocumentTotal` es:

```txt
total = max(subtotal − abono − retención1 − retención2, 0)
```

Como cada componente se convierte en un par debe/haber independiente:

- declarar `SUBTOTAL` reconoce el movimiento bruto completo;
- declarar cada deducción lo reduce en la cuenta que nombre el mapeo;
- declarar **además** `TOTAL` reconocería el mismo dinero dos veces.

El conjunto no es una preferencia: **está forzado**. Cualquier otra combinación
duplica o pierde dinero. Verificado en `SMOKE-FF1.4-C`: una factura de 10 000
con retenciones de 200 y 100 y abono de 1 500 produce ocho líneas cuadradas cuyo
**saldo neto en cartera es exactamente 8 200**, el total del documento.

Un componente en cero no se declara: no se movió, y declararlo exigiría una
regla de mapeo para un movimiento que nunca ocurre.

Donde la matriz no admite un componente que el documento sí trae —un recibo
oficial de caja con retención, por ejemplo— la estrategia **rechaza** el
documento en vez de perder el movimiento en silencio.

**Pendiente del contador:** confirmar esta derivación y, sobre todo, la
dirección de las notas. La estrategia declara `SUBTOTAL` para nota de débito y
de crédito por igual; que una reste y la otra sume lo decide el **mapeo**, no el
código, y ese contenido sigue sin definirse.

---

## 12. Ambigüedad abierta del recibo de caja (FF1.4-D)

`componentsForEvent("CAJA_RECIBO")` admite **`TOTAL` y la familia `PAGO_*`**.
Para un recibo son el mismo dinero: declarar ambos lo contabilizaría dos veces,
así que a lo sumo una interpretación puede aplicarse.

| Interpretación | Qué produce | Estado |
|---|---|---|
| `PAGO_*` por método | Un par por forma de cobro: efectivo y banco caen en cuentas distintas | **Implementada** |
| `TOTAL` | Un solo par para todo el recibo; se pierde el método | No implementada |

Se implementó `PAGO_*` porque, **cuando los cobros cubren exactamente el total**,
mueve el mismo importe que `TOTAL` y conserva estrictamente más información. Es
una dominancia, no una preferencia.

**Donde la dominancia no se sostiene, la estrategia rechaza.** Un recibo cuyos
cobros no suman su total tendría un saldo que solo `TOTAL` podría representar, y
elegir esa lectura sería inventar política contable: se rechaza con un mensaje
que nombra ambos importes.

**Pendiente del contador.** Si la empresa no quiere cuentas por forma de cobro,
la interpretación correcta es `TOTAL` y esta estrategia debe cambiar. La decisión
no está tomada.

### Por qué el cierre de caja (`CAJA_CIERRE`) sigue sin integrarse

FF1.1-B corrigió la aritmética del arqueo, pero el fondo inicial del turno
(CJ-15) y los movimientos de efectivo (CJ-16) **no existen**. Mientras el
efectivo esperado sea únicamente lo cobrado, un turno con fondo de cambio
produce un sobrante inexistente, y contabilizarlo registraría una diferencia
falsa. El evento queda deliberadamente fuera.

---

## 13. El gasto y el impuesto que la matriz no sabe expresar (FF1.4-E)

### La aritmética del gasto es distinta

`calculateExpenseTotal` (`src/server/contabilidad/shared.ts`) es:

    total = max(subtotal + impuesto − retención1 − retención2, 0)

El impuesto **suma**. En el documento contable y en el de caja todo término
después del subtotal resta; aquí no. Por eso el gasto no reutiliza la fábrica de
estrategias de documentos: la forma se parece, la aritmética no.

### Componentes declarados

Con `impuesto = 0` la derivación es la de FF1.4-C, sin cambios: **`SUBTOTAL` más
las retenciones distintas de cero, nunca `TOTAL`**. Cada componente se convierte
en un par deudor/acreedor independiente, y `subtotal − retenciones` ya es el
total, así que la cuenta por pagar aterriza exactamente en `total`. Declarar
además `TOTAL` contabilizaría el mismo dinero dos veces.

### El impuesto no tiene componente. En ningún evento

`componentsForEvent("GASTO")` es `SUBTOTAL, RETENCION_1, RETENCION_2, TOTAL`. No
hay componente de impuesto — y no lo hay en **ninguna** fila de
`eventComponentMatrix`. Un gasto con `impuesto > 0` no admite lectura honesta:

| Intento | Qué produce |
|---|---|
| Solo `SUBTOTAL` | La cuenta por pagar queda corta por el impuesto, y el IVA acreditable nunca llega a una cuenta |
| `SUBTOTAL` + `TOTAL` | La cuenta por pagar queda bien, pero el subtotal se contabiliza dos veces |
| Impuesto dentro de `SUBTOTAL` | Sobrestima el gasto justo por el importe que una cuenta de IVA acreditable existe para separar |

Toda combinación disponible o pierde dinero o afirma un gasto falso, así que la
estrategia **rechaza** el gasto con impuesto en vez de contabilizar un asiento
incorrecto. La transición a `REVISADO` se revierte con él: no queda gasto
revisado sin asiento.

**Pendiente del contador y de migración.** Habilitar el gasto con impuesto exige
dos cosas que no pertenecen a este parche: decidir el tratamiento del IVA
acreditable y agregar el valor al enum `AccountingEventComponent` de Prisma.
Hasta entonces el rechazo es la única respuesta que no miente.

### Retenciones mayores que el subtotal

`total` está acotado en cero, así que un gasto con retenciones que superan el
subtotal declara un total de cero mientras sus componentes suman otra cosa. El
modelo lo permite; el asiento no puede representarlo. También se rechaza.

### Dos preguntas abiertas que este parche no resolvió

**`Expense.accountId`.** El modelo deja elegir una cuenta contable por gasto, y
el motor resuelve cuentas por mapeo. Hoy la columna **se ignora al contabilizar**.
Si la intención era que esa cuenta gobierne el débito del gasto, hace falta un
mecanismo de anulación por origen que el motor no tiene, y crearlo sin decisión
contable sería inventar política.

**`Expense.voucherId`.** Un gasto puede apuntar a un comprobante. Si ese
comprobante es de egreso y ya se contabilizó (FF1.4-A), el mismo hecho económico
puede quedar registrado dos veces: una por el comprobante y otra por el gasto.
El motor no lo detecta —son dos orígenes distintos, cada uno con su clave de
idempotencia— y **este parche no lo impide**. Si el flujo real crea ambos, hay
que decidir cuál de los dos es el asiento y cuál es solo respaldo.

### Por qué no hay reversión automática

`ExpenseStatus` es `REGISTRADO | REVISADO` y nada más. **No existe anulación de
gastos**, así que no hay ninguna transición que signifique "este gasto dejó de
ser cierto" a la cual enganchar una reversión. Inventar ese estado sería un
cambio de comportamiento de negocio fuera de alcance. La reversión queda
disponible por el motor (`reversePosting`) y `reverseExpensePostingInTransaction`
es lo que una anulación futura llamaría.

---

## 14. La planilla: el devengo se contabiliza, el pago no (FF1.4-F)

### La aritmética

`calculatePayrollNetPay` (`src/server/contabilidad/shared.ts`) es:

    neto = max(salario + comisiones + bonos − deducciones − anticipos, 0)

El hecho bruto —lo que gasta la empresa— es `salario + comisiones + bonos`. El
neto es el residuo que queda para el trabajador después de las dos restas.

### Componentes: la derivación se invierte

`componentsForEvent("PLANILLA")` es `PLANILLA_NETO, PLANILLA_DEDUCCIONES`. **No
hay componente de bruto**, así que el bruto se alcanza por suma en vez de por
resta:

    neto + deducciones = salario + comisiones + bonos

Es la imagen especular de FF1.4-C: allí se declaraba el bruto y las deducciones
lo reducían; aquí se declaran las partes y el bruto es su suma. Las dos reglas
existen por lo mismo — nunca declarar el mismo dinero dos veces, nunca perderlo.
Verificado en runtime: con salario 20 000 y deducciones 3 000, el gasto queda en
**20 000** (el devengado), no en 17 000 (el neto).

La identidad solo se sostiene si **`anticipos = 0`**.

### Los anticipos no tienen componente propio

El anticipo resta igual que la deducción, pero la matriz tiene **un** componente
de deducción, no dos. No son intercambiables:

| Concepto | Qué es | Qué acredita |
|---|---|---|
| Deducción | Retención para un tercero (INSS, IR) | Retenciones por pagar |
| Anticipo | Recuperación de un saldo que la empresa ya tiene contra el trabajador | Esa cuenta por cobrar |

Una regla de mapeo nombra **un** par de cuentas, así que meter ambos en
`PLANILLA_DEDUCCIONES` mandaría la recuperación del anticipo a la cuenta de
retenciones. Y omitirlo lo pierde: `neto + deducciones` quedaría corto por
exactamente el anticipo, subestimando el gasto de salarios. Las dos lecturas
disponibles son incorrectas, así que la planilla **se rechaza**.

**Pendiente del contador y de migración.** Habilitarlo exige un componente nuevo
en el enum `AccountingEventComponent` de Prisma y decidir contra qué cuenta se
recupera el anticipo.

### Otros rechazos

- **Deducciones mayores que el devengado**: el neto se acota en cero y los
  componentes dejan de reconstruir lo devengado.
- **Neto inconsistente con sus partes**: si `neto + deducciones` no coincide con
  el devengado, el asiento afirmaría un gasto que el propio registro no dice.

### La fecha contable es derivada

`PayrollRecord` **no tiene columna de fecha** — solo `period` (`YYYY-MM`). El
asiento necesita una, así que se deriva: **el último día del período, en UTC**.

El mes es lo único que decide algo, porque `accountingPeriodOf` compara el
prefijo `YYYY-MM` en UTC y cualquier día dentro del período bloquea igual. Se
elige el último día porque la planilla mensual se devenga a lo largo del período
y se reconoce a su cierre: es la única opción que nunca fecha el asiento antes
del trabajo que paga. **Es una elección razonada, no una regla leída del
repositorio.** Un período malformado produce una fecha inválida y el motor la
rechaza: falla cerrado, nunca adivina el mes.

### El pago no se contabiliza

`PayrollStatus` es `BORRADOR → PREPARADA → PAGADA`. Se contabiliza en
**`PREPARADA`**: es la transición con permiso `review` y el punto tras el cual
`updatePayrollRecordAction` se niega a editar. Es el devengo.

**`PAGADA` no genera asiento**, y esto es una limitación del repositorio, no una
decisión: la matriz FF1.0 tiene un solo evento de planilla, y sus componentes
describen el devengo. No existe un evento de pago que exprese *debitar salarios
por pagar contra banco*, e inventarlo sería inventar política contable.

**Consecuencia contable que hay que mirar de frente:** el mayor acumulará
`Salarios por pagar` que **nada cancela**. Mientras no exista el evento de pago,
esa cuenta crece indefinidamente. Verificado en runtime: marcar una planilla
`PAGADA` no crea ningún asiento nuevo.

### Por qué no hay reversión automática

No hay estado de anulación ni transición hacia atrás. Ninguna transición
significa "esta planilla dejó de ser cierta", así que no hay dónde enganchar una
reversión. Queda disponible por el motor (`reversePosting`), y
`reversePayrollPostingInTransaction` es lo que una anulación futura llamaría.

> **Corrección (FF1.4-G).** La frase anterior es engañosa y se conserva aquí solo
> porque el parche de contrato prohíbe tocar código. `reversePosting` **no tiene
> ningún llamador** en `src/`: no hay acción, ruta ni pantalla que la alcance.
> Para gasto y planilla la reversión no es accesible para ningún usuario. Ver
> `POSTING_CONTRACT.md`, bloqueante B-2.

---

## 15. El contrato contable → `POSTING_CONTRACT.md`

Este documento describe **cómo funciona** el motor: sus etapas, sus garantías
estructurales y las decisiones de cada integración.

El **significado contable** de lo que produce vive en
[`POSTING_CONTRACT.md`](./POSTING_CONTRACT.md) (parche FF1.4-G): semántica de
los 13 componentes, contrato de los 17 eventos, limitaciones del modelo,
invariantes que la capa de mapeo debe cumplir y tabla de bloqueantes.

Se separó en otro archivo por una razón concreta: el contrato es tan extenso
como este documento entero, y mezclar "qué etapas ejecuta el pipeline" con "qué
significa `PLANILLA_DEDUCCIONES`" haría ambos peores. La regla para saber dónde
escribir: **mecánica aquí, semántica allá.**

La distinción operativa más importante que fija el contrato, y que ningún
documento previo enunciaba: **la matriz declara qué componentes pueden
*mapearse*, no cuáles se *emiten*.** En 9 de 17 eventos esos conjuntos no
coinciden, y una regla de mapeo válida puede quedar muerta sin ninguna
advertencia.

---

## 16. El impuesto como componente (FF2.0-A)

`§13` documentaba que un gasto con impuesto **no podía contabilizarse**: ningún
componente de la matriz FF1.0 lo expresaba, y toda combinación disponible o
perdía el crédito fiscal o afirmaba un gasto falso. FF2.0-A cerró esa brecha
añadiendo `IMPUESTO` al enum `AccountingEventComponent`
(`20260807120000_tax_component`) y a la fila `GASTO` de la matriz.

### El motor no cambió, y esa es la prueba de que el diseño aguanta

Ni `pipeline.ts`, ni `builder.ts`, ni `validator.ts`, ni `writer.ts`, ni
`registry.ts`, ni `dispatcher.ts` tienen una línea nueva. El motor sigue sin
saber qué es un impuesto: recibe un componente más, lo resuelve contra el mapeo
y produce su par débito/crédito como con cualquier otro. **Un componente nuevo
cuesta un valor de enum, una fila de matriz y una entrada en la lista de
modificadores de la estrategia.** Era exactamente la propiedad para la que se
construyó FF1.3-A.

### La estrategia quedó más corta

El bloque que rechazaba los gastos con impuesto desapareció. El impuesto entró
en la lista de modificadores que ya existía junto a las retenciones, y el único
ajuste fue el umbral del piso: las retenciones se comparan ahora contra
`subtotal + impuesto`, porque el impuesto también forma parte de lo adeudado.

### Por qué al principio solo `GASTO`

Cuando se introdujo el componente, **`Expense.tax` era el único importe de
impuesto de todo el esquema**. `AccountingDocument` y `CashDocument` no tenían
columna equivalente — sus `taxId` son números de identificación tributaria, no
importes. Añadir `IMPUESTO` a sus filas habría creado reglas que ninguna
estrategia podía emitir: el problema de reglas muertas que documenta el
contrato.

### FF2.0-B: la predicción se cumplió

`AccountingDocument.tax` se añadió en `20260808120000_document_tax_amount`, y
habilitar el impuesto en documentos costó exactamente lo previsto:

- una entrada en la lista de modificadores de la estrategia de documentos;
- `IMPUESTO` en tres filas de la matriz (factura y las dos notas);
- **cero migraciones de enum, cero líneas de motor.**

La columna es `NOT NULL DEFAULT 0` y el término es aditivo, así que **todo
documento anterior conserva el total que ya tenía**: la fórmula solo suma un
término que vale cero para todos ellos.

El **recibo oficial de caja quedó fuera a propósito**: no tiene componente bruto
al que el impuesto pueda sumarse, y su total ya incluye el impuesto que cobró el
documento original. Un recibo con impuesto se rechaza explícitamente.

### FF2.0-C: la misma operación, tercera vez

`CashDocument.tax` se añadió en `20260809120000_cash_document_tax_amount` y
habilitó `CAJA_FACTURA` y las dos notas de caja. Costó lo mismo que la vez
anterior: tres filas de matriz, una entrada en la lista de modificadores de la
estrategia de caja, **cero migraciones de enum y cero líneas de motor**.

Con esto **las dos fórmulas de total vuelven a coincidir** — la asimetría que
FF2.0-B introdujo entre documento contable y caja duró un solo parche.

El recibo de caja quedó fuera por la misma razón que su gemelo contable, y el
guard de componente no admitido lo rechaza sin lógica nueva.

Queda una duplicación preexistente que ahora hay que mantener en paso: caja
tiene **dos** implementaciones de su fórmula, `calculateDocumentTotalDecimal`
(Decimal, escribe la columna) y `calculateCashDocumentTotal` (número, el resto
de la capa). Las dos llevan el término de impuesto.

### FF2.0-D: el evento que cierra el ciclo

Con el impuesto reconocido en compras y ventas, el mayor acumula posiciones de
IVA que nada saldaba. `LIQUIDACION_IVA`
(`20260810120000_vat_settlement_event`) es el hecho contable que las liquida
contra la administración.

**Por qué un evento propio y no `COMPROBANTE_AJUSTE`** —el único evento genérico
de ajuste que existe—: admite solo `TOTAL`, no tiene estrategia, y el seam de
comprobantes lo ata a una fila `VoucherType.AJUSTE`, así que todo asiento suyo
nace de un `AccountingVoucher`. Una liquidación no es un comprobante, y
esconderla ahí la volvería indistinguible de una corrección ordinaria en
cualquier reporte que agrupe por evento.

**Reutiliza `IMPUESTO`**: ningún componente nuevo. Es el único evento cuyo
componente único es el impuesto, y el único donde el impuesto no modifica a otro
—por eso X3 no le aplica y no hizo falta validación nueva.

**No tiene modelo de negocio, y no lo necesita.** La identidad de una liquidación
es el período que salda, que viaja como `source.id`; la clave de idempotencia
impide liquidar dos veces el mismo período. Eso exigió un valor nuevo en
`postingSourceTypes` — una lista en tiempo de ejecución, no un enum de base de
datos, exactamente para que un origen nuevo cueste código y no migración.

**Lo que no hace:** no calcula el importe. Ver `POSTING_CONTRACT.md` §L-10.

### FF2.0-E: el flujo que la vuelve alcanzable

FF2.0-D dejó el evento registrado pero sin nadie que lo invocara. FF2.0-E añade
el modelo `VatSettlement` (`20260811120000_vat_settlement_workflow`), el seam
`postVatSettlementInTransaction` y tres acciones: crear borrador, editarlo y
**ejecutar**.

El ciclo es el mismo que ya usan gasto y planilla —dos estados, una transición,
sin anulación— y la ejecución es el punto de reconocimiento por las tres señales
de siempre: permiso `review`, sello de ejecutor y fecha, y congelación del
registro.

**La identidad no cambió**: sigue siendo `sucursal:período`, no el id de la fila.
`@@unique([branchId, period])` es el gemelo de negocio de la clave de
idempotencia, así que la base de datos impide dos liquidaciones del mismo período
por los dos lados a la vez.

**El motor no cambió.** Ni pipeline, ni builder, ni validador, ni writer, ni
dispatcher, ni registry, ni la estrategia. Lo que hizo falta fuera del modelo
fueron tres entradas en las listas blancas de auditoría —diseñadas justo para que
un flujo nuevo no exija migración de enum.

La semántica completa —clase, coexistencia, interacción con subtotal, total y
retenciones, y lo que se espera del mapeo— vive en
[`POSTING_CONTRACT.md`](./POSTING_CONTRACT.md), no aquí.
