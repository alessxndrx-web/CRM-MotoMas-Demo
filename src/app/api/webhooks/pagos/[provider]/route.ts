import { applyProviderWebhook } from "@/server/payments/service";

/**
 * ============================================================================
 * LA SEGUNDA RUTA DE API DEL REPOSITORIO. EL MISMO ARGUMENTO, HECHO OTRA VEZ.
 * ============================================================================
 *
 * CLAUDE.md dice que la excepción de Meta «no es un precedente: una segunda ruta
 * necesita el mismo argumento, hecho de nuevo». Este es ese argumento, y es
 * literalmente el mismo:
 *
 *   **Una pasarela de pago llama a una URL pública fija por HTTP.** El endpoint
 *   de una Server Action lo genera el compilador, cambia entre builds y va
 *   firmado para el cliente de Next: no se puede escribir en el panel de un
 *   proveedor de pago y esperar que siga significando lo mismo tras el próximo
 *   despliegue. Un webhook necesita una URL estable.
 *
 * Y hay una razón añadida que el webhook de Meta también tiene: **la firma se
 * calcula sobre los bytes exactos del cuerpo**. Una Server Action recibe
 * argumentos ya deserializados; volver a serializarlos produce otros bytes y
 * otra firma. Aquí se lee `request.text()` y se pasa en crudo.
 *
 * ## Por qué no entra por la ruta de Meta
 *
 * Porque no es Meta. Aquella ruta reparte entre dos productos de Meta que
 * comparten **la misma firma y el mismo secreto**; una pasarela de pago tiene su
 * propio secreto y su propio formato. Meterla ahí obligaría a ese archivo a
 * decidir de quién es cada cuerpo antes de poder verificar ninguno, que es el
 * orden equivocado.
 *
 * ## Lo que esta excepción NO autoriza
 *
 * Todo lo demás del cobro es Server Action: crear la solicitud
 * (`server/payments/actions.ts`), pagarla desde el portal
 * (`server/payments/portal-actions.ts`) y consultarla. Aquí sólo entra lo que un
 * tercero tiene que poder llamar por HTTP.
 *
 * **No lo borres por «limpieza».** Nada lo importa: lo alcanza Next por
 * convención de carpeta y lo llama el proveedor desde fuera.
 *
 * ## Qué hace
 *
 * Nada de negocio. Lee el cuerpo en crudo, copia las cabeceras y delega en
 * {@link applyProviderWebhook}, que verifica la firma **antes de tocar Prisma**,
 * garantiza la idempotencia y aplica el pago en una transacción. Que la lógica
 * viva ahí es lo que permite ejercitarla desde `npm run smoke:pagos` sin
 * levantar un servidor.
 *
 * ## Códigos de respuesta
 *
 * `200` también para un evento duplicado o para uno que no corresponde a ningún
 * cobro: son respuestas correctas. Un proveedor que recibe un error reintenta, y
 * reintentaría eternamente un evento que nunca va a poder procesarse. `401`
 * queda para la firma inválida, que es lo único que de verdad hay que rechazar.
 */

/** Depende de `node:crypto` para el HMAC; se declara en vez de heredarlo. */
export const runtime = "nodejs";
/** Cada entrega es única: nada aquí se puede precalcular ni cachear. */
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ provider: string }> },
) {
  const { provider } = await context.params;

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new Response("cuerpo ilegible", { status: 400 });
  }

  const headers: Record<string, string | undefined> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const result = await applyProviderWebhook({ provider, rawBody, headers });

  if (!result.ok) {
    // El motivo no vuelve al llamante. Un atacante que sondea firmas no debe
    // poder distinguir «secreto equivocado» de «proveedor desconocido».
    return new Response("rechazado", { status: 401 });
  }

  return Response.json({ received: true, outcome: result.outcome });
}
