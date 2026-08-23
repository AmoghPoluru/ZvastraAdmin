export type OpenAiConfigInput = {
  apiKey?: string | null;
};

type OpenAiConfigStored = {
  apiKey?: string | null;
};

/** Only overwrite the API key when a non-empty value is provided. */
function resolveSecret(
  inputValue: string | null | undefined,
  existingValue: string | null | undefined,
): string | undefined {
  if (inputValue === undefined || inputValue === null) return existingValue ?? undefined;
  const trimmed = inputValue.trim();
  if (trimmed === "") return existingValue ?? undefined;
  return trimmed;
}

export function buildOpenAiConfigUpdate(
  existing: OpenAiConfigStored | null | undefined,
  input: OpenAiConfigInput,
): OpenAiConfigStored {
  return {
    apiKey: resolveSecret(input.apiKey, existing?.apiKey),
  };
}

export function hasStoredOpenAiKey(config: OpenAiConfigStored | null | undefined): boolean {
  return Boolean(config?.apiKey?.trim());
}

export function getVendorOpenAiApiKey(
  vendor: { openaiConfig?: OpenAiConfigStored | null } | null | undefined,
): string | null {
  const raw = vendor?.openaiConfig?.apiKey;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed || null;
}
