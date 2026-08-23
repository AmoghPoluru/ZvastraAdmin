import { z } from "zod";
import type { BasePayload } from "payload";
import type { Vendor } from "@/payload-types";
import { buildOpenAiConfigUpdate, hasStoredOpenAiKey } from "@/lib/vendor-openai-config";

export const openAiConfigInputSchema = z.object({
  apiKey: z
    .string()
    .optional()
    .refine(
      (value) => {
        if (!value || value.trim() === "") return true;
        return value.trim().startsWith("sk-");
      },
      { message: "OpenAI API keys usually start with sk-" },
    ),
});

export type OpenAiConfigUpdateBody = z.infer<typeof openAiConfigInputSchema>;

export function toOpenAiConfigResponse(vendor: Vendor) {
  return {
    hasApiKey: hasStoredOpenAiKey(vendor.openaiConfig),
  };
}

export async function updateVendorOpenAiConfig(
  db: BasePayload,
  vendorId: string,
  input: OpenAiConfigUpdateBody,
  options?: { overrideAccess?: boolean },
) {
  const existing = await db.findByID({
    collection: "vendors",
    id: vendorId,
    depth: 0,
    overrideAccess: options?.overrideAccess,
  });

  return db.update({
    collection: "vendors",
    id: vendorId,
    data: {
      openaiConfig: buildOpenAiConfigUpdate(existing.openaiConfig, input),
    },
    overrideAccess: options?.overrideAccess,
  });
}
