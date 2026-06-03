"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get("callbackUrl") || "/catalog";
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      username,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow"
      >
        <Link href="/" className="flex flex-col items-center text-center" title="หน้าแรก">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="mb-2 h-20 w-auto" />
          <h1 className="text-xl font-bold tracking-wide">NETDOI</h1>
          <p className="text-sm text-slate-500">เข้าสู่ระบบเพื่อดูราคา</p>
        </Link>
        <div className="space-y-1">
          <label className="text-sm font-medium">ชื่อผู้ใช้</label>
          <input
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            required
          />
        </div>
        <div className="space-y-1">
          <label className="text-sm font-medium">รหัสผ่าน</label>
          <input
            type="password"
            className="w-full rounded-md border border-slate-300 px-3 py-2 outline-none focus:border-slate-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-slate-900 py-2 font-medium text-white hover:bg-slate-700 disabled:opacity-50"
        >
          {loading ? "กำลังเข้า..." : "เข้าสู่ระบบ"}
        </button>
        <Link
          href="/"
          className="block text-center text-sm text-slate-500 hover:text-slate-800"
        >
          🏠 กลับหน้าร้าน
        </Link>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
