# MotoMas — Fundación financiera (FF1.0)

Documento de arquitectura de la capa base financiera introducida por el Parche
FF1.0. Describe **qué existe, qué garantiza y qué NO hace todavía**.

> FF1.0 es infraestructura. No genera asientos, no integra Caja con
> Contabilidad, no toca POS, facturación ni tesorería, y no modifica ningún
> flujo existente. El motor de contabilización es FF1.4.

Documentos relacionados: [FINANCE_STABILIZATION_PLAN.md](FINANCE_STABILIZATION_PLAN.md)
(secuencia completa), [ACCOUNTING_INTEGRATION_AUDIT.md](ACCOUNTING_INTEGRATION_AUDIT.md)
y [CASH_OPERATIONAL_AUDIT.md](CASH_OPERATIONAL_AUDIT.md) (auditorías 4.0S-A).

---

## 1. Por qué existe esta capa

Antes de FF1.0, cada acción financiera repetía a mano la misma plomería:
comprobar la base de datos, abrir transacción, escribir el evento de auditoría,
traducir errores de Prisma y revalidar rutas. El patrón era correcto pero estaba
copiado decenas de veces, y cada copia era una oportunidad de olvidar una pieza.

Además, dos capacidades que todos los parches financieros posteriores necesitan
no existían:

- **Numeración secuencial.** Los números se generaban con sufijo aleatorio y el
  cliente podía suministrar uno arbitrario.
- **Mapeo contable.** No había forma de expresar "este evento económico se
  registra en estas cuentas", que es exactamente lo que el motor de
  contabilización necesitará leer.

FF1.0 construye las tres piezas: helper transaccional, servicio de numeración y
catálogo de mapeo contable.

---

## 2. Ubicación y capas

```txt
src/server/finance/
  errors.ts                     # FinancialRuleError + traducción de errores
  text.ts                       # saneador de texto financiero
  transaction.ts                # runFinancialTransaction
  context.ts                    # autorización + resolución de sucursal
  numbering/
    shared.ts                   # contratos puros (series, año fiscal, formato)
    repository.ts               # acceso a datos DocumentSequence
    service.ts                  # asignación + configuración autorizada
  account-mapping/
    shared.ts                   # contratos puros (eventos, componentes, DTOs)
    repository.ts               # acceso a datos de conjuntos y reglas
    validation.ts               # reglas de validez de un conjunto
    service.ts                  # ciclo de vida autorizado + resolución
```

**Regla de dependencia:** `finance` es la capa base. Puede ser importada por
`caja` y `contabilidad`; **nunca al revés**. Por eso resuelve sucursales por sí
misma en lugar de reutilizar `resolveCajaBranchIdByCode`.

La convención por dominio del proyecto (`shared` / `repository` / `service`) se
respeta: `shared.ts` es puro y apto para cliente; `repository.ts` solo persiste;
`service.ts` autoriza, valida, audita y transacciona.

---

## 3. Helper transaccional

`runFinancialTransaction` centraliza cinco invariantes que hoy cada acción
cumple a mano:

1. Ninguna escritura financiera corre sin base de datos configurada.
2. El evento de auditoría se escribe con **el mismo cliente de transacción** que
   la mutación: historial y cambio se confirman o se revierten juntos.
3. Una regla de negocio rechazada **aborta la transacción**.
4. `revalidatePath` corre **después** del commit, nunca dentro.
5. El error que llega al usuario es un mensaje de negocio, nunca texto del
   driver.

### El punto que más importa: `ctx.fail`

Devolver `{ ok: false }` desde dentro de una transacción interactiva de Prisma
**confirma la transacción**. Hoy eso es inofensivo porque las acciones existentes
validan antes de escribir, pero es una trampa latente: en cuanto una acción
escriba y luego rechace, quedará un escritura parcial confirmada.

```ts
run: async (ctx) => {
  const entry = await ctx.tx.journalEntry.findUnique({ where: { id } });
  if (!entry) return ctx.fail("El asiento no existe.");   // revierte
  ctx.ensure(entry.status === "BORRADOR", POSTED_IMMUTABLE); // revierte
  // ...
}
```

`ctx.fail` devuelve `never`, así que TypeScript estrecha el tipo después del
`return ctx.fail(...)` sin necesidad de aserciones.

### Lo que el helper NO hace

**No autoriza.** La autorización sigue donde está hoy: `authorizeCaja` /
`authorizeContabilidad` / `authorizeFinancialFoundation` resuelven rol y alcance
desde la sesión firmada antes de llamar. Pasar un actor al helper **no es un
control de permisos** y no debe tratarse como tal.

### Adopción

Las acciones existentes de Caja y Contabilidad **no fueron reescritas**. Siguen
funcionando exactamente igual. El helper se estrena en el código nuevo de FF1.0
y se adoptará de forma incremental cuando cada acción se toque por otra razón.

> `revalidatePath` solo puede invocarse desde una server action o un route
> handler. Los servicios de escritura de FF1.0 deben llamarse desde ahí, nunca
> durante el render de un Server Component.

---

## 4. Numeración secuencial

### Modelo

`DocumentSequence`: un contador por **serie + alcance de sucursal + año fiscal**.

| Campo | Significado |
|---|---|
| `series` | Tipo de documento (`FinancialDocumentSeries`) |
| `branchId` / `branchKey` | Sucursal dueña; `branchKey` es el espejo no nulo |
| `fiscalYear` | Año fiscal del contador |
| `prefix` / `padding` | Formato: `PREFIJO-AAAA-000123` |
| `nextValue` | Valor que consumirá la próxima asignación |
| `lastNumber` / `lastIssuedAt` | Último número emitido (visibilidad operativa) |
| `isActive` | Serie habilitada |

**Por qué `branchKey`:** PostgreSQL considera distintos dos `NULL` en una clave
única. Con solo `branchId` nulo podrían existir dos contadores corporativos para
la misma serie y año. `branchKey` guarda `"__CORPORATIVO__"` en ese caso, así la
clave única `(series, branchKey, fiscalYear)` sí es total.

### Seguridad ante concurrencia

```ts
await db.documentSequence.update({
  where: { id },
  data: { nextValue: { increment: 1 } },
});
```

Prisma compila esto a `UPDATE ... SET next_value = next_value + 1 ... RETURNING`:
una sola sentencia que toma el bloqueo de fila y devuelve el resultado
confirmado. El valor consumido es el devuelto menos uno; **nunca se deriva de
una lectura previa**, que es donde aparecen los números duplicados.

Como `allocateDocumentNumber` recibe el cliente de transacción del llamante, si
la creación del documento falla, el número consumido se revierte con ella.

### Falla cerrada

Una serie inexistente o inactiva **no** cae a un número aleatorio: lanza
`FinancialRuleError`. Un fallback silencioso reintroduciría exactamente el riesgo
de huecos y duplicados que el servicio elimina.

### Reglas de configuración

- El contador (`nextValue`) **nunca** se acepta del llamante: retroceder un
  contador vivo reemitiría números que ya están en documentos existentes.
- El prefijo y el relleno no pueden cambiar una vez que la serie emitió su
  primer número; si no, convivirían dos formatos dentro de una misma serie.
- Para empezar en otro punto se configura una serie nueva.

### Año fiscal

`resolveFiscalYear(date, startMonth = 1)` lee la fecha en **UTC**, igual que
`parseAccountingDate` de Contabilidad, de modo que una fecha sin hora no se
desplaza al año vecino por zona horaria. El valor por defecto es el año
calendario, que es el ejercicio fiscal nicaragüense que usa la empresa.

### Estado de adopción

**Ninguna acción existente usa todavía este servicio.** Los números actuales no
se migran ni se reescriben. Cuando una serie se adopte (FF1.1 en adelante),
numerará únicamente los documentos creados a partir de ese momento.

---

## 5. Mapeo contable

### Qué responde

Una regla responde una sola pregunta: *para este evento económico y este
componente monetario, ¿qué cuenta se debita y cuál se acredita?*

- `AccountingEventType` — el hecho (factura de caja, gasto, planilla…). Los
  valores reflejan documentos y comprobantes que los módulos **ya producen
  hoy**; no hay eventos inventados.
- `AccountingEventComponent` — la porción de dinero (subtotal, retención 1,
  total, pago en efectivo, diferencia de caja…).

La matriz `componentsForEvent` declara qué componentes puede llevar cada evento,
de modo que una regla que jamás se aplicaría se rechaza al configurarla en lugar
de fallar en silencio al contabilizar.

### Balance por construcción

Toda regla exige **cuenta de debe y cuenta de haber**, y deben ser distintas.
En consecuencia, cualquier asiento que el motor construya a partir de un
conjunto validado está cuadrado por construcción: un asiento descuadrado no
puede originarse en un mapeo.

### Versionado e inmutabilidad

```txt
BORRADOR ──activar──> ACTIVO ──(activar otra versión | archivar)──> ARCHIVADO
```

- Un conjunto se edita solo en `BORRADOR`.
- Activar **valida contra el estado vigente** de la base de datos: un conjunto
  válido al redactarlo puede tener una cuenta desactivada después.
- Activar archiva automáticamente el conjunto que ocupaba el mismo alcance, en
  la misma transacción.
- Un conjunto activo **nunca se edita en sitio**. Corregir un mapeo significa
  redactar la versión siguiente y activarla; así, las reglas que produjeron un
  asiento histórico siguen siendo legibles.
- Reutilizar un código existente crea la versión siguiente de ese mapeo
  (`@@unique([code, version])`).

### Un solo conjunto activo por alcance

`activeBranchKey` es único y solo lleva valor mientras el conjunto está
`ACTIVO`; en cualquier otro estado es `NULL`. Como PostgreSQL admite múltiples
`NULL` en un índice único, esto garantiza **como máximo un conjunto activo por
alcance de sucursal** a nivel de base de datos.

> Se eligió esta columna en lugar de un índice único parcial
> (`... WHERE status = 'ACTIVO'`) porque Prisma no puede expresar un índice
> parcial en el esquema: existiría solo en el SQL de la migración y cada
> `prisma migrate dev` posterior lo detectaría como deriva e intentaría
> eliminarlo. La columna logra la misma garantía sin esa trampa de
> mantenimiento.

### Resolución

`resolveAccountMapping` prefiere el conjunto de la sucursal sobre el
corporativo, y solo considera conjuntos `ACTIVO` ya vigentes
(`effectiveFrom <= fecha`).

Devuelve `null` cuando no hay mapeo. **Eso es intencional:** un evento sin mapeo
debe detener la contabilización, nunca inventar una cuenta.

Hoy esta función **no tiene ningún llamante**. Es el contrato que consumirá
FF1.4.

---

## 6. Autorización

Sin cambios de acceso efectivo. Los predicados nuevos delegan en los existentes:

| Predicado | Equivale a | Roles |
|---|---|---|
| `canViewFinancialFoundation` | `canViewAccountingLedger` | Administrador, Contador |
| `canConfigureFinancialFoundation` | `canOperateContabilidad` | Administrador, Contador |

`authorizeFinancialFoundation` exige además alcance contable **global**: un
Gerente (`branchReadOnly`) no configura numeración ni mapeos. Cajero, Vendedor,
Marketing y Soporte Técnico quedan fuera por completo.

Son predicados con nombre propio, no reutilización directa, para que un cambio
futuro en el acceso a la fundación no arrastre en silencio a todo el libro mayor.

---

## 7. Auditoría

Toda escritura de FF1.0 emite un evento financiero en la misma transacción, con
las acciones y entidades nuevas incorporadas a la lista blanca existente:

- Acciones: `DOCUMENT_SEQUENCE_*`, `ACCOUNT_MAPPING_SET_*`,
  `ACCOUNT_MAPPING_RULE_*`.
- Entidades: `DOCUMENT_SEQUENCE`, `ACCOUNT_MAPPING_SET`, `ACCOUNT_MAPPING_RULE`.
- Campos: `series`, `fiscalYear`, `prefix`, `padding`, `nextValue`, `version`,
  `event`, `component`, `debitAccountCode`, `creditAccountCode`,
  `effectiveFrom`, `activatedAt`, `archivedAt`.

Dominio: **CONTABILIDAD**, incluso para las series de Caja. Configurar una serie
es un acto de administración contable ejecutado por Administrador o Contador, no
una operación de turno de caja.

`allocateDocumentNumber` no emite evento propio: el número emitido
queda registrado en el evento del documento que lo consume, dentro de la misma
transacción.

---

## 8. Lo que FF1.0 explícitamente NO hace

- No genera ni previsualiza asientos contables (FF1.4).
- No integra Caja con Contabilidad (FF1.3).
- No cambia la fórmula de arqueo de caja (FF1.1-B).
- No habilita cobros posteriores a la emisión (FF1.2).
- No toca reportes, cierres, costeo, POS, facturación ni tesorería.
- No migra ni reescribe ningún número de documento existente.
- No modifica ninguna acción, ruta, permiso ni pantalla existente.
- No siembra el catálogo de cuentas: **la base sigue con cero cuentas
  contables**, y sin cuentas no puede existir ningún mapeo válido.

> **ACTUALIZADO POR FF1.1-A.** La última viñeta describe el estado al cierre de
> FF1.0. El Parche FF1.1-A construyó la fundación del catálogo de cuentas y una
> plantilla de referencia de 239 cuentas, y extendió la validación de mapeo para
> exigir la misma regla de elegibilidad que una línea de asiento (una cuenta de
> agrupación o una cuenta de plantilla sin aprobar tampoco se puede mapear). Ver
> [CHART_OF_ACCOUNTS.md](CHART_OF_ACCOUNTS.md). Lo que sigue bloqueando FF1.4 es
> la aprobación del catálogo por el contador de la empresa y el contenido del
> mapeo, ambas decisiones de negocio.

---

## 9. Dependencias abiertas antes de FF1.4

1. **Catálogo de cuentas real**, provisto por el contador de la empresa. Es
   bloqueante: sin cuentas no hay reglas. *(FF1.1-A entregó la infraestructura y
   una plantilla; falta la aprobación de la empresa.)*
2. **Mapeo contable por evento**, decidido y firmado por contabilidad. La
   estructura ya existe; el contenido es una decisión contable, no técnica.
3. **Moneda funcional y política de tipo de cambio**, aún sin definir.
4. **Importe monetario en `Sale`**, requisito para integrar ventas y COGS.

---

## 10. Verificación pendiente

La migración `20260801120000_financial_foundation` se generó con
`prisma migrate diff` entre el esquema anterior y el nuevo, y es **puramente
aditiva**: solo `CREATE TYPE`, `CREATE TABLE`, `CREATE INDEX` y `ADD CONSTRAINT`.
No contiene ninguna sentencia destructiva.

No se aplicó a una base de datos: el contenedor PostgreSQL de desarrollo no
estaba disponible en la máquina de entrega. Debe ejecutarse
`npx prisma migrate deploy` y `npx prisma migrate status` en un entorno con la
base alcanzable antes de dar FF1.0 por cerrado.

Igualmente pendiente: un smoke `SMOKE-FF1.0` con base real que ejercite
asignación concurrente de números (dos asignaciones simultáneas producen valores
distintos y consecutivos), reversión de la asignación al fallar la transacción,
serie inexistente/inactiva, activación con cuenta desactivada, y unicidad del
conjunto activo por alcance — siguiendo la metodología de los smokes 4.0S.
