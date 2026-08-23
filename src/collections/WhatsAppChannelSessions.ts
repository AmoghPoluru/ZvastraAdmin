import type { CollectionConfig, Where } from "payload";

import { getVendorId, isSuperAdmin, isVendor } from "@/lib/access";

export const WhatsAppChannelSessions: CollectionConfig = {
  slug: "whatsapp-channel-sessions",
  admin: {
    hidden: true,
    defaultColumns: ["vendor", "status", "lastConnectedAt"],
    description:
      "Link state of the unofficial (Baileys) WhatsApp Channels session per vendor.",
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
      fields: ["vendor"],
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
      // Indexed by the unique `vendor` index above; `index: true` here would
      // make Mongoose warn about a duplicate index.
    },
    {
      name: "status",
      type: "select",
      required: true,
      index: true,
      defaultValue: "pending",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Connected", value: "connected" },
        { label: "Disconnected", value: "disconnected" },
      ],
    },
    {
      name: "lastConnectedAt",
      type: "date",
    },
  ],
};
