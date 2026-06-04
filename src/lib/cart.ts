// Client-side shopping cart. State lives entirely in localStorage — there is no
// server/DB involvement. The shop confirms each order manually over LINE, so a
// client-side price snapshot is acceptable.
import { useSyncExternalStore } from "react";

export type CartItem = {
  id: number;
  brand: string;
  model: string;
  name: string;
  price: number;
  image: string;
  qty: number;
};

const KEY = "netdoi_cart";
const EVENT = "netdoi-cart-change";

// Bank transfer details shown at checkout. No PromptPay proxy exists for this
// account, so a scannable QR cannot be generated programmatically. Instead the
// shop exports the "QR รับเงิน" image from SCB Easy and drops it at
// web/public/scb-qr.png; if present it renders as the primary pay method, with
// the account number always shown as a copy-able fallback.
export const BANK = {
  bankName: "ไทยพาณิชย์ (SCB)",
  accountName: "หจก.เน็ตดอยเทคโนโลยี",
  accountNo: "6362534539",
  qrImage: "/scb-qr.png",
} as const;

function read(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Cached snapshot so useSyncExternalStore gets a stable reference between reads.
let cache: CartItem[] = read();

function write(items: CartItem[]) {
  cache = items;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEY, JSON.stringify(items));
    window.dispatchEvent(new Event(EVENT));
  }
}

export function addToCart(p: Omit<CartItem, "qty">, qty = 1) {
  const items = read();
  const existing = items.find((i) => i.id === p.id);
  if (existing) {
    existing.qty += qty;
    write([...items]);
  } else {
    write([...items, { ...p, qty }]);
  }
}

export function setQty(id: number, qty: number) {
  if (qty <= 0) return removeFromCart(id);
  write(read().map((i) => (i.id === id ? { ...i, qty } : i)));
}

export function removeFromCart(id: number) {
  write(read().filter((i) => i.id !== id));
}

export function clearCart() {
  write([]);
}

export function cartTotal(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.price * i.qty, 0);
}

export function cartCount(items: CartItem[]) {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

function subscribe(cb: () => void) {
  const handler = () => {
    cache = read();
    cb();
  };
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler); // sync across tabs
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

// Reactive cart hook for client components.
export function useCart(): CartItem[] {
  return useSyncExternalStore(
    subscribe,
    () => cache,
    () => [] as CartItem[]
  );
}
