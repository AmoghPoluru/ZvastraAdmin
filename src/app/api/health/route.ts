import { NextResponse } from "next/server";

import { getCachedPayload } from "@/lib/payload-client";

export const dynamic = "force-dynamic";

/** Liveness/readiness probe: process is up and the shared database answers. */
export async function GET() {
  try {
    const payload = await getCachedPayload();
    await payload.count({ collection: "users", overrideAccess: true });
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch (error) {
    return NextResponse.json(
      {
        status: "degraded",
        db: "error",
        message: error instanceof Error ? error.message : "unknown error",
      },
      { status: 503 },
    );
  }
}
