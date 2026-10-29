"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart, cartCount } from "@/lib/cart";
import { PHONE } from "@/lib/contact";
import MemberAuthControl from "@/app/MemberAuthControl";
import LineQrModal from "./LineQrModal";
import { CameraIcon, CartIcon, ChatIcon, DiskIcon, GridIcon, PhoneIcon } from "./icons";

export type StoreSection = "shop" | "camera-set" | "calculator" | "checkout" | "product";

const NAV: { key: StoreSection; href: string; label: string; Icon: typeof GridIcon }[] = [
  { key: "shop", href: "/", label: "สินค้าทั้งหมด", Icon: GridIcon },
  { key: "camera-set", href: "/camera-set", label: "จัดชุดกล้อง", Icon: CameraIcon },
  { key: "calculator", href: "/calculator", label: "คำนวณ HDD", Icon: DiskIcon },
];

// One header for every storefront page: brand, section nav, contact, cart,
// account. Owns its own LINE QR modal.
export default function StoreHeader({ active }: { active?: StoreSection }) {
  const [showLine, setShowLine] = useState(false);
  const count = cartCount(useCart());

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:gap-5 sm:px-6">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-2.5" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NETDOI" className="h-9 w-auto" />
            <div className="hidden leading-tight sm:block">
              <div className="text-[15px] font-bold tracking-wide text-brand-900">NETDOI</div>
              <div className="text-[11px] text-slate-500">Network · CCTV · IT</div>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map(({ key, href, label, Icon }) => (
              <Link
                key={key}
                href={href}
                className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition ${
                  active === key
                    ? "bg-brand-50 text-brand-900"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="text-base" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
            <a
              href={`tel:${PHONE}`}
              className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              aria-label={`โทร ${PHONE}`}
            >
              <PhoneIcon className="text-lg" />
              <span className="hidden lg:inline">{PHONE}</span>
            </a>
            <button
              onClick={() => setShowLine(true)}
              className="flex h-10 items-center gap-2 rounded-full px-3 text-sm font-medium text-[#06A84A] transition hover:bg-[#06C755]/10"
              aria-label="LINE"
            >
              <ChatIcon className="text-lg" />
              <span className="hidden lg:inline">LINE</span>
            </button>
            <Link
              href="/checkout"
              className="relative flex h-10 items-center gap-2 rounded-full bg-brand-900 px-3.5 text-sm font-semibold text-white transition hover:bg-brand-800"
              aria-label="ตะกร้า"
            >
              <CartIcon className="text-lg" />
              <span className="hidden sm:inline">ตะกร้า</span>
              {count > 0 && (
                <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-brand-950">
                  {count}
                </span>
              )}
            </Link>
            <MemberAuthControl />
          </div>
        </div>

        {/* section nav on small screens */}
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 md:hidden">
          {NAV.map(({ key, href, label, Icon }) => (
            <Link
              key={key}
              href={href}
              className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                active === key ? "bg-brand-900 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <Icon />
              {label}
            </Link>
          ))}
        </nav>
      </header>
      {showLine && <LineQrModal onClose={() => setShowLine(false)} />}
    </>
  );
}
