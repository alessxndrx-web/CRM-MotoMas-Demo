"use client";

import {
  createDemoInventoryUnits,
  INVENTORY_UNITS_STORAGE_KEY,
  normalizeInventoryUnit,
  type InventoryUnit,
} from "@/data/operations/inventory";
import { isDemoDataEnabled } from "@/shared/lib/demo-mode";

export function readInventoryUnits() {
  try {
    const raw = window.localStorage.getItem(INVENTORY_UNITS_STORAGE_KEY);
    if (!raw) {
      if (!isDemoDataEnabled()) return [];
      const seedUnits = createDemoInventoryUnits();
      writeInventoryUnits(seedUnits);
      return seedUnits;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return isDemoDataEnabled() ? resetInventoryUnits() : [];
    if (!parsed.length) return [];

    const units = parsed
      .map((unit) => normalizeInventoryUnit(unit))
      .filter((unit): unit is InventoryUnit => Boolean(unit));

    if (!units.length) return isDemoDataEnabled() ? resetInventoryUnits() : [];

    return units;
  } catch {
    return isDemoDataEnabled() ? resetInventoryUnits() : [];
  }
}

export function writeInventoryUnits(units: InventoryUnit[]) {
  window.localStorage.setItem(INVENTORY_UNITS_STORAGE_KEY, JSON.stringify(units));
}

export function resetInventoryUnits() {
  if (!isDemoDataEnabled()) {
    writeInventoryUnits([]);
    return [];
  }
  const seedUnits = createDemoInventoryUnits();
  writeInventoryUnits(seedUnits);
  return seedUnits;
}
