import type { Metadata } from "next";
import "./globals.css";
import { SITE_URL, SITE_NAME, localBusinessJsonLd } from "@/lib/seo";

const DESCRIPTION =
  "NETDOI Technology — ร้านอุปกรณ์เน็ตเวิร์กและกล้องวงจรปิดครบวงจร Router, Switch, Access Point, NVR ราคาส่ง ส่งทั่วไทย พร้อมบริการติดตั้งโซนแม่สาย จ.เชียงราย";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "NETDOI — อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด ราคาส่ง ส่งทั่วไทย",
    template: "%s | NETDOI",
  },
  description: DESCRIPTION,
  keywords: [
    "อุปกรณ์เน็ตเวิร์ก",
    "กล้องวงจรปิด",
    "Router",
    "Access Point",
    "Switch",
    "NVR",
    "ราคาส่ง",
    "ติดตั้งกล้องวงจรปิด แม่สาย",
    "ติดตั้งเน็ตเวิร์ก เชียงราย",
    "NETDOI",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: "NETDOI — อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด ราคาส่ง ส่งทั่วไทย",
    description: DESCRIPTION,
    images: [{ url: "/logo.png", width: 512, height: 512, alt: "NETDOI" }],
  },
  twitter: {
    card: "summary",
    title: "NETDOI — อุปกรณ์เน็ตเวิร์ก & กล้องวงจรปิด",
    description: DESCRIPTION,
    images: ["/logo.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large" },
  },
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="bg-slate-100 text-slate-900 antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(localBusinessJsonLd()),
          }}
        />
        {children}
      </body>
    </html>
  );
}
