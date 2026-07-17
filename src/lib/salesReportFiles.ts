import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";

export const MAX_PHOTOS = 100;
export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
export const ALLOWED_PHOTO_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const MAX_DOCS = 10;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;
export const ALLOWED_DOC_MIME: Record<string, string> = {
  ...ALLOWED_PHOTO_MIME,
  "application/pdf": "pdf",
};

export function currentYyyyMm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Validates a batch of uploaded files against a mime/size policy. Returns an
// error string (for a 400 response) or null if everything is fine.
export function validateFiles(
  files: File[],
  max: number,
  maxBytes: number,
  allowedMime: Record<string, string>,
  labels: { tooMany: string; badType: string; tooLarge: string }
): string | null {
  if (files.length > max) return labels.tooMany;
  for (const f of files) {
    if (!(f.type in allowedMime)) return labels.badType;
    if (f.size > maxBytes) return labels.tooLarge;
  }
  return null;
}

export async function saveUploadedFiles(
  files: File[],
  allowedMime: Record<string, string>
): Promise<{ url: string; name: string }[]> {
  if (files.length === 0) return [];
  const yyyymm = currentYyyyMm();
  const dir = join(process.cwd(), "public", "uploads", "sales", yyyymm);
  await mkdir(dir, { recursive: true });

  const saved: { url: string; name: string }[] = [];
  for (const f of files) {
    const ext = allowedMime[f.type];
    const filename = `${randomUUID()}.${ext}`;
    const buf = Buffer.from(await f.arrayBuffer());
    await writeFile(join(dir, filename), buf);
    saved.push({ url: `/uploads/sales/${yyyymm}/${filename}`, name: f.name });
  }
  return saved;
}

// Best-effort delete of previously-saved files by their public URL
// (/uploads/sales/<yyyy-mm>/<file>). Missing files are ignored — this is
// cleanup, not a correctness-critical path.
export async function deleteUploadedFiles(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (url) => {
      if (!url.startsWith("/uploads/sales/")) return; // never touch anything outside our own upload dir
      const filePath = join(process.cwd(), "public", url);
      try {
        await unlink(filePath);
      } catch {
        // already gone / never existed — fine
      }
    })
  );
}
