import { NextResponse } from "next/server";
import { memberSessionCookieOptions } from "@/lib/memberAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(memberSessionCookieOptions(0).name, "", memberSessionCookieOptions(0));
  return res;
}
