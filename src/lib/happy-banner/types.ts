export type HappyBannerPreset =
  | "mega-sale"
  | "summer-sale"
  | "hue-editorial"
  | "tropical-hot-sale"
  | "new-arrivals"
  | "ethnic-festive"
  | "flash-sale"
  | "bridal-edit"
  | "linen-edit"
  | "kurta-print"
  | "luxury-boutique"
  | "boho-chic"
  | "clearance-eoss"
  | "handloom-heritage";

export type HappyBannerTheme = {
  backgroundColor: string;
  accentYellow: string;
  accentPink: string;
};

export type HappyBannerDocFields = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  preset?: HappyBannerPreset | null;
  defaultWord1?: string | null;
  defaultWord2?: string | null;
  vendorWords?: {
    word1?: {
      label?: string | null;
      hint?: string | null;
      defaultValue?: string | null;
    } | null;
    word2?: {
      label?: string | null;
      hint?: string | null;
      defaultValue?: string | null;
    } | null;
  } | null;
  eyebrowText?: string | null;
  secondaryWord?: string | null;
  ctaLabel?: string | null;
  discountPrefix?: string | null;
  discountSuffix?: string | null;
  theme?: {
    backgroundColor?: string | null;
    accentYellow?: string | null;
    accentPink?: string | null;
  } | null;
  previewImage?: string | { id?: string; url?: string | null } | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
};

export type HeroBannerPlatformConfig = {
  enabled?: boolean | null;
};

export type ResolvedHappyBanner = {
  enabled: true;
  bannerId: string;
  bannerName: string;
  preset: HappyBannerPreset;
  word1: string;
  word2: string;
  eyebrowText: string;
  secondaryWord: string;
  ctaLabel: string;
  discountPrefix: string;
  discountSuffix: string;
  theme: HappyBannerTheme;
  vendorSlug: string;
};

export type VendorHappyBannerSelection = {
  bannerId: string | null;
  word1: string;
  word2: string;
};
