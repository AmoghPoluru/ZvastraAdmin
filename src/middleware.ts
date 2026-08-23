import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "zvastra-admin-token";

/**
 * Cheap edge gate: bounce requests with no auth cookie straight to /login.
 * Role checks still happen server-side on every page and procedure — this only
 * avoids rendering the console shell for anonymous visitors.
 */
export function middleware(req: NextRequest) {
  if (req.cookies.get(COOKIE_NAME)?.value) {
    return NextResponse.next();
  }

  const url = new URL("/login", req.nextUrl.origin);
  url.searchParams.set("redirect", req.nextUrl.pathname + req.nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/", "/post-to-social/:path*"],
};
