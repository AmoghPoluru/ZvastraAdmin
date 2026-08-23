import { NextResponse, type NextRequest } from "next/server";

import { clearAuthCookie } from "@/lib/auth-cookie";
import { getCachedPayload } from "@/lib/payload-client";

export async function POST(req: NextRequest) {
  const payload = await getCachedPayload();
  await clearAuthCookie(payload.config.cookiePrefix);
  return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
}
