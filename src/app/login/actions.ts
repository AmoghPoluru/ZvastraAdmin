"use server";

import { isAppAdmin } from "@/lib/access";
import { setAuthCookie } from "@/lib/auth-cookie";
import { getCachedPayload } from "@/lib/payload-client";
import type { User } from "@/payload-types";

export type LoginResult = { ok: true } | { ok: false; error: string };

/**
 * Admin-only login. A valid non-admin credential is treated exactly like a bad
 * credential: no cookie is issued and the message does not reveal the account
 * exists.
 */
export async function loginAction(email: string, password: string): Promise<LoginResult> {
  const payload = await getCachedPayload();

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  let user: User | undefined;
  let token: string | undefined;

  try {
    const result = await payload.login({
      collection: "users",
      data: { email: trimmedEmail, password },
    });
    user = result.user as User;
    token = result.token;
  } catch {
    return { ok: false, error: "Invalid email or password" };
  }

  if (!token || !user || !isAppAdmin(user)) {
    return { ok: false, error: "Invalid email or password" };
  }

  const allowlist = (process.env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  if (allowlist.length > 0 && !allowlist.includes(trimmedEmail)) {
    return { ok: false, error: "Invalid email or password" };
  }

  await setAuthCookie(payload.config.cookiePrefix, token);
  return { ok: true };
}
