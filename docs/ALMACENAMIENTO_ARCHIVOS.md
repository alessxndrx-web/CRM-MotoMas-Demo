# Archivos en PostgreSQL: lo que cuesta y cómo salir de ahí

Comprobantes de reserva y documentos de expediente se guardan como bytes en
`stored_files.data` (Patch CRM-QA1). Este documento mide lo que eso cuesta hoy y
describe cómo moverlos a un almacenamiento de objetos **cuando haga falta**.
**No se ha migrado ningún archivo** y nada de esto está implementado.

---

## 1. Cómo funciona hoy

- **Única entrada:** `storeUploadedFile` (`src/server/storage/service.ts`):
  lista blanca de tipos, tamaño medido sobre los bytes leídos (máximo 5 MiB,
  `MAX_UPLOAD_BYTES`), firma binaria del contenido y SHA-256.
- **Única salida:** `readStoredFileAsDataUri`, llamada sólo después de que la
  acción autorizó a quien lee. **No hay URL**: el archivo viaja como `data:` URI
  dentro de la respuesta de la Server Action. Es deliberado: sin ruta HTTP no
  hay identificadores que enumerar ni enlaces que reenviar.
- Server Actions admiten cuerpos de hasta 6 MB (`next.config.ts`,
  `serverActions.bodySizeLimit`): 5 MiB de archivo más el resto del formulario.
- Un empleado **o** un cliente es el autor (CHECK de CRM-INT1).

## 2. Medición (smoke CRM-INT2, base local, Docker, PostgreSQL 16)

Comprobante PNG de 4,9 MB con contenido aleatorio (una foto real no se
comprime; un relleno repetitivo sí, y falsearía la medida). Tres ejecuciones
en la misma máquina con carga distinta; se da el rango, no una cifra única:

| Operación | Resultado |
|---|---|
| Subir desde el panel (validación, SHA-256, escritura) | 646–3.009 ms |
| Listar las reservas de una sucursal **trayendo los bytes** (lo que hacía `listReservations` en `13d3ecb`: `include: { storedFile: true }`) | mediana 162–765 ms, **4,90 MB** leídos por listado |
| El mismo listado **sin bytes** (CRM-INT1 selecciona sólo id, tipo, tamaño y nombre) | mediana 7–16,5 ms, 0 MB |
| Abrir el comprobante como `data:` URI | 193–636 ms, **6,53 MB** de texto (base64 = ×1,33) |
| `pg_total_relation_size('stored_files')` con ese archivo | 5.360–5.368 kB (TOAST no lo comprime) |

En las tres, el listado con bytes costó entre 15 y 46 veces el listado sin
ellos, con **un solo** comprobante en la sucursal.

Lecturas:

- **El riesgo real era el listado, y ya está corregido.** En `13d3ecb` cada
  apertura de «Reservas» leía todos los comprobantes de la sucursal: con cien
  reservas con comprobante de 2 MB, 200 MB por carga de página. CRM-INT1 lo
  quitó; la medición confirma que el coste pasa a ser despreciable.
- **Abrir un archivo cuesta lo que pesa**, y en memoria del servidor se tiene a
  la vez el `Buffer` y el texto base64 (~2,3× el archivo). Aceptable con el
  límite de 5 MiB y pocos usuarios simultáneos.
- **La base crece con cada archivo, y el respaldo con ella.** Es el coste que
  acabará obligando a salir: `pg_dump` y la restauración de §3 de
  `docs/DESPLIEGUE_CRM_INT.md` tardan en proporción al tamaño de
  `stored_files`.

Cuándo mirar esto otra vez:

```sql
SELECT pg_size_pretty(pg_total_relation_size('stored_files')) AS total,
       count(*) AS archivos,
       pg_size_pretty(avg(size_bytes)::bigint) AS medio
  FROM stored_files;
```

Umbral orientativo para empezar la migración: `stored_files` por encima de
5–10 GB, o un `pg_dump` que ya no cabe en la ventana de mantenimiento.

## 3. Estrategia de migración (no implementada)

### Principios

1. **Mismo contrato hacia fuera.** Las acciones siguen llamando a
   `storeUploadedFile` y `readStoredFileAsDataUri`; nada de lo que está por
   encima cambia. Validación, autorización y SHA-256 no se mueven.
2. **Sin URLs públicas.** El contenedor de objetos es privado. La primera fase
   lee el objeto **desde el servidor** y sigue devolviendo `data:` URI, así que
   la propiedad de §1 se conserva. URLs prefirmadas de vida corta (≤ 60 s) sólo
   si el tamaño lo exige, y sabiendo que son enlaces reenviables mientras viven.
3. **Doble lectura, sin corte.** Durante la transición conviven filas con bytes
   en PostgreSQL y filas en el contenedor.
4. **Nada automático.** Copiar los archivos históricos es un script que alguien
   lanza, verifica y puede detener.

### Pasos

1. **Adaptador** en `src/server/storage/`: una interfaz `put(key, bytes, type)`,
   `get(key)`, `delete(key)` con dos implementaciones, PostgreSQL (la actual) y
   S3 compatible (AWS S3, Cloudflare R2, DigitalOcean Spaces o MinIO propio).
   Credenciales por variables de entorno, nunca en el repositorio.
2. **Una migración** que añade a `stored_files` `storage_backend`
   (`'POSTGRES' | 'OBJETO'`, por defecto `'POSTGRES'`) y `object_key` (anulable),
   y hace `data` anulable, con una CHECK: `POSTGRES` exige `data`, `OBJETO` exige
   `object_key`. Aditiva: la aplicación anterior sigue funcionando mientras no
   haya filas `OBJETO`.
3. **Escrituras nuevas al contenedor** detrás de una variable
   (`STORAGE_BACKEND=objeto`). Clave del objeto: `sucursal/año/mes/<id>`, sin
   nombre del cliente. La fila guarda tamaño, tipo y SHA-256 como hoy.
4. **Lectura doble:** `readStoredFileAsDataUri` mira `storage_backend` y lee de
   donde toque; si el objeto falta, error propio y registro, nunca un archivo
   vacío.
5. **Copia de históricos** por lotes: sube, **relee y compara el SHA-256**,
   marca la fila como `OBJETO` y sólo entonces pone `data = NULL`. Un lote que
   falla no marca nada. Liberar el espacio de TOAST requiere después un
   `VACUUM FULL stored_files` en ventana de mantenimiento.
6. **Respaldo del contenedor:** versionado activado y una regla de ciclo de vida
   para versiones antiguas; el respaldo de la base ya no incluye los archivos, así
   que los dos respaldos deben tomarse **juntos** y restaurarse juntos.

### Vuelta atrás

Hasta el paso 5 basta con `STORAGE_BACKEND=postgres`: las filas `OBJETO` se
siguen leyendo del contenedor. Mientras `data` no se haya puesto a `NULL`, cada
fila migrada puede volver a `POSTGRES` sin copiar nada.
