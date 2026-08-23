import { storefrontUrl } from "@/lib/storefront";
import type { Product } from "@/payload-types";

/** True when Instagram/WhatsApp can fetch the URL (not localhost or a private LAN host). */
export function isPublicHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
    const host = parsed.hostname.toLowerCase();
    return (
      host !== "localhost" &&
      host !== "127.0.0.1" &&
      !host.endsWith(".local") &&
      !host.startsWith("192.168.") &&
      !host.startsWith("10.")
    );
  } catch {
    return false;
  }
}

/**
 * Public product image URLs (Vercel Blob / CDN) from `image` and `cover`.
 * Instagram cannot fetch localhost URLs.
 */
export function extractProductPublicImageUrls(product: Product): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const candidates: unknown[] = [product.image];
  if (Array.isArray(product.cover)) {
    candidates.push(...product.cover);
  }

  for (const candidate of candidates) {
    if (
      !candidate ||
      typeof candidate !== "object" ||
      !("url" in candidate) ||
      typeof (candidate as { url?: unknown }).url !== "string"
    ) {
      continue;
    }
    const raw = (candidate as { url: string }).url;
    const absolute = storefrontUrl(raw);
    if (!isPublicHttpUrl(absolute) || seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
  }

  return urls;
}
