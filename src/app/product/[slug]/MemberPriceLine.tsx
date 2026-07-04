"use client";

import { useEffect, useState } from "react";

const baht = (n: number) => n.toLocaleString("th-TH");

// Client-only fetch so this page's ISR-cached HTML never contains
// member-only cost pricing — only the visiting browser learns it, at
// runtime, regardless of the cache.
export default function MemberPriceLine({ productId }: { productId: number }) {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((me) => {
        if (!me || cancelled) return null;
        return fetch(`/api/member-auth/prices?ids=${productId}`).then((r) =>
          r.ok ? r.json() : null
        );
      })
      .then((data) => {
        if (cancelled) return;
        const v = data?.prices?.[productId];
        setPrice(typeof v === "number" ? v : null);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  if (price === null) return null;
  return (
    <div className="-mt-3 mb-3 text-sm font-medium text-sky-700">
      🔧 ราคาช่าง: ฿{baht(price)}
    </div>
  );
}
