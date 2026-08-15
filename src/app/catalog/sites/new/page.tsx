import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import UploadSiteDevicesClient from "./UploadSiteDevicesClient";

export const dynamic = "force-dynamic";

export default async function NewSiteDevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const sites = await prisma.site.findMany({
    select: { name: true },
    distinct: ["name"],
    orderBy: { name: "asc" },
  });

  return <UploadSiteDevicesClient existingSiteNames={sites.map((s) => s.name)} />;
}
