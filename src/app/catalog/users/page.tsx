import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UsersClient, { type UserRow, type MemberRow, type InviteRow } from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (session.user?.role !== "admin") redirect("/catalog");

  const userRows = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  const memberRows = await prisma.member.findMany({ orderBy: { createdAt: "desc" } });
  const inviteRows = await prisma.accountInvite.findMany({ orderBy: { createdAt: "desc" } });

  // never pass passwordHash to the client
  const users: UserRow[] = userRows.map((u) => ({
    id: u.id,
    username: u.username,
    name: u.name,
    role: u.role,
    createdAt: u.createdAt.toISOString(),
  }));

  const members: MemberRow[] = memberRows.map((m) => ({
    id: m.id,
    username: m.username,
    fullName: m.fullName,
    phone: m.phone,
    shopName: m.shopName,
    createdAt: m.createdAt.toISOString(),
  }));

  const invites: InviteRow[] = inviteRows.map((i) => ({
    token: i.token,
    intendedRole: i.intendedRole,
    used: i.used,
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <UsersClient
      users={users}
      members={members}
      invites={invites}
      currentUserId={session.user?.id ?? ""}
    />
  );
}
