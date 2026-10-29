"use client";

import { useState } from "react";
import Link from "next/link";
import StoreHeader from "@/components/StoreHeader";
import StoreFooter from "@/components/StoreFooter";
import { CartIcon, ChatIcon } from "@/components/icons";
import { LINE_ID } from "@/lib/contact";
import {
  useCart,
  setQty,
  removeFromCart,
  clearCart,
  cartTotal,
  cartCount,
  BANK,
} from "@/lib/cart";

const baht = (n: number) => n.toLocaleString("th-TH");

export default function CheckoutClient() {
  const cart = useCart();
  const total = cartTotal(cart);
  const count = cartCount(cart);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrOk, setQrOk] = useState(true);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  const copyAccount = async () => {
    try {
      await navigator.clipboard.writeText(BANK.accountNo);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — number is shown on screen anyway */
    }
  };

  // Build the prefilled LINE OA message: items + total, then delivery + payment
  // details. Address/payment can be sorted out in chat, so any blank field is
  // sent as a "(แจ้งในแชต)" placeholder rather than blocking the send. The bank
  // account + amount are always included so the customer can transfer right away.
  // Lines kept compact to avoid URL/message truncation.
  const buildMessage = (orderId: number) => {
    const lines = cart.map(
      (i) => `• ${i.brand} ${i.model} ×${i.qty} ฿${baht(i.price * i.qty)}`
    );
    const fill = (v: string) => v.trim() || "(แจ้งในแชต)";
    return [
      `🛒 สั่งซื้อ NETDOI #${orderId}`,
      ...lines,
      `รวม ฿${baht(total)} (${count} ชิ้น)`,
      "",
      "📦 จัดส่ง",
      `ชื่อ: ${fill(name)}`,
      `โทร: ${fill(phone)}`,
      `ที่อยู่: ${fill(address)}`,
      "",
      "💳 ชำระเงิน — โอนเข้าบัญชี",
      `${BANK.bankName} ${BANK.accountNo}`,
      `ชื่อบัญชี ${BANK.accountName}`,
      `ยอด ฿${baht(total)}`,
      "",
      "โอนแล้วแนบรูปสลิป + แจ้งที่อยู่ในแชตนี้",
    ].join("\n");
  };

  // Persist the order to the DB first (server recomputes prices), then redirect
  // into the LINE chat with the prefilled message. Uses location.href, not
  // window.open: after the await the user gesture is spent and mobile browsers
  // block popups — a redirect to the LINE app still works. Cart is cleared only
  // after a successful save.
  const sendOrder = async () => {
    if (sending) return;
    setSending(true);
    setErr("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name.trim(),
          customerPhone: phone.trim(),
          address: address.trim(),
          items: cart.map((i) => ({ id: i.id, qty: i.qty })),
        }),
      });
      if (!res.ok) {
        setErr("บันทึกออเดอร์ไม่สำเร็จ ลองใหม่อีกครั้ง");
        setSending(false);
        return;
      }
      const { id } = (await res.json()) as { id: number };
      const url = `https://line.me/R/oaMessage/${LINE_ID}/?${encodeURIComponent(
        buildMessage(id)
      )}`;
      clearCart();
      window.location.href = url;
    } catch {
      setErr("เชื่อมต่อไม่ได้ ลองใหม่อีกครั้ง");
      setSending(false);
    }
  };

  const card = "rounded-3xl border border-slate-200/80 bg-white p-5 shadow-card sm:p-6";
  const input =
    "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-base outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100";

  if (count === 0) {
    return (
      <div className="min-h-screen bg-slate-50">
        <StoreHeader active="checkout" />
        <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-3xl text-brand-900">
            <CartIcon />
          </span>
          <p className="mt-5 text-xl font-semibold text-slate-900">ตะกร้ายังว่าง</p>
          <p className="mt-1 text-slate-500">เลือกสินค้าที่ต้องการ แล้วกลับมาสั่งซื้อที่นี่</p>
          <Link
            href="/"
            className="mt-6 rounded-full bg-brand-900 px-6 py-3 font-semibold text-white transition hover:bg-brand-800"
          >
            เลือกซื้อสินค้า
          </Link>
        </div>
        <StoreFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <StoreHeader active="checkout" />

      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">ตะกร้าสินค้า</h1>
            <p className="mt-1 text-slate-500">{count} ชิ้น · ยืนยันออเดอร์ทาง LINE {LINE_ID}</p>
          </div>
          <Link href="/" className="text-sm font-medium text-brand-700 hover:underline">
            ← เลือกซื้อต่อ
          </Link>
        </div>

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            {/* cart items */}
            <section className={card}>
              <h2 className="mb-2 text-lg font-bold text-slate-900">รายการสั่งซื้อ</h2>
              <ul className="divide-y divide-slate-100">
                {cart.map((i) => (
                  <li key={i.id} className="flex gap-4 py-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={i.image}
                      alt={i.model}
                      className="h-20 w-20 shrink-0 rounded-2xl border border-slate-100 bg-white object-contain p-1.5"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-brand-600">{i.brand}</div>
                          <div className="font-semibold leading-tight text-slate-900">{i.model}</div>
                          <div className="mt-0.5 text-sm text-slate-500">฿{baht(i.price)} / ชิ้น</div>
                        </div>
                        <button
                          onClick={() => removeFromCart(i.id)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                          title="ลบ"
                          aria-label="ลบ"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center rounded-full border border-slate-200">
                          <button
                            onClick={() => setQty(i.id, i.qty - 1)}
                            className="h-9 w-9 rounded-l-full text-lg text-slate-500 hover:bg-slate-50"
                            aria-label="ลดจำนวน"
                          >
                            −
                          </button>
                          <span className="w-8 text-center text-sm font-semibold">{i.qty}</span>
                          <button
                            onClick={() => setQty(i.id, i.qty + 1)}
                            className="h-9 w-9 rounded-r-full text-lg text-slate-500 hover:bg-slate-50"
                            aria-label="เพิ่มจำนวน"
                          >
                            +
                          </button>
                        </div>
                        <div className="font-bold text-slate-900">฿{baht(i.price * i.qty)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 border-t border-slate-100 pt-4">
                <button onClick={clearCart} className="text-sm text-slate-400 hover:text-rose-600">
                  ล้างตะกร้า
                </button>
              </div>
            </section>

            {/* delivery address */}
            <section className={card}>
              <h2 className="text-lg font-bold text-slate-900">ที่อยู่จัดส่ง</h2>
              <p className="mb-4 mt-0.5 text-sm text-slate-500">กรอกเลย หรือเว้นไว้แล้วแจ้งในแชตก็ได้</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="ชื่อ-นามสกุล ผู้รับ"
                  className={input}
                />
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="เบอร์โทร"
                  inputMode="tel"
                  className={input}
                />
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="ที่อยู่จัดส่ง (บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์)"
                  rows={3}
                  className={`${input} sm:col-span-2`}
                />
              </div>
            </section>
          </div>

          {/* summary + payment (sticky on desktop) */}
          <aside className="space-y-4 lg:sticky lg:top-24">
            <section className="overflow-hidden rounded-3xl bg-brand-900 text-white shadow-lift">
              <div className="p-6">
                <div className="text-sm text-slate-300">ยอดรวม {count} ชิ้น</div>
                <div className="text-4xl font-bold tracking-tight">฿{baht(total)}</div>
              </div>

              <div className="border-t border-white/10 bg-white p-5 text-slate-900">
                <h2 className="mb-3 font-semibold">ชำระเงิน — โอนเข้าบัญชี</h2>
                <div className="flex items-start gap-4">
                  {qrOk && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={BANK.qrImage}
                      alt="QR พร้อมเพย์ NETDOI"
                      onError={() => setQrOk(false)}
                      className="h-28 w-28 shrink-0 rounded-xl border border-slate-200 object-contain"
                    />
                  )}
                  <div className="min-w-0 space-y-0.5 text-sm">
                    <div className="font-semibold">{BANK.bankName}</div>
                    <div className="text-slate-500">{BANK.accountName}</div>
                    <div className="pt-1 text-lg font-bold tracking-wider">{BANK.accountNo}</div>
                    <button
                      onClick={copyAccount}
                      className="mt-1 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      {copied ? "คัดลอกแล้ว ✓" : "คัดลอกเลขบัญชี"}
                    </button>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  กด “ส่งออเดอร์เข้า LINE” ระบบจะส่งรายการ ที่อยู่ และบัญชีโอนให้ร้าน จากนั้น{" "}
                  <b>แนบรูปสลิป</b> ในแชต {LINE_ID} เพื่อยืนยัน
                </p>
                {err && <p className="mt-3 text-sm font-medium text-rose-600">{err}</p>}
                {/* desktop button — mobile uses the sticky bar below */}
                <button
                  onClick={sendOrder}
                  disabled={sending}
                  className="mt-4 hidden w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-105 disabled:opacity-60 sm:flex"
                >
                  {sending ? (
                    "กำลังส่ง…"
                  ) : (
                    <>
                      <ChatIcon /> ส่งออเดอร์เข้า LINE
                    </>
                  )}
                </button>
              </div>
            </section>
          </aside>
        </div>

        {/* spacer so the sticky bar doesn't cover content on mobile */}
        <div className="h-24 sm:hidden" />
      </main>

      <StoreFooter />

      {/* sticky send bar — mobile only */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 shadow-lift backdrop-blur-md sm:hidden">
        {err && <p className="mb-2 text-center text-sm font-medium text-rose-600">{err}</p>}
        <button
          onClick={sendOrder}
          disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-[#06C755] px-4 py-3.5 text-base font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
        >
          {sending ? (
            "กำลังส่ง…"
          ) : (
            <>
              <ChatIcon /> ส่งออเดอร์เข้า LINE · ฿{baht(total)}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
