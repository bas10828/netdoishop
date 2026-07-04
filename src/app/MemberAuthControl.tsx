"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { signOut } from "next-auth/react";

export default function MemberAuthControl() {
  const [name, setName] = useState<string | null>(null);
  const [source, setSource] = useState<"member" | "staff" | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/member-auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        setName(data?.name ?? null);
        setSource(data?.source ?? null);
      })
      .finally(() => setLoaded(true));
  }, []);

  function closeMenu() {
    setOpen(false);
    setShowLoginForm(false);
    setError("");
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/member-auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
        return;
      }
      setName(data.name);
      window.location.reload();
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSubmitting(false);
    }
  }

  async function logout() {
    await fetch("/api/member-auth/logout", { method: "POST" });
    window.location.reload();
  }

  if (!loaded) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-slate-600 px-3 py-2 font-medium text-slate-300 hover:bg-slate-800"
      >
        {name ? (
          <>
            {source === "staff" ? "👔" : "🔧"}
            <span className="hidden sm:inline"> {name}</span>
          </>
        ) : (
          <>
            👤<span className="hidden sm:inline"> บัญชี</span>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeMenu} />
          <div className="absolute right-0 top-full z-50 mt-2 w-56 rounded-md border border-slate-200 bg-white p-2 text-slate-900 shadow-lg">
            {source === "staff" ? (
              <>
                <Link
                  href="/catalog"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
                  onClick={closeMenu}
                >
                  👔 {name}
                </Link>
                <p className="px-3 pb-2 text-xs text-slate-500">
                  เห็นราคาช่างอัตโนมัติเพราะ login พนักงานอยู่
                </p>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-slate-100"
                >
                  🚪 ออกจากระบบพนักงาน
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/catalog"
                  className="block rounded-md px-3 py-2 text-sm font-medium hover:bg-slate-100"
                  onClick={closeMenu}
                >
                  👔 พนักงาน
                </Link>
                <div className="my-1 border-t border-slate-100" />
              </>
            )}

            {source === "staff" ? null : name ? (
              <>
                <div className="px-3 py-1 text-xs text-slate-400">สมาชิกช่าง</div>
                <div className="px-3 pb-2 text-sm font-medium">🔧 {name}</div>
                <button
                  onClick={logout}
                  className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-slate-100"
                >
                  🚪 ออกจากระบบ
                </button>
              </>
            ) : showLoginForm ? (
              <form onSubmit={login} className="space-y-2 p-1">
                {error && <p className="text-xs font-medium text-red-600">{error}</p>}
                <input
                  placeholder="Username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
                />
                <input
                  placeholder="รหัสผ่าน"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-sky-500"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-md bg-sky-600 py-1.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  {submitting ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
                </button>
              </form>
            ) : (
              <button
                onClick={() => setShowLoginForm(true)}
                className="block w-full rounded-md px-3 py-2 text-left text-sm font-medium hover:bg-slate-100"
              >
                🔧 เข้าสู่ระบบสมาชิกช่าง
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
