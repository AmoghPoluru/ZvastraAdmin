import type { CollectionConfig, Where } from "payload";

import { isSuperAdmin, getVendorId } from "@/lib/access";

export const SocialPosts: CollectionConfig = {
  slug: "social-posts",
  admin: {
    useAsTitle: "id",
    defaultColumns: ["vendor", "product", "status", "createdAt"],
    description: "Log of products posted to Instagram, Facebook, and WhatsApp.",
  },
  access: {
    read: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      const vendorId = getVendorId(user);
      if (vendorId) {
        const where: Where = { vendor: { equals: vendorId } };
        return where;
      }
      return false;
    },
    create: ({ req }) => {
      const user = req.user;
      return isSuperAdmin(user) || Boolean(getVendorId(user));
    },
    update: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      const vendorId = getVendorId(user);
      if (vendorId) {
        const where: Where = { vendor: { equals: vendorId } };
        return where;
      }
      return false;
    },
    delete: ({ req }) => isSuperAdmin(req.user),
  },
  fields: [
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: true,
      index: true,
    },
    {
      name: "product",
      type: "relationship",
      relationTo: "products",
      required: true,
      index: true,
    },
    {
      name: "channels",
      type: "select",
      hasMany: true,
      required: true,
      options: [
        { label: "Instagram", value: "instagram" },
        { label: "Facebook", value: "facebook" },
        { label: "WhatsApp", value: "whatsapp" },
        { label: "WhatsApp Channel", value: "whatsapp-channel" },
      ],
    },
    {
      name: "caption",
      type: "textarea",
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Draft", value: "draft" },
        { label: "Posted", value: "posted" },
        { label: "Failed", value: "failed" },
      ],
      defaultValue: "draft",
      required: true,
    },
    {
      name: "externalPostId",
      type: "text",
      admin: {
        description: "ID returned by the social platform for the created post.",
      },
    },
    {
      name: "error",
      type: "text",
      admin: {
        description: "Error message if the post failed.",
      },
    },
    {
      name: "postedBy",
      type: "relationship",
      relationTo: "users",
    },
  ],
  timestamps: true,
};
