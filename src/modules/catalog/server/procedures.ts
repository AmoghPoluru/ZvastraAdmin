import type { Sort, Where } from "payload";
import { z } from "zod";

import type { Product, Vendor } from "@/payload-types";
import { adminProcedure, createTRPCRouter } from "@/trpc/init";

const productStatusSchema = z.enum(["all", "published", "draft", "archived"]);

const listInputSchema = z.object({
  status: productStatusSchema.optional().default("all"),
  search: z.string().optional(),
  vendorId: z.string().optional(),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(20),
  sortBy: z.enum(["name", "price", "createdAt", "updatedAt"]).default("updatedAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
});

function buildProductStatusWhere(status: z.infer<typeof productStatusSchema>): Where {
  if (status === "published") {
    return { isPrivate: { equals: false }, isArchived: { equals: false } };
  }
  if (status === "draft") {
    return { isPrivate: { equals: true }, isArchived: { equals: false } };
  }
  if (status === "archived") {
    return { isArchived: { equals: true } };
  }
  return { isArchived: { equals: false } };
}

function flagsToStatus(
  isPrivate?: boolean | null,
  isArchived?: boolean | null,
): "published" | "draft" | "archived" {
  if (isArchived) return "archived";
  if (isPrivate) return "draft";
  return "published";
}

function getRemainingStock(product: {
  variants?: { stock?: number | null }[] | null;
  stock?: number | null;
}): number {
  if (Array.isArray(product.variants) && product.variants.length > 0) {
    return product.variants.reduce((sum, variant) => sum + (variant.stock || 0), 0);
  }
  return product.stock ?? 0;
}

export const catalogRouter = createTRPCRouter({
  vendorOptions: adminProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.find({
      collection: "vendors",
      limit: 200,
      sort: "name",
      depth: 0,
      overrideAccess: true,
    });

    return result.docs.map((vendor: Vendor) => ({
      id: vendor.id,
      name: vendor.name,
      slug: vendor.slug,
      status: vendor.status,
    }));
  }),

  products: adminProcedure.input(listInputSchema).query(async ({ ctx, input }) => {
    const where: Where = { ...buildProductStatusWhere(input.status) };

    if (input.vendorId) {
      where.vendor = { equals: input.vendorId };
    }

    if (input.search?.trim()) {
      where.name = { contains: input.search.trim() };
    }

    const sort: Sort = `${input.sortOrder === "desc" ? "-" : ""}${input.sortBy}`;

    const result = await ctx.db.find({
      collection: "products",
      where,
      limit: input.limit,
      page: input.page,
      sort,
      depth: 1,
      overrideAccess: true,
    });

    return {
      docs: result.docs.map((product: Product) => ({
        ...product,
        remainingStock: getRemainingStock(product),
        statusLabel: flagsToStatus(product.isPrivate, product.isArchived),
      })),
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    };
  }),
});
