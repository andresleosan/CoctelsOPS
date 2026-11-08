import "server-only";

import crypto from "crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import type { PushSubscriptionData, PushSubscriptionRecord } from "@/types/operations";

function getSubscriptionDocId(uid: string, endpoint: string): string {
  return crypto.createHash("sha256").update(`${uid}:${endpoint}`).digest("hex").slice(0, 32);
}

function toPushRecord(id: string, data: Record<string, unknown>): PushSubscriptionRecord {
  const sub = (data.subscription ?? {}) as Record<string, unknown>;
  const keys = (sub.keys ?? {}) as Record<string, unknown>;
  return {
    id,
    uid: typeof data.uid === "string" ? data.uid : "",
    subscription: {
      endpoint: typeof sub.endpoint === "string" ? sub.endpoint : "",
      expirationTime: typeof sub.expirationTime === "number" ? sub.expirationTime : null,
      keys: {
        p256dh: typeof keys.p256dh === "string" ? keys.p256dh : "",
        auth: typeof keys.auth === "string" ? keys.auth : "",
      },
    },
    orderId: typeof data.orderId === "string" ? data.orderId : undefined,
    userAgent: typeof data.userAgent === "string" ? data.userAgent : undefined,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}

export async function savePushSubscription(
  uid: string,
  subscription: PushSubscriptionData,
  orderId?: string,
  userAgent?: string
): Promise<{ id: string }> {
  const docId = getSubscriptionDocId(uid, subscription.endpoint);
  const docRef = getAdminDb().collection("push_subscriptions").doc(docId);
  const now = new Date().toISOString();

  const existing = await docRef.get();
  const data: Record<string, unknown> = {
    uid,
    subscription: {
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime ?? null,
      keys: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    },
    updatedAt: now,
    ...(orderId ? { orderId } : {}),
    ...(userAgent ? { userAgent } : {}),
  };

  if (existing.exists) {
    await docRef.update(data);
  } else {
    data.createdAt = now;
    await docRef.set(data);
  }

  return { id: docId };
}

export async function removePushSubscription(uid: string, endpoint: string): Promise<boolean> {
  const docId = getSubscriptionDocId(uid, endpoint);
  const docRef = getAdminDb().collection("push_subscriptions").doc(docId);
  const existing = await docRef.get();
  if (!existing.exists) return false;
  await docRef.delete();
  return true;
}

export async function getPushSubscriptionsForUser(uid: string): Promise<PushSubscriptionRecord[]> {
  const snapshot = await getAdminDb()
    .collection("push_subscriptions")
    .where("uid", "==", uid)
    .orderBy("updatedAt", "desc")
    .limit(20)
    .get();

  return snapshot.docs.map((doc) => toPushRecord(doc.id, doc.data() as Record<string, unknown>));
}
