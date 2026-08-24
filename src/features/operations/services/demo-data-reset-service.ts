"use client";

import {
  DEMO_SESSION_CHANGE_EVENT,
} from "@/features/operations/services/session-service";
import { resetInventoryUnits } from "@/features/operations/services/inventory-service";
import { isDemoDataEnabled } from "@/shared/lib/demo-mode";
import { demoPersistenceKeys } from "@/shared/persistence/storage-keys";

export const demoDataStorageKeys = demoPersistenceKeys;

export function resetDemoData() {
  if (!isDemoDataEnabled()) {
    window.dispatchEvent(new Event(DEMO_SESSION_CHANGE_EVENT));
    return;
  }
  demoDataStorageKeys.forEach((key) => {
    window.localStorage.removeItem(key);
  });
  resetInventoryUnits();
  window.dispatchEvent(new Event(DEMO_SESSION_CHANGE_EVENT));
}
