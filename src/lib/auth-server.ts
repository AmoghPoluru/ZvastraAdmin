import { cache } from "react";
import { headers } from "next/headers";

import { getCachedPayload } from "@/lib/payload-client";

/** One Payload auth call per server request (shared by layouts, pages, and auth helpers). */
export const getCachedSession = cache(async () => {
  const payload = await getCachedPayload();
  const headersList = await headers();
  return payload.auth({ headers: headersList });
});
