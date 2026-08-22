import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { deviceImage, deviceImages } from "@/lib/deviceImage";
import { productDoc } from "@/data/descriptions";
import { SITE_URL, SITE_NAME, productSlug, idFromSlug } from "@/lib/seo";
import ProductActions from "./ProductActions";
import ViewCounter from "./ViewCounter";
import Gallery from "./Gallery";
import MemberPriceLine from "./MemberPriceLine";
import MemberAuthControl from "../../MemberAuthControl";

// ISR: detail pages are cached and refreshed at most hourly. A staff price
// edit (publicPriceOverride) also revalidates this path on demand via the
// PATCH /api/products/[id] route, so edits show up without waiting the window.
export const revalidate = 3600;

// PUBLIC select — never pull priceMember. Mirrors the home page exactly.
const PUBLIC_SELECT = {
  id: true,
  brand: true,
  category: true,
  categoryLabel: true,
  model: true,
  name: true,
  onlineMin: true,
  onlineMax: true,
  publicPriceOverride: true,
  publicPriceSupplier: true,
  supplierCosts: true,
  status: true,
  viewCount: true,
} as const;

const baht = (n: number) => n.toLocaleString("th-TH");

// Resolve a slug to a public-safe product, or null. "hidden" 404s (staff-only,
// never a public page); SOLD OUT still renders — badge, no price/cart.
async function getProduct(slug: string) {
  const id = idFromSlug(slug);
  if (id === null) return null;
  const r = await prisma.product.findUnique({
    where: { id },
    select: PUBLIC_SELECT,
  });
  if (!r) return null;
  if (r.status === "hidden") return null;
  const soldOut = r.status === "SOLD OUT";
  // price is null for "coming soon" items (no cost quote yet) and for SOLD
  // OUT items (never show a price for something you can't sell) — render
  // the page anyway, just without a price / add-to-cart control.
  const price = soldOut
    ? null
    : resolvePublicPrice({
        ...r,
        supplierCosts: r.supplierCosts as Record<string, number> | null,
      });
  return {
    id: r.id,
    brand: r.brand,
    category: r.category,
    categoryLabel: r.categoryLabel,
    model: r.model,
    name: r.name,
    price, // the ONLY price that may reach the client / structured data
    soldOut,
    image: deviceImage(r.model, r.brand),
    images: deviceImages(r.model, r.brand),
    viewCount: r.viewCount,
    doc: productDoc(r.brand, r.model),
  };
}

export async function generateStaticParams() {
  try {
    const rows = await prisma.product.findMany({
      where: { status: { not: "hidden" } },
      select: { id: true, brand: true, model: true },
    });
    return rows.map((r) => ({ slug: productSlug(r) }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const p = await getProduct(params.slug);
  if (!p) return { title: "ไม่พบสินค้า", robots: { index: false, follow: true } };

  const canonical = `/product/${productSlug(p)}`;
  const title = `${p.brand} ${p.model} — ${p.name}`;
  const priceText =
    p.price !== null ? `ราคา ฿${baht(p.price)}` : p.soldOut ? "สินค้าหมด (SOLD OUT)" : "เร็วๆ นี้ (Coming Soon)";
  const description = `${p.brand} ${p.model} ${p.name} ${priceText} | NETDOI อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด ส่งทั่วไทย ติดตั้งแม่สาย เชียงราย`;

  return {
    title,
    description,
    // coming-soon pages (no price yet) aren't in the sitemap either — keep
    // them out of the index until there's a real price to show.
    ...(p.price === null && { robots: { index: false, follow: true } }),
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "th_TH",
      url: `${SITE_URL}${canonical}`,
      siteName: SITE_NAME,
      title,
      description,
      images: [{ url: p.image, alt: `${p.brand} ${p.model}` }],
    },
    twitter: { card: "summary", title, description, images: [p.image] },
  };
}

export default async function ProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const p = await getProduct(params.slug);
  if (!p) notFound();

  const canonicalUrl = `${SITE_URL}/product/${productSlug(p)}`;

  // Product + Offer structured data. offers.price is publicPrice ONLY — the
  // cost price and the min/max range are never emitted (that would leak margin).
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${p.brand} ${p.model}`,
    description: p.doc ? `${p.name}. ${p.doc.body.replace(/\n+/g, " ")}` : p.name,
    sku: p.model,
    mpn: p.model,
    category: p.categoryLabel,
    brand: { "@type": "Brand", name: p.brand },
    image: p.images.map((i) => `${SITE_URL}${i}`),
    // "coming soon" items have no price yet — omit offers rather than
    // emit a fake ฿0 price into structured data.
    ...(p.price !== null && {
      offers: {
        "@type": "Offer",
        url: canonicalUrl,
        priceCurrency: "THB",
        price: p.price,
        availability: "https://schema.org/InStock",
        seller: { "@type": "Organization", name: SITE_NAME },
      },
    }),
  };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "หน้าแรก",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: `${p.brand} ${p.model}`,
      },
    ],
  };

  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      {/* header */}
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex items-center justify-between gap-2 p-3 sm:p-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NETDOI"
              className="h-9 w-auto rounded bg-white p-1 sm:h-12"
            />
            <span className="text-lg font-bold tracking-wide sm:text-2xl">NETDOI</span>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/"
              className="rounded-md border border-slate-600 px-3 py-2 text-slate-300 hover:bg-slate-800"
            >
              ← สินค้าทั้งหมด
            </Link>
            <MemberAuthControl />
          </div>
        </div>
      </header>

      <main className="mx-auto p-4">
        {/* breadcrumb */}
        <nav className="mb-4 text-sm text-slate-500" aria-label="breadcrumb">
          <Link href="/" className="hover:text-slate-800">
            หน้าแรก
          </Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700">
            {p.brand} {p.model}
          </span>
        </nav>

        <div className="grid gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6">
          {/* image gallery */}
          <Gallery images={p.images} alt={`${p.brand} ${p.model} ${p.name}`} />

          {/* info */}
          <div className="flex flex-col">
            <span className="mb-2 inline-block w-fit rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {p.categoryLabel}
            </span>
            <div className="text-sm font-semibold text-sky-700">{p.brand}</div>
            <h1 className="text-2xl font-bold">{p.model}</h1>
            <p className="mt-2 text-slate-600">{p.name}</p>
            {p.doc && (
              <p className="mt-2 text-sm font-medium text-slate-700">
                {p.doc.tagline}
              </p>
            )}

            <div className="mt-2">
              <ViewCounter productId={p.id} initial={p.viewCount} />
            </div>

            {p.price !== null ? (
              <>
                <div className="my-5 text-3xl font-bold text-emerald-600">
                  ฿{baht(p.price)}
                </div>
                <MemberPriceLine productId={p.id} />

                <ProductActions
                  product={{
                    id: p.id,
                    brand: p.brand,
                    model: p.model,
                    name: p.name,
                    price: p.price,
                    image: p.image,
                  }}
                  shareUrl={canonicalUrl}
                />
              </>
            ) : p.soldOut ? (
              <div className="my-5 flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-slate-200 px-3 py-1.5 text-lg font-bold text-slate-600">
                  ❌ สินค้าหมด (SOLD OUT)
                </span>
              </div>
            ) : (
              <div className="my-5 flex flex-wrap items-center gap-3">
                <span className="rounded-md bg-amber-100 px-3 py-1.5 text-lg font-bold text-amber-700">
                  🔜 เร็วๆ นี้ (Coming Soon)
                </span>
                <a
                  href="https://line.me/R/ti/p/%40ndtech"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-[#06C755] px-4 py-2 font-medium text-white hover:brightness-110"
                >
                  💬 สอบถามราคาทาง LINE
                </a>
                <a
                  href="tel:052029550"
                  className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-white hover:brightness-110"
                >
                  📞 โทรสอบถาม
                </a>
              </div>
            )}

            <div className="mt-6 border-t border-slate-200 pt-4 text-sm text-slate-500">
              สอบถาม / สั่งซื้อ:{" "}
              <a href="tel:052029550" className="font-medium text-slate-800">
                📞 052029550
              </a>{" "}
              ·{" "}
              <a
                href="https://line.me/R/ti/p/%40ndtech"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#06C755]"
              >
                💬 LINE @ndtech
              </a>
              <p className="mt-2">
                NETDOI Technology · ส่งทั่วไทย · ติดตั้งโซนแม่สาย จ.เชียงราย
              </p>
            </div>
          </div>
        </div>

        {/* description + spec sheet (static content map; absent for products
            without sourced copy, so the section just doesn't render) */}
        {p.doc && (
          <section className="mt-6 grid gap-6 rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-2 sm:p-6">
            <div>
              <h2 className="mb-3 text-lg font-bold text-slate-800">
                รายละเอียดสินค้า
              </h2>
              {p.doc.body.split("\n\n").map((para, i) => (
                <p key={i} className="mb-3 text-sm leading-relaxed text-slate-600">
                  {para}
                </p>
              ))}
            </div>
            <div>
              <h2 className="mb-3 text-lg font-bold text-slate-800">
                สเปคสินค้า
              </h2>
              <ul className="space-y-2">
                {p.doc.specs.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-slate-700">
                    <span className="mt-0.5 text-emerald-600">✓</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
