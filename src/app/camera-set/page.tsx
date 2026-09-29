import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { resolvePublicPrice } from "@/lib/pricing";
import { deviceImage } from "@/lib/deviceImage";
import { productSlug } from "@/lib/seo";
import { productDoc } from "@/data/descriptions";
import { cameraInstallNote } from "@/lib/ragRetrieval";
import type { SetProduct } from "@/lib/cameraSet";
import CameraSetClient from "./CameraSetClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "จัดชุดกล้องวงจรปิด TP-Link VIGI",
  description: "เลือกจำนวนกล้อง ระดับภาพ และจำนวนวันที่อยากดูย้อนหลัง แล้วได้ชุดกล้อง + NVR + ฮาร์ดดิสก์ พร้อมราคาทันที",
};

export default async function CameraSetPage() {
  const rows = await prisma.product.findMany({
    where: {
      // recommending what to buy — skip SOLD OUT as well as hidden
      status: { notIn: ["SOLD OUT", "hidden"] },
      OR: [
        { category: { in: ["camera-ip", "nvr"] }, brand: "TP-Link VIGI" },
        { category: "sw-poe", brand: { in: ["TP-Link", "TP-Link Omada"] } },
        { category: "harddisk" },
      ],
    },
    select: {
      id: true,
      brand: true,
      category: true,
      model: true,
      name: true,
      onlineMin: true,
      onlineMax: true,
      publicPriceOverride: true,
      publicPriceSupplier: true,
      supplierCosts: true,
    },
  });

  const catalog: SetProduct[] = [];
  for (const r of rows) {
    const price = resolvePublicPrice({ ...r, supplierCosts: r.supplierCosts as Record<string, number> | null });
    if (price === null) continue;
    let outdoor = false;
    if (r.category === "camera-ip") {
      // same indoor/outdoor rule the RAG chat uses, plus the explicit
      // "Outdoor" VIGI puts in exterior models' names
      const doc = productDoc(r.brand, r.model);
      const note = cameraInstallNote(r.category, doc?.specs ?? null, doc?.body);
      outdoor = /outdoor/i.test(r.name) || (note?.startsWith("ติดตั้งกลางแจ้ง") ?? false);
    }
    catalog.push({
      id: r.id,
      brand: r.brand,
      category: r.category,
      model: r.model,
      name: r.name,
      price,
      image: deviceImage(r.model, r.brand),
      slug: productSlug(r),
      outdoor,
    });
  }

  return <CameraSetClient catalog={catalog} />;
}
