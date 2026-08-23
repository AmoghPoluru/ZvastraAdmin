import type { NextRequest } from "next/server";
import type { BasePayload } from "payload";

/**
 * Headers for Payload `auth()` in Route Handlers.
 * Forwards the auth cookie as `Authorization: JWT …` so login works even when
 * Payload's cookie CSRF check rejects the Origin (common on custom domains).
 */
export function getPayloadAuthHeaders(
  req: NextRequest,
  payload?: BasePayload,
): Headers {
  const headers = new Headers(req.headers);

  if (!payload) {
    return headers;
  }

  const prefix = payload.config.cookiePrefix || "payload";
  const token =
    req.cookies.get(`${prefix}-token`)?.value ??
    req.cookies.get("payload-token")?.value;

  if (token) {
    const existing = headers.get("Authorization");
    if (!existing?.includes(token)) {
      headers.set("Authorization", `JWT ${token}`);
    }
  }

  return headers;
}

export async function getPayloadSessionFromRequest(
  req: NextRequest,
  payload: BasePayload,
) {
  return payload.auth({
    headers: getPayloadAuthHeaders(req, payload),
  });
}
