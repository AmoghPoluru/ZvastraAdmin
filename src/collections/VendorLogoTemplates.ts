import type { CollectionConfig } from "payload";
import { isSuperAdmin } from "@/lib/access";
import { VENDOR_LOGO_PRESET_OPTIONS } from "@/lib/vendor-logo/presets";

export const VendorLogoTemplates: CollectionConfig = {
  slug: "vendor-logo-templates",
  labels: {
    singular: "Logo Template",
    plural: "Logo Templates",
  },
  admin: {
    useAsTitle: "name",
    description: "Colorful South Asian monogram designs — vendors pick one initial letter",
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
            collection: "vendor-logo-templates",
            where: {
              isDefault: { equals: true },
              ...(docId ? { id: { not_equals: docId } } : {}),
            },
            limit: 100,
          });

          for (const template of existingDefaults.docs) {
            await req.payload.update({
              collection: "vendor-logo-templates",
              id: template.id,
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
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
    },
    {
      name: "description",
      type: "textarea",
    },
    {
      name: "previewImage",
      type: "upload",
      relationTo: "media",
      label: "Preview thumbnail",
    },
    {
      name: "preset",
      type: "select",
      required: true,
      defaultValue: "lotus-grace",
      options: VENDOR_LOGO_PRESET_OPTIONS.map((option) => ({
        label: option.label,
        value: option.value,
      })),
    },
    {
      name: "vendorWords",
      type: "group",
      label: "Vendor-editable words",
      fields: [
        {
          name: "word1",
          type: "group",
          label: "Word 1 slot",
          fields: [
            { name: "label", type: "text", defaultValue: "Brand name" },
            { name: "hint", type: "text", defaultValue: "Main brand name" },
            { name: "defaultValue", type: "text", defaultValue: "ANAYA" },
          ],
        },
        {
          name: "word2",
          type: "group",
          label: "Word 2 slot",
          fields: [
            { name: "label", type: "text", defaultValue: "Tagline" },
            { name: "hint", type: "text", defaultValue: "Short tagline" },
            { name: "defaultValue", type: "text", defaultValue: "SILKS" },
          ],
        },
      ],
    },
    {
      name: "defaultWord1",
      type: "text",
      admin: { hidden: true },
    },
    {
      name: "defaultWord2",
      type: "text",
      admin: { hidden: true },
    },
    {
      name: "theme",
      type: "group",
      fields: [
        { name: "primary", type: "text" },
        { name: "secondary", type: "text" },
        { name: "accent", type: "text" },
        { name: "tertiary", type: "text", label: "Tertiary" },
        { name: "highlight", type: "text", label: "Highlight" },
        { name: "background", type: "text" },
      ],
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
    },
  ],
};
