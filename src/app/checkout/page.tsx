import type { Metadata } from "next";
import CheckoutClient from "./CheckoutClient";

// Cart/checkout is a private, per-visitor page — keep it out of search results.
export const metadata: Metadata = {
  title: "ตะกร้าสินค้า | NETDOI",
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutClient />;
}
