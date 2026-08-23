import type { CollectionConfig } from "payload";
import type { Where } from "payload";

import { isSuperAdmin, isVendor, getVendorId } from "@/lib/access";
import { extractYouTubeVideoId, timeToSeconds } from "@/lib/youtube-utils";

export const Products: CollectionConfig = {
  slug: "products",
  access: {
    read: ({ req }) => {
      const user = req.user;
      // Public can read published products from all vendors
      const where: Where = {
        isArchived: { equals: false },
        isPrivate: { equals: false },
      };

      // Vendors can also see their own drafts
      if (user && isVendor(user) && user.vendor) {
        const vendorId = getVendorId(user);
        if (vendorId) {
          return {
            or: [
              where,
              {
                and: [
                  { vendor: { equals: vendorId } },
                  { isArchived: { equals: false } },
                ],
              },
            ],
          };
        }
      }

      return where;
    },
    create: ({ req }) => {
      if (isSuperAdmin(req.user)) return true;
      // Only vendors can create products
      return isVendor(req.user);
    },
    update: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      if (user && isVendor(user) && user.vendor) {
        const vendorId = getVendorId(user);
        if (vendorId) {
          const where: Where = { vendor: { equals: vendorId } };
          return where;
        }
      }
      return false;
    },
    delete: ({ req }) => {
      const user = req.user;
      if (isSuperAdmin(user)) return true;
      if (user && isVendor(user) && user.vendor) {
        const vendorId = getVendorId(user);
        if (vendorId) {
          const where: Where = { vendor: { equals: vendorId } };
          return where;
        }
      }
      return false;
    },
  },
  admin: {
    useAsTitle: "name",
    description: "You must verify your account before creating products"
  },
  // Note: MongoDB indexes should be created via migration script or MongoDB directly
  // See docs/SEARCH_INDEXES.md for index creation commands
  hooks: {
    beforeValidate: [
      async ({ data, operation, req }) => {
        // Convert string descriptions to Lexical format for richText fields
        if (data?.description && typeof data.description === "string") {
          data.description = {
            root: {
              children: [
                {
                  children: [
                    {
                      detail: 0,
                      format: 0,
                      mode: "normal",
                      style: "",
                      text: data.description,
                      type: "text",
                      version: 1,
                    },
                  ],
                  direction: "ltr",
                  format: "",
                  indent: 0,
                  type: "paragraph",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "root",
              version: 1,
            },
          };
        }
        return data;
      },
    ],
    beforeChange: [
      async ({ data, operation, req }) => {
        const user = req.user;
        // Auto-assign vendor for vendors when creating
        if (operation === "create" && user && isVendor(user) && user.vendor && !data.vendor) {
          const vendorId = getVendorId(user);
          if (vendorId) {
            data.vendor = vendorId;
          }
        }

        // Task 1007: Auto-draft when total stock reaches 0
        if (operation === "update") {
          // Calculate total stock from variants
          let totalStock = 0;
          if (data.variants && Array.isArray(data.variants) && data.variants.length > 0) {
            totalStock = data.variants.reduce((sum: number, variant: any) => {
              return sum + (variant.stock || 0);
            }, 0);
          }
          
          // If stock is 0 and product is not already private, set to draft
          if (totalStock === 0 && data.isPrivate !== true) {
            data.isPrivate = true;
            console.log(`[Products Hook] Auto-drafted product due to zero inventory`);
          }
        }

        // Prevent vendors from changing vendor field
        if (operation === "update" && user && isVendor(user) && user.vendor) {
          const vendorId = getVendorId(user);
          if (data.vendor && data.vendor !== vendorId) {
            throw new Error("You cannot change the vendor of this product");
          }
          // Force vendor to match vendor's vendor
          if (vendorId) {
            data.vendor = vendorId;
          }
        }
        return data;
      },
    ],
    afterRead: [
      async ({ doc, req }) => {
        // Convert string descriptions to Lexical format when reading existing products
        if (doc?.description && typeof doc.description === "string") {
          doc.description = {
            root: {
              children: [
                {
                  children: [
                    {
                      detail: 0,
                      format: 0,
                      mode: "normal",
                      style: "",
                      text: doc.description,
                      type: "text",
                      version: 1,
                    },
                  ],
                  direction: "ltr",
                  format: "",
                  indent: 0,
                  type: "paragraph",
                  version: 1,
                },
              ],
              direction: "ltr",
              format: "",
              indent: 0,
              type: "root",
              version: 1,
            },
          };
        }
        return doc;
      },
    ],
    afterChange: [
      // Task 1008: Check stock after variant updates and auto-draft if needed
      async ({ doc, operation, req }) => {
        if (operation === "update") {
          // Calculate total stock from variants
          let totalStock = 0;
          if (doc.variants && Array.isArray(doc.variants) && doc.variants.length > 0) {
            totalStock = doc.variants.reduce((sum: number, variant: any) => {
              return sum + (variant.stock || 0);
            }, 0);
          }
          
          // If stock is 0 and product is published, auto-draft it
          if (totalStock === 0 && doc.isPrivate === false) {
            try {
              await req.payload.update({
                collection: "products",
                id: doc.id,
                data: {
                  isPrivate: true,
                },
              });
              console.log(`[Products Hook] Auto-drafted product ${doc.id} due to zero inventory after update`);
            } catch (error) {
              console.error(`[Products Hook] Failed to auto-draft product ${doc.id}:`, error);
            }
          }
        }
        return doc;
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
      name: "description",
      type: "richText",
    },
    {
      name: "price",
      type: "number",
      required: true,
      admin: {
        description: "Price in USD"
      }
    },
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: true,
      admin: {
        description: "The vendor/shop that owns this product",
      },
    },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
    },
    {
      name: "cover",
      type: "upload",
      relationTo: "media",
      hasMany: true,
    },
    {
      name: "videoSource",
      type: "select",
      label: "Video Source",
      options: [
        { label: "Upload Video File", value: "upload" },
        { label: "YouTube Link", value: "youtube" },
      ],
      defaultValue: "upload",
      admin: {
        description: "Choose how to add product video: upload a file or use a YouTube link",
      },
    },
    {
      name: "video",
      type: "upload",
      relationTo: "media",
      admin: {
        condition: (data) => data.videoSource !== "youtube",
        description: "Product video (MP4, WebM, etc.) - vendors can upload product demonstration videos",
      },
      filterOptions: {
        mimeType: {
          contains: "video",
        },
      },
    },
    {
      name: "youtubeUrl",
      type: "text",
      label: "YouTube URL",
      admin: {
        condition: (data) => data.videoSource === "youtube",
        description: "Paste the full YouTube URL (e.g., https://www.youtube.com/watch?v=VIDEO_ID or https://youtu.be/VIDEO_ID)",
      },
    },
    {
      name: "youtubeVideoId",
      type: "text",
      label: "YouTube Video ID",
      admin: {
        condition: (data) => data.videoSource === "youtube",
        description: "Automatically extracted from YouTube URL",
        readOnly: true,
      },
    },
    {
      name: "youtubeStartTime",
      type: "text",
      label: "Start Time (MM:SS)",
      admin: {
        condition: (data) => data.videoSource === "youtube",
        description: "Enter the time where product details are discussed in MM:SS format (e.g., 2:05 for 2 minutes 5 seconds, or 0:30 for 30 seconds)",
        placeholder: "2:05",
      },
    },
    {
      name: "youtubeStartTimeSeconds",
      type: "number",
      label: "Start Time (seconds) - Auto-calculated",
      admin: {
        condition: (data) => data.videoSource === "youtube",
        description: "Automatically calculated from MM:SS format",
        readOnly: true,
      },
    },
    {
      name: "refundPolicy",
      type: "select",
      options: ["30-day", "14-day", "7-day", "3-day", "1-day", "no-refunds"],
      defaultValue: "30-day",
    },
    {
      name: "content",
      type: "richText",
      admin: {
        description:
          "Protected content only visible to customers after purchase. Add product documentation, downloadable files, getting started guides, and bonus materials. Supports Markdown formatting"
      },
    },
    {
      name: "isPrivate",
      label: "Private",
      defaultValue: false,
      type: "checkbox",
      admin: {
        description: "If checked, this product will not be shown on the public storefront"
      },
    },
    {
      name: "isArchived",
      label: "Archive",
      defaultValue: false,
      type: "checkbox",
      admin: {
        description: "If checked, this product will be archived"
      },
    },
    {
      name: "tags",
      type: "relationship",
      relationTo: "tags",
      hasMany: true,
      admin: {
        description: "Select tags for this product"
      },
    },
    {
      name: "variants",
      type: "array",
      label: "Product Variants",
      admin: {
        description: "⚠️ Use the Vendor Dashboard (/vendor/products) to create products with variants. This field is for advanced users only.",
      },
      fields: [
        {
          name: "variantData",
          type: "json",
          required: true,
          admin: {
            description: "Variant attributes (e.g., { size: 'M', color: 'Red', material: 'Silk' })",
            components: {
              Field: "@/components/payload/VariantDataField",
            },
          },
        },
        {
          name: "stock",
          type: "number",
          required: true,
          defaultValue: 0,
          min: 0,
          admin: {
            description: "Available inventory for this variant",
          },
        },
        {
          name: "price",
          type: "number",
          required: false,
          admin: {
            description: "Price for this specific variant. If not set, uses the product's base price.",
          },
        },
      ],
    },
  ],
};
