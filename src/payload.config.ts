import { mongooseAdapter } from "@payloadcms/db-mongodb";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import path from "path";
import { buildConfig } from "payload";
import { fileURLToPath } from "url";
import sharp from "sharp";

import { HappyBanners } from "./collections/HappyBanners";
import { Media } from "./collections/Media";
import { Products } from "./collections/Products";
import { Roles } from "./collections/Roles";
import { SocialPosts } from "./collections/SocialPosts";
import { Tags } from "./collections/Tags";
import { Users } from "./collections/Users";
import { VendorLogoTemplates } from "./collections/VendorLogoTemplates";
import { VendorSocialConnections } from "./collections/VendorSocialConnections";
import { VendorTemplates } from "./collections/VendorTemplates";
import { Vendors } from "./collections/Vendors";
import { WhatsAppChannelSessions } from "./collections/WhatsAppChannelSessions";

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

const payloadSecret = process.env.PAYLOAD_SECRET;
const isBuildTime =
  process.env.NEXT_PHASE === "phase-production-build" ||
  process.env.NEXT_PHASE === "phase-development-build";

if (!payloadSecret && !isBuildTime) {
  console.error(
    "PAYLOAD_SECRET is not set. It must match the value used by the main evega app, " +
      "otherwise existing sessions and encrypted values cannot be read.",
  );
}

const serverURL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3100";

/**
 * Trimmed mirror of the evega Payload config: same database, same collection
 * slugs and field shapes, but only the collections this console touches.
 * The Payload admin UI is disabled — this app is the only front end.
 */
export default buildConfig({
  admin: {
    user: Users.slug,
    disable: true,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [
    Users,
    Roles,
    Media,
    Tags,
    Vendors,
    Products,
    VendorTemplates,
    VendorLogoTemplates,
    HappyBanners,
    SocialPosts,
    VendorSocialConnections,
    WhatsAppChannelSessions,
  ],
  editor: lexicalEditor(),
  // Distinct cookie name so a console session is never confused with (or
  // reused as) an evega storefront/vendor session.
  cookiePrefix: "zvastra-admin",
  secret:
    payloadSecret ||
    (isBuildTime
      ? "build-placeholder-secret-replace-at-runtime-minimum-32-characters-long"
      : ""),
  typescript: {
    outputFile: path.resolve(dirname, "payload-types.ts"),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URL || "",
  }),
  serverURL,
  csrf: [serverURL],
  cors: [serverURL],
  sharp,
  plugins: [],
});
