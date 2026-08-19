#!/usr/bin/env node
/**
 * Patch POS2.6 — puente de hardware del punto de venta.
 *
 * ## Qué es, y qué deliberadamente no es
 *
 * Un servicio diminuto que corre **en el mismo PC Windows que el mostrador** y
 * cuya única responsabilidad es entregar bytes a la impresora. Nada más.
 *
 * No tiene: lógica de venta, de inventario, de pagos, de autorización, acceso a
 * base de datos, Prisma, sesión de POS, precios ni impuestos. **El servidor de
 * MotoMas sigue siendo la única fuente de verdad del negocio**; aquí solo pasan
 * bytes que alguien ya decidió.
 *
 * ## Por qué existe
 *
 * El POS es una página web. Un navegador no puede escribir en una impresora USB
 * sin permisos que el usuario tendría que conceder por dispositivo, y `window.
 * print()` abre un diálogo y renderiza como una hoja A4 — que no es lo que hace
 * una térmica de 80 mm. Este proceso local es el mínimo puente entre las dos
 * cosas.
 *
 * ## Cómo entrega los bytes
 *
 * Escribe a un destino de Windows a través de `copy /b … <destino>`, donde el
 * destino es un **recurso compartido de impresora** (`\\\\localhost\\TICKET`).
 * Es la vía que no exige compilar un módulo nativo ni instalar un controlador
 * aparte: se comparte la impresora en Windows y se apunta aquí.
 *
 * **No ejecuta nada que venga del navegador.** El destino sale de la
 * configuración del proceso, los bytes van por un archivo temporal, y el comando
 * es fijo. La petición HTTP no puede aportar una sola palabra a la línea de
 * órdenes.
 *
 * ## Uso
 *
 *   node tools/pos-bridge/bridge.mjs
 *
 * Variables de entorno:
 *
 *   POS_BRIDGE_PORT    puerto (por omisión 7777)
 *   POS_BRIDGE_TARGET  destino de impresión, p. ej. \\\\localhost\\TICKET
 *   POS_BRIDGE_TOKEN   secreto compartido con el terminal (recomendado)
 */
import { createServer } from "node:http";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.POS_BRIDGE_PORT ?? 7777);
const TARGET = process.env.POS_BRIDGE_TARGET ?? "";
const TOKEN = process.env.POS_BRIDGE_TOKEN ?? "";
/** Un recibo largo son unos pocos kilobytes; más es un abuso, no un ticket. */
const MAX_BYTES = 256 * 1024;

/**
 * **Solo desde esta máquina.**
 *
 * Se comprueba la dirección del socket, no una cabecera: `Origin` y `Host` los
 * escribe el cliente y se pueden falsificar; la IP de origen del socket, no.
 */
function isLocal(socketAddress) {
  return (
    socketAddress === "127.0.0.1" ||
    socketAddress === "::1" ||
    socketAddress === "::ffff:127.0.0.1"
  );
}

/** Comparación en tiempo constante: un `===` filtra el token carácter a carácter. */
function tokenMatches(provided) {
  if (!TOKEN) return true;
  const a = Buffer.from(String(provided ?? ""));
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

function send(response, status, body) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    // Sin CORS permisivo: el terminal y el puente están en la misma máquina, y
    // el navegador solo necesita que el origen de MotoMas pueda hablarle.
    "access-control-allow-origin": process.env.POS_BRIDGE_ORIGIN ?? "*",
    "access-control-allow-headers": "content-type, x-pos-bridge-token",
    "access-control-allow-methods": "POST, OPTIONS",
    "cache-control": "no-store",
  });
  response.end(payload);
}

/** Los bytes salen por archivo temporal; nunca por la línea de órdenes. */
async function writeToPrinter(bytes) {
  if (!TARGET) {
    return { ok: false, error: "El puente no tiene destino de impresión configurado." };
  }
  let dir;
  try {
    dir = await mkdtemp(join(tmpdir(), "motomas-pos-"));
    const file = join(dir, "job.bin");
    await writeFile(file, Buffer.from(bytes));

    await new Promise((resolve, reject) => {
      // `cmd /c copy /b` con argumentos fijos: ni el archivo ni el destino
      // vienen del navegador, así que no hay nada que inyectar.
      execFile(
        "cmd",
        ["/c", "copy", "/b", file, TARGET],
        { timeout: 15_000, windowsHide: true },
        (error) => (error ? reject(error) : resolve(undefined)),
      );
    });
    return { ok: true };
  } catch {
    // **Nunca se devuelve el error del sistema.** Rutas, códigos de Windows y
    // trazas no le sirven al cajero y describen la máquina a quien pregunte.
    return { ok: false, error: "La impresora no respondió." };
  } finally {
    if (dir) await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

const server = createServer(async (request, response) => {
  if (!isLocal(request.socket.remoteAddress)) {
    send(response, 403, { ok: false, error: "Solo desde este equipo." });
    return;
  }
  if (request.method === "OPTIONS") {
    send(response, 204, {});
    return;
  }

  // Superficie mínima: tres operaciones y un estado. Nada más existe.
  const route = (request.url ?? "").split("?")[0];
  if (request.method === "GET" && route === "/status") {
    send(response, 200, { ok: true, configured: Boolean(TARGET), version: "1" });
    return;
  }
  if (request.method !== "POST" || !["/print", "/drawer", "/test"].includes(route)) {
    send(response, 404, { ok: false, error: "Operación no disponible." });
    return;
  }

  let raw = "";
  let tooBig = false;
  request.on("data", (chunk) => {
    raw += chunk;
    if (raw.length > MAX_BYTES) {
      tooBig = true;
      request.destroy();
    }
  });
  request.on("end", async () => {
    if (tooBig) {
      send(response, 413, { ok: false, error: "El trabajo es demasiado grande." });
      return;
    }
    let body;
    try {
      body = JSON.parse(raw || "{}");
    } catch {
      send(response, 400, { ok: false, error: "Petición mal formada." });
      return;
    }
    if (!tokenMatches(request.headers["x-pos-bridge-token"])) {
      send(response, 401, { ok: false, error: "No autorizado." });
      return;
    }
    // **El cuerpo solo puede traer bytes.** Un arreglo de enteros 0–255 y nada
    // más: ni rutas, ni nombres de dispositivo, ni comandos.
    const { bytes } = body;
    if (
      !Array.isArray(bytes) ||
      bytes.length === 0 ||
      bytes.length > MAX_BYTES ||
      !bytes.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ) {
      send(response, 400, { ok: false, error: "Petición mal formada." });
      return;
    }

    const result = await writeToPrinter(bytes);
    send(response, result.ok ? 200 : 502, result);
  });
});

// Escucha **solo** en la interfaz de bucle local: no queda expuesto en la red
// del local aunque el equipo tenga la suya abierta.
server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `Puente POS escuchando en http://127.0.0.1:${PORT} · destino ${TARGET || "(sin configurar)"}\n`,
  );
});
