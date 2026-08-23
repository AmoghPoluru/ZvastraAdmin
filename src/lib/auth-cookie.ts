import { cookies as getCookies } from "next/headers";

const isDev = process.env.NODE_ENV === "development";

function cookieOptions() {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    ...(isDev ? {} : { secure: true }),
  };
}

export async function setAuthCookie(prefix: string, value: string) {
  const cookies = await getCookies();
  cookies.set({ name: `${prefix}-token`, value, ...cookieOptions() });
}

export async function clearAuthCookie(prefix: string) {
  const cookies = await getCookies();
  cookies.delete({ name: `${prefix}-token`, path: "/" });
}

export function authCookieName(prefix: string) {
  return `${prefix}-token`;
}
