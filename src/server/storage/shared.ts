/**
 * Patch CRM-QA1 — reglas de subida de archivos, puras y compartidas.
 *
 * Sin importar la base de datos ni el runtime de Next, para que el formulario
 * del cliente pueda avisar antes de enviar y el servidor pueda volver a
 * comprobar exactamente lo mismo. **El aviso del navegador es cortesía; la
 * validación que cuenta es la del servidor**, que es la única que ve los bytes.
 */

/**
 * 5 MiB por archivo.
 *
 * **[D] El límite existe porque los bytes viven en PostgreSQL.** Un comprobante
 * de transferencia fotografiado con un teléfono actual cabe de sobra; un PDF
 * escaneado a 600 ppp no, y es justo lo que no queremos dentro de una fila. Si
 * el negocio necesita archivos mayores, lo que cambia no es esta constante: es
 * la decisión de almacenamiento (ver el comentario de `StoredFile`).
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/**
 * Tipos aceptados para un comprobante de pago. Imágenes solamente: un
 * comprobante es una foto o una captura, y aceptar PDF obligaría a renderizarlo
 * para que un supervisor pueda revisarlo de un vistazo.
 */
export const RECEIPT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

/**
 * Tipos aceptados para un documento del expediente. Añade PDF porque una
 * constancia salarial o una colilla llegan así, y ahí sí basta con descargarla.
 */
export const DOCUMENT_MIME_TYPES = [
  ...RECEIPT_MIME_TYPES,
  "application/pdf",
] as const;

export type AllowedMimeType = (typeof DOCUMENT_MIME_TYPES)[number];

/**
 * Los primeros bytes que cada tipo aceptado tiene obligatoriamente.
 *
 * **[R] Esto es lo que impide confiar en el nombre ni en el `type` del `File`.**
 * Los dos los elige quien sube: un ejecutable renombrado a `.jpg` y anunciado
 * como `image/jpeg` pasa cualquier comprobación que sólo los lea. El contenido
 * no se puede renombrar.
 *
 * `null` en una posición significa «este byte no se comprueba»: WebP lleva el
 * tamaño del archivo en los bytes 4-7, entre `RIFF` y `WEBP`.
 */
const MAGIC_BYTES: Record<AllowedMimeType, Array<number | null>> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/webp": [
    0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50,
  ],
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
};

/** Extensión canónica, para nombrar la descarga. */
export const EXTENSION_BY_MIME: Record<AllowedMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export function isAllowedMimeType(
  value: string,
  allowed: readonly string[],
): value is AllowedMimeType {
  return allowed.includes(value);
}

/**
 * ¿Los bytes son de verdad lo que dicen ser?
 *
 * Devuelve `false` también cuando el archivo es más corto que su propia firma:
 * un archivo de 2 bytes no es un PNG por mucho que se llame así.
 */
export function matchesMagicBytes(
  bytes: Uint8Array,
  mimeType: AllowedMimeType,
): boolean {
  const signature = MAGIC_BYTES[mimeType];
  if (bytes.length < signature.length) return false;
  return signature.every(
    (expected, index) => expected === null || bytes[index] === expected,
  );
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

/** El archivo, tal y como una pantalla autorizada lo recibe para mostrarlo. */
export type StoredFileDTO = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByName: string | null;
  uploadedAt: string;
};
