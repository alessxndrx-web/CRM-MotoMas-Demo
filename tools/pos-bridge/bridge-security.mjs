/**
 * SMOKE-POS2.6 — seguridad del puente de hardware.
 *
 *   npm run smoke:pos-bridge
 *
 * **Arranca el puente de verdad** —el mismo `bridge.mjs` que corre en el
 * mostrador— y lo sondea desde fuera. No hay imitación ni impresora: el destino
 * de impresión se apunta a un archivo temporal, así que «imprimir» deja bytes en
 * disco que se pueden leer y comparar.
 *
 * Lo que se comprueba es una sola idea con varias caras: **el navegador solo
 * puede entregar bytes**. No puede elegir a dónde van, no puede aportar una
 * palabra a la línea de órdenes, no puede llegar desde otra máquina, y no puede
 * ampliar la superficie más allá de cuatro rutas.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PORT = 7913;
const TOKEN = "clave-de-prueba-del-puente";
const BASE = `http://127.0.0.1:${PORT}`;
const BRIDGE = fileURLToPath(new URL("./bridge.mjs", import.meta.url));

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  OK    ${name}`);
  } else {
    failed += 1;
    console.log(`  FALLA ${name} ${detail}`);
  }
}

const auth = { "content-type": "application/json", "x-pos-bridge-token": TOKEN };

async function call(path, { method = "POST", body, headers = auth } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* respuesta no JSON: se juzga por el texto */
  }
  return { status: response.status, text, json };
}

/** Espera a que el puente conteste, sin dormir a ciegas. */
async function waitForBridge() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${BASE}/status`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return true;
    } catch {
      /* aún no escucha */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

/** La primera IP de red real del equipo, si la hay. */
function lanAddress() {
  for (const list of Object.values(networkInterfaces())) {
    for (const entry of list ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return null;
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "motomas-bridge-test-"));
  const target = join(dir, "salida.bin");

  const child = spawn(process.execPath, [BRIDGE], {
    env: {
      ...process.env,
      POS_BRIDGE_PORT: String(PORT),
      POS_BRIDGE_TARGET: target,
      POS_BRIDGE_TOKEN: TOKEN,
    },
    stdio: "ignore",
  });

  try {
    if (!(await waitForBridge())) {
      console.log("  FALLA el puente no llegó a escuchar");
      process.exitCode = 1;
      return;
    }

    /* ------------------------------------------------------------------
     * Alcance de red
     * --------------------------------------------------------------- */

    const lan = lanAddress();
    if (lan) {
      let refused = false;
      try {
        await fetch(`http://${lan}:${PORT}/status`, { signal: AbortSignal.timeout(2_000) });
      } catch {
        refused = true;
      }
      // **No está en la red del local.** Escucha solo en el bucle local, así que
      // ni siquiera hay a quién rechazar: la conexión no se establece.
      check("no acepta conexiones por la IP de red del equipo", refused, `(${lan})`);
    } else {
      console.log("  NOTA  el equipo no tiene IP de red; omitida la prueba de alcance");
    }

    /* ------------------------------------------------------------------
     * Superficie
     * --------------------------------------------------------------- */

    const status = await call("/status", { method: "GET", headers: {} });
    check("GET /status responde", status.status === 200 && status.json?.ok === true);
    check(
      "el estado no revela el destino de impresión",
      !status.text.includes(target) && !status.text.includes(dir),
      status.text,
    );

    for (const path of ["/exec", "/shell", "/files", "/db", "/../bridge.mjs", "/print/../exec"]) {
      const response = await call(path, { body: { bytes: [1] } });
      check(`no existe ${path}`, response.status === 404);
    }
    const wrongMethod = await call("/print", { method: "GET", headers: {} });
    check("GET /print no imprime", wrongMethod.status === 404);

    /* ------------------------------------------------------------------
     * Token
     * --------------------------------------------------------------- */

    const noToken = await call("/print", {
      body: { bytes: [65] },
      headers: { "content-type": "application/json" },
    });
    check("sin clave, no imprime", noToken.status === 401);

    const badToken = await call("/print", {
      body: { bytes: [65] },
      headers: { "content-type": "application/json", "x-pos-bridge-token": "otra-clave" },
    });
    check("con clave equivocada, no imprime", badToken.status === 401);

    // **La cabecera de origen no es la frontera.** Un origen falsificado con la
    // clave correcta se comporta igual que cualquier otro: la decisión la toman
    // el socket y el token, no algo que el cliente escribe.
    const forgedOrigin = await call("/print", {
      body: { bytes: [65] },
      headers: { ...auth, origin: "http://sitio-ajeno.example", host: "sitio-ajeno.example" },
    });
    check(
      "el origen falsificado no cambia la decisión",
      forgedOrigin.status === 200,
      String(forgedOrigin.status),
    );

    /* ------------------------------------------------------------------
     * Forma del cuerpo
     * --------------------------------------------------------------- */

    const malformed = [
      ["cuerpo vacío", {}],
      ["bytes ausente", { datos: [65] }],
      ["bytes no es arreglo", { bytes: "AAA" }],
      ["bytes vacío", { bytes: [] }],
      ["byte fuera de rango", { bytes: [65, 256] }],
      ["byte negativo", { bytes: [65, -1] }],
      ["byte decimal", { bytes: [65, 1.5] }],
      ["byte no numérico", { bytes: [65, "x"] }],
      ["byte nulo", { bytes: [65, null] }],
    ];
    for (const [name, body] of malformed) {
      const response = await call("/print", { body });
      check(`rechaza ${name}`, response.status === 400, String(response.status));
    }

    const notJson = await fetch(`${BASE}/print`, { method: "POST", headers: auth, body: "{{{" });
    check("rechaza un cuerpo que no es JSON", notJson.status === 400);

    /* ------------------------------------------------------------------
     * El destino no es negociable
     * --------------------------------------------------------------- */

    const hijacked = join(dir, "secuestrado.bin");
    const hijack = await call("/print", {
      body: {
        bytes: [66],
        // Todo esto es ruido: el puente no lee ni una de estas claves.
        target: hijacked,
        path: hijacked,
        device: "LPT1",
        command: "calc.exe",
        file: "C:\\Windows\\System32\\config\\SAM",
      },
    });
    check("acepta el trabajo ignorando los campos extra", hijack.status === 200);
    let hijackedExists = true;
    try {
      await readFile(hijacked);
    } catch {
      hijackedExists = false;
    }
    // **El destino sale de la configuración del proceso, siempre.**
    check("el destino propuesto por el cliente no se usó", !hijackedExists);

    /* ------------------------------------------------------------------
     * Nada se ejecuta
     * --------------------------------------------------------------- */

    // Bytes que en una línea de órdenes serían metacaracteres. Si algo los
    // interpretara, no llegarían intactos al archivo.
    const payload = '& calc.exe & echo "x" | dir %PATH% ^ `whoami` $(id) > out';
    const bytes = Array.from(payload, (character) => character.charCodeAt(0));
    const injected = await call("/print", { body: { bytes } });
    check("imprime la carga con metacaracteres", injected.status === 200);

    const written = await readFile(target);
    check(
      "los metacaracteres llegaron literales al destino",
      written.toString("latin1").includes(payload),
      written.toString("latin1").slice(0, 120),
    );

    /* ------------------------------------------------------------------
     * Tamaño
     * --------------------------------------------------------------- */

    const huge = await call("/print", { body: { bytes: new Array(300 * 1024).fill(65) } }).catch(
      () => ({ status: 413 }),
    );
    check(
      "rechaza un trabajo desmedido",
      huge.status === 413 || huge.status === 400,
      String(huge.status),
    );

    // Y sigue vivo después: cortar una petición abusiva no tumba el servicio.
    const after = await call("/status", { method: "GET", headers: {} });
    check("sigue atendiendo tras rechazar el abuso", after.status === 200);

    /* ------------------------------------------------------------------
     * Nada de negocio
     * --------------------------------------------------------------- */

    const source = await readFile(BRIDGE, "utf8");
    for (const forbidden of ["PrismaClient", "@prisma/client", "posSale", "posInventory"]) {
      check(`el puente no menciona ${forbidden}`, !source.includes(forbidden));
    }
    check(
      "el puente escucha solo en el bucle local",
      /server\.listen\(\s*PORT\s*,\s*"127\.0\.0\.1"/.test(source),
    );
  } finally {
    child.kill();
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }

  console.log(`\n  ${passed} correctas · ${failed} fallidas`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
