import path from "node:path";
import { fileURLToPath } from "node:url";
import { withPayload } from "@payloadcms/next/withPayload";
import type { NextConfig } from "next";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  outputFileTracingRoot: projectRoot,
  // Standalone output keeps the container image small; this app is deployed as a
  // single long-lived Node process, never serverless.
  output: "standalone",
  turbopack: {
    root: projectRoot,
  },
  // Baileys and sharp use native/dynamic requires and must stay unbundled.
  serverExternalPackages: [
    "sharp",
    "@img/sharp-linux-x64",
    "@img/sharp-libvips-linux-x64",
    "@whiskeysockets/baileys",
  ],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
      { protocol: "http", hostname: "localhost" },
    ],
  },
};

export default withPayload(nextConfig);
