import { z } from "zod";

import {
  marketingProfileUpdateBodySchema,
  toMarketingProfileResponse,
  updateVendorMarketingProfile,
} from "@/modules/marketing/marketing-profile-trpc";
import { adminProcedure, createTRPCRouter } from "@/trpc/init";

export const marketingRouter = createTRPCRouter({
  getProfile: adminProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const vendor = await ctx.db.findByID({
        collection: "vendors",
        id: input.vendorId,
        depth: 1,
        overrideAccess: true,
      });

      return toMarketingProfileResponse(vendor);
    }),

  updateProfile: adminProcedure
    .input(marketingProfileUpdateBodySchema.extend({ vendorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { vendorId, ...body } = input;
      return updateVendorMarketingProfile(ctx.db, vendorId, body, {
        overrideAccess: true,
      });
    }),
});
