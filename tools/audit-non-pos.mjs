import { loadEnvFile } from "node:process";
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, existsSync, unlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

loadEnvFile(".env");
const output = ".audit/non-pos";
mkdirSync(output, { recursive: true });
const lockFile = `${output}/running.json`;
if (existsSync(lockFile)) {
  const previous = JSON.parse(readFileSync(lockFile, "utf8"));
  let running = false;
  try { process.kill(previous.pid, 0); running = true; } catch { /* The previous runner stopped. */ }
  if (running) throw new Error("Ya hay una auditoría en curso. Ejecuta las pruebas de servicio y navegador en secuencia.");
  unlinkSync(lockFile);
}
writeFileSync(lockFile, JSON.stringify({ pid: process.pid }), { flag: "wx" });
process.on("exit", () => { if (existsSync(lockFile)) unlinkSync(lockFile); });
const stateFile = `${output}/state.json`;
const mode = process.argv[2] ?? "smokes";
const sourceUrl = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1", "[::1]"].includes(sourceUrl.hostname)) throw new Error("La auditoría solo admite PostgreSQL local.");
// Avoid the Windows IPv4 relay when Docker Desktop is available over localhost.
sourceUrl.hostname = "localhost";
sourceUrl.searchParams.set("connection_limit", "3");
sourceUrl.searchParams.set("connect_timeout", "15");
let state;
if (mode === "init") {
  if (existsSync(stateFile)) throw new Error("Ya existe una auditoría; usa smokes o browser para continuarla.");
  const databaseName = `motomas_audit_${Date.now()}`;
  const db = new PrismaClient({ datasourceUrl: sourceUrl.toString() });
  try { await db.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`); } finally { await db.$disconnect(); }
  state = { databaseName, results: [] };
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
} else state = JSON.parse(readFileSync(stateFile, "utf8"));
if (!/^motomas_audit_\d+$/.test(state.databaseName)) throw new Error("Nombre de base de auditoría no válido.");
sourceUrl.pathname = `/${state.databaseName}`;
const env = { ...process.env, DATABASE_URL: sourceUrl.toString(), AUDIT_NON_POS: "true" };
for (const key of Object.keys(env)) if (/^(META_|WHATSAPP_|MOTOMAS_ADMIN_)/.test(key)) env[key] = "";

function run(name, args) {
  const log = `${output}/${name}.log`;
  console.log(`INICIO ${name}`);
  const fd = openSync(log, "w");
  const start = Date.now();
  let child;
  const childEnv = name === "crmqa1-roles-reservas-pagos"
    ? { ...env, PAYMENTS_PROVIDER: "sandbox", PAYMENTS_SANDBOX_SECRET: randomBytes(32).toString("hex") }
    : env;
  try { child = spawnSync(process.execPath, args, { env: childEnv, stdio: ["ignore", fd, fd] }); } finally { closeSync(fd); }
  const result = { name, ok: child.status === 0, exitCode: child.status, seconds: Math.round((Date.now() - start) / 1000), log };
  if (existsSync(stateFile)) state = JSON.parse(readFileSync(stateFile, "utf8"));
  state.results.push(result);
  writeFileSync(stateFile, JSON.stringify(state, null, 2));
  console.log(`${result.ok ? "PASS" : "FAIL"} ${name} (${result.seconds}s)`);
  return result.ok;
}

if (mode === "init") {
  if (!run("migrations", ["node_modules/prisma/build/index.js", "migrate", "deploy"])) process.exitCode = 1;
  else if (!run("seed", ["prisma/seed.mjs"])) process.exitCode = 1;
} else if (mode === "smokes") {
  const files = [
    "crmaud1-matriz-roles", "crmaud2-ficha-avisos-paginacion", "crmqa1-roles-reservas-pagos",
    "crmint1-flujo-integral", "crmint3-meta-comprobantes-whatsapp", "crmcc1-call-center",
    "meta1-webhook-leadads", "meta2-whatsapp", "meta3-ad-accounts", "meta4-ad-metrics",
    "cb4a-cash-session-single-open", "ff20a-tax-component", "ff20b-document-tax", "ff20c-cash-tax",
    "ff20d-vat-settlement", "ff20e-vat-settlement-workflow", "non-pos-support", "non-pos-suppliers",
  ];
  const selected = files.filter(file => !process.argv[3] || file.includes(process.argv[3]));
  if (!selected.length) throw new Error("El filtro no coincide con ninguna prueba de servicio.");
  for (const file of selected) if (!run(file, ["--experimental-strip-types", "--no-warnings", "--import", "./prisma/smoke/register.mjs", `prisma/smoke/${file}.ts`])) process.exitCode = 1;
} else if (mode === "browser") {
  if (!run("browser", ["node_modules/@playwright/test/cli.js", "test", "-c", "playwright.non-pos.config.ts", ...process.argv.slice(3)])) process.exitCode = 1;
} else throw new Error("Usa init, smokes o browser.");
