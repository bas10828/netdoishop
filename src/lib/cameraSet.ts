// Pure bundle builder for the customer-facing /camera-set page: turns
// "N indoor + M outdoor cameras, quality tier, days of playback" into a
// working VIGI PoE system (cameras + NVR + optional PoE switch + one HDD)
// priced from the real storefront catalog.
//
// NVR/switch sizing mirrors the RAG bundle rule in ragRetrieval.ts
// (retrieveProducts): a PoE NVR that can power every camera on its own is
// preferred, and a PoE switch is only added when the NVR's built-in PoE
// falls short. Kept separate from that inline block rather than refactoring
// it, since RAG answer behavior needs its own verification pass.

import { channelsFromName, nvrPoePortsFromName, poePortsFromName } from "@/lib/deviceCapacity";
import { calcDailyGB, capacityFromModel, CODEC_FACTORS, GENERIC_BITRATE_MBPS_BY_MP, mpFromName } from "@/lib/storageCalc";

export type SetProduct = {
  id: number;
  brand: string;
  category: string;
  model: string;
  name: string;
  price: number;
  image: string;
  slug: string;
  // cameras only: weather-rated for exterior mounting (see page.tsx)
  outdoor: boolean;
};

export type Tier = "eco" | "mid" | "high";

export const TIERS: { id: Tier; label: string; mp: number; desc: string }[] = [
  { id: "eco", label: "ประหยัด", mp: 2, desc: "2MP ภาพชัดระดับ Full HD คุ้มราคา" },
  { id: "mid", label: "คุ้มค่า", mp: 4, desc: "4MP ภาพสีกลางคืน รายละเอียดมากขึ้น" },
  { id: "high", label: "คมชัด", mp: 5, desc: "5MP ภาพสีกลางคืน คมชัดสุดในชุดนี้" },
];

export const DAY_OPTIONS = [7, 15, 30] as const;

export const MAX_CAMERAS = 32;

// Largest single drive we'll recommend. VIGI NVR names don't state the
// number of HDD bays, so a multi-drive answer can't be backed — anything
// beyond one drive goes to "ask the shop".
const MAX_SINGLE_DRIVE_TB = 10;

// Special-purpose models that a generic "cheapest camera of this tier" pick
// should never land on (pan/tilt, 4G, panoramic, fisheye, motorized zoom).
const SPECIALTY = /pan\s*\/?\s*tilt|panoramic|fisheye|4G|varifocal|motorized|dual-lens/i;

export type Role = "camera-in" | "camera-out" | "nvr" | "switch" | "hdd";

export type SetLine = {
  role: Role;
  product: SetProduct;
  qty: number;
  // every catalog item that fits this slot (cheapest first; drives by
  // capacity) — what the customer can swap to with "เปลี่ยนรุ่น"
  options: SetProduct[];
  // the item the builder would pick on its own, so the UI can mark it
  // "แนะนำ" and offer a way back
  recommendedId: number;
};

// customer's own model choice per slot; ignored when it no longer fits
// (e.g. an 8-channel NVR after raising the camera count to 12)
export type Overrides = Partial<Record<Role, number>>;

export type SetPlan = {
  lines: SetLine[];
  total: number;
  hddNeedTB: number;
  // empty when the plan is complete; otherwise why a part couldn't be picked
  problems: string[];
};

const byPrice = (a: SetProduct, b: SetProduct) => a.price - b.price;

// cameras that physically suit the placement, any resolution — the swap list
function cameraOptions(cameras: SetProduct[], outdoor: boolean): SetProduct[] {
  // exterior needs a weather rating; interior prefers turret/dome over a
  // bullet (an outdoor-rated turret is still fine indoors)
  return cameras.filter((c) => (outdoor ? c.outdoor : !/bullet/i.test(c.name))).sort(byPrice);
}

// the tier's default pick out of those options
function recommendCamera(options: SetProduct[], tier: Tier): SetProduct | null {
  const mp = TIERS.find((t) => t.id === tier)!.mp;
  return (
    options.find((c) => {
      if (SPECIALTY.test(c.name) || mpFromName(c.name) !== mp) return false;
      // above the entry tier the pitch is night color, so require it
      return tier === "eco" || /full-color|colorpro/i.test(c.name);
    }) ?? null
  );
}

function withOverride(options: SetProduct[], recommended: SetProduct, overrideId: number | undefined): SetProduct {
  return options.find((o) => o.id === overrideId) ?? recommended;
}

function switchOptions(switches: SetProduct[], need: number): SetProduct[] {
  return switches
    .filter((s) => !/reverse|industrial/i.test(s.name))
    .filter((s) => (poePortsFromName(s.name) ?? 0) >= need)
    .sort(byPrice);
}

function recommendRecorder(
  nvrs: { n: SetProduct; poe: number }[],
  switches: SetProduct[],
  cameraCount: number
): SetProduct | null {
  const selfSufficient = nvrs.filter((x) => x.poe >= cameraCount);
  if (selfSufficient.length > 0) return selfSufficient[0].n;

  // otherwise the cheapest NVR + switch combo whose switch covers the
  // cameras the NVR's own PoE ports can't
  let best: { nvr: SetProduct; total: number } | null = null;
  for (const x of nvrs) {
    const sw = switchOptions(switches, cameraCount - x.poe)[0];
    if (!sw) continue;
    const total = x.n.price + sw.price;
    if (!best || total < best.total) best = { nvr: x.n, total };
  }
  return best?.nvr ?? null;
}

// H.265 bitrate for one camera — GENERIC_BITRATE_MBPS_BY_MP has no entry for
// odd sizes (e.g. 6MP), so fall back to the next size up that it does have
function bitrateFor(mp: number): number {
  const known = Object.keys(GENERIC_BITRATE_MBPS_BY_MP).map(Number).sort((a, b) => a - b);
  const key = known.find((k) => k >= mp) ?? known[known.length - 1];
  return GENERIC_BITRATE_MBPS_BY_MP[key] * CODEC_FACTORS["H.265"];
}

export function planCameraSet(
  catalog: SetProduct[],
  input: { indoor: number; outdoor: number; tier: Tier; days: number },
  overrides: Overrides = {}
): SetPlan {
  const { indoor, outdoor, tier, days } = input;
  const count = indoor + outdoor;
  const lines: SetLine[] = [];
  const problems: string[] = [];
  const tierMp = TIERS.find((t) => t.id === tier)!.mp;

  const cameras = catalog.filter((p) => p.category === "camera-ip");
  for (const [role, qty, isOutdoor] of [
    ["camera-in", indoor, false],
    ["camera-out", outdoor, true],
  ] as const) {
    if (qty === 0) continue;
    const options = cameraOptions(cameras, isOutdoor);
    const rec = recommendCamera(options, tier);
    if (rec) {
      lines.push({ role, product: withOverride(options, rec, overrides[role]), qty, options, recommendedId: rec.id });
    } else {
      problems.push(`ไม่มีกล้อง${isOutdoor ? "นอก" : "ใน"}อาคารระดับนี้ในสต็อกตอนนี้`);
    }
  }

  if (count > 0) {
    const switches = catalog.filter((p) => p.category === "sw-poe");
    const nvrs = catalog
      .filter((p) => p.category === "nvr" && !/wi-?fi/i.test(p.name))
      .map((n) => ({ n, ch: channelsFromName(n.name), poe: nvrPoePortsFromName(n.name) }))
      .filter((x) => x.ch !== null && x.ch >= count)
      .sort((a, b) => a.n.price - b.n.price);
    const nvrOpts = nvrs.map((x) => x.n);
    const rec = recommendRecorder(nvrs, switches, count);
    if (rec) {
      const nvr = withOverride(nvrOpts, rec, overrides.nvr);
      lines.push({ role: "nvr", product: nvr, qty: 1, options: nvrOpts, recommendedId: rec.id });
      // a switch is needed only for cameras the chosen NVR can't power
      const need = count - nvrPoePortsFromName(nvr.name);
      if (need > 0) {
        const swOpts = switchOptions(switches, need);
        if (swOpts.length > 0) {
          lines.push({ role: "switch", product: withOverride(swOpts, swOpts[0], overrides.switch), qty: 1, options: swOpts, recommendedId: swOpts[0].id });
        } else {
          problems.push(`ไม่มี PoE switch ที่จ่ายไฟได้ ${need} กล้องในสต็อกตอนนี้`);
        }
      }
    } else {
      problems.push(`ไม่มี NVR ที่รองรับ ${count} กล้องในสต็อกตอนนี้`);
    }
  }

  // same math as /calculator's defaults: H.265, 25fps, 24h recording —
  // summed per camera line so a swapped-in higher-MP model sizes the drive up
  let totalBitrate = 0;
  for (const l of lines) {
    if (l.role === "camera-in" || l.role === "camera-out") {
      totalBitrate += bitrateFor(mpFromName(l.product.name) ?? tierMp) * l.qty;
    }
  }
  const hddNeedTB = (calcDailyGB(totalBitrate, 24, 1) * days) / 1000;
  if (count > 0) {
    const drives = catalog
      .filter((p) => p.category === "harddisk" && !/promo/i.test(p.model))
      .map((p) => ({ p, tb: capacityFromModel(p.model) }))
      .filter((x): x is { p: SetProduct; tb: number } => x.tb !== null && x.tb <= MAX_SINGLE_DRIVE_TB && x.tb >= hddNeedTB)
      .sort((a, b) => a.tb - b.tb || a.p.price - b.p.price);
    if (drives.length > 0) {
      const hddOpts = drives.map((d) => d.p);
      lines.push({ role: "hdd", product: withOverride(hddOpts, hddOpts[0], overrides.hdd), qty: 1, options: hddOpts, recommendedId: hddOpts[0].id });
    } else {
      problems.push(`ต้องใช้พื้นที่ประมาณ ${hddNeedTB.toFixed(1)} TB เกินฮาร์ดดิสก์ลูกเดียว — ทักร้านเพื่อจัด HDD หลายลูกหรือลดจำนวนวัน`);
    }
  }

  const total = lines.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  return { lines, total, hddNeedTB, problems };
}
