import { catalogRouter } from "@/modules/catalog/server/procedures";
import { marketingRouter } from "@/modules/marketing/server/procedures";
import {
  socialRouter,
  whatsappChannelsRouter,
} from "@/modules/social/server/procedures";
import { createTRPCRouter } from "@/trpc/init";

export const appRouter = createTRPCRouter({
  catalog: catalogRouter,
  marketing: marketingRouter,
  social: socialRouter,
  whatsappChannels: whatsappChannelsRouter,
});

export type AppRouter = typeof appRouter;
