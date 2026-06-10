import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { publicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import { SITE_URL, SITE_NAME, productSlug, idFromSlug } from "@/lib/seo";
import ProductActions from "./ProductActions";
import ViewCounter from "./ViewCounter";

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
  status: true,
  viewCount: true,
} as const;

const baht = (n: number) => n.toLocaleString("th-TH");

// Resolve a slug to a public-safe product, or null. Applies the SAME gate as
// the home page (in stock + has a cost-derived range) so SOLD OUT / no-price
// items 404 instead of rendering an indexable page with an empty price.
async function getProduct(slug: string) {
  const id = idFromSlug(slug);
  if (id === null) return null;
  const r = await prisma.product.findUnique({
    where: { id },
    select: PUBLIC_SELECT,
  });
  if (!r) return null;
  if (r.status === "SOLD OUT" || r.onlineMin === null || r.onlineMax === null) {
    return null;
  }
  const price = publicPrice(r.id, r.onlineMin, r.onlineMax, r.publicPriceOverride);
  if (price === null) return null;
  return {
    id: r.id,
    brand: r.brand,
    category: r.category,
    categoryLabel: r.categoryLabel,
    model: r.model,
    name: r.name,
    price, // the ONLY price that may reach the client / structured data
    image: deviceImage(r.model, r.brand),
    viewCount: r.viewCount,
  };
}

export async function generateStaticParams() {
  const rows = await prisma.product.findMany({
    where: {
      status: { not: "SOLD OUT" },
      onlineMin: { not: null },
      onlineMax: { not: null },
    },
    select: { id: true, brand: true, model: true },
  });
  return rows.map((r) => ({ slug: productSlug(r) }));
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
  const description = `${p.brand} ${p.model} ${p.name} ราคา ฿${baht(p.price)} | NETDOI อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด ส่งทั่วไทย ติดตั้งแม่สาย เชียงราย`;

  return {
    title,
    description,
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
    description: p.name,
    sku: p.model,
    mpn: p.model,
    category: p.categoryLabel,
    brand: { "@type": "Brand", name: p.brand },
    image: `${SITE_URL}${p.image}`,
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "THB",
      price: p.price,
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: SITE_NAME },
    },
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
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 p-3 sm:p-4">
          <Link href="/" className="flex items-center gap-2 sm:gap-3" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NETDOI"
              className="h-9 w-auto rounded bg-white p-1 sm:h-12"
            />
            <span className="text-lg font-bold tracking-wide sm:text-2xl">NETDOI</span>
          </Link>
          <Link
            href="/"
            className="rounded-md border border-slate-600 px-3 py-2 text-sm text-slate-300 hover:bg-slate-800"
          >
            ← สินค้าทั้งหมด
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4">
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
          {/* image */}
          <div className="flex h-72 items-center justify-center rounded bg-slate-50 p-4 sm:h-96">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.image}
              alt={`${p.brand} ${p.model} ${p.name}`}
              className="max-h-full max-w-full object-contain"
            />
          </div>

          {/* info */}
          <div className="flex flex-col">
            <span className="mb-2 inline-block w-fit rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
              {p.categoryLabel}
            </span>
            <div className="text-sm font-semibold text-sky-700">{p.brand}</div>
            <h1 className="text-2xl font-bold">{p.model}</h1>
            <p className="mt-2 text-slate-600">{p.name}</p>

            <div className="mt-2">
              <ViewCounter productId={p.id} initial={p.viewCount} />
            </div>

            <div className="my-5 text-3xl font-bold text-emerald-600">
              ฿{baht(p.price)}
            </div>

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
      </main>
    </div>
  );
}
