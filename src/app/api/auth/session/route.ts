import { buildAdminAccessDiagnostic, resolvePermissions } from "@/lib/auth/permissions";
import { verifyRequest, toAuthorizationResponse } from "@/lib/auth/verify-request";

export async function GET(request: Request): Promise<Response> {
  try {
    const verified = await verifyRequest(request as never);
    const permissions = await resolvePermissions(verified.profile);
    const adminAccess = buildAdminAccessDiagnostic(verified, permissions);
    return Response.json({
      user: { ...verified.profile, permissions },
      adminAccess,
    });
  } catch (error) {
    return toAuthorizationResponse(error);
  }
}
