import type { CollectionConfig } from "payload";
import type { Where } from "payload";

import { isSuperAdmin, getVendorId } from "@/lib/access";

export const Vendors: CollectionConfig = {
  slug: "vendors",
  admin: {
    useAsTitle: "name",
    description: "Vendors/Sellers in the marketplace",
  },
  access: {
    read: () => true, // Public can read vendor info
    create: ({ req }) => {
      // Only authenticated users can create vendors (during registration)
      return Boolean(req.user);
    },
    update: ({ req, data }) => {
      const user = req.user;
      
      // Super admins can update everything
      if (isSuperAdmin(user)) return true;
      
      // Vendors can update their own vendor, but NOT status or isActive
      const vendorId = getVendorId(user);
      if (vendorId) {
        // Prevent vendors from changing status or isActive
        if (data?.status !== undefined || data?.isActive !== undefined) {
          return false;
        }
        
        const where: Where = { id: { equals: vendorId } };
        return where;
      }
      
      return false;
    },
    delete: ({ req }) => isSuperAdmin(req.user),
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
      async ({ data, operation, req }) => {
        const user = req.user;
        
        // Prevent vendors from changing their own status or isActive
        if (operation === "update" && user && !isSuperAdmin(user)) {
          const vendorId = getVendorId(user);
          if (vendorId && (data?.status !== undefined || data?.isActive !== undefined)) {
            // Remove status and isActive from data if vendor is trying to change it
            delete data.status;
            delete data.isActive;
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
        description: "Business/Vendor name",
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
      type: "richText",
      admin: {
        description: "Vendor description/bio",
      },
    },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Vendor logo image (custom upload)",
      },
    },
    {
      name: "logoSource",
      type: "select",
      defaultValue: "upload",
      options: [
        { label: "Custom upload", value: "upload" },
        { label: "Logo template", value: "template" },
      ],
      admin: {
        description: "Whether the storefront uses a custom uploaded logo or a logo template",
      },
    },
    {
      name: "logoTemplate",
      type: "group",
      label: "Logo template",
      admin: {
        description: "Vendor-selected logo design and two customizable keywords",
      },
      fields: [
        {
          name: "selectedTemplate",
          type: "relationship",
          relationTo: "vendor-logo-templates",
          label: "Selected logo template",
        },
        {
          name: "word1",
          type: "text",
          label: "Word 1",
          admin: {
            description: "Primary brand word (e.g. ANAYA, MARUTHI)",
          },
        },
        {
          name: "word2",
          type: "text",
          label: "Word 2",
          admin: {
            description: "Tagline word (e.g. SILKS, COLLECTION)",
          },
        },
      ],
    },
    {
      name: "coverImage",
      type: "upload",
      relationTo: "media",
      admin: {
        description: "Vendor cover/banner image (fallback if hero banner not configured)",
      },
    },
    {
      name: "happyBanner",
      type: "group",
      label: "Happy Banner",
      admin: {
        description: "Vendor-selected Happy Banner design and editable words.",
      },
      fields: [
        {
          name: "selectedBanner",
          type: "relationship",
          relationTo: "happy-banners",
          label: "Selected banner",
          admin: {
            description: "Banner design shown on the vendor storefront",
          },
        },
        {
          name: "word1",
          type: "text",
          label: "Word 1",
          admin: {
            description: "Primary headline word (e.g. MEGA, SUMMER)",
          },
        },
        {
          name: "word2",
          type: "text",
          label: "Word 2",
          admin: {
            description: "Discount number shown before % (e.g. 50, 35)",
          },
        },
      ],
    },
    {
      name: "heroBanner",
      type: "group",
      label: "Hero Banner Configuration",
      admin: {
        description: "Configure a custom hero banner for your vendor page. If not configured, the cover image will be used.",
        condition: (data, siblingData, { user }) => {
          // Only show to vendors (they can edit their own) or super admins
          return isSuperAdmin(user) || (user && (user as any).vendor);
        },
      },
      fields: [
        {
          name: "title",
          type: "text",
          label: "Banner Title",
          admin: {
            description: "Main title displayed on the hero banner (e.g., 'Welcome to [Vendor Name]')",
          },
        },
        {
          name: "subtitle",
          type: "text",
          label: "Banner Subtitle",
          admin: {
            description: "Optional subtitle text displayed below the title",
          },
        },
        {
          name: "backgroundImage",
          type: "upload",
          relationTo: "media",
          label: "Background Image",
          admin: {
            description: "Background image for the hero banner (recommended: 1920x500px). If not set, a gradient will be used.",
          },
        },
        {
          name: "products",
          type: "relationship",
          relationTo: "products",
          hasMany: true,
          label: "Featured Products",
          admin: {
            description: "Select products to display in the hero banner (4-6 products recommended). Only your own products can be selected.",
          },
        },
        {
          name: "isActive",
          type: "checkbox",
          label: "Active",
          defaultValue: true,
          admin: {
            description: "Only active hero banners will be displayed on your vendor page",
          },
        },
        {
          name: "order",
          type: "number",
          label: "Display Order",
          defaultValue: 0,
          admin: {
            description: "Display order (lower numbers appear first, if multiple banners exist)",
          },
        },
      ],
    },
    {
      name: "email",
      type: "email",
      required: true,
      admin: {
        description: "Business email address",
      },
    },
    {
      name: "phone",
      type: "text",
      admin: {
        description: "Business phone number",
      },
    },
    {
      name: "website",
      type: "text",
      admin: {
        description: "Business website URL",
      },
    },
    {
      name: "socialChannels",
      type: "group",
      label: "Social & WhatsApp (vendor-owned)",
      admin: {
        description:
          "Your Instagram, Facebook page, and WhatsApp group. Vendors and Evega staff can update these for digital marketing.",
      },
      fields: [
        {
          name: "socialInstagram",
          type: "text",
          label: "Instagram",
          admin: {
            description: "Instagram profile or page URL (e.g. https://instagram.com/yourstore)",
          },
        },
        {
          name: "socialInstagramLastPostedAt",
          type: "date",
          label: "Instagram last posted",
          admin: {
            description: "Last promotional post on this Instagram account (not profile URL edits)",
            date: { pickerAppearance: "dayAndTime" },
          },
        },
        {
          name: "socialFacebook",
          type: "text",
          label: "Facebook",
          admin: {
            description: "Facebook page URL",
          },
        },
        {
          name: "socialFacebookLastPostedAt",
          type: "date",
          label: "Facebook last posted",
          admin: {
            description: "Last promotional post on this Facebook page",
            date: { pickerAppearance: "dayAndTime" },
          },
        },
        {
          name: "socialWhatsAppGroup",
          type: "text",
          label: "WhatsApp group",
          admin: {
            description: "WhatsApp group invite link (https://chat.whatsapp.com/…)",
          },
        },
        {
          name: "socialWhatsAppGroupJid",
          type: "text",
          label: "WhatsApp group JID",
          admin: {
            description:
              "Auto-filled from the invite link when WhatsApp is linked (e.g. 120363…@g.us). You can paste a JID manually if needed.",
          },
        },
        {
          name: "socialWhatsAppGroupLastPostedAt",
          type: "date",
          label: "WhatsApp last posted",
          admin: {
            description: "Last promotional post in this WhatsApp group",
            date: { pickerAppearance: "dayAndTime" },
          },
        },
        {
          name: "socialNotes",
          type: "textarea",
          label: "Notes",
          admin: {
            description: "Posting preferences, handles, or other notes for marketing",
          },
        },
      ],
    },
    {
      name: "marketingChannels",
      type: "array",
      label: "Community marketing channels",
      admin: {
        description:
          "Facebook groups, Instagram pages, and other channels where you or Evega promote this store. Vendors and staff can add or update entries.",
      },
      fields: [
        {
          name: "platform",
          type: "select",
          required: true,
          options: [
            { label: "Facebook group", value: "facebook-group" },
            { label: "Instagram page", value: "instagram-page" },
            { label: "WhatsApp group", value: "whatsapp-group" },
            { label: "Other", value: "other" },
          ],
        },
        {
          name: "name",
          type: "text",
          required: true,
          admin: {
            description: 'e.g. "Desi Fashion Deals", "Charlotte Saree Lovers"',
          },
        },
        {
          name: "url",
          type: "text",
          required: true,
          admin: {
            description: "Link to the group or page",
          },
        },
        {
          name: "region",
          type: "text",
          admin: {
            description: "State or metro area (optional)",
          },
        },
        {
          name: "audienceNotes",
          type: "textarea",
          label: "Audience & posting rules",
          admin: {
            description: "Who is in this channel and any rules for posting",
          },
        },
        {
          name: "isActive",
          type: "checkbox",
          label: "Active",
          defaultValue: true,
        },
        {
          name: "lastPostedAt",
          type: "date",
          label: "Last posted",
          admin: {
            description: "Last promotional post to this group or page",
            date: {
              pickerAppearance: "dayAndTime",
            },
          },
        },
      ],
    },
    {
      name: "whatsappConfig",
      type: "group",
      label: "WhatsApp Business (notifications)",
      admin: {
        description:
          "Connected WhatsApp Business Cloud API account. Order/like/favorite notifications are sent to the business number below.",
      },
      fields: [
        {
          name: "businessNumber",
          type: "text",
          label: "Business number (E.164)",
          admin: {
            description:
              "Recipient for WhatsApp notifications, in E.164 format (e.g. +13098253354).",
          },
        },
        {
          name: "phoneNumberId",
          type: "text",
          label: "Phone number ID",
          admin: {
            description: "WhatsApp Cloud API phone number ID (from Meta).",
          },
        },
        {
          name: "wabaId",
          type: "text",
          label: "WhatsApp Business Account ID",
          admin: {
            description: "WABA ID (from Meta).",
          },
        },
        {
          name: "accessToken",
          type: "text",
          label: "Access token",
          access: {
            read: ({ req }) => isSuperAdmin(req.user),
            update: ({ req }) => isSuperAdmin(req.user) || Boolean(getVendorId(req.user)),
          },
          admin: {
            hidden: true,
            description: "Secret WhatsApp Cloud API access token. Never exposed to clients.",
          },
        },
        {
          name: "notificationsEnabled",
          type: "checkbox",
          label: "WhatsApp notifications enabled",
          defaultValue: true,
          admin: {
            description: "When enabled, send WhatsApp notifications for orders, likes, and favorites.",
          },
        },
      ],
    },
    {
      name: "metaConfig",
      type: "group",
      label: "Meta (Facebook / Instagram)",
      admin: {
        description:
          "Connected Facebook Page and Instagram Business account used to post products to social channels.",
      },
      fields: [
        {
          name: "facebookPageId",
          type: "text",
          label: "Facebook Page ID",
        },
        {
          name: "instagramBusinessId",
          type: "text",
          label: "Instagram Business account ID",
          admin: {
            description:
              "Auto-filled from token. IG Business ID (Facebook path) or Instagram user ID (IGAA path).",
          },
        },
        {
          name: "instagramUsername",
          type: "text",
          label: "Instagram username",
          admin: {
            description: "Auto-filled when using an Instagram Login token (IGAA…).",
          },
        },
        {
          name: "pageAccessToken",
          type: "text",
          label: "Page access token",
          access: {
            read: ({ req }) => isSuperAdmin(req.user),
            update: ({ req }) => isSuperAdmin(req.user) || Boolean(getVendorId(req.user)),
          },
          admin: {
            hidden: true,
            description: "Facebook Page access token (EAA…). Used for Facebook + Instagram via Page.",
          },
        },
        {
          name: "instagramAccessToken",
          type: "text",
          label: "Instagram access token",
          access: {
            read: ({ req }) => isSuperAdmin(req.user),
            update: ({ req }) => isSuperAdmin(req.user) || Boolean(getVendorId(req.user)),
          },
          admin: {
            hidden: true,
            description:
              "Instagram Login access token (IGAA…). Used for Instagram-only posting without a Facebook Page token.",
          },
        },
      ],
    },
    {
      name: "openaiConfig",
      type: "group",
      label: "OpenAI",
      admin: {
        description: "Vendor-owned OpenAI API key for AI-powered features.",
      },
      fields: [
        {
          name: "apiKey",
          type: "text",
          label: "API key",
          access: {
            read: ({ req, doc }) => {
              if (isSuperAdmin(req.user)) return true;
              const vendorId = getVendorId(req.user);
              if (!vendorId || !doc) return false;
              return String(doc.id) === String(vendorId);
            },
            update: ({ req }) => isSuperAdmin(req.user) || Boolean(getVendorId(req.user)),
          },
          admin: {
            hidden: true,
            description: "Secret OpenAI API key (sk-…). Never exposed to clients.",
          },
        },
      ],
    },
    {
      name: "address",
      type: "group",
      fields: [
        {
          name: "street",
          type: "text",
          label: "Street Address",
        },
        {
          name: "city",
          type: "text",
          label: "City",
        },
        {
          name: "state",
          type: "text",
          label: "State",
        },
        {
          name: "zipcode",
          type: "text",
          label: "ZIP Code",
        },
        {
          name: "country",
          type: "text",
          label: "Country",
          defaultValue: "USA",
        },
      ],
    },
    {
      name: "approveAction",
      type: "text",
      admin: {
        components: {
          Field: "@/collections/components/ApproveVendorButton#ApproveVendorButton",
        },
        description: "Quick action to approve and activate this vendor",
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          if (!isSuperAdmin(user)) {
            return false;
          }
          // Show button if vendor is not already approved AND active
          // Check both data (new values) and siblingData (existing values)
          const currentStatus = data?.status ?? siblingData?.status;
          const currentIsActive = data?.isActive ?? siblingData?.isActive ?? false;
          // Show if status is not approved OR isActive is false
          return currentStatus !== "approved" || currentIsActive === false;
        },
        position: "sidebar",
        readOnly: true,
      },
    },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Pending", value: "pending" },
        { label: "Approved", value: "approved" },
        { label: "Suspended", value: "suspended" },
        { label: "Rejected", value: "rejected" },
      ],
      defaultValue: "pending",
      admin: {
        description: "Vendor approval status. Use 'Approve & Activate' button to approve vendors.",
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "isActive",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Active vendors can sell products. Use 'Approve & Activate' button above to activate vendors.",
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeAccountId",
      type: "text",
      admin: {
        description: "Stripe Connect account ID for payouts",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeAccountStatus",
      type: "select",
      options: [
        { label: "Not Connected", value: "not_connected" },
        { label: "Pending", value: "pending" },
        { label: "Active", value: "active" },
        { label: "Restricted", value: "restricted" },
        { label: "Rejected", value: "rejected" },
      ],
      defaultValue: "not_connected",
      admin: {
        description: "Stripe Connect account status",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeOnboardingLink",
      type: "text",
      admin: {
        description: "Link for vendor to complete Stripe onboarding",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeOnboardingCompleted",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Whether vendor has completed Stripe onboarding",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeAccountDetails",
      type: "json",
      admin: {
        description: "Detailed Stripe account information (business details, capabilities, requirements)",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeAccountCountry",
      type: "text",
      admin: {
        description: "Stripe account country",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeAccountEmail",
      type: "email",
      admin: {
        description: "Stripe account email",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripeChargesEnabled",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Whether vendor can accept charges",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "stripePayoutsEnabled",
      type: "checkbox",
      defaultValue: false,
      admin: {
        description: "Whether vendor can receive payouts",
        readOnly: true,
        condition: (data, siblingData, { user }) => {
          return isSuperAdmin(user);
        },
      },
    },
    {
      name: "syncStripeAction",
      type: "text",
      admin: {
        components: {
          Field: "@/collections/components/SyncStripeDetailsButton#SyncStripeDetailsButton",
        },
        description: "Sync vendor Stripe account details from Stripe API",
        condition: (data, siblingData, { user }) => {
          // Only show to super admins
          if (!isSuperAdmin(user)) {
            return false;
          }
          // Show button if vendor has a Stripe account
          const stripeAccountId = data?.stripeAccountId ?? siblingData?.stripeAccountId;
          return !!stripeAccountId;
        },
        position: "sidebar",
        readOnly: true,
      },
    },
    {
      name: "commissionRate",
      type: "number",
      defaultValue: 10,
      admin: {
        description: "Platform commission rate (%)",
      },
    },
    {
      name: "contactPhone",
      type: "text",
      label: "Contact Phone for Offline Payments",
      admin: {
        description: "Phone number for customers to contact you for offline payments",
        position: "sidebar",
      },
    },
    {
      name: "contactEmail",
      type: "email",
      label: "Contact Email for Offline Payments",
      admin: {
        description: "Email address for customers to contact you for offline payments",
        position: "sidebar",
      },
    },
    {
      name: "preferredPaymentMethod",
      type: "select",
      label: "Preferred Payment Method",
      options: [
        { label: "Stripe Only", value: "stripe" },
        { label: "Offline Only", value: "offline" },
        { label: "Both (Stripe & Offline)", value: "both" },
      ],
      defaultValue: "both",
      admin: {
        description: "Which payment methods do you want to offer to customers?",
        position: "sidebar",
      },
    },
    {
      name: "offlinePaymentInstructions",
      type: "textarea",
      label: "Offline Payment Instructions",
      admin: {
        description: "Custom instructions for customers who choose offline payment (e.g., 'Call me at [phone] or WhatsApp me at [number]')",
        position: "sidebar",
      },
    },
    {
      name: "verificationDocuments",
      type: "array",
      label: "Verification Documents",
      admin: {
        description: "Business verification documents (business license, tax ID, etc.)",
      },
      fields: [
        {
          name: "document",
          type: "upload",
          relationTo: "media",
          required: true,
        },
        {
          name: "type",
          type: "select",
          options: [
            { label: "Business License", value: "business-license" },
            { label: "Tax ID", value: "tax-id" },
            { label: "Identity", value: "identity" },
            { label: "Other", value: "other" },
          ],
          required: true,
        },
        {
          name: "notes",
          type: "text",
          admin: {
            description: "Additional notes about this document",
          },
        },
      ],
    },
    {
      name: "selectedTemplate",
      type: "relationship",
      relationTo: "vendor-templates",
      admin: {
        description: "Selected UI/UX template for vendor storefront",
        position: "sidebar",
      },
      hooks: {
        beforeValidate: [
          async ({ value, operation, req }) => {
            if ((operation === "create" || operation === "update") && !value) {
              try {
                const defaultTemplate = await req.payload.find({
                  collection: "vendor-templates",
                  where: {
                    isDefault: { equals: true },
                    isActive: { equals: true },
                  },
                  limit: 1,
                });
                if (defaultTemplate.docs.length > 0) {
                  return defaultTemplate.docs[0].id;
                }
              } catch (error) {
                console.error("Error fetching default template:", error);
              }
            }
            return value;
          },
        ],
      },
    },
    {
      name: "selectedLayoutId",
      type: "select",
      options: [
        { label: "Classic Grid (default)", value: "default" },
        { label: "Boutique Grid (collection)", value: "collection" },
        { label: "Catalog Shop (emporium)", value: "emporium" },
        { label: "Runway Lookbook (runway)", value: "runway" },
        { label: "Social Gallery (reloop)", value: "reloop" },
      ],
      admin: {
        description:
          "Optional storefront layout override. When empty, the layout from the selected theme is used.",
        position: "sidebar",
      },
    },
    {
      name: "templateCustomization",
      type: "json",
      defaultValue: {},
      admin: {
        description: "Vendor-specific template customizations (colors, fonts, layout, etc.)",
        position: "sidebar",
      },
    },
  ],
};
