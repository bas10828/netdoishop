// Shared SEO constants. SITE_URL must have NO trailing slash.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3005"
).replace(/\/$/, "");

export const SITE_NAME = "NETDOI Technology";

// URL-safe slug from arbitrary text. Keeps a-z0-9 and Thai chars; everything
// else collapses to a single "-". (model strings carry "/", spaces, "()", ".").
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9฀-๿]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Product detail slug = decorative "brand-model" + the numeric id as the final
// segment. The id is the source of truth on lookup (idFromSlug); the prefix is
// for humans/SEO only, so any prefix resolves to the same product and the page's
// canonical points back at this exact form.
export function productSlug(p: {
  brand: string;
  model: string;
  id: number;
}): string {
  return `${slugify(`${p.brand}-${p.model}`)}-${p.id}`;
}

// Pull the product id back out of a slug (last "-" segment). Returns null for a
// malformed slug so callers can 404 instead of querying with NaN.
export function idFromSlug(slug: string): number | null {
  const last = slug.split("-").pop();
  const n = Number(last);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// Business contact / NAP — keep in sync with ShopClient.tsx footer.
export const BUSINESS = {
  name: SITE_NAME,
  phone: "052029550",
  lineId: "@ndtech",
  lineUrl: "https://line.me/R/ti/p/%40ndtech",
  facebook: "https://www.facebook.com/profile.php?id=100087740514812",
  // ติดตั้งโซนแม่สาย จ.เชียงราย — ขายส่งทั่วไทย
  addressLocality: "แม่สาย",
  addressRegion: "เชียงราย",
  postalCode: "57130",
  country: "TH",
} as const;

// LocalBusiness structured data injected site-wide via layout.
export function localBusinessJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Store",
    "@id": `${SITE_URL}/#store`,
    name: BUSINESS.name,
    url: SITE_URL,
    image: `${SITE_URL}/logo.png`,
    logo: `${SITE_URL}/logo.png`,
    telephone: BUSINESS.phone,
    priceRange: "฿฿",
    address: {
      "@type": "PostalAddress",
      addressLocality: BUSINESS.addressLocality,
      addressRegion: BUSINESS.addressRegion,
      postalCode: BUSINESS.postalCode,
      addressCountry: BUSINESS.country,
    },
    areaServed: { "@type": "Country", name: "Thailand" },
    sameAs: [BUSINESS.facebook, BUSINESS.lineUrl],
  };
}
