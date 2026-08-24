import { ingestMetaLeadgen } from "@/server/meta/ingest";
import { logMetaInfo, logMetaWarn } from "@/server/meta/log";
import {
  collectLeadgenChanges,
  resolveVerificationChallenge,
  verifyMetaSignature,
  type MetaWebhookPayload,
} from "@/server/meta/webhook";

/**
 * ============================================================================
 * LA ÚNICA RUTA DE API DEL REPOSITORIO. NO ES UN PRECEDENTE.
 * ============================================================================
 *
 * CLAUDE.md dice «No API routes. Mutations are Server Actions… Keep it that
 * way», y hasta este archivo el repositorio tenía cero. Esta es la excepción, y
 * existe por una razón que no admite la regla general:
 *
 *   **Meta llama a una URL pública fija por HTTP.** Una Server Action no es un
 *   contrato estable invocable por un tercero — su endpoint lo genera el
 *   compilador, cambia entre builds y va firmado para el cliente de Next. Meta
 *   no puede llamarla. Este webhook necesita una URL que se pueda escribir en
 *   el panel de Meta y siga significando lo mismo mañana.
 *
 * Lo que esta excepción NO autoriza: todo lo demás de esta integración —leer
 * los mapeos, crear uno, resolver un lead del andén— sigue siendo Server Action
 * en `src/server/meta/actions.ts`, igual que el resto de la aplicación. Si algo
 * de Meta necesita entrar por HTTP en el futuro, entra por ESTE archivo o no
 * entra.
 *
 * **No lo borres por «limpieza».** Nada lo importa, igual que nada importa
 * `src/proxy.ts`; lo alcanza Next por convención de carpeta y lo llama Meta
 * desde fuera.
 *
 * ## Qué hace, en orden
 *
 *   GET  — el saludo de suscripción de Meta. Devuelve `hub.challenge` crudo.
 *   POST — verifica `X-Hub-Signature-256` ANTES de tocar Prisma, y sólo
 *          entonces procesa los cambios `leadgen`.
 *
 * Es un adaptador HTTP delgado a propósito: no decide nada de negocio. El
 * contrato con Meta vive en `webhook.ts` y la captación en `ingest.ts`, que es
 * lo que permite ejercitarlos desde `npm run smoke:meta` sin servidor.
 */

/** Depende de `node:crypto` para el HMAC; se declara en vez de heredarlo. */
export const runtime = "nodejs";
/** Cada entrega es única: nada aquí se puede precalcular ni cachear. */
export const dynamic = "force-dynamic";

/**
 * Saludo de verificación. Meta lo llama una vez al suscribir el webhook y no
 * vuelve a llamarlo. Si la respuesta no es el `hub.challenge` crudo en texto
 * plano, Meta se niega a suscribir y el error queda de su lado sin mensaje
 * útil del nuestro.
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;

  let result: { ok: boolean; challenge: string };
  try {
    result = resolveVerificationChallenge(params);
  } catch {
    // META_WEBHOOK_VERIFY_TOKEN sin configurar. Se responde 403 igual que a un
    // token equivocado: quien llama no tiene por qué distinguir un servidor mal
    // configurado de un token incorrecto.
    logMetaWarn("saludo de verificación sin token configurado en el servidor");
    return new Response("Forbidden", { status: 403 });
  }

  if (!result.ok) {
    logMetaWarn("saludo de verificación rechazado");
    return new Response("Forbidden", { status: 403 });
  }

  logMetaInfo("saludo de verificación aceptado");
  return new Response(result.challenge, {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

/**
 * Entrega de eventos.
 *
 * El cuerpo se lee UNA vez como texto y esa misma cadena se usa para el HMAC y
 * para el parseo: volver a serializar el JSON reordena claves y la firma dejaría
 * de coincidir.
 */
export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();

  let signatureValid: boolean;
  try {
    signatureValid = verifyMetaSignature(
      rawBody,
      request.headers.get("x-hub-signature-256"),
    );
  } catch {
    // META_APP_SECRET sin configurar: no se puede verificar nada, así que no se
    // procesa nada. Rechazar es la única respuesta segura.
    logMetaWarn("entrega rechazada: META_APP_SECRET no está configurada");
    return new Response("Unauthorized", { status: 401 });
  }

  if (!signatureValid) {
    // Antes de Prisma, a propósito: sin esta comprobación cualquiera que
    // descubra la URL puede inyectar leads falsos.
    logMetaWarn("entrega rechazada: firma inválida");
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: MetaWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as MetaWebhookPayload;
  } catch {
    logMetaWarn("entrega firmada con cuerpo no-JSON");
    return new Response("Bad Request", { status: 400 });
  }

  const { leadgen, ignored } = collectLeadgenChanges(payload);

  if (ignored.length) {
    // Mensajes de WhatsApp y demás formas todavía no manejadas. Se responde 200
    // igual: Meta reintenta con insistencia ante cualquier otra respuesta, y un
    // tipo de evento que aún no manejamos no es un fallo.
    logMetaInfo("eventos ignorados en esta entrega", {
      object: payload.object,
      campos: ignored,
    });
  }

  if (!leadgen.length) return new Response("EVENT_RECEIVED", { status: 200 });

  try {
    for (const event of leadgen) {
      await ingestMetaLeadgen(event);
    }
  } catch (error) {
    /*
     * Un fallo aquí es del Graph API o de la base, y los dos son recuperables.
     * Se responde 500 para que Meta reenvíe: la captación es idempotente por
     * `leadgen_id`, así que el reenvío no duplica nada y sí recupera el lead.
     * Responder 200 lo perdería para siempre.
     */
    logMetaWarn("fallo procesando la entrega; se pide reenvío a Meta", {
      error: error instanceof Error ? error.message : "desconocido",
    });
    return new Response("Internal Server Error", { status: 500 });
  }

  return new Response("EVENT_RECEIVED", { status: 200 });
}
