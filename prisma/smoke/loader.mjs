// Resolutor para ejecutar el código de `src/` desde un script de Node:
// traduce el alias `@/`, resuelve `directorio` como `directorio/index.ts` (que
// TypeScript y el bundler hacen solos) y sustituye el runtime de Next por un
// stub.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, "..", "..", "src");
const STUB = new URL("next-stub.mjs", import.meta.url).href;

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const base = path.join(SRC, specifier.slice(2));
    const file = existsSync(`${base}.ts`) ? `${base}.ts` : path.join(base, "index.ts");
    return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (specifier.startsWith("next/")) {
    return { url: STUB, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
