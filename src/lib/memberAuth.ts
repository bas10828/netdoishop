import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Entirely separate from the staff NextAuth session (src/lib/auth.ts) — own
// cookie name, own secret, own verification code. A member session must be
// structurally invisible to getServerSession(authOptions) and to the
// /catalog middleware, which only ever look at NextAuth's own cookie.
export const MEMBER_COOKIE_NAME = "member_session";
export const MEMBER_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const INVITE_TTL_DAYS = 14;

function secret(): string {
  const s = process.env.MEMBER_SESSION_SECRET;
  if (!s) throw new Error("MEMBER_SESSION_SECRET is not set");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", secret()).update(payloadB64).digest("base64url");
}

export function signMemberSession(memberId: string): string {
  const exp = Math.floor(Date.now() / 1000) + MEMBER_SESSION_MAX_AGE_SECONDS;
  const payloadB64 = b64url(JSON.stringify({ memberId, exp }));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyMemberSession(value: string | undefined | null): { memberId: string } | null {
  if (!value) return null;
  const dot = value.lastIndexOf(".");
  if (dot < 0) return null;
  const payloadB64 = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payloadB64);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload: { memberId?: unknown; exp?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf-8"));
  } catch {
    return null;
  }
  if (typeof payload.memberId !== "string" || typeof payload.exp !== "number") return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return { memberId: payload.memberId };
}

// Server Component / Route Handler only (uses next/headers cookies()).
export async function readMemberSession(): Promise<{ memberId: string } | null> {
  const store = await cookies();
  return verifyMemberSession(store.get(MEMBER_COOKIE_NAME)?.value);
}

export function memberSessionCookieOptions(maxAge: number) {
  return {
    name: MEMBER_COOKIE_NAME,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function newInviteToken(): string {
  return randomBytes(32).toString("base64url");
}

export function newInviteExpiry(): Date {
  return new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
