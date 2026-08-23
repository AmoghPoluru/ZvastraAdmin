import { TRPCError } from "@trpc/server";
import { z } from "zod";
import type { Payload } from "payload";

import { adminProcedure, createTRPCRouter } from "@/trpc/init";
import { postToFacebookPage, publishVendorInstagram } from "@/lib/social";
import { sendWhatsAppText } from "@/lib/whatsapp";
import {
  extractProductPublicImageUrls,
  isPublicHttpUrl,
} from "@/lib/product-public-media";
import { buildSocialChannelsUpdate } from "@/lib/vendor-marketing-profile";
import {
  listPublicVendorSocialConnections,
  resolveInstagramPublishCreds,
} from "@/lib/vendor-social-connections";
import { generateInstagramBanner } from "@/lib/openai-instagram-banner";
import { getVendorOpenAiApiKey } from "@/lib/vendor-openai-config";
import { toOpenAiConfigResponse } from "@/modules/marketing/openai-config-trpc";
import {
  getOrCreateSession,
  getSessionStatus,
  logoutSession,
  restoreSessionIfSaved,
} from "@/lib/whatsapp-channels/session-manager";
import { postToChannel } from "@/lib/whatsapp-channels/channels";
import {
  isPostableWhatsAppJid,
  resolveWhatsAppDestination,
} from "@/lib/whatsapp-channels/resolve-destination";
import { toMarketingProfileResponse } from "@/modules/marketing/marketing-profile-trpc";
import {
  deletePlatformConnection,
} from "@/lib/vendor-social-connections";
import type { Product, Vendor } from "@/payload-types";

function productSourceImageUrl(product: Product): string | null {
  const publicUrl = extractProductPublicImageUrls(product)[0];
  if (publicUrl) return publicUrl;
  const image = product.image;
  if (image && typeof image === "object" && typeof image.url === "string" && image.url) {
    const raw = image.url;
    if (raw.startsWith("http")) return raw;
    const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(
      /\/$/,
      "",
    );
    return `${base}${raw.startsWith("/") ? "" : "/"}${raw}`;
  }
  return null;
}

async function assertProductOwnedByVendor(
  db: Payload,
  productId: string,
  vendorId: string,
): Promise<Product> {
  const product = (await db.findByID({
    collection: "products",
    id: productId,
    depth: 1,
    overrideAccess: true,
  })) as Product;

  const productVendorId =
    typeof product.vendor === "string" ? product.vendor : product.vendor?.id;

  if (productVendorId !== vendorId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That product does not belong to the selected vendor",
    });
  }

  return product;
}

const channelEnum = z.enum(["instagram", "facebook", "whatsapp"]);

const CHANNEL_TO_LAST_POSTED: Record<
  z.infer<typeof channelEnum>,
  | "socialInstagramLastPostedAt"
  | "socialFacebookLastPostedAt"
  | "socialWhatsAppGroupLastPostedAt"
> = {
  instagram: "socialInstagramLastPostedAt",
  facebook: "socialFacebookLastPostedAt",
  whatsapp: "socialWhatsAppGroupLastPostedAt",
};

/**
 * Staff wrappers for posting as a selected vendor (same libs as vendor
 * connected-channels). Connecting Instagram/WhatsApp still happens as the vendor.
 */
export const socialRouter = createTRPCRouter({
  instagramStatus: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      return listPublicVendorSocialConnections(ctx.db, input.vendorId);
    }),

  disconnectInstagram: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await deletePlatformConnection(ctx.db, input.vendorId, "instagram");
      return { ok: true };
    }),

  getOpenAiConfig: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const vendor = await ctx.db.findByID({
        collection: "vendors",
        id: input.vendorId,
        depth: 0,
        overrideAccess: true,
      });
      return toOpenAiConfigResponse(vendor as Vendor);
    }),

  generateBanner: adminProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        productId: z.string(),
        instruction: z.string().trim().min(8, "Add generation instructions").max(2000),
        brief: z.string().trim().min(8, "Add a creative brief").max(1200),
        useSourceImage: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const product = await assertProductOwnedByVendor(
        ctx.db,
        input.productId,
        input.vendorId,
      );

      const sourceImageUrl = productSourceImageUrl(product);
      if (input.useSourceImage && !sourceImageUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This product needs an image, or turn off “Use product photo”.",
        });
      }

      const vendor = (await ctx.db.findByID({
        collection: "vendors",
        id: input.vendorId,
        depth: 0,
        overrideAccess: true,
      })) as Vendor;
      const apiKey = getVendorOpenAiApiKey(vendor);
      if (!apiKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This vendor needs an OpenAI API key in Settings first.",
        });
      }

      const priceLabel = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
      }).format(product.price ?? 0);

      try {
        return await generateInstagramBanner({
          apiKey,
          sourceImageUrl,
          useSourceImage: input.useSourceImage,
          instruction: input.instruction,
          brief: input.brief,
          productName: product.name,
          priceLabel,
          vendorId: input.vendorId,
          productId: product.id,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to generate banner";
        throw new TRPCError({ code: "BAD_REQUEST", message });
      }
    }),

  postProduct: adminProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        productId: z.string(),
        channels: z.array(channelEnum).min(1, "Select at least one channel"),
        caption: z.string().min(1, "Caption is required"),
        imageUrl: z.string().url().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vendorId = input.vendorId;
      const product = await assertProductOwnedByVendor(
        ctx.db,
        input.productId,
        vendorId,
      );

      const vendor = (await ctx.db.findByID({
        collection: "vendors",
        id: vendorId,
        depth: 0,
        overrideAccess: true,
      })) as Vendor;

      const meta = vendor.metaConfig;
      const whatsapp = vendor.whatsappConfig;
      const overrideUrl = input.imageUrl?.trim();
      if (overrideUrl && !isPublicHttpUrl(overrideUrl)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Custom Instagram images must be a public URL (Vercel Blob). Localhost URLs cannot be published.",
        });
      }
      const publicImageUrls = overrideUrl
        ? [overrideUrl]
        : extractProductPublicImageUrls(product);
      const imageUrl = publicImageUrls[0];

      const results: Array<{
        channel: z.infer<typeof channelEnum>;
        status: "posted" | "failed";
        externalPostId?: string;
        error?: string;
      }> = [];

      for (const channel of input.channels) {
        try {
          let externalPostId: string | undefined;

          if (channel === "facebook") {
            if (!meta?.facebookPageId || !meta?.pageAccessToken) {
              throw new Error("Facebook is not connected for this vendor.");
            }
            const res = await postToFacebookPage({
              pageId: meta.facebookPageId,
              pageAccessToken: meta.pageAccessToken,
              message: input.caption,
              imageUrl,
            });
            externalPostId = res.id;
          } else if (channel === "instagram") {
            if (publicImageUrls.length === 0) {
              throw new Error(
                "Instagram requires a public image URL (Vercel Blob). Localhost URLs cannot be published.",
              );
            }

            const igCreds = await resolveInstagramPublishCreds(ctx.db, vendorId);
            if (igCreds) {
              const res = await publishVendorInstagram({
                igUserId: igCreds.igUserId,
                accessToken: igCreds.accessToken,
                caption: input.caption,
                imageUrls: publicImageUrls,
              });
              externalPostId = res.id;
            } else {
              throw new Error(
                "Instagram is not connected for this vendor. Have them connect it under Post to social media.",
              );
            }
          } else {
            if (!whatsapp?.businessNumber) {
              throw new Error("WhatsApp business number is not configured.");
            }
            const res = await sendWhatsAppText({
              to: whatsapp.businessNumber,
              body: input.caption,
              phoneNumberId: whatsapp.phoneNumberId,
              accessToken: whatsapp.accessToken,
            });
            if (!res) {
              throw new Error("WhatsApp is not configured.");
            }
            externalPostId = res.id;
          }

          results.push({ channel, status: "posted", externalPostId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown error";
          console.error(`[admin.social.postProduct] ${channel} failed:`, message);
          results.push({ channel, status: "failed", error: message });
        }

        const last = results[results.length - 1];
        try {
          await ctx.db.create({
            collection: "social-posts",
            data: {
              vendor: vendorId,
              product: input.productId,
              channels: [channel],
              caption: input.caption,
              status: last.status,
              externalPostId: last.externalPostId,
              error: last.error,
              postedBy: ctx.session.user.id,
            },
            overrideAccess: true,
          });
        } catch (logError) {
          console.error(
            "[admin.social.postProduct] failed to log social-post:",
            logError,
          );
        }
      }

      const postedChannels = results.filter((r) => r.status === "posted");
      if (postedChannels.length > 0) {
        try {
          const now = new Date().toISOString();
          const stamps: Record<string, string> = {};
          for (const r of postedChannels) {
            stamps[CHANNEL_TO_LAST_POSTED[r.channel]] = now;
          }
          await ctx.db.update({
            collection: "vendors",
            id: vendorId,
            data: {
              socialChannels: buildSocialChannelsUpdate(vendor.socialChannels, {
                socialInstagram: vendor.socialChannels?.socialInstagram ?? undefined,
                socialFacebook: vendor.socialChannels?.socialFacebook ?? undefined,
                socialWhatsAppGroup:
                  vendor.socialChannels?.socialWhatsAppGroup ?? undefined,
                socialNotes: vendor.socialChannels?.socialNotes ?? undefined,
                ...stamps,
              }),
            },
            overrideAccess: true,
          });
        } catch (stampError) {
          console.error(
            "[admin.social.postProduct] failed to stamp lastPostedAt:",
            stampError,
          );
        }
      }

      return {
        results,
        posted: postedChannels.length,
        failed: results.length - postedChannels.length,
      };
    }),
});

export const whatsappChannelsRouter = createTRPCRouter({
  sessionStatus: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const live = await getSessionStatus(input.vendorId);
      if (live.connected) return live;
      if (live.hasSavedAuth) {
        const restored = await restoreSessionIfSaved(input.vendorId);
        if (restored.connected) {
          await upsertSessionRow(ctx.db, input.vendorId, "connected");
        }
        return restored;
      }
      return live;
    }),

  startSession: adminProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        forceRelink: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const session = await getOrCreateSession(input.vendorId, {
          forceRelink: input.forceRelink === true,
        });
        await upsertSessionRow(
          ctx.db,
          input.vendorId,
          session.connected ? "connected" : "pending",
        );
        if (!session.connected && !session.qr) {
          throw new Error(
            "WhatsApp did not return a QR code in time. Click Link WhatsApp again.",
          );
        }
        return { qr: session.qr, connected: session.connected };
      } catch (error) {
        console.error("[admin.whatsappChannels.startSession] failed:", error);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: error instanceof Error ? error.message : "WhatsApp link failed",
        });
      }
    }),

  logout: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await logoutSession(input.vendorId);
      await upsertSessionRow(ctx.db, input.vendorId, "disconnected");
      return { ok: true };
    }),

  syncGroupJidFromSettings: adminProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        groupLink: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const vendor = (await ctx.db.findByID({
        collection: "vendors",
        id: input.vendorId,
        depth: 0,
        overrideAccess: true,
      })) as Vendor;

      const groupLink =
        input.groupLink?.trim() ||
        vendor.socialChannels?.socialWhatsAppGroup?.trim() ||
        "";
      const existingJid = vendor.socialChannels?.socialWhatsAppGroupJid?.trim() ?? "";
      const linkChanged =
        Boolean(groupLink) &&
        groupLink !== (vendor.socialChannels?.socialWhatsAppGroup?.trim() ?? "");

      if (!groupLink && !existingJid) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Add a WhatsApp group/channel invite in Digital Marketing first.",
        });
      }

      let jid =
        !linkChanged && existingJid && isPostableWhatsAppJid(existingJid)
          ? existingJid
          : "";

      if (!jid) {
        if (!groupLink) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "WhatsApp JID is missing. Paste the invite link in Digital Marketing.",
          });
        }
        try {
          const resolved = await resolveWhatsAppDestination(input.vendorId, groupLink);
          jid = resolved.jid;
        } catch (error) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              error instanceof Error ? error.message : "Could not resolve WhatsApp JID",
          });
        }
      }

      await ctx.db.update({
        collection: "vendors",
        id: input.vendorId,
        data: {
          socialChannels: {
            ...(vendor.socialChannels ?? {}),
            socialWhatsAppGroup:
              groupLink || vendor.socialChannels?.socialWhatsAppGroup,
            socialWhatsAppGroupJid: jid,
          },
        },
        overrideAccess: true,
      });

      const updated = (await ctx.db.findByID({
        collection: "vendors",
        id: input.vendorId,
        depth: 1,
        overrideAccess: true,
      })) as Vendor;

      return {
        jid,
        profile: toMarketingProfileResponse(updated),
      };
    }),

  postToChannel: adminProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        channelJid: z.string().min(1, "Channel id is required"),
        caption: z.string().min(1, "Caption is required"),
        imageUrl: z
          .string()
          .url("Image URL must be a full public URL, e.g. https://example.com/a.jpg")
          .optional(),
        productId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (input.productId) {
        await assertProductOwnedByVendor(ctx.db, input.productId, input.vendorId);
      }

      let messageId: string | null = null;
      let failure: string | undefined;

      try {
        const result = await postToChannel(input.vendorId, input.channelJid, {
          caption: input.caption,
          mediaUrl: input.imageUrl,
        });
        messageId = result.messageId;
      } catch (error) {
        failure = error instanceof Error ? error.message : "Unknown error";
        console.error("[admin.whatsappChannels.postToChannel] failed:", failure);
      }

      if (input.productId) {
        try {
          await ctx.db.create({
            collection: "social-posts",
            data: {
              vendor: input.vendorId,
              product: input.productId,
              channels: ["whatsapp-channel"],
              caption: input.caption,
              status: failure ? "failed" : "posted",
              externalPostId: messageId ?? undefined,
              error: failure,
              postedBy: ctx.session.user.id,
            },
            overrideAccess: true,
          });
        } catch (logError) {
          console.error(
            "[admin.whatsappChannels.postToChannel] failed to log social-post:",
            logError,
          );
        }
      }

      if (failure) {
        throw new TRPCError({ code: "BAD_REQUEST", message: failure });
      }

      return { messageId };
    }),
});

async function upsertSessionRow(
  db: Payload,
  vendorId: string,
  status: "pending" | "connected" | "disconnected",
): Promise<void> {
  const data = {
    vendor: vendorId,
    status,
    lastConnectedAt: status === "connected" ? new Date().toISOString() : undefined,
  };

  try {
    const existing = await db.find({
      collection: "whatsapp-channel-sessions",
      where: { vendor: { equals: vendorId } },
      limit: 1,
      overrideAccess: true,
    });

    if (existing.docs.length > 0) {
      await db.update({
        collection: "whatsapp-channel-sessions",
        id: existing.docs[0].id,
        data,
        overrideAccess: true,
      });
      return;
    }

    await db.create({
      collection: "whatsapp-channel-sessions",
      data,
      overrideAccess: true,
    });
  } catch (error) {
    console.error("[admin.whatsappChannels] failed to persist session row:", error);
  }
}
