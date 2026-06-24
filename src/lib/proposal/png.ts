import JSZip from "jszip";
import { withBrowser } from "./browser";
import { buildProposalHtml, WIDTH, HEADER_HEIGHT, CARD_MIN_HEIGHT, ITEMS_PER_PAGE, type PriceDisplay } from "./template";
import type { ProposalItem } from "./data";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Card height grows with content (long specs/tagline), so the viewport
// height is just a lower-bound starting point — fullPage capture expands
// to whatever the page actually rendered to, never clipping detail text.
async function renderOnePng(items: ProposalItem[], priceDisplay: PriceDisplay): Promise<Buffer> {
  const html = await buildProposalHtml(items, priceDisplay);
  const height = HEADER_HEIGHT + items.length * CARD_MIN_HEIGHT;
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height });
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png", fullPage: true });
    await page.close();
    return Buffer.from(png);
  });
}

// Returns either a single PNG (≤ ITEMS_PER_PAGE items) or a ZIP of multiple
// PNGs (ITEMS_PER_PAGE items each) — keeps every image readable instead of
// one very tall image.
export async function renderProposalPng(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both"
): Promise<{ buffer: Buffer; isZip: boolean }> {
  const groups = chunk(items, ITEMS_PER_PAGE);

  if (groups.length === 1) {
    return { buffer: await renderOnePng(groups[0], priceDisplay), isZip: false };
  }

  const zip = new JSZip();
  for (let i = 0; i < groups.length; i++) {
    const png = await renderOnePng(groups[i], priceDisplay);
    zip.file(`netdoi-proposal-${String(i + 1).padStart(3, "0")}.png`, png);
  }
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer, isZip: true };
}
