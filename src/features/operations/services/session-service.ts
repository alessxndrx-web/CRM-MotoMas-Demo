"use client";

import type { DemoSession } from "@/features/operations/types";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const DEMO_SESSION_STORAGE_KEY = storageKeys.demoSession;
export const DEMO_SESSION_CHANGE_EVENT = "motomas-demo-session-change";

/**
 * Reads the mirrored session written by SessionBridge (real login) or by the
 * legacy demo login. Both already store the full DemoSession shape, so this
 * only needs to validate the stored shape — it must NOT re-derive the user
 * from the fixed `demoInternalUsers` list, since a real database user id
 * never appears there and would make every authenticated Seller/Manager
 * session look logged out to the legacy panels.
 */
export function readDemoSession(): DemoSession | null {
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.userName !== "string" ||
      typeof parsed.role !== "string" ||
      typeof parsed.branchId !== "string" ||
      typeof parsed.branchName !== "string"
    ) {
      return null;
    }

    return parsed as DemoSession;
  } catch {
    return null;
  }
}

export function saveDemoSession(session: DemoSession) {
  window.localStorage.setItem(
    DEMO_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
  emitDemoSessionChange();
}

export function clearDemoSession() {
  window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
  emitDemoSessionChange();
}

export function emitDemoSessionChange() {
  window.dispatchEvent(new Event(DEMO_SESSION_CHANGE_EVENT));
}

export function subscribeToDemoSession(callback: () => void) {
  window.addEventListener(DEMO_SESSION_CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener(DEMO_SESSION_CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}
