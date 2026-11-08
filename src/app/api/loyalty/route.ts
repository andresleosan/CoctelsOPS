import { toAuthorizationResponse, verifyRequest } from "@/lib/auth/verify-request";
import { getUserLoyaltySummary } from "@/lib/firestore/loyalty";

export async function GET(request: Request): Promise<Response> {
  try {
    const user = await verifyRequest(request as never);
    const loyalty = await getUserLoyaltySummary(user.uid);
    return Response.json({ loyalty });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
