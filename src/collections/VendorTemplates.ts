import type { CollectionConfig } from "payload";
import { isSuperAdmin } from "@/lib/access";

export const VendorTemplates: CollectionConfig = {
  slug: "vendor-templates",
  admin: {
    useAsTitle: "name",
    description: "UI/UX templates for vendor storefronts",
    defaultColumns: ["name", "category", "industry", "isFeatured", "isDefault", "isActive", "version"],
  },
  access: {
    read: () => true, // Public read - vendors need to see available templates
    create: ({ req: { user } }) => isSuperAdmin(user),
    update: ({ req: { user } }) => isSuperAdmin(user),
    delete: ({ req: { user } }) => isSuperAdmin(user),
  },
  hooks: {
    beforeValidate: [
      async ({ data, operation }) => {
        // Auto-generate slug from name
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

        // If setting a template as default, unset other defaults
        if (data?.isDefault === true) {
          const existingDefaults = await req.payload.find({
            collection: "vendor-templates",
            where: {
              isDefault: { equals: true },
              ...(docId ? { id: { not_equals: docId } } : {}),
            },
            limit: 100,
          });

          for (const template of existingDefaults.docs) {
            await req.payload.update({
              collection: "vendor-templates",
              id: template.id,
              data: {
                isDefault: false,
              },
            });
          }
        }

        // Prevent unsetting the last site-wide default while other active templates exist
        const wasDefault = originalDoc?.isDefault === true;
        const unsettingDefault = wasDefault && data?.isDefault === false;

        if (unsettingDefault && docId) {
          const otherDefaults = await req.payload.find({
            collection: "vendor-templates",
            where: {
              isDefault: { equals: true },
              id: { not_equals: docId },
            },
            limit: 1,
          });

          if (otherDefaults.docs.length === 0) {
            const otherActive = await req.payload.find({
              collection: "vendor-templates",
              where: {
                isActive: { equals: true },
                id: { not_equals: docId },
              },
              limit: 1,
            });

            if (otherActive.docs.length > 0) {
              throw new Error(
                "At least one template must be marked as the site-wide default. " +
                  "Set another active template as default before unchecking this one."
              );
            }
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
        description: "Template name (e.g., 'Modern Minimal', 'Classic Elegance')",
      },
    },
    {
      name: "slug",
      type: "text",
      required: true,
      unique: true,
      index: true,
      admin: {
        description: "URL-friendly identifier (auto-generated from name)",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Template description shown to vendors",
      },
    },
    {
      name: "previewImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Screenshot/preview image of the template (recommended: 1920x1080px)",
      },
    },
    {
      name: "thumbnailImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Small thumbnail for template selection UI (recommended: 400x300px)",
      },
    },
    {
      name: "category",
      type: "select",
      required: true,
      options: [
        { label: "Minimal", value: "minimal" },
        { label: "Elegant", value: "elegant" },
        { label: "Bold", value: "bold" },
        { label: "Colorful", value: "colorful" },
        { label: "Classic", value: "classic" },
      ],
      defaultValue: "minimal",
      admin: {
        description: "Visual mood for filtering (minimal, elegant, bold, etc.)",
      },
    },
    {
      name: "industry",
      type: "select",
      required: true,
      defaultValue: "general",
      options: [
        { label: "General retail", value: "general" },
        { label: "Fashion boutique", value: "fashion-boutique" },
        { label: "Ethnic & festive", value: "ethnic-apparel" },
        { label: "Heritage & handloom", value: "ethnic-heritage" },
        { label: "Luxury", value: "luxury" },
        { label: "Large catalog", value: "catalog" },
        { label: "Neighborhood / kirana", value: "neighborhood-retail" },
        { label: "Marketplace / bazaar", value: "marketplace" },
        { label: "Social & resale", value: "social-resale" },
        { label: "Home & lifestyle", value: "home-lifestyle" },
        { label: "Wellness & calm", value: "wellness" },
        { label: "Events & promos", value: "events-promo" },
      ],
      admin: {
        description: "Industry vertical for vendor theme discovery",
      },
    },
    {
      name: "isFeatured",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Featured themes appear in the main vendor theme picker. Non-featured themes remain available to vendors already using them.",
      },
    },
    {
      name: "sortOrder",
      type: "number",
      defaultValue: 100,
      admin: {
        description: "Lower numbers appear first in the vendor theme picker",
      },
    },
    {
      name: "isDefault",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description:
          "Site-wide default template for new vendors. Only one template can be default; checking this unchecks any other default.",
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Whether template is available for selection",
      },
    },
    {
      name: "version",
      type: "text",
      defaultValue: "1.0.0",
      admin: {
        description: "Template version number",
      },
    },
    {
      name: "author",
      type: "text",
      defaultValue: "Evega Team",
      admin: {
        description: "Template creator/author",
      },
    },
    {
      name: "templateConfig",
      type: "json",
      required: true,
      admin: {
        description: "Template configuration schema (colors, fonts, spacing, layout, components)",
      },
    },
    {
      name: "cssVariables",
      type: "json",
      required: true,
      admin: {
        description: "CSS custom properties/variables for the template",
      },
    },
    {
      name: "componentMapping",
      type: "json",
      required: true,
      admin: {
        description: "Component structure mapping (which component variants to use)",
      },
    },
  ],
};
