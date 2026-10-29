"use client";

import { useEffect, useState } from "react";
import { WrenchIcon } from "@/components/icons";

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
    <div className="-mt-2 mb-4 flex w-fit items-center gap-1.5 rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-700">
      <WrenchIcon /> ราคาช่าง ฿{baht(price)}
    </div>
  );
}
