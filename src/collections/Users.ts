import type { CollectionConfig } from "payload";
import type { User } from "@/payload-types";
import { isAppAdmin } from "@/lib/access";

export const Users: CollectionConfig = {
  slug: "users",
  admin: {
    useAsTitle: "email",
  },
  auth: true,
  /** Only app admins may use Payload at `/admin` (includes legacy super-admin / app-admin). */
  access: {
    admin: ({ req: { user } }) => isAppAdmin(user as User | undefined),
  },
  hooks: {
    beforeValidate: [
      ({ data, operation }) => {
        if (data && data.email && operation === "create") {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(data.email as string)) {
            throw new Error("Invalid email format");
          }
        }
        if (data && data.oauthProvider && data.oauthProvider !== "email") {
          if (!data.password) {
            data.password = undefined;
          }
        }
        return data;
      },
    ],
  },
  fields: [
    {
      name: "username",
      type: "text",
      required: false,
      unique: true,
    },
    {
      name: "name",
      type: "text",
      label: "Full Name",
      required: false,
    },
    {
      name: "role",
      type: "select",
      options: [
        { label: "User", value: "user" },
        { label: "Vendor", value: "vendor" },
        { label: "Admin", value: "admin" },
      ],
      defaultValue: "user",
      required: true,
    },
    {
      name: "oauthProvider",
      type: "select",
      options: [
        { label: "Email", value: "email" },
        { label: "Google", value: "google" },
        { label: "Facebook", value: "facebook" },
      ],
      defaultValue: "email",
      admin: {
        description: "Authentication method used by this user",
      },
    },
    {
      name: "oauthId",
      type: "text",
      admin: {
        description: "OAuth provider user ID",
        condition: (data) => data.oauthProvider !== "email",
      },
    },
    {
      name: "avatar",
      type: "text",
      admin: {
        description: "User avatar URL (from OAuth or uploaded)",
      },
    },
    {
      name: "vendor",
      type: "relationship",
      relationTo: "vendors",
      required: false,
      admin: {
        description:
          "The vendor/shop this user belongs to. Not used for admin or BDO accounts.",
        condition: (data) => {
          const r = data?.role;
          return r !== "admin";
        },
      },
    },
    {
      name: "shippingAddresses",
      type: "array",
      label: "Shipping Addresses",
      admin: {
        description: "Manage multiple shipping addresses. Set one as default for faster checkout.",
      },
      fields: [
        {
          name: "label",
          type: "text",
          label: "Address Label",
          required: true,
          defaultValue: "Home",
          admin: {
            description: "e.g., Home, Work, Office",
          },
        },
        {
          name: "isDefault",
          type: "checkbox",
          label: "Default Address",
          defaultValue: false,
          admin: {
            description: "Set as default shipping address",
          },
        },
        {
          name: "fullName",
          type: "text",
          label: "Full Name",
          required: true,
          admin: {
            description: "Recipient's full name",
          },
        },
        {
          name: "phone",
          type: "text",
          label: "Phone Number",
          required: true,
          admin: {
            description: "Contact phone number (e.g., +1-555-123-4567)",
          },
        },
        {
          name: "street",
          type: "text",
          label: "Street Address",
          required: true,
          admin: {
            description: "Street address, apartment, suite, etc.",
          },
        },
        {
          name: "city",
          type: "text",
          label: "City",
          required: true,
        },
        {
          name: "state",
          type: "select",
          label: "State",
          required: true,
          options: [
            { label: "Alabama", value: "AL" },
            { label: "Alaska", value: "AK" },
            { label: "Arizona", value: "AZ" },
            { label: "Arkansas", value: "AR" },
            { label: "California", value: "CA" },
            { label: "Colorado", value: "CO" },
            { label: "Connecticut", value: "CT" },
            { label: "Delaware", value: "DE" },
            { label: "Florida", value: "FL" },
            { label: "Georgia", value: "GA" },
            { label: "Hawaii", value: "HI" },
            { label: "Idaho", value: "ID" },
            { label: "Illinois", value: "IL" },
            { label: "Indiana", value: "IN" },
            { label: "Iowa", value: "IA" },
            { label: "Kansas", value: "KS" },
            { label: "Kentucky", value: "KY" },
            { label: "Louisiana", value: "LA" },
            { label: "Maine", value: "ME" },
            { label: "Maryland", value: "MD" },
            { label: "Massachusetts", value: "MA" },
            { label: "Michigan", value: "MI" },
            { label: "Minnesota", value: "MN" },
            { label: "Mississippi", value: "MS" },
            { label: "Missouri", value: "MO" },
            { label: "Montana", value: "MT" },
            { label: "Nebraska", value: "NE" },
            { label: "Nevada", value: "NV" },
            { label: "New Hampshire", value: "NH" },
            { label: "New Jersey", value: "NJ" },
            { label: "New Mexico", value: "NM" },
            { label: "New York", value: "NY" },
            { label: "North Carolina", value: "NC" },
            { label: "North Dakota", value: "ND" },
            { label: "Ohio", value: "OH" },
            { label: "Oklahoma", value: "OK" },
            { label: "Oregon", value: "OR" },
            { label: "Pennsylvania", value: "PA" },
            { label: "Rhode Island", value: "RI" },
            { label: "South Carolina", value: "SC" },
            { label: "South Dakota", value: "SD" },
            { label: "Tennessee", value: "TN" },
            { label: "Texas", value: "TX" },
            { label: "Utah", value: "UT" },
            { label: "Vermont", value: "VT" },
            { label: "Virginia", value: "VA" },
            { label: "Washington", value: "WA" },
            { label: "West Virginia", value: "WV" },
            { label: "Wisconsin", value: "WI" },
            { label: "Wyoming", value: "WY" },
            { label: "District of Columbia", value: "DC" },
          ],
        },
        {
          name: "zipcode",
          type: "text",
          label: "ZIP Code",
          required: true,
          admin: {
            description: "5-digit ZIP code or ZIP+4 format (e.g., 12345 or 12345-6789)",
          },
        },
      ],
    },
  ],
};
