import { prisma } from "@/lib/prisma";
import SignupForm from "./SignupForm";
import StaffSignupForm from "./StaffSignupForm";

export const dynamic = "force-dynamic";

const TITLE: Record<string, { title: string; subtitle: string }> = {
  member: { title: "สมัครสมาชิกช่าง", subtitle: "ดูราคาช่างพิเศษสำหรับสมาชิก" },
  staff: { title: "สมัครบัญชีพนักงาน", subtitle: "ตั้งชื่อผู้ใช้และรหัสผ่านของตัวเอง" },
  admin: { title: "สมัครบัญชีแอดมิน", subtitle: "ตั้งชื่อผู้ใช้และรหัสผ่านของตัวเอง" },
};

export default async function SignupPage({ params }: { params: { token: string } }) {
  const invite = await prisma.accountInvite.findUnique({ where: { token: params.token } });
  const valid = !!invite && !invite.used && invite.expiresAt.getTime() > Date.now();
  const copy = (valid && TITLE[invite!.intendedRole]) || TITLE.member;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-sm">
        <div className="mb-5 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="NETDOI" className="mx-auto mb-2 h-14 w-auto" />
          <h1 className="text-lg font-bold">{copy.title}</h1>
          <p className="text-sm text-slate-500">{copy.subtitle}</p>
        </div>
        {!valid ? (
          <p className="rounded-md bg-red-50 p-3 text-center text-sm text-red-700">
            ลิงก์นี้ใช้ไปแล้วหรือหมดอายุ กรุณาติดต่อแอดมินเพื่อขอลิงก์ใหม่
          </p>
        ) : invite!.intendedRole === "member" ? (
          <SignupForm token={params.token} />
        ) : (
          <StaffSignupForm token={params.token} />
        )}
      </div>
    </div>
  );
}
