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
  // staff chatting from anywhere (not just /catalog) still needs a way to
  // turn what the assistant just recommended into a real ใบเสนอราคา — a
  // customer-facing "ใส่ตะกร้า" button alone doesn't cover that ask. Only
  // ever true for a staff NextAuth session (never สมาชิกช่าง), same
  // distinction MemberAuthControl already draws from this same endpoint.
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/member-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) {
          setLoggedIn(!!data?.name);
          setIsStaff(data?.source === "staff");
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (pathname?.startsWith("/catalog") || !loggedIn) return null;

  // Hands the matched ids off to /catalog via a URL param instead of
  // duplicating the proposal-summary logic here — CatalogClient reads
  // `proposalIds` on mount and opens the same summary modal the /catalog
  // widget's own button does. Full navigation (not a router push) since
  // we're leaving the current page entirely.
  const onAddToProposal = isStaff
    ? (ids: number[]) => {
        window.location.href = `/catalog?proposalIds=${ids.join(",")}`;
      }
    : undefined;

  return <RagAssistant onAddToProposal={onAddToProposal} />;
}
