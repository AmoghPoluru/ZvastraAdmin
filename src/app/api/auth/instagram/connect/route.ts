import { NextRequest, NextResponse } from "next/server";

import { isAppAdmin } from "@/lib/access";
import {
  INSTAGRAM_OAUTH_STATE_COOKIE,
  assertInstagramOAuthConfigured,
  buildInstagramAuthorizeUrl,
  createInstagramOAuthState,
  getInstagramRedirectUri,
} from "@/lib/instagram-oauth";
import { getPayloadSessionFromRequest } from "@/lib/payload-auth-headers";
import { getCachedPayload } from "@/lib/payload-client";

function oauthCookieOptions() {
  return {
    httpOnly: true,
    secure: getInstagramRedirectUri().startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 20 * 60,
  };
}

/** GET /api/auth/instagram/connect?vendorId=… — admin connects IG for a vendor. */
export async function GET(req: NextRequest) {
  try {
    assertInstagramOAuthConfigured();
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Instagram OAuth is not configured" },
      { status: 500 },
    );
  }

  const payload = await getCachedPayload();
  const { user } = await getPayloadSessionFromRequest(req, payload);

  if (!user || !isAppAdmin(user)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const vendorId = req.nextUrl.searchParams.get("vendorId")?.trim() || "";
  if (!vendorId) {
    return NextResponse.json({ error: "vendorId is required" }, { status: 400 });
  }

  try {
    await payload.findByID({
      collection: "vendors",
      id: vendorId,
      depth: 0,
      overrideAccess: true,
    });
  } catch {
    return NextResponse.json({ error: "Vendor not found" }, { status: 404 });
  }

  const state = createInstagramOAuthState(vendorId);
  const response = NextResponse.redirect(buildInstagramAuthorizeUrl(state));
  response.cookies.set(INSTAGRAM_OAUTH_STATE_COOKIE, state, oauthCookieOptions());
  return response;
}
