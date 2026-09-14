import { createHash } from "node:crypto";

import { getPrisma } from "@/server/db/prisma";
import {
  MAX_UPLOAD_BYTES,
  isAllowedMimeType,
  matchesMagicBytes,
  formatBytes,
  type AllowedMimeType,
} from "@/server/storage/shared";

/**
 * Patch CRM-QA1 — la única puerta por la que un archivo entra al sistema.
 *
 * ## Qué comprueba, y en qué orden
 *
 * 1. Que haya archivo y no esté vacío.
 * 2. Que el tipo declarado esté en la lista blanca del contexto que llama.
 * 3. Que el tamaño real de los bytes leídos no pase del límite.
 * 4. Que **los bytes empiecen por la firma de ese tipo**.
 *
 * El paso 4 es el que hace que los tres anteriores sirvan de algo: `File.name` y
 * `File.type` los elige quien sube, así que un ejecutable renombrado a `.jpg` y
 * anunciado como `image/jpeg` pasa los pasos 1-3 sin despeinarse.
 *
 * El tamaño se mide **después** de leer, sobre el buffer, y no sobre `File.size`:
 * ese también viene del cliente.
 *
 * ## Lo que NO hace
 *
 * No autoriza. Quien llama ya decidió que este usuario puede subir aquí; esta
 * función no sabe a qué expediente ni a qué reserva va el archivo y no debe
 * saberlo. Tampoco escribe la fila que lo enlaza: devuelve el `StoredFile` para
 * que el llamante lo ate dentro de su propia transacción.
 */

export type UploadFileResult =
  | { ok: true; storedFileId: string; deduped: boolean }
  | { ok: false; error: string };

export async function storeUploadedFile(input: {
  file: File;
  allowedMimeTypes: readonly string[];
  branchId: string;
  uploadedById: string;
}): Promise<UploadFileResult> {
  const { file } = input;

  if (!file || typeof file.arrayBuffer !== "function") {
    return { ok: false, error: "No se recibió ningún archivo." };
  }

  const declaredType = (file.type || "").toLowerCase();
  if (!isAllowedMimeType(declaredType, input.allowedMimeTypes)) {
    return {
      ok: false,
      error: `Formato no permitido. Se aceptan: ${describeTypes(input.allowedMimeTypes)}.`,
    };
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { ok: false, error: "No se pudo leer el archivo." };
  }

  if (bytes.length === 0) {
    return { ok: false, error: "El archivo está vacío." };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `El archivo supera el máximo de ${formatBytes(MAX_UPLOAD_BYTES)}.`,
    };
  }
  if (!matchesMagicBytes(bytes, declaredType as AllowedMimeType)) {
    return {
      ok: false,
      error:
        "El contenido del archivo no corresponde a su formato. Vuelve a exportarlo e inténtalo de nuevo.",
    };
  }

  const checksum = createHash("sha256").update(bytes).digest("hex");
  const prisma = getPrisma();

  // El mismo archivo subido dos veces se reutiliza. No es una optimización de
  // espacio: evita que un reintento del usuario (o un doble clic) deje dos filas
  // idénticas que después nadie sabe cuál borrar.
  const existing = await prisma.storedFile.findFirst({
    where: {
      checksumSha256: checksum,
      branchId: input.branchId,
      sizeBytes: bytes.length,
    },
    select: { id: true, expedienteDocument: true, reservationProof: true },
  });
  if (existing && !existing.expedienteDocument && !existing.reservationProof) {
    return { ok: true, storedFileId: existing.id, deduped: true };
  }

  const created = await prisma.storedFile.create({
    data: {
      branchId: input.branchId,
      // El nombre se conserva sólo para mostrarlo y nombrar la descarga. Nunca
      // se usa como ruta: no hay ninguna ruta.
      originalName: sanitizeFileName(file.name),
      mimeType: declaredType,
      sizeBytes: bytes.length,
      checksumSha256: checksum,
      data: Buffer.from(bytes),
      uploadedById: input.uploadedById,
    },
    select: { id: true },
  });

  return { ok: true, storedFileId: created.id, deduped: false };
}

/**
 * Lee un archivo ya autorizado y lo devuelve como `data:` URI.
 *
 * **[R] `data:` y no una URL.** Servir el archivo por una URL exigiría una ruta
 * HTTP pública, y una ruta pública a documentos financieros de un cliente es
 * exactamente el agujero que este diseño evita: sin ruta no hay enumeración de
 * identificadores ni URL que se reenvíe por WhatsApp y siga funcionando.
 *
 * Quien llama ya comprobó que este usuario puede ver este archivo.
 */
export async function readStoredFileAsDataUri(
  storedFileId: string,
): Promise<string | null> {
  const row = await getPrisma().storedFile.findUnique({
    where: { id: storedFileId },
    select: { mimeType: true, data: true },
  });
  if (!row) return null;
  return `data:${row.mimeType};base64,${Buffer.from(row.data).toString("base64")}`;
}

/**
 * Deja el nombre en algo imprimible y acotado. No hay traversal que evitar
 * —el nombre nunca toca el sistema de ficheros— pero un nombre de 4 KB con
 * saltos de línea sí rompe una tabla y sí ensucia una cabecera de descarga.
 */
function sanitizeFileName(value: string): string {
  const clean = (value || "archivo")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[/\\]/g, "-")
    .trim();
  return (clean || "archivo").slice(0, 120);
}

function describeTypes(types: readonly string[]): string {
  return types
    .map((type) => type.replace("image/", "").replace("application/", "").toUpperCase())
    .join(", ");
}
