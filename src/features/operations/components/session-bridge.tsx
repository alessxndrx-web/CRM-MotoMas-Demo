"use client";

import { useEffect } from "react";

import { saveDemoSession } from "@/features/operations/services/session-service";
import type { DemoSession } from "@/features/operations/types";

/**
 * Mirrors the authenticated server session into the localStorage session that
 * every existing internal panel already reads. This keeps the current
 * role/branch-scoped UX working unchanged on top of the real cookie auth.
 */
export function SessionBridge({ session }: { session: DemoSession }) {
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("motomas-demo-session-v1");
      const current = raw ? (JSON.parse(raw) as Partial<DemoSession>) : null;
      if (!current || current.userId !== session.userId) {
        saveDemoSession(session);
      }
    } catch {
      saveDemoSession(session);
    }
  }, [session]);

  return null;
}
