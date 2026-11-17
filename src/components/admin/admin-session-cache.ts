"use client";

import type { User } from "firebase/auth";

import type { AdminAccessDiagnostic, Permission, UserProfile } from "@/types/auth";

export type AdminSessionPayload = {
  user?: UserProfile & { permissions?: Permission[]; isAdmin?: boolean };
  adminAccess?: AdminAccessDiagnostic;
  error?: string;
};

export type AdminSessionResult = {
  ok: boolean;
  status: number;
  data: AdminSessionPayload;
};

const SESSION_CACHE_TTL_MS = 30_000;

type CacheEntry = {
  fetchedAt: number;
  result: AdminSessionResult;
};

const sessionCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<AdminSessionResult>>();

export function invalidateAdminSessionCache(uid?: string): void {
  if (uid) {
    sessionCache.delete(uid);
    inFlightRequests.delete(uid);
    return;
  }
  sessionCache.clear();
  inFlightRequests.clear();
}

export async function fetchAdminSession(
  user: Pick<User, "uid" | "getIdToken">,
  options: { force?: boolean } = {},
): Promise<AdminSessionResult> {
  const { force = false } = options;

  if (!force) {
    const cached = sessionCache.get(user.uid);
    if (cached && Date.now() - cached.fetchedAt < SESSION_CACHE_TTL_MS) {
      return cached.result;
    }

    const pending = inFlightRequests.get(user.uid);
    if (pending) {
      return pending;
    }
  } else {
    sessionCache.delete(user.uid);
  }

  const requestPromise = (async (): Promise<AdminSessionResult> => {
    try {
      const token = await user.getIdToken(force);
      const response = await fetch("/api/auth/session", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await response.json().catch(() => ({}))) as AdminSessionPayload;
      const result: AdminSessionResult = {
        ok: response.ok,
        status: response.status,
        data,
      };
      if (response.ok) {
        sessionCache.set(user.uid, { fetchedAt: Date.now(), result });
      }
      return result;
    } catch (error) {
      return {
        ok: false,
        status: 0,
        data: {
          error:
            error instanceof Error
              ? error.message
              : "No fue posible validar la sesión con el servidor.",
        },
      };
    } finally {
      inFlightRequests.delete(user.uid);
    }
  })();

  inFlightRequests.set(user.uid, requestPromise);
  return requestPromise;
}
