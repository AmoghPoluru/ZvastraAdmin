/**
 * WhatsApp Business Cloud API Service
 *
 * Mirrors the provider pattern in `src/lib/email.ts`: env is read on module load
 * as a platform-wide default, per-vendor credentials can be passed per call, and
 * callers are expected to swallow errors ("async, don't block, log on failure").
 */

import type { BasePayload } from "payload";
import type { Product, Vendor } from "@/payload-types";
import { isPublicHttpUrl } from "@/lib/product-public-media";

const DEFAULT_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || "en";
const ORDER_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_ORDER_LANGUAGE?.trim() || DEFAULT_TEMPLATE_LANGUAGE;
const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
const DEFAULT_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const DEFAULT_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const LOG_PREFIX = "[WhatsApp]";

function logWhatsApp(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.log(`${LOG_PREFIX} ${message}`, details);
    return;
  }
  console.log(`${LOG_PREFIX} ${message}`);
}

if (
  process.env.NODE_ENV === "development" &&
  (!DEFAULT_PHONE_NUMBER_ID || !DEFAULT_ACCESS_TOKEN)
) {
  console.warn(
    "⚠️  WhatsApp not configured (WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN). Messages will only send when a vendor has its own credentials."
  );
}

function graphUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`;
}

interface WhatsAppCreds {
  phoneNumberId?: string | null;
  accessToken?: string | null;
}

function resolveCreds(creds: WhatsAppCreds): {
  phoneNumberId: string;
  accessToken: string;
} | null {
  const phoneNumberId = creds.phoneNumberId || DEFAULT_PHONE_NUMBER_ID;
  const accessToken = creds.accessToken || DEFAULT_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    logWhatsApp("Skipped send — missing credentials", {
      hasPhoneNumberId: Boolean(phoneNumberId),
      hasAccessToken: Boolean(accessToken),
      credentialSource: creds.phoneNumberId ? "vendor" : "env-fallback",
    });
    return null;
  }

  logWhatsApp("Resolved credentials", {
    phoneNumberId,
    credentialSource:
      creds.phoneNumberId && creds.accessToken
        ? "vendor"
        : creds.phoneNumberId || creds.accessToken
          ? "mixed"
          : "env-fallback",
  });

  return { phoneNumberId, accessToken };
}

async function postToGraph(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>
): Promise<{ id?: string }> {
  logWhatsApp("Sending message to Meta Graph API", {
    phoneNumberId,
    to: payload.to,
    type: payload.type,
    template:
      payload.type === "template" &&
      typeof payload.template === "object" &&
      payload.template !== null &&
      "name" in payload.template
        ? {
            name: (payload.template as { name?: string }).name,
            language:
              "language" in payload.template &&
              typeof payload.template.language === "object" &&
              payload.template.language !== null &&
              "code" in payload.template.language
                ? (payload.template.language as { code?: string }).code
                : undefined,
          }
        : undefined,
  });

  const res = await fetch(graphUrl(phoneNumberId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id?: string }>;
    error?: {
      message?: string;
      error_data?: { details?: string };
    };
  };

  if (!res.ok) {
    const details = data?.error?.error_data?.details;
    console.error(`${LOG_PREFIX} Meta API error`, {
      status: res.status,
      to: payload.to,
      type: payload.type,
      message: data?.error?.message || "unknown error",
      ...(details ? { details } : {}),
    });
    throw new Error(
      `WhatsApp API error (${res.status}): ${data?.error?.message || "unknown error"}`
    );
  }

  const messageId = data?.messages?.[0]?.id;
  logWhatsApp("Message sent successfully", {
    to: payload.to,
    type: payload.type,
    messageId,
  });

  return { id: messageId };
}

export interface SendWhatsAppTemplateArgs extends WhatsAppCreds {
  to: string;
  template: string;
  /** Body text parameters, in order. */
  params?: string[];
  languageCode?: string;
  /** TEXT header variable (must match template header type in Meta). */
  headerText?: string;
  /** Publicly hosted image URL for an IMAGE header component. */
  headerImageUrl?: string;
}

/**
 * Send a WhatsApp template (business-initiated) message. Templates must be
 * pre-approved in the Meta WhatsApp Manager.
 */
export async function sendWhatsAppTemplate(
  args: SendWhatsAppTemplateArgs
): Promise<{ id?: string } | null> {
  const creds = resolveCreds(args);
  if (!creds) return null;

  const parameterless = isParameterlessTemplate(args.template);
  const components: Record<string, unknown>[] = [];

  if (!parameterless && args.headerText) {
    components.push({
      type: "header",
      parameters: [{ type: "text", text: args.headerText }],
    });
  } else if (
    !parameterless &&
    args.headerImageUrl &&
    isPublicHttpUrl(args.headerImageUrl)
  ) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: args.headerImageUrl } }],
    });
  }

  if (!parameterless && args.params && args.params.length > 0) {
    components.push({
      type: "body",
      parameters: args.params.map((text) => ({ type: "text", text })),
    });
  }

  if (parameterless) {
    logWhatsApp("Using parameterless template (hello_world test mode)", {
      template: args.template,
    });
  }

  return postToGraph(creds.phoneNumberId, creds.accessToken, {
    to: normalizeWhatsAppRecipient(args.to),
    type: "template",
    template: {
      name: args.template,
      language: { code: args.languageCode || DEFAULT_TEMPLATE_LANGUAGE },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

export interface SendWhatsAppTextArgs extends WhatsAppCreds {
  to: string;
  body: string;
  previewUrl?: boolean;
}

/**
 * Send a plain-text WhatsApp message. Used for the product "post to Business
 * WhatsApp" broadcast case (requires an active session or opted-in recipient).
 */
export async function sendWhatsAppText(
  args: SendWhatsAppTextArgs
): Promise<{ id?: string } | null> {
  const creds = resolveCreds(args);
  if (!creds) return null;

  return postToGraph(creds.phoneNumberId, creds.accessToken, {
    to: normalizeWhatsAppRecipient(args.to),
    type: "text",
    text: { preview_url: args.previewUrl ?? true, body: args.body },
  });
}

export type ResolvedVendorWhatsApp = {
  vendorId: string;
  vendorName?: string | null;
  businessNumber?: string | null;
  phoneNumberId?: string | null;
  accessToken?: string | null;
  notificationsEnabled: boolean;
};

/**
 * Load a product's owning vendor and return its `whatsappConfig`. Used by the
 * order / like / favorite notification hooks.
 */
export async function resolveVendorWhatsApp(
  payload: BasePayload,
  product: Product | string
): Promise<ResolvedVendorWhatsApp | null> {
  try {
    let productDoc: Product;
    if (typeof product === "string") {
      productDoc = await payload.findByID({
        collection: "products",
        id: product,
        depth: 0,
        overrideAccess: true,
      });
    } else {
      productDoc = product;
    }

    const vendorRef = productDoc.vendor;
    const vendorId =
      typeof vendorRef === "string" ? vendorRef : vendorRef?.id;
    if (!vendorId) {
      logWhatsApp("Skipped — product has no vendor", {
        productId: productDoc.id,
      });
      return null;
    }

    const vendor: Vendor =
      typeof vendorRef === "object" && vendorRef !== null && "whatsappConfig" in vendorRef
        ? (vendorRef as Vendor)
        : await payload.findByID({
            collection: "vendors",
            id: vendorId,
            depth: 0,
            overrideAccess: true,
          });

    const config = vendor.whatsappConfig;
    const resolved = {
      vendorId,
      vendorName: vendor.name ?? null,
      businessNumber: config?.businessNumber ?? null,
      phoneNumberId: config?.phoneNumberId ?? null,
      accessToken: config?.accessToken ?? null,
      notificationsEnabled: config?.notificationsEnabled ?? false,
    };

    logWhatsApp("Resolved vendor WhatsApp config", {
      vendorId: resolved.vendorId,
      vendorName: vendor.name,
      businessNumber: resolved.businessNumber,
      notificationsEnabled: resolved.notificationsEnabled,
      hasVendorPhoneNumberId: Boolean(resolved.phoneNumberId),
      hasVendorAccessToken: Boolean(resolved.accessToken),
      hasEnvFallback: Boolean(DEFAULT_PHONE_NUMBER_ID && DEFAULT_ACCESS_TOKEN),
    });

    return resolved;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to resolve vendor WhatsApp config:`, error);
    return null;
  }
}

/**
 * Extract a product's primary image URL from a media-populated product,
 * returning an absolute URL (Meta requires a publicly hosted image URL).
 */
export function extractProductImageUrl(product: Product): string | undefined {
  const candidates: unknown[] = [product.image];
  if (Array.isArray(product.cover)) {
    candidates.push(...product.cover);
  }
  for (const candidate of candidates) {
    if (
      candidate &&
      typeof candidate === "object" &&
      "url" in candidate &&
      typeof (candidate as { url?: unknown }).url === "string"
    ) {
      const url = (candidate as { url: string }).url;
      if (url.startsWith("http")) return url;
      const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
      return `${base}${url.startsWith("/") ? "" : "/"}${url}`;
    }
  }
  return undefined;
}

/**
 * Load a product (media populated) and return its primary image URL. Refetches
 * with depth when the passed product's media is not populated.
 */
export async function resolveProductImageUrl(
  payload: BasePayload,
  product: Product | string
): Promise<string | undefined> {
  try {
    let productDoc: Product;
    if (
      typeof product === "object" &&
      product.image &&
      typeof product.image === "object"
    ) {
      productDoc = product;
    } else {
      const id = typeof product === "string" ? product : product.id;
      productDoc = await payload.findByID({
        collection: "products",
        id,
        depth: 1,
        overrideAccess: true,
      });
    }
    return extractProductImageUrl(productDoc);
  } catch (error) {
    console.error("Failed to resolve product image URL:", error);
    return undefined;
  }
}

const TEMPLATE_ORDER =
  process.env.WHATSAPP_TEMPLATE_ORDER?.trim() || "order_notification";
const TEMPLATE_LIKE =
  process.env.WHATSAPP_TEMPLATE_LIKE?.trim() || "product_liked";
const TEMPLATE_FAVORITE =
  process.env.WHATSAPP_TEMPLATE_FAVORITE?.trim() || "product_favorited";
const TEMPLATE_COMMENT =
  process.env.WHATSAPP_TEMPLATE_COMMENT?.trim() || "product_commented";
/** order_notification header in Meta: text | image | none (static headers use none) */
const ORDER_HEADER_MODE = (
  process.env.WHATSAPP_ORDER_HEADER?.trim().toLowerCase() || "none"
) as "text" | "image" | "none";
/** When set (e.g. hello_world), overrides all event templates for testing. */
const TEST_TEMPLATE_OVERRIDE = process.env.WHATSAPP_TEST_TEMPLATE?.trim();

if (TEST_TEMPLATE_OVERRIDE) {
  logWhatsApp(`Test mode: all notifications use template "${TEST_TEMPLATE_OVERRIDE}"`);
}

export const whatsAppTemplates = {
  order: () => TEST_TEMPLATE_OVERRIDE || TEMPLATE_ORDER,
  like: () => TEST_TEMPLATE_OVERRIDE || TEMPLATE_LIKE,
  favorite: () => TEST_TEMPLATE_OVERRIDE || TEMPLATE_FAVORITE,
  comment: () => TEST_TEMPLATE_OVERRIDE || TEMPLATE_COMMENT,
} as const;

/** Meta's default sandbox template — no body params or header components. */
function isParameterlessTemplate(template: string): boolean {
  return template === "hello_world";
}

function normalizeWhatsAppRecipient(phone: string): string {
  return phone.replace(/\D/g, "");
}

export type WhatsAppTemplateHeader =
  | { type: "text"; text: string }
  | { type: "image"; imageUrl: string };

/**
 * Send a vendor WhatsApp notification for a template if the vendor has
 * notifications enabled and a business number configured. Returns null (no-op)
 * otherwise. Never throws — callers may still wrap in try/catch to be safe.
 */
export async function notifyVendorWhatsApp(
  vendor: ResolvedVendorWhatsApp | null,
  template: string,
  params: string[],
  header?: WhatsAppTemplateHeader,
  languageCode?: string
): Promise<{ id?: string } | null> {
  if (!vendor) {
    logWhatsApp("Skipped notification — no vendor config resolved");
    return null;
  }

  if (!vendor.notificationsEnabled) {
    logWhatsApp("Skipped notification — notifications disabled for vendor", {
      vendorId: vendor.vendorId,
      businessNumber: vendor.businessNumber,
    });
    return null;
  }

  if (!vendor.businessNumber) {
    logWhatsApp("Skipped notification — vendor has no businessNumber", {
      vendorId: vendor.vendorId,
    });
    return null;
  }

  logWhatsApp("Sending vendor notification", {
    vendorId: vendor.vendorId,
    to: vendor.businessNumber,
    template,
    params,
    headerType: header?.type ?? "none",
  });

  return sendWhatsAppTemplate({
    to: vendor.businessNumber,
    template,
    params,
    languageCode,
    headerText: header?.type === "text" ? header.text : undefined,
    headerImageUrl: header?.type === "image" ? header.imageUrl : undefined,
    phoneNumberId: vendor.phoneNumberId,
    accessToken: vendor.accessToken,
  });
}

export function notifyVendorNewOrder(
  vendor: ResolvedVendorWhatsApp | null,
  args: {
    orderNumber: string;
    productName: string;
    quantity: number;
    total: number;
    customerName: string;
    orderUrl?: string;
    imageUrl?: string;
  }
): Promise<{ id?: string } | null> {
  logWhatsApp("Order notification triggered", {
    orderNumber: args.orderNumber,
    productName: args.productName,
    customerName: args.customerName,
  });

  return notifyVendorWhatsApp(
    vendor,
    whatsAppTemplates.order(),
    [
      vendor?.vendorName || "Store",
      args.orderNumber,
      args.productName,
      String(args.quantity),
      `$${args.total.toFixed(2)}`,
      args.customerName,
    ],
    ORDER_HEADER_MODE === "image" && args.imageUrl && isPublicHttpUrl(args.imageUrl)
      ? { type: "image", imageUrl: args.imageUrl }
      : ORDER_HEADER_MODE === "text"
        ? { type: "text", text: args.orderNumber }
        : undefined,
    ORDER_TEMPLATE_LANGUAGE
  );
}

export function notifyVendorProductLiked(
  vendor: ResolvedVendorWhatsApp | null,
  args: { productName: string }
): Promise<{ id?: string } | null> {
  logWhatsApp("Like notification triggered", { productName: args.productName });
  return notifyVendorWhatsApp(vendor, whatsAppTemplates.like(), [args.productName]);
}

export function notifyVendorProductFavorited(
  vendor: ResolvedVendorWhatsApp | null,
  args: { productName: string }
): Promise<{ id?: string } | null> {
  logWhatsApp("Favorite notification triggered", { productName: args.productName });
  return notifyVendorWhatsApp(vendor, whatsAppTemplates.favorite(), [args.productName]);
}

export function notifyVendorProductCommented(
  vendor: ResolvedVendorWhatsApp | null,
  args: { productName: string; commenterName: string; commentPreview: string }
): Promise<{ id?: string } | null> {
  logWhatsApp("Comment notification triggered", {
    productName: args.productName,
    commenterName: args.commenterName,
  });

  const preview =
    args.commentPreview.length > 120
      ? `${args.commentPreview.slice(0, 117)}...`
      : args.commentPreview;

  return notifyVendorWhatsApp(vendor, whatsAppTemplates.comment(), [
    args.productName,
    args.commenterName,
    preview,
  ]);
}
