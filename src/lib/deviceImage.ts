import { readdirSync } from "node:fs";
import { join } from "node:path";

// Server-side resolver: map a product model -> a real image file in
// /public/devices. Images are named "<model>.png". Falls back to default.png.
const DEVICES_DIR = join(process.cwd(), "public", "devices");

const norm = (s: string) => s.toLowerCase().replace(/[()\s]/g, "");

// supported image extensions, in preference order (png first for transparency)
const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".jfif", ".avif"];
const extRe = /\.(png|jpe?g|webp|jfif|avif)$/i;

let cache: Map<string, string> | null = null;

function getMap(): Map<string, string> {
  // cache only in production; in dev re-read so newly added images show up
  // without a server restart
  if (cache && process.env.NODE_ENV === "production") return cache;
  const m = new Map<string, string>();
  try {
    const put = (key: string, f: string, allowOverride: boolean) => {
      const existing = m.get(key);
      if (!existing) {
        m.set(key, f);
      } else if (allowOverride) {
        // a .png beats an already-set non-png for the same key
        const better =
          EXTS.indexOf(f.slice(f.lastIndexOf(".")).toLowerCase()) <
          EXTS.indexOf(existing.slice(existing.lastIndexOf(".")).toLowerCase());
        if (better) m.set(key, f);
      }
    };
    for (const f of readdirSync(DEVICES_DIR).sort()) {
      if (!extRe.test(f)) continue;
      const base = f.replace(extRe, "");
      // primary key: full filename
      put(norm(base), f, true);
      // alias: filename with a leading brand word stripped, e.g.
      // "Rapoo X130 PRO" / "d-power CB-S15" -> match model "X130 PRO" / "CB-S15".
      // Does not override a real full-name match.
      const sp = base.indexOf(" ");
      if (sp > 0) put(norm(base.slice(sp + 1)), f, false);
    }
  } catch {
    // dir missing -> everything falls back to default
  }
  cache = m;
  return m;
}

export function deviceImage(model: string, brand?: string): string {
  const map = getMap();
  // try several candidate names, in order:
  //   - exact
  //   - drop part after "/"  (e.g. "IPC-B7ED-...-EU/FSP14" -> "IPC-B7ED-...-EU")
  //   - drop trailing "-<digits>" length variant (e.g. "US-9045-1" -> "US-9045")
  //   - both
  const slashBase = model.split("/")[0];
  // file names can't contain "/", so the source pics replace it with "-"
  // (e.g. model "DS-7204HGHI-M1/T" -> file "DS-7204HGHI-M1-T.png").
  const dashed = model.replace(/\//g, "-");
  const base = [
    model,
    dashed,
    slashBase,
    model.replace(/-\d+$/, ""),
    slashBase.replace(/-\d+$/, ""),
    dashed.replace(/-\d+$/, ""),
  ];
  // drop a trailing parenthetical qualifier that the file omits, e.g.
  // model "Adapter 12V 3.2A (หัวกล้อง)" -> file "Adapter 12V 3.2A.jpg".
  // low priority (pushed last) so an exact "(...)" file still wins.
  const parenless = model.replace(/\s*\([^)]*\)\s*$/, "");
  if (parenless !== model) base.push(parenless);
  // many source files glue the brand onto the model with no separator
  // (e.g. brand "Dahua" + model "DH-HAC-..." -> file "DahuaDH-HAC-...png").
  // try each candidate again with the brand prepended.
  const candidates = brand ? base.concat(base.map((c) => brand + c)) : base;
  for (const c of candidates) {
    const f = map.get(norm(c));
    if (f) return `/devices/${f}`;
  }
  return `/devices/default.png`;
}
