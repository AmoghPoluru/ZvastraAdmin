/**
 * Public evega storefront origin. Product links and relative media URLs must
 * resolve against the storefront, never against this console's own host.
 */
export function getStorefrontOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_STOREFRONT_URL || process.env.NEXT_PUBLIC_APP_URL || "";
  return raw.replace(/\/$/, "");
}

export function storefrontUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const origin = getStorefrontOrigin();
  const path = pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
  return `${origin}${path}`;
}
