#!/usr/bin/env node
/**
 * Patch CRM-INT4 — la paleta oscura del panel: la genera y la comprueba.
 *
 *   npm run theme:palette            imprime el bloque `@theme` para globals.css
 *   npm run theme:palette -- --check comprueba que globals.css coincide y que
 *                                    los pares de contraste cumplen WCAG AA
 *
 * ## Por qué existe
 *
 * Los 165 colores oscuros de `src/app/globals.css` no están elegidos uno a uno:
 * salen de una regla por rol del escalón (ver `docs/design-system.md` §19). Si
 * alguien retoca uno a mano, o si una actualización de Tailwind mueve un valor
 * claro, el bloque deja de decir lo que el documento dice. `--check` lo detecta
 * y además vuelve a medir el contraste, que es la razón de ser de la regla.
 *
 * No forma parte de `npm run verify` a propósito: la paleta cambia muy de vez
 * en cuando y esta comprobación no protege nada que el diff no enseñe. Se corre
 * al tocar la paleta.
 *
 * Sin dependencias: la conversión OKLCH → sRGB y la mezcla en OKLab son las
 * fórmulas publicadas por Björn Ottosson, las mismas que usa el navegador.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TAILWIND_THEME = join(ROOT, "node_modules", "tailwindcss", "theme.css");
const GLOBALS = join(ROOT, "src", "app", "globals.css");

// --- Regla -----------------------------------------------------------------

/** Superficies oscuras: azul marino, no negro. Deben coincidir con `--sb-*`. */
const CANVAS = "#0b1120";
const SURFACE = "#121a2b";

/**
 * Rampa neutra oscura, diseñada a mano. 50–300 son fondos y bordes; 400–950,
 * texto de menos a más contraste. Se comparte entre slate, gray y zinc: en el
 * panel los tres hacen el mismo papel.
 */
const NEUTRAL_DARK = {
  50: "#172134", // superficie atenuada, fila activa
  100: "#1d283d", // hundida, fichas neutras, hover fuerte
  200: "#29364d", // borde
  300: "#3a4861", // borde fuerte
  400: "#7f8ca5", // iconos y marcas de ayuda
  500: "#9aa7bc", // texto atenuado
  600: "#afbacb", // texto secundario
  700: "#c5cedb", // texto de cuerpo
  800: "#d8dfe9", // texto fuerte
  900: "#e7ecf3", // texto principal
  950: "#f4f7fb",
};

const NEUTRALS = ["slate", "gray", "zinc"];
const ACCENTS = [
  "blue", "sky", "indigo", "violet", "emerald", "green", "teal",
  "red", "rose", "amber", "yellow", "orange",
];
/** Acentos 50–300: tinte del 500 sobre la superficie, con este porcentaje. */
const TINT = { 50: 14, 100: 20, 200: 32, 300: 46 };
/** Acentos 600–950: el tono claro del mismo color que ocupa su lugar. */
const LIGHTER = { 600: 400, 700: 300, 800: 200, 900: 100, 950: 50 };

/** Rellenos sólidos con texto blanco (`--sb-action*`): [claro, oscuro]. */
const ACTIONS = {
  "acción principal": ["oklch(54.6% 0.245 262.881)", "#2f6fe8"],
  "acción principal (hover)": ["oklch(48.8% 0.243 264.376)", "#2359c9"],
  "acción peligro": ["oklch(57.7% 0.245 27.325)", "#d23b3b"],
  "acción peligro (hover)": ["oklch(50.5% 0.213 27.518)", "#b42f2f"],
  "acción éxito": ["oklch(59.6% 0.145 163.225)", "#0e7a57"],
  "acción éxito (hover)": ["oklch(50.8% 0.118 165.612)", "#0b6649"],
};
/** Borde de campo oscuro (`--sb-field-border`): WCAG 1.4.11 pide 3:1. */
const FIELD_BORDER_DARK = "#606e88";

// --- Color -------------------------------------------------------------------

const cbrt = (v) => Math.sign(v) * Math.abs(v) ** (1 / 3);
const gamma = (c) => {
  const x = Math.min(Math.max(c, 0), 1);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
};
const ungamma = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function oklabToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearToOklab([r, g, b]) {
  const l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function toLinear(value) {
  if (value.startsWith("#")) {
    return [1, 3, 5].map((i) => ungamma(parseInt(value.slice(i, i + 2), 16) / 255));
  }
  const match = /oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+)\)/.exec(value);
  if (!match) throw new Error(`Color no reconocido: ${value}`);
  const [L, C, H] = [Number(match[1]) / 100, Number(match[2]), (Number(match[3]) * Math.PI) / 180];
  return oklabToLinear([L, C * Math.cos(H), C * Math.sin(H)]);
}

const toHex = (value) =>
  "#" + toLinear(value).map((c) => Math.round(gamma(c) * 255).toString(16).padStart(2, "0")).join("");

/** `color-mix(in oklab, fg pct%, bg)`, en hex. */
function mix(fg, bg, pct) {
  const [f, b] = [linearToOklab(toLinear(fg)), linearToOklab(toLinear(bg))];
  const t = pct / 100;
  const lab = f.map((v, i) => v * t + b[i] * (1 - t));
  return "#" + oklabToLinear(lab).map((c) => Math.round(gamma(c) * 255).toString(16).padStart(2, "0")).join("");
}

function contrast(a, b) {
  const lum = (v) => {
    const [r, g, bl] = toLinear(v).map((c) => Math.min(Math.max(c, 0), 1));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Paleta ----------------------------------------------------------------

const tailwind = {};
for (const [, scale, step, value] of readFileSync(TAILWIND_THEME, "utf8").matchAll(
  /--color-([a-z]+)-(\d+):\s*(oklch\([^)]*\));/g,
)) {
  (tailwind[scale] ??= {})[Number(step)] = value;
}

const dark = {};
for (const scale of NEUTRALS) dark[scale] = { ...NEUTRAL_DARK };
for (const scale of ACCENTS) {
  const base = tailwind[scale];
  dark[scale] = {
    ...Object.fromEntries(Object.entries(TINT).map(([step, pct]) => [step, mix(base[500], SURFACE, pct)])),
    400: toHex(base[400]),
    500: toHex(base[500]),
    ...Object.fromEntries(Object.entries(LIGHTER).map(([step, src]) => [step, toHex(base[src])])),
  };
}

const expected = [];
for (const scale of [...NEUTRALS, ...ACCENTS]) {
  for (const step of Object.keys(tailwind[scale]).map(Number).sort((a, b) => a - b)) {
    expected.push(`  --color-${scale}-${step}: light-dark(${tailwind[scale][step]}, ${dark[scale][step]});`);
  }
}

if (!process.argv.includes("--check")) {
  process.stdout.write(`@theme {\n${expected.join("\n")}\n}\n`);
  process.exit(0);
}

// --- Comprobación ------------------------------------------------------------

const problems = [];

const css = readFileSync(GLOBALS, "utf8");
const present = new Set(
  [...css.matchAll(/^ {2}--color-[a-z]+-\d+: light-dark\([^\r\n]*\);(?=\r?$)/gm)].map((m) => m[0]),
);
for (const line of expected) {
  if (!present.has(line)) problems.push(`globals.css no tiene, o tiene distinta: ${line.trim()}`);
}
for (const line of present) {
  if (!expected.includes(line)) problems.push(`globals.css tiene una línea que la regla no genera: ${line.trim()}`);
}

const checks = [];
const need = (label, fg, bg, minimum) => checks.push({ label, ratio: contrast(fg, bg), minimum });
const N = NEUTRAL_DARK;
for (const [name, bg] of Object.entries({ lienzo: CANVAS, superficie: SURFACE, "slate-50": N[50], "slate-100": N[100] })) {
  need(`texto principal slate-900 sobre ${name}`, N[900], bg, 4.5);
  need(`texto de cuerpo slate-700 sobre ${name}`, N[700], bg, 4.5);
  need(`texto secundario slate-600 sobre ${name}`, N[600], bg, 4.5);
  need(`texto atenuado slate-500 sobre ${name}`, N[500], bg, 4.5);
  need(`iconos slate-400 sobre ${name} (no texto)`, N[400], bg, 3);
}
need("borde de campo sobre superficie (no texto)", FIELD_BORDER_DARK, SURFACE, 3);
for (const scale of ACCENTS) {
  const d = dark[scale];
  for (const step of [600, 700, 800]) {
    need(`${scale}-${step} texto sobre superficie`, d[step], SURFACE, 4.5);
    need(`${scale}-${step} texto sobre su tinte ${scale}-50`, d[step], d[50], 4.5);
  }
  need(`${scale}-700 texto sobre su tinte ${scale}-100`, d[700], d[100], 4.5);
}
for (const [label, [, darkValue]] of Object.entries(ACTIONS)) {
  need(`texto blanco sobre ${label}`, "#ffffff", darkValue, 4.5);
}
need("acción principal distinguible del lienzo (no texto)", ACTIONS["acción principal"][1], CANVAS, 3);

for (const { label, ratio, minimum } of checks) {
  if (ratio < minimum) problems.push(`contraste ${ratio.toFixed(2)}:1 < ${minimum}:1 — ${label}`);
}
const tightest = [...checks].sort((a, b) => a.ratio / a.minimum - b.ratio / b.minimum).slice(0, 3);

console.log(`${expected.length} colores comparados con globals.css; ${checks.length} pares de contraste medidos.`);
console.log(`Los más ajustados: ${tightest.map((c) => `${c.label} ${c.ratio.toFixed(2)}:1`).join(" · ")}`);
if (problems.length) {
  console.error(`\n${problems.length} problema(s):\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("Paleta conforme.");
