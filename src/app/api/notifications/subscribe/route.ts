import { z } from "zod";

import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import {
  getPushSubscriptionsForUser,
  removePushSubscription,
  savePushSubscription,
} from "@/lib/firestore/push-subscriptions";

const subscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    expirationTime: z.number().nullable().optional(),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  }),
  orderId: z.string().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url(),
});

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await verifyRequest(request as never).catch(() => null);
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

    if (!user) {
      return Response.json({ vapidPublicKey, subscribed: false });
    }

    const subscriptions = await getPushSubscriptionsForUser(user.uid);
    return Response.json({
      vapidPublicKey,
      subscribed: subscriptions.length > 0,
      count: subscriptions.length,
    });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const user = await verifyRequest(request as never);
    const body = await request.json().catch(() => null);
    const validated = subscribeSchema.parse(body);

    const userAgent = request.headers.get("user-agent") ?? undefined;
    const result = await savePushSubscription(
      user.uid,
      validated.subscription,
      validated.orderId,
      userAgent
    );

    return Response.json({ ok: true, id: result.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Datos de suscripción inválidos", details: error.flatten() }, { status: 422 });
    }
    return toAuthorizationResponse(error);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await verifyRequest(request as never);
    const body = await request.json().catch(() => null);
    const validated = unsubscribeSchema.parse(body);

    const removed = await removePushSubscription(user.uid, validated.endpoint);
    return Response.json({ ok: true, removed });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "Endpoint inválido" }, { status: 422 });
    }
    return toAuthorizationResponse(error);
  }
}
