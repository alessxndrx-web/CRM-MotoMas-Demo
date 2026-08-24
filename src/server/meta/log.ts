/**
 * El ÚNICO sitio de `src/` que escribe en consola.
 *
 * Todo lo demás en este repositorio devuelve el error a quien lo pidió: una
 * acción responde un string en español y la pantalla lo muestra. El webhook no
 * tiene a quién devolvérselo — lo llama Meta, no una persona, y la respuesta
 * HTTP sólo puede ser un número. El registro del servidor es el único canal que
 * queda para saber qué llegó y qué se hizo con ello.
 *
 * Concentrarlo aquí mantiene esa excepción localizada y greppable, en vez de
 * repartir `console.*` por el módulo. No registra respuestas de formulario:
 * `page_id` y `leadgen_id` identifican la entrega sin volcar datos personales
 * al log.
 */

const PREFIX = "[meta-webhook]";

export function logMetaInfo(message: string, detail?: Record<string, unknown>) {
  console.info(PREFIX, message, detail ?? "");
}

export function logMetaWarn(message: string, detail?: Record<string, unknown>) {
  console.warn(PREFIX, message, detail ?? "");
}
