import { NextRequest, NextResponse } from "next/server";

import { isAppAdmin } from "@/lib/access";
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  completeInstagramLoginOAuth,
  parseAndVerifyInstagramOAuthState,
} from "@/lib/instagram-oauth";
import { getPayloadSessionFromRequest } from "@/lib/payload-auth-headers";
import { getCachedPayload } from "@/lib/payload-client";
import { upsertInstagramConnection } from "@/lib/vendor-social-connections";

function consoleUrl(req: NextRequest, vendorId: string, query: Record<string, string>) {
  const url = new URL("/post-to-social", req.nextUrl.origin);
  if (vendorId) {
    url.searchParams.set("vendorId", vendorId);
  }
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }
  return url;
}

function clearStateCookie(req: NextRequest, response: NextResponse) {
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: req.nextUrl.protocol === "https:",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export async function GET(req: NextRequest) {
  const payload = await getCachedPayload();
  const { user } = await getPayloadSessionFromRequest(req, payload);

  const stateParam = req.nextUrl.searchParams.get("state") || "";
  const savedState = req.cookies.get(INSTAGRAM_OAUTH_STATE_COOKIE)?.value || "";
  const stateVendorId =
    parseAndVerifyInstagramOAuthState(stateParam || savedState) || "";

  const oauthError = req.nextUrl.searchParams.get("error");
  if (oauthError) {
    const description = req.nextUrl.searchParams.get("error_description") || oauthError;
    return clearStateCookie(
      req,
      NextResponse.redirect(consoleUrl(req, stateVendorId, { error: description })),
    );
  }

  if (!user || !isAppAdmin(user)) {
    return clearStateCookie(
      req,
      NextResponse.redirect(new URL("/login?error=not-admin", req.nextUrl.origin)),
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const cookieOk = Boolean(stateParam && savedState && stateParam === savedState);

  if (!code || !stateParam || !stateVendorId || !cookieOk) {
    return clearStateCookie(
      req,
      NextResponse.redirect(consoleUrl(req, stateVendorId, { error: "invalid_state" })),
    );
  }

  try {
    const connected = await completeInstagramLoginOAuth(code);
    await upsertInstagramConnection(payload, {
      vendorId: stateVendorId,
      igUserId: connected.igUserId,
      username: connected.username,
      accessToken: connected.accessToken,
      expiresInSeconds: connected.expiresIn,
    });
    return clearStateCookie(
      req,
      NextResponse.redirect(consoleUrl(req, stateVendorId, { success: "instagram" })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Instagram connect failed";
    return clearStateCookie(
      req,
      NextResponse.redirect(consoleUrl(req, stateVendorId, { error: message })),
    );
  }
}
