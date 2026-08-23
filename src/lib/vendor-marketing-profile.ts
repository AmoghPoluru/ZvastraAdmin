type SocialChannelsInput = {
  socialInstagram?: string | null;
  socialFacebook?: string | null;
  socialWhatsAppGroup?: string | null;
  socialWhatsAppGroupJid?: string | null;
  socialNotes?: string | null;
};

export type SocialChannelsSaveInput = SocialChannelsInput & {
  socialInstagramLastPostedAt?: string | null;
  socialFacebookLastPostedAt?: string | null;
  socialWhatsAppGroupLastPostedAt?: string | null;
};

type SocialChannelsStored = SocialChannelsInput & {
  socialInstagramLastPostedAt?: string | null;
  socialFacebookLastPostedAt?: string | null;
  socialWhatsAppGroupLastPostedAt?: string | null;
};

type MarketingChannelPlatform =
  | "facebook-group"
  | "instagram-page"
  | "whatsapp-group"
  | "other";

type MarketingChannelInput = {
  platform: MarketingChannelPlatform;
  name: string;
  url: string;
  region?: string | null;
  audienceNotes?: string | null;
  isActive?: boolean | null;
  lastPostedAt?: string | null;
};

type MarketingChannelStored = MarketingChannelInput & {
  lastPostedAt?: string | null;
};

function normalizeSocialChannels(
  channels?: SocialChannelsInput | null
): Record<keyof SocialChannelsInput, string> {
  return {
    socialInstagram: (channels?.socialInstagram ?? "").trim(),
    socialFacebook: (channels?.socialFacebook ?? "").trim(),
    socialWhatsAppGroup: (channels?.socialWhatsAppGroup ?? "").trim(),
    socialWhatsAppGroupJid: (channels?.socialWhatsAppGroupJid ?? "").trim(),
    socialNotes: (channels?.socialNotes ?? "").trim(),
  };
}

function resolveLastPostedAt(
  inputValue: string | null | undefined,
  existingValue: string | null | undefined
): string | undefined {
  if (inputValue === undefined) {
    return existingValue ?? undefined;
  }
  if (inputValue === null || inputValue === "") {
    return undefined;
  }
  return inputValue;
}

export function buildSocialChannelsUpdate(
  existing: SocialChannelsStored | null | undefined,
  input: SocialChannelsSaveInput
): SocialChannelsStored {
  const next = normalizeSocialChannels(input);

  return {
    socialInstagram: next.socialInstagram || undefined,
    socialFacebook: next.socialFacebook || undefined,
    socialWhatsAppGroup: next.socialWhatsAppGroup || undefined,
    socialWhatsAppGroupJid: next.socialWhatsAppGroupJid || undefined,
    socialNotes: next.socialNotes || undefined,
    socialInstagramLastPostedAt: resolveLastPostedAt(
      input.socialInstagramLastPostedAt,
      existing?.socialInstagramLastPostedAt
    ),
    socialFacebookLastPostedAt: resolveLastPostedAt(
      input.socialFacebookLastPostedAt,
      existing?.socialFacebookLastPostedAt
    ),
    socialWhatsAppGroupLastPostedAt: resolveLastPostedAt(
      input.socialWhatsAppGroupLastPostedAt,
      existing?.socialWhatsAppGroupLastPostedAt
    ),
  };
}

export function hasMarketingChannelRowChanged(
  prev: MarketingChannelStored | undefined,
  input: Omit<MarketingChannelInput, "lastPostedAt">
): boolean {
  if (!prev) return true;
  return (
    prev.platform !== input.platform ||
    prev.name !== input.name ||
    prev.url !== input.url ||
    (prev.region ?? "").trim() !== (input.region ?? "").trim() ||
    (prev.audienceNotes ?? "").trim() !== (input.audienceNotes ?? "").trim() ||
    (prev.isActive ?? true) !== (input.isActive ?? true)
  );
}

export function buildMarketingChannelsUpdate(
  existing: MarketingChannelStored[] | null | undefined,
  input: MarketingChannelInput[]
): MarketingChannelStored[] {
  const existingByUrl = new Map((existing ?? []).map((ch) => [ch.url, ch]));

  return input.map((ch) => {
    const prev = existingByUrl.get(ch.url);
    const row = {
      platform: ch.platform,
      name: ch.name,
      url: ch.url,
      region: ch.region?.trim() || undefined,
      audienceNotes: ch.audienceNotes?.trim() || undefined,
      isActive: ch.isActive ?? true,
    };

    return {
      ...row,
      lastPostedAt: resolveLastPostedAt(ch.lastPostedAt, prev?.lastPostedAt),
    };
  });
}

export type WhatsAppConfigInput = {
  businessNumber?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  accessToken?: string | null;
  notificationsEnabled?: boolean | null;
};

type WhatsAppConfigStored = {
  businessNumber?: string | null;
  phoneNumberId?: string | null;
  wabaId?: string | null;
  accessToken?: string | null;
  notificationsEnabled?: boolean | null;
};

export type MetaConfigInput = {
  facebookPageId?: string | null;
  instagramBusinessId?: string | null;
  pageAccessToken?: string | null;
  instagramAccessToken?: string | null;
  instagramUsername?: string | null;
};

export type MetaConfigStored = {
  facebookPageId?: string | null;
  instagramBusinessId?: string | null;
  pageAccessToken?: string | null;
  instagramAccessToken?: string | null;
  instagramUsername?: string | null;
};

/** Only overwrite a secret token when a non-empty value is provided. */
function resolveSecret(
  inputValue: string | null | undefined,
  existingValue: string | null | undefined
): string | undefined {
  if (inputValue === undefined || inputValue === null) return existingValue ?? undefined;
  const trimmed = inputValue.trim();
  if (trimmed === "") return existingValue ?? undefined;
  return trimmed;
}

function resolveText(value: string | null | undefined): string | undefined {
  const trimmed = (value ?? "").trim();
  return trimmed || undefined;
}

export function buildWhatsAppConfigUpdate(
  existing: WhatsAppConfigStored | null | undefined,
  input: WhatsAppConfigInput
): WhatsAppConfigStored {
  return {
    businessNumber:
      input.businessNumber !== undefined
        ? resolveText(input.businessNumber)
        : existing?.businessNumber,
    phoneNumberId:
      input.phoneNumberId !== undefined
        ? resolveText(input.phoneNumberId)
        : existing?.phoneNumberId,
    wabaId: input.wabaId !== undefined ? resolveText(input.wabaId) : existing?.wabaId,
    accessToken: resolveSecret(input.accessToken, existing?.accessToken),
    notificationsEnabled:
      input.notificationsEnabled ?? existing?.notificationsEnabled ?? true,
  };
}

export function buildMetaConfigUpdate(
  existing: MetaConfigStored | null | undefined,
  input: MetaConfigInput
): MetaConfigStored {
  return {
    facebookPageId:
      input.facebookPageId !== undefined
        ? resolveText(input.facebookPageId)
        : existing?.facebookPageId,
    instagramBusinessId:
      input.instagramBusinessId !== undefined
        ? resolveText(input.instagramBusinessId)
        : existing?.instagramBusinessId,
    pageAccessToken: resolveSecret(input.pageAccessToken, existing?.pageAccessToken),
    instagramAccessToken: resolveSecret(
      input.instagramAccessToken,
      existing?.instagramAccessToken
    ),
    instagramUsername:
      input.instagramUsername !== undefined
        ? resolveText(input.instagramUsername)
        : existing?.instagramUsername,
  };
}

/** Convert ISO date to value for datetime-local input */
export function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convert datetime-local value to ISO for Payload */
export function datetimeLocalToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}
