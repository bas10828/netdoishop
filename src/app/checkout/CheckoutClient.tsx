"use client";

import { useState } from "react";
import Link from "next/link";
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
const LINE_ID = "@ndtech";

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

  if (count === 0) {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-2xl">🛒</p>
        <p className="text-lg text-slate-600">ตะกร้าว่าง</p>
        <Link
          href="/"
          className="rounded-md bg-slate-900 px-4 py-2 font-medium text-white hover:brightness-110"
        >
          เลือกซื้อสินค้า
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-slate-900 text-white">
        <div className="mx-auto flex items-center justify-between gap-3 p-4">
          <Link href="/" className="flex items-center gap-2" title="หน้าแรก">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="NETDOI"
              className="h-10 w-auto rounded bg-white p-1"
            />
            <span className="text-xl font-bold">NETDOI</span>
          </Link>
          <Link href="/" className="text-sm text-slate-300 hover:text-white">
            ← เลือกซื้อต่อ
          </Link>
        </div>
      </header>

      <main className="mx-auto space-y-6 p-4">
        {/* cart items */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-bold">รายการสั่งซื้อ</h2>
          <ul className="divide-y divide-slate-100">
            {cart.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={i.image}
                  alt={i.model}
                  className="h-16 w-16 shrink-0 rounded bg-slate-50 object-contain p-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-sky-700">
                        {i.brand}
                      </div>
                      <div className="font-bold leading-tight">{i.model}</div>
                      <div className="text-sm text-slate-500">
                        ฿{baht(i.price)} / ชิ้น
                      </div>
                    </div>
                    <button
                      onClick={() => removeFromCart(i.id)}
                      className="shrink-0 p-1 text-slate-400 hover:text-red-600"
                      title="ลบ"
                      aria-label="ลบ"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQty(i.id, i.qty - 1)}
                        className="h-9 w-9 rounded border border-slate-300 text-lg font-bold hover:bg-slate-100"
                      >
                        −
                      </button>
                      <span className="w-8 text-center font-medium">{i.qty}</span>
                      <button
                        onClick={() => setQty(i.id, i.qty + 1)}
                        className="h-9 w-9 rounded border border-slate-300 text-lg font-bold hover:bg-slate-100"
                      >
                        +
                      </button>
                    </div>
                    <div className="font-bold text-emerald-600">
                      ฿{baht(i.price * i.qty)}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
            <button
              onClick={clearCart}
              className="text-sm text-slate-400 hover:text-red-600"
            >
              ล้างตะกร้า
            </button>
            <div className="text-lg">
              รวม{" "}
              <span className="text-2xl font-bold text-emerald-600">
                ฿{baht(total)}
              </span>
            </div>
          </div>
        </section>

        {/* delivery address */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="text-lg font-bold">ที่อยู่จัดส่ง</h2>
          <p className="mb-3 text-sm text-slate-500">
            กรอกเลย หรือเว้นไว้แล้วแจ้งในแชตก็ได้
          </p>
          <div className="space-y-3">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ชื่อ-นามสกุล ผู้รับ"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
            />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="เบอร์โทร"
              inputMode="tel"
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
            />
            <textarea
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="ที่อยู่จัดส่ง (บ้านเลขที่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์)"
              rows={3}
              className="w-full rounded-md border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-slate-500"
            />
          </div>
        </section>

        {/* payment */}
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-lg font-bold">ชำระเงิน — โอนเข้าบัญชี</h2>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            {qrOk && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={BANK.qrImage}
                alt="QR พร้อมเพย์ NETDOI"
                onError={() => setQrOk(false)}
                className="h-48 w-48 rounded border border-slate-200 object-contain"
              />
            )}
            <div className="flex-1 space-y-1 text-sm">
              <div className="font-semibold">{BANK.bankName}</div>
              <div>ชื่อบัญชี: {BANK.accountName}</div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold tracking-wider">
                  {BANK.accountNo}
                </span>
                <button
                  onClick={copyAccount}
                  className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100"
                >
                  {copied ? "คัดลอกแล้ว ✓" : "คัดลอกเลขบัญชี"}
                </button>
              </div>
              <p className="pt-1 text-slate-500">
                ยอดโอน ฿{baht(total)} — สแกน QR หรือโอนตามเลขบัญชี
              </p>
            </div>
          </div>
        </section>

        {/* send to LINE */}
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <p className="mb-3 text-sm text-slate-700">
            กด “ส่งออเดอร์เข้า LINE” ออเดอร์+ที่อยู่+บัญชีโอนเงินจะถูกส่งให้เลย จากนั้น{" "}
            <b>แนบรูปสลิปการโอน</b> ในแชต {LINE_ID} เพื่อยืนยัน
          </p>
          {err && <p className="mb-2 text-sm font-medium text-red-600">{err}</p>}
          {/* desktop button — mobile uses the sticky bar below */}
          <button
            onClick={sendOrder}
            disabled={sending}
            className="hidden w-full rounded-md bg-[#06C755] px-4 py-3 text-lg font-bold text-white hover:brightness-110 disabled:opacity-60 sm:block"
          >
            {sending ? "กำลังส่ง…" : "💬 ส่งออเดอร์เข้า LINE"}
          </button>
        </section>

        {/* spacer so the sticky bar doesn't cover content on mobile */}
        <div className="h-24 sm:hidden" />
      </main>

      {/* sticky send bar — mobile only */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-emerald-600 bg-white p-3 shadow-lg sm:hidden">
        {err && (
          <p className="mb-2 text-center text-sm font-medium text-red-600">
            {err}
          </p>
        )}
        <button
          onClick={sendOrder}
          disabled={sending}
          className="flex w-full items-center justify-center gap-2 rounded-md bg-[#06C755] px-4 py-3 text-lg font-bold text-white hover:brightness-110 disabled:opacity-60"
        >
          {sending ? "กำลังส่ง…" : `💬 ส่งออเดอร์เข้า LINE · ฿${baht(total)}`}
        </button>
      </div>
    </div>
  );
}
