import type { CollectionConfig } from "payload";
import { isSuperAdmin } from "@/lib/access";
import { HAPPY_BANNER_PRESET_OPTIONS } from "@/lib/happy-banner/presets";

export const HappyBanners: CollectionConfig = {
  slug: "happy-banners",
  labels: {
    singular: "Happy Banner",
    plural: "Happy Banners",
  },
  admin: {
    useAsTitle: "name",
    description: "Promotional banner designs vendors can choose from",
    defaultColumns: ["name", "preset", "isDefault", "isActive", "updatedAt"],
  },
  access: {
    read: () => true,
    create: ({ req: { user } }) => isSuperAdmin(user),
    update: ({ req: { user } }) => isSuperAdmin(user),
    delete: ({ req: { user } }) => isSuperAdmin(user),
  },
  hooks: {
    beforeValidate: [
      async ({ data, operation }) => {
        if (operation === "create" && data?.name && !data?.slug) {
          data.slug = data.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/(^-|-$)/g, "");
        }
        return data;
      },
    ],
    beforeChange: [
      async ({ data, operation, req, originalDoc }) => {
        const docId = originalDoc?.id ?? data?.id;

        if (data?.isDefault === true) {
          const existingDefaults = await req.payload.find({
            collection: "happy-banners",
            where: {
              isDefault: { equals: true },
              ...(docId ? { id: { not_equals: docId } } : {}),
            },
            limit: 100,
          });

          for (const banner of existingDefaults.docs) {
            await req.payload.update({
              collection: "happy-banners",
              id: banner.id,
              data: { isDefault: false },
            });
          }
        }

        return data;
      },
    ],
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "Banner name shown to vendors (e.g. Mega Sale Blue)",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      admin: {
        description: "URL-safe identifier",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Short description for the vendor picker",
      },
    },
    {
      name: "previewImage",
      type: "upload",
      relationTo: "media",
      label: "Preview thumbnail",
      admin: {
        description:
          "Optional thumbnail shown in the vendor banner picker. Recommended ~1200×400px.",
      },
    },
    {
      name: "preset",
      type: "select",
      required: true,
      defaultValue: "mega-sale",
      options: HAPPY_BANNER_PRESET_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    },
    {
      name: "vendorWords",
      type: "group",
      label: "Vendor-editable words",
      admin: {
        description:
          "Same two-word slot pattern for every banner design. Each vendor sets their own values after selecting this design.",
      },
      fields: [
        {
          name: "word1",
          type: "group",
          label: "Word 1 slot",
          fields: [
            { name: "label", type: "text", defaultValue: "Word 1" },
            {
              name: "hint",
              type: "text",
              defaultValue: "Main headline (e.g. MEGA, SUMMER)",
            },
            { name: "defaultValue", type: "text", defaultValue: "MEGA" },
          ],
        },
        {
          name: "word2",
          type: "group",
          label: "Word 2 slot",
          fields: [
            { name: "label", type: "text", defaultValue: "Word 2" },
            {
              name: "hint",
              type: "text",
              defaultValue: "Discount number before % (e.g. 50, 35)",
            },
            { name: "defaultValue", type: "text", defaultValue: "50" },
          ],
        },
      ],
    },
    {
      name: "defaultWord1",
      type: "text",
      defaultValue: "MEGA",
      label: "Default Word 1",
      admin: { hidden: true },
    },
    {
      name: "defaultWord2",
      type: "text",
      defaultValue: "50",
      label: "Default Word 2",
      admin: { hidden: true },
    },
    {
      name: "eyebrowText",
      type: "text",
      defaultValue: "LIMITED TIME ONLY",
    },
    {
      name: "secondaryWord",
      type: "text",
      defaultValue: "SALE",
    },
    {
      name: "ctaLabel",
      type: "text",
      defaultValue: "SHOP NOW",
    },
    {
      name: "discountPrefix",
      type: "text",
      defaultValue: "UP TO",
    },
    {
      name: "discountSuffix",
      type: "text",
      defaultValue: "OFF",
    },
    {
      name: "theme",
      type: "group",
      label: "Colors",
      fields: [
        {
          name: "backgroundColor",
          type: "text",
          defaultValue: "#1b2db8",
        },
        {
          name: "accentYellow",
          type: "text",
          defaultValue: "#ffd400",
        },
        {
          name: "accentPink",
          type: "text",
          defaultValue: "#ff2d9a",
        },
      ],
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      label: "Default banner for new vendors",
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      label: "Available for vendors to select",
    },
  ],
};
