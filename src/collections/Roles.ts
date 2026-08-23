import type { CollectionConfig } from "payload";

import { isSuperAdmin } from "@/lib/access";

export const Roles: CollectionConfig = {
  slug: "roles",
  admin: {
    useAsTitle: "name",
    description: "Application and vendor-level roles for user permissions",
  },
  access: {
    read: () => true, // Public can read roles (for display purposes)
    create: ({ req }) => isSuperAdmin(req.user),
    update: ({ req }) => isSuperAdmin(req.user),
    delete: ({ req }) => isSuperAdmin(req.user),
  },
  fields: [
    {
      name: "name",
      type: "text",
      required: true,
      admin: {
        description: "Role name (e.g., 'Vendor Owner', 'App Admin')",
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
      name: "type",
      type: "select",
      required: true,
      options: [
        { label: "Application Role", value: "app" },
        { label: "Vendor Role", value: "vendor" },
      ],
      admin: {
        description: "Role type: Application roles are for app-level access, Vendor roles are for vendor organization access",
      },
    },
    {
      name: "description",
      type: "textarea",
      admin: {
        description: "Description of what this role allows",
      },
    },
    {
      name: "permissions",
      type: "array",
      label: "Permissions",
      admin: {
        description: "List of permissions granted by this role",
      },
      fields: [
        {
          name: "permission",
          type: "text",
          required: true,
          admin: {
            description: "Permission name (e.g., 'manage-products', 'view-orders')",
          },
        },
      ],
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: true,
      admin: {
        description: "Active roles can be assigned to users",
      },
    },
  ],
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
  },
};
