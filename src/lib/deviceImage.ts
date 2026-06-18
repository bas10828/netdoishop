import { readdirSync } from "node:fs";
import { join } from "node:path";

// Server-side resolver: map a product model -> a real image file in
// /public/devices. Images are named "<model>.png". Falls back to default.png.
const DEVICES_DIR = join(process.cwd(), "public", "devices");

const norm = (s: string) => s.toLowerCase().replace(/[()\s]/g, "");

// supported image extensions, in preference order (png first for transparency)
const EXTS = [".png", ".jpg", ".jpeg", ".webp", ".jfif", ".avif"];
const extRe = /\.(png|jpe?g|webp|jfif|avif)$/i;

// extra gallery images for a product share its base name plus a "__<n>" suffix
// (double underscore), e.g. "US-1005SC1.png" + "US-1005SC1__2.png". The double
// underscore is deliberately NOT "-<n>" so it never collides with the trailing
// "-<digits>" length-variant logic below (e.g. "US-9045-1" vs "US-9045").
const galleryRe = /__\d+$/;

interface Maps {
  // norm(model) -> primary image filename
  byKey: Map<string, string>;
  // norm(base without "__<n>") -> ordered list of filenames (primary first)
  groups: Map<string, string[]>;
}

let cache: Maps | null = null;

function getMaps(): Maps {
  // cache only in production; in dev re-read so newly added images show up
  // without a server restart
  if (cache && process.env.NODE_ENV === "production") return cache;
  const m = new Map<string, string>();
  const groups = new Map<string, string[]>();
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
      // group gallery siblings (sorted readdir -> primary "" before "__2"...)
      const gbase = base.replace(galleryRe, "");
      const gkey = norm(gbase);
      const list = groups.get(gkey);
      if (list) list.push(f);
      else groups.set(gkey, [f]);
      // "__<n>" files are gallery extras only; never register them as a
      // primary lookup key (the base file is the one cards/OG resolve to).
      if (galleryRe.test(base)) continue;
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
  cache = { byKey: m, groups };
  return cache;
}

// resolve the primary image filename (not path) for a model, or null
function resolveFile(model: string, brand: string | undefined, map: Map<string, string>): string | null {
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
    if (f) return f;
  }
  return null;
}

/** Primary image path for a model (cards, OG, cart). Falls back to default.png. */
export function deviceImage(model: string, brand?: string): string {
  const f = resolveFile(model, brand, getMaps().byKey);
  return f ? `/devices/${f}` : `/devices/default.png`;
}

/**
 * Ordered gallery image paths for a model (primary first), for the detail page.
 * Includes the primary plus any "<base>__<n>" siblings. Returns [default.png]
 * when no image matches.
 */
export function deviceImages(model: string, brand?: string): string[] {
  const { byKey, groups } = getMaps();
  const file = resolveFile(model, brand, byKey);
  if (!file) return ["/devices/default.png"];
  const gkey = norm(file.replace(extRe, "").replace(galleryRe, ""));
  const list = groups.get(gkey) ?? [file];
  return list.map((f) => `/devices/${f}`);
}
