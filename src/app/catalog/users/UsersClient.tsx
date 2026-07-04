"use client";

import { useState } from "react";
import Link from "next/link";

export type UserRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  createdAt: string;
};

export type MemberRow = {
  id: string;
  username: string;
  fullName: string;
  phone: string;
  shopName: string;
  createdAt: string;
};

export type InviteRow = {
  token: string;
  intendedRole: string;
  used: boolean;
  expiresAt: string;
  createdAt: string;
};

const ROLES = ["admin", "staff"] as const;
const ROLE_LABEL: Record<string, string> = {
  admin: "แอดมิน",
  staff: "พนักงาน",
  member: "ช่าง",
};

function inviteStatus(i: InviteRow): { label: string; cls: string; pending: boolean } {
  if (i.used) return { label: "ใช้แล้ว", cls: "bg-slate-200 text-slate-600", pending: false };
  if (new Date(i.expiresAt).getTime() < Date.now()) {
    return { label: "หมดอายุ", cls: "bg-red-100 text-red-700", pending: false };
  }
  return { label: "รอสมัคร", cls: "bg-amber-100 text-amber-800", pending: true };
}

export default function UsersClient({
  users,
  members,
  invites,
  currentUserId,
}: {
  users: UserRow[];
  members: MemberRow[];
  invites: InviteRow[];
  currentUserId: string;
}) {
  const [items, setItems] = useState<UserRow[]>(users);
  const [memberItems, setMemberItems] = useState<MemberRow[]>(members);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState<Record<string, string>>({});

  const [inviteList, setInviteList] = useState<InviteRow[]>(invites);
  const [inviteRole, setInviteRole] = useState<string>("staff");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [busyToken, setBusyToken] = useState<string | null>(null);

  async function createInvite() {
    setError("");
    setCreatingInvite(true);
    try {
      const res = await fetch("/api/account-invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("สร้างลิงก์ไม่สำเร็จ");
        return;
      }
      setInviteList((prev) => [
        {
          token: data.token,
          intendedRole: inviteRole,
          used: false,
          expiresAt: data.expiresAt,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function deleteInvite(token: string) {
    if (!window.confirm("ลบลิงก์นี้?")) return;
    setBusyToken(token);
    setError("");
    try {
      const res = await fetch(`/api/account-invites/${token}`, { method: "DELETE" });
      if (!res.ok) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      setInviteList((prev) => prev.filter((i) => i.token !== token));
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBusyToken(null);
    }
  }

  async function patchUser(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError("อัปเดตไม่สำเร็จ");
        return;
      }
      setItems((prev) => prev.map((u) => (u.id === id ? { ...u, ...data } : u)));
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteUser(id: string) {
    if (!window.confirm("ลบผู้ใช้นี้?")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "has sales reports" ? "ลบไม่ได้ — ยังมีรายงานการขายของคนนี้อยู่" : "ลบไม่สำเร็จ");
        return;
      }
      setItems((prev) => prev.filter((u) => u.id !== id));
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteMember(id: string) {
    if (!window.confirm("ลบสมาชิกช่างคนนี้?")) return;
    setBusyId(id);
    setError("");
    try {
      const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
      if (!res.ok) {
        setError("ลบไม่สำเร็จ");
        return;
      }
      setMemberItems((prev) => prev.filter((m) => m.id !== id));
    } catch {
      setError("เชื่อมต่อไม่ได้");
    } finally {
      setBusyId(null);
    }
  }

  const inputCls =
    "rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-sky-500";

  return (
    <main className="mx-auto max-w-4xl p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">จัดการผู้ใช้</h1>
        </div>
        <Link
          href="/catalog"
          className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-200"
        >
          ← กลับแคตตาล็อก
        </Link>
      </header>

      {error && <p className="mb-2 text-sm font-medium text-red-600">{error}</p>}

      {/* invite generator — same mechanism for admin/staff/ช่าง */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wide">
          สร้างลิงก์สมัครบัญชี
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={inviteRole}
            onChange={(e) => setInviteRole(e.target.value)}
            className={inputCls}
          >
            <option value="admin">แอดมิน</option>
            <option value="staff">พนักงาน</option>
            <option value="member">ช่าง</option>
          </select>
          <button
            onClick={createInvite}
            disabled={creatingInvite}
            className="rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            + สร้างลิงก์สมัคร
          </button>
        </div>
      </div>

      {/* invite list */}
      <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wide">
          ลิงก์สมัคร ({inviteList.length})
        </h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {inviteList.map((i) => {
            const st = inviteStatus(i);
            const fullUrl =
              typeof window !== "undefined" ? `${window.location.origin}/signup/${i.token}` : "";
            return (
              <li key={i.token} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      {ROLE_LABEL[i.intendedRole] ?? i.intendedRole}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                      {st.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      หมดอายุ {new Date(i.expiresAt).toLocaleDateString("th-TH")}
                    </span>
                  </div>
                  <button
                    onClick={() => deleteInvite(i.token)}
                    disabled={busyToken === i.token}
                    className="rounded-md border border-red-300 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    🗑️ ลบ
                  </button>
                </div>
                {st.pending && (
                  <input
                    readOnly
                    value={fullUrl}
                    onFocus={(e) => e.target.select()}
                    className="w-full rounded border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-xs"
                  />
                )}
              </li>
            );
          })}
          {inviteList.length === 0 && (
            <li className="py-4 text-center text-slate-400">ยังไม่มีลิงก์</li>
          )}
        </ul>
      </div>

      {/* staff/admin accounts */}
      <div className="mb-4">
        <h2 className="mb-2 text-sm font-bold text-slate-500 uppercase tracking-wide">
          พนักงาน/แอดมิน ({items.length})
        </h2>
        <div className="space-y-3">
          {items.map((u) => (
            <div
              key={u.id}
              className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">{u.name || u.username}</span>
                  <span className="ml-2 text-sm text-slate-400">@{u.username}</span>
                </div>
                <span className="text-xs text-slate-400">
                  {new Date(u.createdAt).toLocaleDateString("th-TH")}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  defaultValue={u.name}
                  onBlur={(e) => {
                    if (e.target.value !== u.name) patchUser(u.id, { name: e.target.value });
                  }}
                  placeholder="ชื่อที่แสดง"
                  className={`${inputCls} w-40`}
                />
                <select
                  value={u.role}
                  disabled={busyId === u.id}
                  onChange={(e) => patchUser(u.id, { role: e.target.value })}
                  className={inputCls}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="รหัสผ่านใหม่"
                  type="password"
                  value={resetPw[u.id] ?? ""}
                  onChange={(e) => setResetPw((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  className={`${inputCls} w-32`}
                />
                <button
                  onClick={() => {
                    const pw = resetPw[u.id];
                    if (pw) {
                      patchUser(u.id, { password: pw });
                      setResetPw((prev) => ({ ...prev, [u.id]: "" }));
                    }
                  }}
                  disabled={busyId === u.id || !resetPw[u.id]}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-50"
                >
                  ตั้งรหัสผ่านใหม่
                </button>
                {u.id !== currentUserId && (
                  <button
                    onClick={() => deleteUser(u.id)}
                    disabled={busyId === u.id}
                    className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    🗑️ ลบ
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ช่าง members */}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-sm font-bold text-slate-500 uppercase tracking-wide">
          สมาชิกช่าง ({memberItems.length})
        </h2>
        <ul className="divide-y divide-slate-100 text-sm">
          {memberItems.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <div className="font-medium">
                  {m.fullName} <span className="text-slate-400">@{m.username}</span>
                </div>
                <div className="text-slate-500">
                  {m.shopName} · {m.phone} ·{" "}
                  {new Date(m.createdAt).toLocaleDateString("th-TH")}
                </div>
              </div>
              <button
                onClick={() => deleteMember(m.id)}
                disabled={busyId === m.id}
                className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                🗑️ ลบ
              </button>
            </li>
          ))}
          {memberItems.length === 0 && (
            <li className="py-4 text-center text-slate-400">ยังไม่มีสมาชิกช่าง</li>
          )}
        </ul>
      </div>
    </main>
  );
}
