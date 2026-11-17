export const ADMIN_EMAILS: readonly string[] = ["andres.san1404@gmail.com"];

export function esEmailAdmin(email: unknown): boolean {
  return typeof email === "string" && ADMIN_EMAILS.includes(email.trim().toLowerCase());
}

export function esClaimAdmin(claims: Record<string, unknown> | null | undefined): boolean {
  if (claims?.admin === true) return true;
  if (typeof claims?.email === "string" && esEmailAdmin(claims.email)) return true;
  return false;
}

export function esTokenAdminVerificado(
  token: { admin?: unknown; email?: unknown; email_verified?: unknown } | null | undefined,
): boolean {
  if (!token) return false;
  if (token.admin === true) return true;
  return esEmailAdmin(token.email) && token.email_verified === true;
}
