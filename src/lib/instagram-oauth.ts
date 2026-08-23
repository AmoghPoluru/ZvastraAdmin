import crypto from "crypto";

const GRAPH_API_VERSION = process.env.META_GRAPH_API_VERSION || "v21.0";
export const INSTAGRAM_OAUTH_STATE_COOKIE = "ig_oauth_state";
/** Where to send the browser after OAuth (staff Post to social vs vendor channels). */
export const INSTAGRAM_OAUTH_RETURN_COOKIE = "ig_oauth_return";

/** Instagram API with Instagram Login (Professional Business/Creator). No Facebook Page. */
export const INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
].join(",");

type InstagramApiError = {
  error?: { message?: string; type?: string; code?: number };
  error_type?: string;
  error_message?: string;
};

export function getInstagramAppId(): string {
  return (
    process.env.INSTAGRAM_APP_ID?.trim() ||
    process.env.META_APP_ID?.trim() ||
    ""
  );
}

export function getInstagramAppSecret(): string {
  return (
    process.env.INSTAGRAM_APP_SECRET?.trim() ||
    process.env.META_APP_SECRET?.trim() ||
    ""
  );
}

export function getInstagramRedirectUri(): string {
  const explicit = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  const base = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SERVER_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${base}/api/auth/instagram/callback`;
}

export function assertInstagramOAuthConfigured(): void {
  if (!getInstagramAppId() || !getInstagramAppSecret()) {
    throw new Error(
      "Instagram OAuth is not configured. Set INSTAGRAM_APP_ID and INSTAGRAM_APP_SECRET."
    );
  }
}

const OAUTH_STATE_TTL_MS = 20 * 60 * 1000;

function oauthStateSecret(): string {
  return process.env.PAYLOAD_SECRET || getInstagramAppSecret();
}

function instagramErrorMessage(data: InstagramApiError, fallback: string): string {
  return data.error?.message || data.error_message || fallback;
}

/** Signed CSRF state so the callback does not depend only on the round-trip cookie. */
export function createInstagramOAuthState(vendorId: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${vendorId}|${Date.now()}|${nonce}`;
  const signature = crypto
    .createHmac("sha256", oauthStateSecret())
    .update(payload)
    .digest("hex");
  return Buffer.from(`${payload}|${signature}`).toString("base64url");
}

/** Returns the vendor id embedded in a valid state, or null if invalid/expired. */
export function parseAndVerifyInstagramOAuthState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString("utf8");
    const parts = decoded.split("|");
    if (parts.length !== 4) return null;
    const [stateVendorId, issuedAtRaw, nonce, signature] = parts;
    if (!stateVendorId || !issuedAtRaw || !nonce || !signature) return null;
    const expected = crypto
      .createHmac("sha256", oauthStateSecret())
      .update(`${stateVendorId}|${issuedAtRaw}|${nonce}`)
      .digest("hex");
    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      return null;
    }
    const issuedAt = Number(issuedAtRaw);
    if (!Number.isFinite(issuedAt) || Date.now() - issuedAt > OAUTH_STATE_TTL_MS) {
      return null;
    }
    return stateVendorId;
  } catch {
    return null;
  }
}

export function verifyInstagramOAuthState(state: string, vendorId: string): boolean {
  return parseAndVerifyInstagramOAuthState(state) === vendorId;
}

export function buildInstagramAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: getInstagramAppId(),
    redirect_uri: getInstagramRedirectUri(),
    scope: INSTAGRAM_LOGIN_SCOPES,
    response_type: "code",
    state,
  });
  return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
}

export type InstagramLoginConnection = {
  igUserId: string;
  username: string;
  accessToken: string;
  expiresIn: number;
};

async function exchangeInstagramLoginCode(code: string): Promise<{
  accessToken: string;
  expiresIn: number;
}> {
  const shortRes = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: getInstagramAppId(),
      client_secret: getInstagramAppSecret(),
      grant_type: "authorization_code",
      redirect_uri: getInstagramRedirectUri(),
      code,
    }),
  });
  const shortData = (await shortRes.json()) as InstagramApiError & {
    access_token?: string;
    data?: Array<{ access_token?: string; user_id?: string }>;
  };
  const shortToken = shortData.access_token || shortData.data?.[0]?.access_token;
  if (!shortRes.ok || !shortToken) {
    throw new Error(
      instagramErrorMessage(
        shortData,
        "Failed to exchange Instagram authorization code. Use a Meta app with Instagram Login."
      )
    );
  }

  const exchangeUrl = new URL("https://graph.instagram.com/access_token");
  exchangeUrl.searchParams.set("grant_type", "ig_exchange_token");
  exchangeUrl.searchParams.set("client_secret", getInstagramAppSecret());
  exchangeUrl.searchParams.set("access_token", shortToken);
  const longRes = await fetch(exchangeUrl);
  const longData = (await longRes.json()) as InstagramApiError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!longRes.ok || !longData.access_token) {
    throw new Error(
      instagramErrorMessage(longData, "Failed to exchange Instagram token for a long-lived token.")
    );
  }

  return {
    accessToken: longData.access_token,
    expiresIn: typeof longData.expires_in === "number" ? longData.expires_in : 60 * 60 * 24 * 60,
  };
}

/** Instagram Login → long-lived IGAA token (~60 days). */
export async function completeInstagramLoginOAuth(
  code: string
): Promise<InstagramLoginConnection> {
  const token = await exchangeInstagramLoginCode(code);
  const meUrl = new URL(`https://graph.instagram.com/${GRAPH_API_VERSION}/me`);
  meUrl.searchParams.set("fields", "user_id,username,account_type");
  meUrl.searchParams.set("access_token", token.accessToken);
  const meRes = await fetch(meUrl);
  const me = (await meRes.json()) as InstagramApiError & {
    user_id?: string;
    id?: string;
    username?: string;
    account_type?: string;
  };
  if (!meRes.ok || me.error) {
    throw new Error(instagramErrorMessage(me, "Failed to load Instagram profile."));
  }

  const accountType = (me.account_type || "").toUpperCase();
  if (accountType === "PERSONAL") {
    throw new Error(
      "Instagram Graph API only works with Professional accounts. Convert this Instagram to Business or Creator, then connect again."
    );
  }

  const userId = me.user_id || me.id;
  const username = me.username?.replace(/^@/, "");
  if (!userId || !username) {
    throw new Error("Instagram profile did not include user_id and username.");
  }

  return {
    igUserId: userId,
    username,
    accessToken: token.accessToken,
    expiresIn: token.expiresIn,
  };
}

/** Refresh a long-lived Instagram Login token before it expires (~60 days). */
export async function refreshInstagramLongLivedToken(
  accessToken: string
): Promise<{ accessToken: string; expiresIn: number } | null> {
  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url);
  const data = (await res.json()) as InstagramApiError & {
    access_token?: string;
    expires_in?: number;
  };
  if (!res.ok || !data.access_token) return null;
  return {
    accessToken: data.access_token,
    expiresIn: typeof data.expires_in === "number" ? data.expires_in : 60 * 60 * 24 * 60,
  };
}
