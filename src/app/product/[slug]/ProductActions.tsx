"use client";

import { useState } from "react";
import Link from "next/link";
import { addToCart, useCart, cartCount } from "@/lib/cart";
import ShareButton from "@/components/ShareButton";

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
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center rounded-md border border-slate-300">
        <button
          onClick={() => setQ(qty - 1)}
          className="h-11 w-11 text-xl font-bold text-slate-600 hover:bg-slate-100"
          aria-label="ลดจำนวน"
        >
          −
        </button>
        <input
          type="number"
          min={1}
          value={qty}
          onChange={(e) => setQ(Number(e.target.value))}
          className="h-11 w-12 border-x border-slate-300 text-center text-base outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          aria-label="จำนวน"
        />
        <button
          onClick={() => setQ(qty + 1)}
          className="h-11 w-11 text-xl font-bold text-slate-600 hover:bg-slate-100"
          aria-label="เพิ่มจำนวน"
        >
          +
        </button>
      </div>
      <button
        onClick={handleAdd}
        className={`h-11 flex-1 rounded-md px-6 text-base font-semibold text-white hover:brightness-110 ${
          added ? "bg-emerald-600" : "bg-amber-500"
        }`}
      >
        {added ? "✓ เพิ่มลงตะกร้าแล้ว" : "🛒 ใส่ตะกร้า"}
      </button>
      <Link
        href="/checkout"
        className="relative h-11 rounded-md border border-slate-300 px-4 py-2.5 font-medium text-slate-700 hover:bg-slate-100"
      >
        ดูตะกร้า
        {count > 0 && (
          <span className="absolute -right-2 -top-2 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-600 px-1 text-xs font-bold text-white">
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
  );
}
