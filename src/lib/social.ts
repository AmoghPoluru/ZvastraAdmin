/**
 * Meta (Facebook Page + Instagram) posting service.
 *
 * Mirrors the provider pattern in `src/lib/email.ts`: `META_GRAPH_API_VERSION`
 * is read on module load as a platform default, per-vendor credentials are
 * passed per call, and callers are expected to handle/log errors.
 *
 * Instagram publishing is a two-step flow (create media container, wait until
 * status_code is FINISHED, then publish). Requires a publicly hosted image URL.
 */

import { isInstagramLoginToken } from "@/lib/meta/resolve-ids";

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";

function graphUrl(pathname: string): string {
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${pathname}`;
}

async function graphPost(
  pathname: string,
  params: Record<string, string | undefined>
): Promise<Record<string, unknown>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }

  const res = await fetch(graphUrl(pathname), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: search.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: { message?: string };
  } & Record<string, unknown>;

  if (!res.ok) {
    throw new Error(
      `Meta Graph API error (${res.status}): ${data?.error?.message || "unknown error"}`
    );
  }

  return data;
}

export interface PostToFacebookPageArgs {
  pageId: string;
  pageAccessToken: string;
  message: string;
  imageUrl?: string;
}

/**
 * Post to a Facebook Page feed. If `imageUrl` is provided, publishes a photo
 * post; otherwise a text status update. Returns the created post/photo id.
 */
export async function postToFacebookPage(
  args: PostToFacebookPageArgs
): Promise<{ id: string }> {
  if (!args.pageId || !args.pageAccessToken) {
    throw new Error("Facebook Page not configured (missing pageId or pageAccessToken).");
  }

  if (args.imageUrl) {
    const data = await graphPost(`${args.pageId}/photos`, {
      url: args.imageUrl,
      caption: args.message,
      access_token: args.pageAccessToken,
    });
    return { id: String((data.post_id as string) || (data.id as string)) };
  }

  const data = await graphPost(`${args.pageId}/feed`, {
    message: args.message,
    access_token: args.pageAccessToken,
  });
  return { id: String(data.id) };
}

export interface PostToInstagramArgs {
  igBusinessId: string;
  pageAccessToken: string;
  caption: string;
  imageUrl: string;
}

function instagramGraphUrl(pathname: string): string {
  return `https://graph.instagram.com/${GRAPH_API_VERSION}/${pathname}`;
}

type InstagramGraphError = {
  message?: string;
  code?: number;
  error_subcode?: number;
};

class InstagramApiError extends Error {
  status: number;
  code?: number;
  subcode?: number;

  constructor(status: number, error?: InstagramGraphError) {
    super(
      `Instagram API error (${status}): ${error?.message || "unknown error"}`
    );
    this.name = "InstagramApiError";
    this.status = status;
    this.code = error?.code;
    this.subcode = error?.error_subcode;
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function instagramGraphGet(
  pathname: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(instagramGraphUrl(pathname));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as {
    error?: InstagramGraphError;
  } & Record<string, unknown>;

  if (!res.ok) {
    throw new InstagramApiError(res.status, data.error);
  }

  return data;
}

async function facebookGraphGet(
  pathname: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const url = new URL(graphUrl(pathname));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as {
    error?: InstagramGraphError;
  } & Record<string, unknown>;

  if (!res.ok) {
    throw new InstagramApiError(res.status, data.error);
  }

  return data;
}

async function instagramGraphPost(
  pathname: string,
  params: Record<string, string | undefined>
): Promise<Record<string, unknown>> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, value);
    }
  }

  const res = await fetch(instagramGraphUrl(pathname), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: search.toString(),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: InstagramGraphError;
  } & Record<string, unknown>;

  if (!res.ok) {
    throw new InstagramApiError(res.status, data.error);
  }

  return data;
}

/**
 * Instagram fetches/processes media asynchronously. Publishing before
 * status_code is FINISHED returns 400 "Media ID is not available" (9007).
 */
async function waitForInstagramContainer(args: {
  containerId: string;
  accessToken: string;
  graphGet?: typeof instagramGraphGet;
}): Promise<void> {
  const get = args.graphGet ?? instagramGraphGet;
  const deadline = Date.now() + 90_000;
  let delayMs = 1_500;

  while (Date.now() < deadline) {
    const data = await get(args.containerId, {
      fields: "status_code,status",
      access_token: args.accessToken,
    });
    const statusCode = String(data.status_code || "").toUpperCase();

    if (statusCode === "FINISHED" || statusCode === "PUBLISHED") {
      return;
    }
    if (statusCode === "ERROR" || statusCode === "EXPIRED") {
      const detail = typeof data.status === "string" ? data.status : statusCode;
      throw new Error(`Instagram could not process this image (${detail}).`);
    }

    await sleep(delayMs);
    delayMs = Math.min(Math.round(delayMs * 1.4), 8_000);
  }

  throw new Error(
    "Instagram is still processing the image. Wait a moment and try posting again."
  );
}

async function publishInstagramContainer(args: {
  igUserId: string;
  containerId: string;
  accessToken: string;
  graphPost?: typeof instagramGraphPost;
  graphGet?: typeof instagramGraphGet;
}): Promise<{ id: string }> {
  const post = args.graphPost ?? instagramGraphPost;
  await waitForInstagramContainer({
    containerId: args.containerId,
    accessToken: args.accessToken,
    graphGet: args.graphGet,
  });

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const published = await post(`${args.igUserId}/media_publish`, {
        creation_id: args.containerId,
        access_token: args.accessToken,
      });
      return { id: String(published.id) };
    } catch (error) {
      const code = error instanceof InstagramApiError ? error.code : undefined;
      const message = error instanceof Error ? error.message : "";
      const stillProcessing =
        code === 9007 || message.includes("Media ID is not available");
      if (!stillProcessing || attempt === 2) {
        throw error;
      }
      await sleep(2_000 * (attempt + 1));
      await waitForInstagramContainer({
        containerId: args.containerId,
        accessToken: args.accessToken,
        graphGet: args.graphGet,
      });
    }
  }

  throw new Error("Instagram media_publish failed after retries.");
}

async function publishInstagramLoginMedia(args: {
  igUserId: string;
  instagramAccessToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<{ id: string }> {
  if (!args.igUserId || !args.instagramAccessToken) {
    throw new Error(
      "Instagram not configured (missing Instagram user ID or access token)."
    );
  }

  const imageUrls = args.imageUrls.filter(Boolean).slice(0, 10);
  if (imageUrls.length === 0) {
    throw new Error(
      "Instagram requires a public image URL (Vercel Blob). Localhost URLs cannot be published."
    );
  }

  let creationId: string | undefined;

  if (imageUrls.length === 1) {
    const container = await instagramGraphPost(`${args.igUserId}/media`, {
      image_url: imageUrls[0],
      caption: args.caption,
      access_token: args.instagramAccessToken,
    });
    creationId = container.id as string | undefined;
  } else {
    const childIds: string[] = [];
    for (const url of imageUrls) {
      const child = await instagramGraphPost(`${args.igUserId}/media`, {
        image_url: url,
        is_carousel_item: "true",
        access_token: args.instagramAccessToken,
      });
      const childId = child.id as string | undefined;
      if (!childId) {
        throw new Error("Instagram carousel item creation returned no id.");
      }
      await waitForInstagramContainer({
        containerId: childId,
        accessToken: args.instagramAccessToken,
      });
      childIds.push(childId);
    }
    const carousel = await instagramGraphPost(`${args.igUserId}/media`, {
      media_type: "CAROUSEL",
      children: childIds.join(","),
      caption: args.caption,
      access_token: args.instagramAccessToken,
    });
    creationId = carousel.id as string | undefined;
  }

  if (!creationId) {
    throw new Error("Instagram media container creation returned no id.");
  }

  return publishInstagramContainer({
    igUserId: args.igUserId,
    containerId: creationId,
    accessToken: args.instagramAccessToken,
  });
}

/**
 * Publish a single image to an Instagram Business account via Facebook Graph API
 * (EAA… Page token + linked IG Business ID).
 */
async function postToInstagram(
  args: PostToInstagramArgs
): Promise<{ id: string }> {
  if (!args.igBusinessId || !args.pageAccessToken) {
    throw new Error(
      "Instagram not configured (missing instagramBusinessId or pageAccessToken)."
    );
  }
  if (!args.imageUrl) {
    throw new Error("Instagram requires a publicly hosted image URL.");
  }

  // Step 1: create a media container.
  const container = await graphPost(`${args.igBusinessId}/media`, {
    image_url: args.imageUrl,
    caption: args.caption,
    access_token: args.pageAccessToken,
  });

  const creationId = container.id as string | undefined;
  if (!creationId) {
    throw new Error("Instagram media container creation returned no id.");
  }

  return publishInstagramContainer({
    igUserId: args.igBusinessId,
    containerId: creationId,
    accessToken: args.pageAccessToken,
    graphPost,
    graphGet: facebookGraphGet,
  });
}

/** Publish using either Instagram Login (IGAA…) or Facebook Page (EAA…) credentials. */
export async function publishVendorInstagram(args: {
  igUserId: string;
  accessToken: string;
  caption: string;
  imageUrls: string[];
}): Promise<{ id: string }> {
  if (isInstagramLoginToken(args.accessToken)) {
    return publishInstagramLoginMedia({
      igUserId: args.igUserId,
      instagramAccessToken: args.accessToken,
      caption: args.caption,
      imageUrls: args.imageUrls,
    });
  }

  return postToInstagram({
    igBusinessId: args.igUserId,
    pageAccessToken: args.accessToken,
    caption: args.caption,
    imageUrl: args.imageUrls[0],
  });
}
