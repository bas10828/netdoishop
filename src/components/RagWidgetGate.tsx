"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import RagAssistant from "@/components/RagAssistant";

// Storefront-wide mount (root layout) for the "พี่เน็ตดอย" chat widget,
// shown only to someone already logged in (staff OR สมาชิกช่าง member) —
// same two-way check as MemberAuthControl's /api/member-auth/me, so an
// anonymous visitor never triggers a paid Claude API call. /catalog renders
// its own RagAssistant instance directly (CatalogClient.tsx) with lift
// coordination against its bulk-action bar, so this gate skips that route
// to avoid mounting a second, overlapping widget there.
export default function RagWidgetGate() {
  const pathname = usePathname();
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setLoggedIn(!!data?.name);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (pathname?.startsWith("/catalog") || !loggedIn) return null;
  return <RagAssistant />;
}
