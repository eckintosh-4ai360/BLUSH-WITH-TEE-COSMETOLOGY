import { storageGet } from "@blush/storage";

// Photos of the products that shipped with the site, used until staff upload one of their own.
const LOCAL_PRODUCT_IMAGES_BY_SKU = new Map<string, string>([
  ["BWT-SERUM-01", "/products/lumina-serum.jpg"],
  ["GC-SERUM-01", "/products/lumina-serum.jpg"],
  ["BWT-KIT-01", "/products/student-essentials-kit.jpg"],
  ["GC-KIT-01", "/products/student-essentials-kit.jpg"],
  ["BWT-SHMP-01", "/products/hydrating-shampoo-mask.jpg"],
  ["BWT-COND-01", "/products/hydrating-shampoo-mask.jpg"],
  ["BWT-GEL-01", "/products/builder-gel-kit.jpg"],
  ["BWT-POLISH-01", "/products/builder-gel-kit.jpg"],
  ["BWT-CLNS-01", "/products/facial-cleanser.jpg"],
  ["BWT-BRUSH-01", "/products/makeup-brush-set.jpg"],
]);

const LOCAL_PRODUCT_IMAGES_BY_NAME = new Map<string, string>([
  ["lumina renewal serum", "/products/lumina-serum.jpg"],
  ["student artistry essentials kit", "/products/student-essentials-kit.jpg"],
  ["glow student essentials kit", "/products/student-essentials-kit.jpg"],
  ["student essentials kit", "/products/student-essentials-kit.jpg"],
  [
    "hydrating botanical shampoo & mask duo",
    "/products/hydrating-shampoo-mask.jpg",
  ],
  ["hydrating shampoo 500ml", "/products/hydrating-shampoo-mask.jpg"],
  ["repair conditioner 500ml", "/products/hydrating-shampoo-mask.jpg"],
  ["sculpting builder gel & uv kit", "/products/builder-gel-kit.jpg"],
  ["builder gel kit", "/products/builder-gel-kit.jpg"],
  ["gel polish set (12)", "/products/builder-gel-kit.jpg"],
  ["gentle radiance facial cleanser", "/products/facial-cleanser.jpg"],
  ["gentle facial cleanser", "/products/facial-cleanser.jpg"],
  ["master precision makeup brush set", "/products/makeup-brush-set.jpg"],
  ["professional brush set", "/products/makeup-brush-set.jpg"],
]);

export async function resolveProductImageUrl(
  imageKey: string | null | undefined,
  product?: { sku?: string | null; name?: string | null }
): Promise<string | null> {
  const fallback =
    (product?.sku ? LOCAL_PRODUCT_IMAGES_BY_SKU.get(product.sku) : undefined) ??
    (product?.name
      ? LOCAL_PRODUCT_IMAGES_BY_NAME.get(product.name.toLowerCase())
      : undefined) ??
    null;

  const key = imageKey ?? fallback;
  if (!key) return null;

  if (
    key.startsWith("/") ||
    key.startsWith("http://") ||
    key.startsWith("https://")
  ) {
    return key;
  }
  try {
    const result = await storageGet(key);
    return result.url;
  } catch {
    return fallback;
  }
}

// Where product photos uploaded from the stock screen are stored. The storage proxy serves this
// prefix without a sign-in, because the store shows it to everyone.
export const PRODUCT_IMAGE_PREFIX = "media/product";

export function isProductImageKey(key: string): boolean {
  return /(^|\/)media\/product\//.test(key);
}
