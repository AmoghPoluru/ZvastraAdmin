import { redirect } from "next/navigation";

import { isAppAdmin } from "@/lib/access";
import { getCachedSession } from "@/lib/auth-server";

/**
 * Server-side gate for every console page. Non-admins are never shown the
 * console shell; they are bounced to the login page with an explanation.
 */
export async function requireAdmin(returnTo: string) {
  const session = await getCachedSession();

  if (!session.user) {
    redirect(`/login?redirect=${encodeURIComponent(returnTo)}`);
  }

  if (!isAppAdmin(session.user)) {
    redirect("/login?error=not-admin");
  }

  return { user: session.user };
}
