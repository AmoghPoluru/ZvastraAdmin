export type VendorLogoPreset =
  | "lotus-grace"
  | "peacock-royal"
  | "mandala-gold"
  | "silk-emblem"
  | "temple-arch"
  | "rangoli-star"
  | "diya-lamp"
  | "jasmine-wreath"
  | "paisley-curve"
  | "kite-sankranti"
  | "henna-scroll"
  | "marigold-ring"
  | "chakra-wheel"
  | "hex-kolam"
  | "elephant-emblem";

export type VendorLogoTheme = {
  primary: string;
  secondary: string;
  accent: string;
  /** Fourth palette color — e.g. emerald, fuchsia, Krishna blue */
  tertiary: string;
  /** Fifth palette color — e.g. marigold, magenta, mehndi green */
  highlight: string;
  background: string;
};

export type VendorLogoDocFields = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  description?: string | null;
  preset?: VendorLogoPreset | null;
  defaultWord1?: string | null;
  defaultWord2?: string | null;
  vendorWords?: {
    word1?: { label?: string | null; hint?: string | null; defaultValue?: string | null } | null;
    word2?: { label?: string | null; hint?: string | null; defaultValue?: string | null } | null;
  } | null;
  theme?: {
    primary?: string | null;
    secondary?: string | null;
    accent?: string | null;
    tertiary?: string | null;
    highlight?: string | null;
    background?: string | null;
  } | null;
  previewImage?: string | { id?: string; url?: string | null } | null;
  isDefault?: boolean | null;
  isActive?: boolean | null;
};

export type ResolvedVendorLogoTemplate = {
  templateId: string;
  templateName: string;
  preset: VendorLogoPreset;
  word1: string;
  word2: string;
  theme: VendorLogoTheme;
};

export type VendorLogoSource = "upload" | "template";
