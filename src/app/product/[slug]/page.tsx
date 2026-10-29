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
import StoreHeader from "@/components/StoreHeader";
import StoreFooter from "@/components/StoreFooter";
import { LINE_ID, LINE_URL, PHONE } from "@/lib/contact";
import {
  ChatIcon,
  CheckIcon,
  ChevronRightIcon,
  PhoneIcon,
  TruckIcon,
  WrenchIcon,
} from "@/components/icons";

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

export async function generateMetadata(
  props: {
    params: Promise<{ slug: string }>;
  }
): Promise<Metadata> {
  const params = await props.params;
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

export default async function ProductPage(
  props: {
    params: Promise<{ slug: string }>;
  }
) {
  const params = await props.params;
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
    <div className="min-h-screen bg-slate-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbLd) }}
      />

      <StoreHeader active="product" />

      <main className="mx-auto max-w-[1200px] px-4 py-6 sm:px-6 sm:py-8">
        {/* breadcrumb */}
        <nav className="mb-5 flex items-center gap-1.5 text-sm text-slate-500" aria-label="breadcrumb">
          <Link href="/" className="hover:text-brand-900">
            หน้าแรก
          </Link>
          <ChevronRightIcon className="text-slate-300" />
          <span className="truncate text-slate-700">
            {p.brand} {p.model}
          </span>
        </nav>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr] lg:gap-10">
          {/* image gallery */}
          <div className="rounded-3xl border border-slate-200/80 bg-white p-4 shadow-card sm:p-6">
            <Gallery images={p.images} alt={`${p.brand} ${p.model} ${p.name}`} />
          </div>

          {/* info */}
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-semibold uppercase tracking-wide text-brand-600">{p.brand}</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-500">{p.categoryLabel}</span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">{p.model}</h1>
            <p className="mt-3 text-lg leading-relaxed text-slate-600">{p.name}</p>
            {p.doc && <p className="mt-2 font-medium text-slate-800">{p.doc.tagline}</p>}

            <div className="mt-3">
              <ViewCounter productId={p.id} initial={p.viewCount} />
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6">
              {p.price !== null ? (
                <>
                  <div className="text-sm text-slate-500">ราคา</div>
                  <div className="mb-4 mt-1 text-4xl font-bold tracking-tight text-slate-900">
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
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-slate-100 px-4 py-2 font-semibold text-slate-600">
                    สินค้าหมด (SOLD OUT)
                  </span>
                </div>
              ) : (
                <>
                  <span className="inline-block rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800">
                    เร็วๆ นี้ (Coming Soon)
                  </span>
                  <p className="mt-3 text-sm text-slate-500">สอบถามราคาและวันที่สินค้าเข้าได้ทันที</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a
                      href={LINE_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#06C755] px-5 font-semibold text-white transition hover:brightness-105"
                    >
                      <ChatIcon /> สอบถามราคาทาง LINE
                    </a>
                    <a
                      href={`tel:${PHONE}`}
                      className="flex h-12 items-center justify-center gap-2 rounded-full border border-slate-200 px-5 font-semibold text-slate-700 transition hover:bg-slate-50"
                    >
                      <PhoneIcon /> โทรสอบถาม
                    </a>
                  </div>
                </>
              )}
            </div>

            <ul className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
              <li className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-card">
                <TruckIcon className="text-lg text-brand-600" /> ส่งทั่วไทย
              </li>
              <li className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-card">
                <WrenchIcon className="text-lg text-brand-600" /> ติดตั้งแม่สาย–เชียงราย
              </li>
              <li className="flex items-center gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-card">
                <ChatIcon className="text-lg text-brand-600" /> LINE {LINE_ID}
              </li>
            </ul>

            <p className="mt-4 text-sm text-slate-500">
              สอบถาม / สั่งซื้อ:{" "}
              <a href={`tel:${PHONE}`} className="font-medium text-slate-800 hover:text-brand-900">
                {PHONE}
              </a>{" "}
              ·{" "}
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-[#06A84A]">
                LINE {LINE_ID}
              </a>
            </p>
          </div>
        </div>

        {/* description + spec sheet (static content map; absent for products
            without sourced copy, so the section just doesn't render) */}
        {p.doc && (
          <section className="mt-8 grid gap-6 lg:grid-cols-2">
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card">
              <h2 className="mb-4 text-xl font-bold text-slate-900">รายละเอียดสินค้า</h2>
              {p.doc.body.split("\n\n").map((para, i) => (
                <p key={i} className="mb-3 leading-relaxed text-slate-600">
                  {para}
                </p>
              ))}
            </div>
            <div className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-card">
              <h2 className="mb-4 text-xl font-bold text-slate-900">สเปคสินค้า</h2>
              <ul className="divide-y divide-slate-100">
                {p.doc.specs.map((s, i) => (
                  <li key={i} className="flex gap-3 py-2.5 text-slate-700">
                    <CheckIcon className="mt-1 shrink-0 text-emerald-600" />
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}
      </main>

      <StoreFooter />
    </div>
  );
}
