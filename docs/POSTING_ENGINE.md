# MotoMas — Motor de contabilización (FF1.3-A)

Fundación del motor de contabilización: la arquitectura que consumirá **todo**
evento contable futuro.

> **Esto no es el motor de contabilización todavía.** FF1.3-A entrega la
> infraestructura. No contabiliza ventas, gastos, caja, cobranza, inventario,
> POS, facturación ni impuestos, y **ningún módulo existente la invoca**. El
> registro de estrategias está vacío a propósito: hoy cualquier llamada falla con
> `STRATEGY_NOT_FOUND`.

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

1. **El registro está vacío.** Ningún evento se puede contabilizar. Es el estado
   entregable de esta fase, no un descuido.
2. **Sin reversión de contabilización.** `PostingRecordStatus.REVERTIDO`,
   `reversedAt`, `reversedByUserId`, `reversalReason` y la acción de auditoría
   `POSTING_REVERSED` existen pero **nada los escribe**. La reversión combinará
   el motor con `reverseJournalEntryAction` (4.0S-C2) en FF1.3-C.
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
| **FF1.3-B** | Primeras estrategias: gasto y comprobantes (los eventos más simples con impacto real y sin dependencia de inventario ni caja, según §12.2 de FF1.2-A). Cablear el motor a la acción que contabiliza el documento contable. |
| **FF1.3-C** | Reversión de contabilización: revertir el asiento con 4.0S-C2 y marcar el `PostingRecord` como REVERTIDO para que el evento pueda re-contabilizarse. |
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
