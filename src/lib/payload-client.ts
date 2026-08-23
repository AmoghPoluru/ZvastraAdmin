import { cache } from "react";
import { getPayload, type Payload } from "payload";
import config from "@payload-config";

/**
 * Shared Payload instance.
 *
 * `getPayload` initializes the CMS and opens a Mongo connection, so every extra
 * call on a cold start costs a round trip. The promise is memoized at module
 * scope (process-wide); `getCachedPayload` additionally wraps it in React
 * `cache` so a single server render always awaits the same instance.
 */
let payloadPromise: Promise<Payload> | null = null;

export function getPayloadInstance(): Promise<Payload> {
  if (!payloadPromise) {
    payloadPromise = getPayload({ config }).catch((error: unknown) => {
      payloadPromise = null;
      throw error;
    });
  }

  return payloadPromise;
}

export const getCachedPayload = cache(getPayloadInstance);
