# Cobro al cliente desde la web

**Patch CRM-QA1.** Cómo MotoMas le pide dinero a un cliente, cómo lo cobra, y
qué falta exactamente para que ese cobro sea real.

---

## 0. Lo que está hecho y lo que no

Esta sección va primero a propósito.

| | Estado |
|---|---|
| Dominio del cobro (solicitud, intento, estados) | **Hecho** |
| Aislamiento por cliente | **Hecho** |
| Importe fijado por el servidor | **Hecho** |
| Verificación de firma del webhook | **Hecho** |
| Idempotencia y protección contra reenvíos | **Hecho** |
| Comprobación de importe y moneda | **Hecho** |
| Confirmación atómica de la reserva | **Hecho** |
| Avisos persistentes al cliente | **Hecho** |
| Pantalla de pago en el portal | **Hecho** |
| **Adaptador de un proveedor real** | **NO existe** |
| **Credenciales de comercio** | **NO existen** |

> **MotoMas no tiene pasarela de pago contratada.** Con `PAYMENTS_PROVIDER`
> vacío —que es el estado por omisión— la interfaz **no muestra ningún botón de
> pagar en línea**, ni al cliente ni al empleado. Las solicitudes de cobro se
> pueden emitir igual y el cliente las ve en su portal; sólo no puede pagarlas
> desde ahí.
>
> Esto **no es** un procesamiento de pagos en producción. Es todo lo que rodea a
> uno, listo para que el proveedor se enchufe detrás de una interfaz de cuatro
> métodos. Ver §7.

---

## 1. Los dos casos de uso

**A. Pago de reserva.** El cliente paga el anticipo que aparta su unidad. La
solicitud lleva `purpose = RESERVA` y `reservationId`; al confirmarse el pago,
la reserva pasa de `PENDIENTE_PAGO` a `ACTIVA` y la moto queda bloqueada.

**B. Cobro suelto.** Un empleado autorizado le pide a un cliente concreto un
monto concreto por cualquier concepto. `purpose = SOLICITUD`. Al pagarse no
confirma ninguna reserva: sólo queda `PAGADA`.

Los dos comparten modelo, máquina de estados y camino de confirmación. Lo único
que los separa es si hay una reserva colgando.

---

## 2. El importe no lo toca el cliente

`createPaymentRequestAction` (panel, `canManagePaymentRequests`) escribe
`PaymentRequest.amount` como `Prisma.Decimal`.

`startPortalPaymentAction` (portal, cliente) recibe **el identificador de la
solicitud y nada más**. No hay ningún campo de cantidad en ninguna entrada de
`src/server/payments/portal-actions.ts`. El importe se copia de la fila a la
`PaymentTransaction` en el momento de abrir el intento, y el webhook lo compara
contra esa copia.

No existe un camino por el que una cifra del navegador del cliente llegue a la
pasarela.

---

## 3. Aislamiento entre clientes

Ninguna función del portal acepta un identificador de cliente. Todas reciben un
**testigo firmado** (`createPortalToken` / `verifyPortalToken`, HMAC-SHA256 con
`SESSION_SECRET`) que el servidor emite sólo después de una verificación
correcta —código de seguimiento más teléfono o cédula— y del que saca el cliente.

Por construcción no existe el parámetro con el que un cliente pediría los cobros
de otro.

El testigo vive **una hora**, viaja como argumento explícito de cada Server
Action y **no es una cookie**: una cookie se envía sola en toda petición al mismo
origen, que es la propiedad que hace posible el CSRF.

---

## 4. El estado real del pago lo dicta el proveedor

**Nunca la vuelta del navegador a una URL de éxito.** Esa URL la puede escribir
cualquiera en la barra de direcciones. La página de retorno sólo enseña lo que la
base ya sabe.

Quien cambia la base es `applyProviderWebhook`
(`src/server/payments/service.ts`), y sólo tras verificar la firma.

### Un pago no se aplica dos veces

Tres cierres, no uno:

1. `payment_webhook_events(provider, event_id)` es **único**, y su `INSERT`
   ocurre **dentro de la misma transacción** que aplica el pago. Un reenvío del
   proveedor choca y deshace la transacción entera.
2. `payment_transactions(provider, provider_reference)` es único: dos eventos no
   pueden inventar dos cobros para la misma referencia.
3. La transición sólo se aplica desde un estado que la admite. Un evento
   aprobado sobre una solicitud ya `PAGADA` no vuelve a sellarla.

### Lo que se rechaza

- **Firma inválida** → `401` y **ninguna escritura**. Registrar el evento sería
  permitir que cualquiera inserte filas sin autenticarse.
- **Importe distinto** al de la transacción (comparación decimal exacta) → se
  registra el evento con resultado `importe_no_coincide`, la transacción queda
  `RECHAZADA` y la solicitud **no** se marca pagada. Un pago parcial no es un
  pago.
- **Moneda distinta** o no admitida → igual.
- **Referencia desconocida** → `200` con resultado `sin_transaccion`. Devolver un
  error haría que el proveedor reintentara para siempre un evento que nunca va a
  poder procesarse.

---

## 5. Las dos pruebas de pago de una reserva, y por qué no son equivalentes

| | Comprobante manual | Pago por pasarela |
|---|---|---|
| Qué es | Una foto de la transferencia | Un aviso firmado del proveedor |
| Quién lo aporta | El empleado que atiende | La pasarela |
| Fuerza | Una persona tiene que creérsela | Criptográficamente atribuible |
| Revisión posterior | **Sí** (`ReservationPaymentProof.status`) | No hace falta |
| Bloquea la unidad | Sí, al subirlo | Sí, al confirmarse |

**Un pago verificado por la pasarela satisface el requisito de comprobante.**
Exigir además la foto sería pedir una prueba más débil encima de una más fuerte.
Una reserva confirmada en línea **no tiene** fila en `reservation_payment_proofs`
y eso es correcto: el panel lo distingue con la insignia «Confirmado por la
pasarela».

Rechazar un comprobante manual devuelve la reserva a `PENDIENTE_PAGO` y **libera
la unidad**: estaba apartada por una prueba que resultó no serlo.

---

## 6. Los avisos al cliente: qué son y qué no

**Son filas persistentes** (`customer_notifications`), escritas **dentro de la
misma transacción** que provoca el cambio. Un aviso que sobreviviera a un
`rollback` estaría contándole al cliente algo que no pasó.

**La entrega es por consulta periódica, no por empuje.** Es una decisión, no una
omisión:

> Este repositorio no tiene intermediario de mensajes, ni Redis, ni proceso
> permanente, y su despliegue no garantiza una sola instancia. Un canal SSE o
> WebSocket sostenido en la memoria de un proceso **no vería** el pago confirmado
> por el webhook si éste aterriza en otra instancia — es decir, parecería tiempo
> real y fallaría justo en el caso que importa.

La consulta periódica no tiene ese problema: la verdad está en PostgreSQL y todas
las instancias la ven. El intervalo es de 8 s mientras hay un cobro vivo y de
30 s cuando no lo hay.

Las propiedades que sí se cumplen: **reconexión** (un fallo de red salta esa
vuelta y sigue), **autorización** (testigo firmado en cada llamada),
**aislamiento** (§3), **origen en el servidor** (los avisos los escribe el
servidor, nunca el cliente) y **persistencia** (una recarga los recupera todos).

**Qué cambiaría con un intermediario.** Sólo de dónde llega el aviso. El DTO
(`CustomerNotificationDTO`), la tabla y la pantalla no cambian. Es trabajo de
infraestructura, no de dominio, y está pendiente.

---

## 7. Qué falta para cobrar de verdad

Separado a propósito en dos listas.

### Código que falta

Uno solo:

**Un `PaymentProviderAdapter` para el proveedor que MotoMas contrate**, en
`src/server/payments/providers.ts`, y añadirlo al registro `adapters`. Son cuatro
métodos:

```ts
{
  key: "nombre-del-proveedor",
  label: "Nombre visible",
  isSandbox: false,
  isConfigured(): boolean,          // false mientras falten credenciales
  createCheckout(input): Promise<{ redirectUrl, providerReference }>,
  verifyWebhook({ rawBody, headers }): WebhookVerification,
}
```

`verifyWebhook` recibe el cuerpo **en crudo**: cualquier firma se calcula sobre
los bytes exactos, y volver a serializar un objeto ya deserializado produce otros
bytes y otra firma.

Nada más del sistema cambia. Ni el dominio, ni la máquina de estados, ni el
webhook, ni las pantallas.

### Configuración y alta que faltan (no es código)

1. **Contratar la pasarela.** Ninguna está elegida. No se asumió Stripe, PayPal,
   BAC, Tilopay ni CyberSource porque no hay una sola evidencia en el repositorio
   de que alguna esté decidida.
2. **Credenciales de comercio.** Identificador, clave de API y secreto de
   webhook, en variables de entorno. **Nunca en el código ni en `.env`
   versionado.**
3. **Dominio HTTPS público** para el webhook. La URL es
   `https://<dominio>/api/webhooks/pagos/<clave-del-proveedor>`, y hay que
   registrarla en el panel del proveedor.
4. **Alta del comercio** ante el proveedor: documentación fiscal, cuenta de
   liquidación, límites.
5. **Definir la conciliación.** Un cobro por la web **no genera asiento contable
   hoy** (§8). Cómo y cuándo entra ese ingreso en Caja es una decisión del
   negocio que todavía no se ha tomado.

---

## 8. Lo que este subsistema NO hace

**No contabiliza.** No crea `CashDocument`, no crea `AccountingDocument` y **no
amplía `AccountingEventType`**.

Esto es deliberado y es la regla de CLAUDE.md: un miembro nuevo de
`AccountingEventType` aterriza junto con su estrategia de asiento, su regla de
mapeo de cuentas y una forma de que un contador la escriba, o no aterriza. Un
anticipo cobrado por la web es un hecho comercial con prueba; el ingreso sigue
naciendo en Caja cuando la venta se factura.

**No toca el POS.** El mostrador vende repuestos y tiene su propio cobro. Nada de
aquí entra en `PosSale`, `PosPayment` ni `PosCashShift`.

**No guarda datos de tarjeta.** Ninguno. `PaymentTransaction.providerMetadata`
admite identificadores y estados del proveedor; nunca un número de tarjeta, un
CVV ni una credencial.

---

## 9. La pasarela de pruebas

`PAYMENTS_PROVIDER=sandbox` activa un proveedor de pruebas **que dice serlo en
pantalla**: no pide datos de tarjeta, no cobra nada, y confirma o rechaza porque
una persona pulsa un botón en `/pago/pruebas`.

Lo que sí hace de verdad: construye el cuerpo del aviso, lo firma con HMAC-SHA256
usando `PAYMENTS_SANDBOX_SECRET` y lo entrega al **mismo** `applyProviderWebhook`
que atenderá al proveedor real. La verificación de firma, la idempotencia, la
comprobación de importe y la confirmación atómica de la reserva quedan
ejercitadas.

Lo único que se salta es el transporte HTTP, que es lo que hace la ruta
`/api/webhooks/pagos/[provider]`.

**Está apagada en producción.** Con `NODE_ENV=production` el adaptador se declara
no configurado salvo que alguien ponga `PAYMENTS_ALLOW_SANDBOX=true` a propósito.
Un entorno de producción con la pasarela de pruebas activa permite marcar cobros
como pagados sin que se mueva un córdoba.

---

## 10. La segunda ruta de API del repositorio

`src/app/api/webhooks/pagos/[provider]/route.ts`.

CLAUDE.md permite exactamente una ruta de API —el webhook de Meta— y exige que
una segunda «necesite el mismo argumento, hecho de nuevo». Este es ese argumento:

> Una pasarela de pago llama a una **URL pública fija por HTTP**. El endpoint de
> una Server Action lo genera el compilador, cambia entre builds y va firmado
> para el cliente de Next: no se puede escribir en el panel de un proveedor y
> esperar que siga significando lo mismo tras el próximo despliegue.

Y una razón añadida: **la firma se calcula sobre los bytes exactos del cuerpo**.
Una Server Action recibe argumentos ya deserializados.

No entra por la ruta de Meta porque no es Meta: aquella reparte entre dos
productos que comparten el mismo secreto y la misma firma. Una pasarela tiene el
suyo, y meterla ahí obligaría a ese archivo a decidir de quién es cada cuerpo
antes de poder verificar ninguno, que es el orden equivocado.

Todo lo demás del cobro sigue siendo Server Action.

---

## 11. Variables de entorno

| Variable | Obligatoria | Qué hace |
|---|---|---|
| `PAYMENTS_PROVIDER` | No | Clave del adaptador activo. Vacía = sin pago en línea, y la interfaz no lo ofrece. |
| `PAYMENTS_SANDBOX_SECRET` | Sólo con `sandbox` | Secreto HMAC de la pasarela de pruebas. |
| `PAYMENTS_ALLOW_SANDBOX` | No | `"true"` permite la pasarela de pruebas en producción. Por omisión, no. |
| `SESSION_SECRET` | **Sí en producción** | Ya existía. Firma también el testigo del portal. |

Ninguna credencial de proveedor real está definida todavía, porque no hay
proveedor. Cuando lo haya, sus variables se declaran aquí y en `.env.example`.

---

## 12. Pruebas

    npm run smoke:crm-qa

Requiere base de datos. Para ejercitar además el webhook, exporta
`PAYMENTS_PROVIDER=sandbox` y `PAYMENTS_SANDBOX_SECRET`; sin ellas el smoke
**dice que esa parte no se ejercitó** en lugar de darla por buena.

Cubre: importe fijado por el servidor, aislamiento entre clientes, firma
inválida sin escritura, reenvío que no aplica dos veces, importe que no cuadra, y
pago verificado que confirma la reserva sin comprobante manual.
