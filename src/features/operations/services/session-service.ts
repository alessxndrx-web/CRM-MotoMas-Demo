"use client";

import { getInternalUserById } from "@/data/operations/users";
import type { DemoSession } from "@/features/operations/types";
import { storageKeys } from "@/shared/persistence/storage-keys";

export const DEMO_SESSION_STORAGE_KEY = storageKeys.demoSession;
export const DEMO_SESSION_CHANGE_EVENT = "motomas-demo-session-change";

export function readDemoSession() {
  try {
    const raw = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<DemoSession>;
    if (typeof parsed.userId !== "string") return null;

    const user = getInternalUserById(parsed.userId);
    if (!user) return null;

    return user;
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
