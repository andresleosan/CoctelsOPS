import { verifyToken, toAuthorizationResponse } from "@/lib/auth/verify-request";
import { syncUser } from "@/lib/firestore/users";

export async function POST(request: Request): Promise<Response> {
  try {
    const token = await verifyToken(request as never);
    const user = await syncUser(token.uid, {
      email: typeof token.email === "string" ? token.email : "",
      displayName: typeof token.name === "string" ? token.name : null,
      photoURL: typeof token.picture === "string" ? token.picture : null,
      emailVerified: token.email_verified === true,
    });
    return Response.json({ user }, { status: 200 });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
