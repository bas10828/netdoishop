import Link from "next/link";
import { FB_URL, LINE_ID, LINE_URL, PHONE } from "@/lib/contact";
import { ChatIcon, FacebookIcon, PhoneIcon } from "./icons";

export default function StoreFooter() {
  return (
    <footer className="mt-16 bg-brand-950 text-slate-300">
      <div className="mx-auto grid max-w-[1400px] gap-8 px-4 py-10 sm:grid-cols-3 sm:px-6">
        <div>
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="NETDOI" className="h-10 w-auto rounded-md bg-white p-1" />
            <div className="leading-tight">
              <div className="font-bold tracking-wide text-white">NETDOI TECHNOLOGY</div>
              <div className="text-xs text-slate-400">อุปกรณ์ Network · กล้องวงจรปิด · IT</div>
            </div>
          </div>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            อุปกรณ์เน็ตเวิร์กและกล้องวงจรปิดครบวงจร ส่งทั่วไทย พร้อมบริการติดตั้งโซนแม่สาย จ.เชียงราย
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">เมนู</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li><Link href="/" className="hover:text-white">สินค้าทั้งหมด</Link></li>
            <li><Link href="/camera-set" className="hover:text-white">จัดชุดกล้องวงจรปิด</Link></li>
            <li><Link href="/calculator" className="hover:text-white">คำนวณพื้นที่เก็บ CCTV</Link></li>
            <li><Link href="/checkout" className="hover:text-white">ตะกร้าสินค้า</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-white">ติดต่อสั่งซื้อ</h3>
          <ul className="mt-3 space-y-2.5 text-sm">
            <li>
              <a href={`tel:${PHONE}`} className="flex items-center gap-2 hover:text-white">
                <PhoneIcon /> {PHONE}
              </a>
            </li>
            <li>
              <a href={LINE_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                <ChatIcon /> LINE {LINE_ID}
              </a>
            </li>
            <li>
              <a href={FB_URL} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-white">
                <FacebookIcon /> Facebook
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 py-4 text-center text-xs text-slate-500">
        © NETDOI Technology
      </div>
    </footer>
  );
}
