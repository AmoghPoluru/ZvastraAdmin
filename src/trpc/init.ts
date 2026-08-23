import { initTRPC, TRPCError } from "@trpc/server";
import { headers as getHeaders } from "next/headers";
import { cache } from "react";
import superjson from "superjson";

import { isAppAdmin } from "@/lib/access";
import { getCachedPayload } from "@/lib/payload-client";
import type { User } from "@/payload-types";

export const createTRPCContext = cache(async () => {
  const payload = await getCachedPayload();
  const headers = await getHeaders();

  return { db: payload, headers };
});

const t = initTRPC.context<Awaited<ReturnType<typeof createTRPCContext>>>().create({
  transformer: superjson,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const baseProcedure = t.procedure;

/**
 * The only procedure this app exposes: authenticated *and* an app admin.
 * Every call re-reads the session, so a demoted user loses access immediately.
 */
export const adminProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session = await ctx.db.auth({ headers: ctx.headers });

  if (!session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }

  if (!isAppAdmin(session.user as User)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }

  return next({
    ctx: { ...ctx, session: { ...session, user: session.user } },
  });
});
