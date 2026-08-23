import type { Metadata } from "next";

import { PostToSocialPageClient } from "./components/PostToSocialPageClient";

export const metadata: Metadata = { title: "Post to social" };

export default function PostToSocialPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Post to social</h1>
        <p className="mt-1 text-sm text-gray-600">
          Select a vendor, connect Instagram / WhatsApp for them, then post product
          photos.
        </p>
      </div>

      <PostToSocialPageClient />
    </div>
  );
}
