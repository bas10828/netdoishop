"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ERROR_LABEL: Record<string, string> = {
  "invite invalid": "ลิงก์นี้ใช้ไปแล้วหรือหมดอายุ",
  "username taken": "ชื่อผู้ใช้นี้มีคนใช้แล้ว",
  "password too short": "รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร",
};

export default function StaffSignupForm({ token }: { token: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/users/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, username, password, name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(ERROR_LABEL[data.error] ?? "สมัครไม่สำเร็จ");
        return;
      }
      router.push("/login");
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls =
    "w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-sky-500";

  return (
    <form onSubmit={submit} className="space-y-3">
      {error && <p className="text-sm font-medium text-red-600">{error}</p>}
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">ชื่อที่แสดง</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} required className={inputCls} />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">รหัสผ่าน</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={6}
          required
          className={inputCls}
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
      >
        {submitting ? "กำลังสมัคร..." : "สมัครบัญชี"}
      </button>
    </form>
  );
}
