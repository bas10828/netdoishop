import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NETDOI — ตารางราคาสินค้า",
  description: "NETDOI Technology — ตารางราคาสินค้า network: ราคาต้นทุน / ราคาออนไลน์",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
