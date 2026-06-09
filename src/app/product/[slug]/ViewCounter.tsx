"use client";

import { useEffect, useState } from "react";

// Displays the storefront view count and bumps it once per browser session.
// The server-rendered `initial` count is frozen by ISR (up to the revalidate
// window), so after firing the increment we show the fresh value the API
// returns instead of the stale prop.
export default function ViewCounter({
  productId,
  initial,
}: {
  productId: number;
  initial: number;
}) {
  const [count, setCount] = useState(initial);

  useEffect(() => {
    // count at most once per product per browser session (refreshes / back-nav
    // within the same tab shouldn't inflate the number).
    const key = `viewed:${productId}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");

    let cancelled = false;
    fetch(`/api/products/${productId}/view`, { method: "POST" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d && typeof d.viewCount === "number") {
          setCount(d.viewCount);
        }
      })
      .catch(() => {
        // a failed counter bump must never disrupt the page
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  return (
    <span className="inline-flex items-center gap-1 text-sm text-slate-400">
      👁 เข้าชม {count.toLocaleString("th-TH")} ครั้ง
    </span>
  );
}
