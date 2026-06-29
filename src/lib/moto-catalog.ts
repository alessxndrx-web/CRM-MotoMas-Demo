import { readdir, readFile } from "fs/promises";
import path from "path";

import type { Motorcycle } from "@/lib/motomas-data";

const PUBLIC_MOTOS_DIR = path.join(process.cwd(), "public", "motos");
const IMAGE_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

type InfoJson = Record<string, unknown>;

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function readString(info: InfoJson, keys: string[]) {
  for (const key of keys) {
    const value = info[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function readStringList(info: InfoJson, keys: string[]) {
  for (const key of keys) {
    const value = info[key];
    if (Array.isArray(value)) {
      const items = value
        .map((item) => (typeof item === "string" ? item.trim() : null))
        .filter((item): item is string => Boolean(item));
      if (items.length) return items;
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

function readPrice(info: InfoJson) {
  const raw =
    info.precio ??
    info.price ??
    info.precioCRC ??
    info.precio_crc ??
    info.priceCRC ??
    info.price_crc;

  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;

  const normalized = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function readSpecs(info: InfoJson) {
  const value =
    info.especificaciones ??
    info.specs ??
    info.fichaTecnica ??
    info.ficha_tecnica ??
    info.detalles;

  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const items = value
      .map((item) => (typeof item === "string" ? item.trim() : null))
      .filter((item): item is string => Boolean(item));
    return items.length ? items.join(" | ") : null;
  }
  if (value && typeof value === "object") {
    const items = Object.entries(value)
      .map(([key, item]) => {
        if (typeof item === "string" || typeof item === "number") {
          return `${key}: ${item}`;
        }
        return null;
      })
      .filter((item): item is string => Boolean(item));
    return items.length ? items.join(" | ") : null;
  }
  return null;
}

function publicUrl(folderName: string, fileName: string) {
  return `/motos/${encodeURIComponent(folderName)}/${encodeURIComponent(fileName)}`;
}

async function readInfoJson(folderPath: string) {
  try {
    const raw = await readFile(path.join(folderPath, "info.json"), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as InfoJson)
      : {};
  } catch {
    return {};
  }
}

export async function loadMotorcycleCatalog(): Promise<Motorcycle[]> {
  let entries;

  try {
    entries = await readdir(PUBLIC_MOTOS_DIR, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name, "es"));

  const motorcycles = await Promise.all(
    directories.map(async (entry) => {
      const folderPath = path.join(PUBLIC_MOTOS_DIR, entry.name);
      const [info, files] = await Promise.all([
        readInfoJson(folderPath),
        readdir(folderPath, { withFileTypes: true }).catch(() => []),
      ]);
      const images = files
        .filter(
          (file) =>
            file.isFile() && IMAGE_EXTENSIONS.has(path.extname(file.name).toLowerCase()),
        )
        .map((file) => file.name)
        .sort((a, b) => a.localeCompare(b, "es"))
        .map((fileName) => publicUrl(entry.name, fileName));

      const name =
        readString(info, ["nombre", "name", "modelo", "model"]) ?? entry.name;

      return {
        id: slugify(entry.name) || slugify(name),
        name,
        sourceFolder: entry.name,
        sku: readString(info, ["sku", "codigo", "codigo_sku", "codigoSKU"]),
        category: readString(info, ["categoria", "category", "segmento", "tipo"]),
        specs: readSpecs(info),
        image: images[0] ?? null,
        images,
        price: readPrice(info),
        colors: readStringList(info, ["colores", "colors", "color"]),
        versions: readStringList(info, ["versiones", "versions", "version"]),
      } satisfies Motorcycle;
    }),
  );

  return motorcycles;
}
