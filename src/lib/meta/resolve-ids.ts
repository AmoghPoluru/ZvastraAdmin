/**
 * Resolve Meta credentials from vendor-pasted tokens.
 *
 * - EAA… Page tokens → Facebook Graph API → Page ID + linked IG Business ID
 * - IGAA… Instagram Login tokens → Instagram Graph API → Instagram user ID
 */

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";

type GraphError = { message?: string };
type MeAccountsResponse = {
  data?: Array<{ id: string; name: string }>;
  error?: GraphError;
};
type PageInstagramResponse = {
  instagram_business_account?: { id: string };
  error?: GraphError;
};
type InstagramMeResponse = {
  user_id?: string;
  id?: string;
  username?: string;
  error?: GraphError;
};

export type ResolvedMetaIds = {
  pageId: string;
  igBusinessId: string;
  pageName: string;
};

export type ResolvedInstagramUser = {
  userId: string;
  username?: string;
};

/** Normalize pasted Meta tokens (strip Bearer, quotes, URL fragments, whitespace). */
export function sanitizeMetaAccessToken(raw: string): string {
  let token = raw.trim();
  if (!token) return "";

  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    token = token.slice(1, -1).trim();
  }

  token = token.replace(/^Bearer\s+/i, "");

  const fromQuery = token.match(/(?:^|[?&])access_token=([^&\s]+)/i);
  if (fromQuery?.[1]) {
    token = fromQuery[1];
  }

  token = token.replace(/\s+/g, "");

  return token;
}

/** @deprecated Use sanitizeMetaAccessToken */
export const sanitizePageAccessToken = sanitizeMetaAccessToken;

export function isInstagramLoginToken(token: string): boolean {
  return /^IG[A-Za-z0-9_-]+$/.test(token);
}

export function isFacebookPageToken(token: string): boolean {
  return /^EA[A-Za-z0-9_-]+$/.test(token);
}

function facebookGraphUrl(pathname: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `https://graph.facebook.com/${GRAPH_API_VERSION}/${pathname}?${search.toString()}`;
}

function instagramGraphUrl(pathname: string, params: Record<string, string>): string {
  const search = new URLSearchParams(params);
  return `https://graph.instagram.com/${GRAPH_API_VERSION}/${pathname}?${search.toString()}`;
}

function assertFacebookPageTokenShape(token: string): void {
  if (token.length < 40) {
    throw new Error(
      "Token looks too short. Copy the full Facebook Page access token from Meta (starts with EAA…)."
    );
  }
  if (!isFacebookPageToken(token)) {
    throw new Error(
      'Expected a Facebook Page token (EAA…). For Instagram-only login, use the Instagram access token field (IGAA…).'
    );
  }
}

function assertInstagramLoginTokenShape(token: string): void {
  if (token.length < 40) {
    throw new Error(
      "Token looks too short. Copy the full Instagram access token from Meta (starts with IGAA…)."
    );
  }
  if (!isInstagramLoginToken(token)) {
    throw new Error(
      'Expected an Instagram login token (IGAA…). For Facebook Page posting, use the Page access token field (EAA…).'
    );
  }
}

/**
 * Look up the Page and linked Instagram Business account for a Page token.
 * When `preferredPageId` is set (vendor manages multiple Pages), that Page is
 * used; otherwise the first accessible Page is chosen.
 */
export async function resolveMetaIdsFromPageToken(
  pageAccessToken: string,
  preferredPageId?: string | null
): Promise<ResolvedMetaIds> {
  const token = sanitizeMetaAccessToken(pageAccessToken);
  if (!token) {
    throw new Error("Page access token is required.");
  }
  assertFacebookPageTokenShape(token);

  const meRes = await fetch(
    facebookGraphUrl("me/accounts", {
      access_token: token,
      fields: "id,name",
    })
  );
  const meData = (await meRes.json()) as MeAccountsResponse;

  if (!meRes.ok || meData.error) {
    throw new Error(
      meData.error?.message ||
        "Could not read Facebook Pages for this token. Use a Page access token with pages_show_list."
    );
  }

  const pages = meData.data ?? [];
  if (pages.length === 0) {
    throw new Error(
      "No Facebook Page found for this token. Generate a Page access token (not a user token)."
    );
  }

  const preferred = preferredPageId?.trim();
  const page = preferred
    ? pages.find((p) => p.id === preferred) ?? pages[0]
    : pages[0];

  if (preferred && page.id !== preferred && pages.length > 1) {
    throw new Error(
      `Token does not have access to Page ${preferred}. Available: ${pages.map((p) => p.name).join(", ")}`
    );
  }

  const pageRes = await fetch(
    facebookGraphUrl(page.id, {
      fields: "instagram_business_account",
      access_token: token,
    })
  );
  const pageData = (await pageRes.json()) as PageInstagramResponse;

  if (!pageRes.ok || pageData.error) {
    throw new Error(pageData.error?.message || "Could not read Instagram account for this Page.");
  }

  const igBusinessId = pageData.instagram_business_account?.id;
  if (!igBusinessId) {
    throw new Error(
      "This Facebook Page is not linked to an Instagram Business account. Link IG in Page Settings → Linked accounts."
    );
  }

  return {
    pageId: page.id,
    igBusinessId,
    pageName: page.name,
  };
}

/**
 * Resolve Instagram user ID from an Instagram Login token (IGAA…).
 * Uses graph.instagram.com — no Facebook Page required.
 */
export async function resolveInstagramUserFromToken(
  instagramAccessToken: string
): Promise<ResolvedInstagramUser> {
  const token = sanitizeMetaAccessToken(instagramAccessToken);
  if (!token) {
    throw new Error("Instagram access token is required.");
  }
  assertInstagramLoginTokenShape(token);

  const meRes = await fetch(
    instagramGraphUrl("me", {
      fields: "user_id,username",
      access_token: token,
    })
  );
  const meData = (await meRes.json()) as InstagramMeResponse;

  if (!meRes.ok || meData.error) {
    throw new Error(
      meData.error?.message ||
        "Could not verify Instagram token. Ensure it is an Instagram Login token with instagram_basic."
    );
  }

  const userId = meData.user_id ?? meData.id;
  if (!userId) {
    throw new Error("Instagram token verified but no user ID was returned.");
  }

  return {
    userId,
    username: meData.username,
  };
}
