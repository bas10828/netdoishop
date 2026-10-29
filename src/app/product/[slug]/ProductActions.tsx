"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart, useCart, cartCount } from "@/lib/cart";
import ShareButton from "@/components/ShareButton";
import { CartIcon, CheckIcon } from "@/components/icons";

// Public, cost-free product snapshot — same shape the cart stores.
type ActionProduct = {
  id: number;
  brand: string;
  model: string;
  name: string;
  price: number;
  image: string;
};

export default function ProductActions({
  product,
  shareUrl,
}: {
  product: ActionProduct;
  shareUrl: string;
}) {
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const count = cartCount(useCart());

  const setQ = (v: number) => setQty(Math.max(1, Math.floor(v) || 1));

  const handleAdd = () => {
    addToCart(product, qty);
    setAdded(true);
    setQty(1);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex items-center rounded-full border border-slate-200">
          <button
            onClick={() => setQ(qty - 1)}
            className="h-12 w-11 rounded-l-full text-xl text-slate-500 hover:bg-slate-50"
            aria-label="ลดจำนวน"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={qty}
            onChange={(e) => setQ(Number(e.target.value))}
            className="h-12 w-12 bg-transparent text-center text-base font-semibold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            aria-label="จำนวน"
          />
          <button
            onClick={() => setQ(qty + 1)}
            className="h-12 w-11 rounded-r-full text-xl text-slate-500 hover:bg-slate-50"
            aria-label="เพิ่มจำนวน"
          >
            +
          </button>
        </div>
        <button
          onClick={handleAdd}
          className={`flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-6 text-base font-semibold text-white transition ${
            added ? "bg-emerald-600" : "bg-brand-900 hover:bg-brand-800"
          }`}
        >
          {added ? (
            <>
              <CheckIcon /> เพิ่มลงตะกร้าแล้ว
            </>
          ) : (
            <>
              <CartIcon /> ใส่ตะกร้า
            </>
          )}
        </button>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/checkout"
          className="flex h-11 flex-1 items-center justify-center gap-2 rounded-full border border-slate-200 font-medium text-slate-700 transition hover:bg-slate-50"
        >
          ดูตะกร้า
          {count > 0 && (
            <span className="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-amber-400 px-1 text-xs font-bold text-brand-950">
              {count}
            </span>
          )}
        </Link>
        <ShareButton
          url={shareUrl}
          title={`${product.brand} ${product.model}`}
          text={`${product.brand} ${product.model} — ${product.name}`}
          size="md"
        />
      </div>
    </div>
  );
}
