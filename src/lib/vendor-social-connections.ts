import type { BasePayload } from "payload";
import type { User, Vendor, VendorSocialConnection } from "@/payload-types";

import { getVendorId } from "@/lib/access";
import { refreshInstagramLongLivedToken } from "@/lib/instagram-oauth";
import { isInstagramLoginToken } from "@/lib/meta/resolve-ids";
import { buildMetaConfigUpdate } from "@/lib/vendor-marketing-profile";

export const VENDOR_SOCIAL_CONNECTIONS_SLUG = "vendor-social-connections" as const;

export type SocialPlatform = "instagram" | "facebook";

export type PublicSocialConnection = {
  platform: SocialPlatform;
  username: string | null;
  igUserId: string | null;
  tokenExpiresAt: string | null;
  connected: boolean;
};

export type InstagramPublishCreds = {
  igUserId: string;
  accessToken: string;
  username: string | null;
};

export function vendorIdFromUser(user: User | null | undefined): string | null {
  return getVendorId(user);
}

export async function findPlatformConnection(
  payload: BasePayload,
  vendorId: string,
  platform: SocialPlatform
): Promise<VendorSocialConnection | null> {
  const existing = await payload.find({
    collection: VENDOR_SOCIAL_CONNECTIONS_SLUG,
    where: {
      and: [
        { vendor: { equals: vendorId } },
        { platform: { equals: platform } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  return existing.docs[0] ?? null;
}

export async function upsertInstagramConnection(
  payload: BasePayload,
  args: {
    vendorId: string;
    igUserId: string;
    username: string;
    accessToken: string;
    expiresInSeconds: number;
  }
): Promise<VendorSocialConnection> {
  const tokenExpiresAt = new Date(Date.now() + args.expiresInSeconds * 1000).toISOString();
  const data = {
    vendor: args.vendorId,
    platform: "instagram" as const,
    igUserId: args.igUserId,
    username: args.username,
    accessToken: args.accessToken,
    tokenExpiresAt,
  };

  const existing = await findPlatformConnection(payload, args.vendorId, "instagram");
  const saved = existing
    ? await payload.update({
        collection: VENDOR_SOCIAL_CONNECTIONS_SLUG,
        id: existing.id,
        data,
        overrideAccess: true,
      })
    : await payload.create({
        collection: VENDOR_SOCIAL_CONNECTIONS_SLUG,
        data,
        overrideAccess: true,
      });

  const vendor = (await payload.findByID({
    collection: "vendors",
    id: args.vendorId,
    depth: 0,
    overrideAccess: true,
  })) as Vendor;

  await payload.update({
    collection: "vendors",
    id: args.vendorId,
    data: {
      metaConfig: buildMetaConfigUpdate(vendor.metaConfig, {
        instagramBusinessId: args.igUserId,
        instagramUsername: args.username,
        instagramAccessToken: args.accessToken,
      }),
    },
    overrideAccess: true,
  });

  return saved;
}

export async function deletePlatformConnection(
  payload: BasePayload,
  vendorId: string,
  platform: SocialPlatform
): Promise<boolean> {
  const existing = await findPlatformConnection(payload, vendorId, platform);
  if (existing) {
    await payload.delete({
      collection: VENDOR_SOCIAL_CONNECTIONS_SLUG,
      id: existing.id,
      overrideAccess: true,
    });
  }

  if (platform === "instagram") {
    const vendor = (await payload.findByID({
      collection: "vendors",
      id: vendorId,
      depth: 0,
      overrideAccess: true,
    })) as Vendor;
    await payload.update({
      collection: "vendors",
      id: vendorId,
      data: {
        metaConfig: {
          ...vendor.metaConfig,
          instagramAccessToken: null,
          instagramBusinessId: null,
          instagramUsername: null,
        },
      },
      overrideAccess: true,
    });
  }

  return Boolean(existing);
}

export async function listPublicVendorSocialConnections(
  payload: BasePayload,
  vendorId: string
): Promise<PublicSocialConnection[]> {
  const connections: PublicSocialConnection[] = [];

  const igRow = await findPlatformConnection(payload, vendorId, "instagram");
  if (igRow) {
    connections.push({
      platform: "instagram",
      username: igRow.username,
      igUserId: igRow.igUserId,
      tokenExpiresAt: igRow.tokenExpiresAt ?? null,
      connected: true,
    });
  } else {
    const vendor = (await payload.findByID({
      collection: "vendors",
      id: vendorId,
      depth: 0,
      overrideAccess: true,
    })) as Vendor;
    if (vendor.metaConfig?.instagramBusinessId && vendor.metaConfig.instagramAccessToken) {
      connections.push({
        platform: "instagram",
        username: vendor.metaConfig.instagramUsername ?? null,
        igUserId: vendor.metaConfig.instagramBusinessId,
        tokenExpiresAt: null,
        connected: true,
      });
    }
  }

  return connections;
}

const TOKEN_REFRESH_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

async function maybeRefreshStoredInstagramToken(
  payload: BasePayload,
  row: VendorSocialConnection
): Promise<string> {
  if (!isInstagramLoginToken(row.accessToken)) return row.accessToken;
  const expiresAt = row.tokenExpiresAt ? new Date(row.tokenExpiresAt).getTime() : 0;
  const shouldRefresh = !expiresAt || expiresAt - Date.now() < TOKEN_REFRESH_WINDOW_MS;
  if (!shouldRefresh) return row.accessToken;

  const refreshed = await refreshInstagramLongLivedToken(row.accessToken);
  if (!refreshed) return row.accessToken;

  await payload.update({
    collection: VENDOR_SOCIAL_CONNECTIONS_SLUG,
    id: row.id,
    data: {
      accessToken: refreshed.accessToken,
      tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000).toISOString(),
    },
    overrideAccess: true,
  });
  return refreshed.accessToken;
}

export async function resolveInstagramPublishCreds(
  payload: BasePayload,
  vendorId: string
): Promise<InstagramPublishCreds | null> {
  const row = await findPlatformConnection(payload, vendorId, "instagram");
  if (row?.accessToken && row.igUserId) {
    const accessToken = await maybeRefreshStoredInstagramToken(payload, row);
    return {
      igUserId: row.igUserId,
      accessToken,
      username: row.username,
    };
  }

  const vendor = (await payload.findByID({
    collection: "vendors",
    id: vendorId,
    depth: 0,
    overrideAccess: true,
  })) as Vendor;
  if (vendor.metaConfig?.instagramAccessToken && vendor.metaConfig.instagramBusinessId) {
    return {
      igUserId: vendor.metaConfig.instagramBusinessId,
      accessToken: vendor.metaConfig.instagramAccessToken,
      username: vendor.metaConfig.instagramUsername ?? null,
    };
  }

  return null;
}
