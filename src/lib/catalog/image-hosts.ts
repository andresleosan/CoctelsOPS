export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const DEFAULT_CATALOG_PLACEHOLDER = "/catalog-placeholder.svg";

export const CATALOG_IMAGE_HOSTS = [
  "firebasestorage.googleapis.com",
] as const;

function getConfiguredR2PublicUrl(): URL | undefined {
  const serverValue = process.env.R2_PUBLIC_BASE_URL;
  const publicValue = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;

  if (serverValue && publicValue && serverValue !== publicValue) return undefined;

  const value = serverValue || publicValue;
  if (!value) return undefined;

  try {
    const url = new URL(value);
    const schemeSeparator = value.indexOf("://");
    const authorityStart = schemeSeparator + 3;
    const remainder = value.slice(authorityStart);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = remainder.slice(0, authorityEnd === -1 ? remainder.length : authorityEnd);
    const hostPort = authority.slice(authority.lastIndexOf("@") + 1);

    if (url.protocol !== "https:" || hostPort.includes(":") || url.username || url.password) {
      return undefined;
    }

    return url;
  } catch {
    return undefined;
  }
}

export function getCatalogImageHosts(): string[] {
  const hosts: string[] = [...CATALOG_IMAGE_HOSTS];
  const r2Url = getConfiguredR2PublicUrl();

  if (r2Url && !hosts.includes(r2Url.hostname)) {
    hosts.push(r2Url.hostname);
  }

  return hosts;
}

export function isAllowedCatalogImage(value: string): boolean {
  if (value === "/catalog-placeholder.svg") return true;
  if (value.startsWith("/")) return false;

  try {
    const url = new URL(value);
    const schemeSeparator = value.indexOf("://");
    const authorityStart = schemeSeparator + 3;
    const remainder = value.slice(authorityStart);
    const authorityEnd = remainder.search(/[/?#]/);
    const authority = remainder.slice(0, authorityEnd === -1 ? remainder.length : authorityEnd);
    const hostPort = authority.slice(authority.lastIndexOf("@") + 1);
    const hasExplicitPort = hostPort.includes(":");
    return url.protocol === "https:"
      && !hasExplicitPort
      && !url.username
      && !url.password
      && getCatalogImageHosts().includes(url.hostname);
  } catch {
    return false;
  }
}
