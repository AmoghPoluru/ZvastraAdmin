import type { CollectionConfig, Where } from "payload";

import { getVendorId, isSuperAdmin, isVendor } from "@/lib/access";

export const VendorSocialConnections: CollectionConfig = {
  slug: "vendor-social-connections",
  admin: {
    hidden: true,
    defaultColumns: ["vendor", "platform", "username"],
    description: "OAuth tokens for vendor Instagram (Instagram Login).",
  },
  access: {
    read: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      const vendorId = getVendorId(user);
      if (vendorId) {
        return { vendor: { equals: vendorId } } satisfies Where;
      }
      return false;
    },
    create: ({ req }) => isSuperAdmin(req.user) || isVendor(req.user),
    update: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      const vendorId = getVendorId(user);
      if (vendorId) {
        return { vendor: { equals: vendorId } } satisfies Where;
      }
      return false;
    },
    delete: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      const vendorId = getVendorId(user);
      if (vendorId) {
        return { vendor: { equals: vendorId } } satisfies Where;
      }
      return false;
    },
  },
  indexes: [
    {
      fields: ["vendor", "platform"],
      unique: true,
    },
  ],
  hooks: {
    beforeChange: [
      ({ data, req }) => {
        const user = req.user;
        if (user && isVendor(user) && !isSuperAdmin(user)) {
          const vendorId = getVendorId(user);
          if (vendorId) {
            data.vendor = vendorId;
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: true,
      hasMany: false,
      index: true,
    },
    {
      name: "platform",
      type: "select",
      required: true,
      index: true,
      options: [
        { label: "Instagram", value: "instagram" },
        { label: "Facebook", value: "facebook" },
      ],
    },
    {
      name: "igUserId",
      type: "text",
      required: true,
    },
    {
      name: "username",
      type: "text",
      required: true,
    },
    {
      name: "accessToken",
      type: "text",
      required: true,
      access: {
        read: ({ req }) => isSuperAdmin(req.user),
        update: ({ req }) => isSuperAdmin(req.user) || isVendor(req.user),
      },
      admin: {
        hidden: true,
      },
    },
    {
      name: "tokenExpiresAt",
      type: "date",
      required: true,
    },
  ],
};
