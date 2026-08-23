export const DEFAULT_BANNER_INSTRUCTION_WITH_PHOTO = [
  "Create a professional Instagram promotional banner in a portrait layout.",
  "Use the attached photo as the real product photography. Do not replace it with a different product.",
  "Place the product clearly in the composition (typically one side or center). Add campaign copy, brand styling, and decorative frames as the user requests.",
  "Keep all text sharp, spelled correctly, and readable on a phone. Premium boutique aesthetic unless the user asks otherwise.",
].join(" ");

export const DEFAULT_BANNER_INSTRUCTION_WITHOUT_PHOTO = [
  "Create a professional Instagram promotional banner in a portrait layout.",
  "Do not use a product photo. Invent the scene, garments, and styling from the creative brief.",
  "Add campaign copy, brand styling, and decorative frames as the user requests.",
  "Keep all text sharp, spelled correctly, and readable on a phone. Premium boutique aesthetic unless the user asks otherwise.",
].join(" ");

export const DEFAULT_BANNER_BRIEF =
  "Festive boutique sale banner, cream background, maroon and gold type, 10% off all dresses, product photo on the right, gold floral frame, premium and readable on Instagram.";

export function buildBannerPrompt(args: {
  instruction: string;
  brief: string;
  productName: string;
  priceLabel: string;
}): string {
  return [
    args.instruction.trim(),
    `Product name: ${args.productName}. Price: ${args.priceLabel}.`,
    `Creative brief: ${args.brief.trim()}`,
  ]
    .filter(Boolean)
    .join(" ");
}
