import { withBrowser } from "./browser";
import { buildProposalHtml, WIDTH, HEADER_HEIGHT, CARD_MIN_HEIGHT, ITEMS_PER_PAGE, type PriceDisplay, type ProposalFooter } from "./template";
import { computeTotals, type ProposalItem, type CustomLineItem } from "./data";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Card height grows with content (long specs/tagline), so the viewport
// height is just a lower-bound starting point — fullPage capture expands
// to whatever the page actually rendered to, never clipping detail text.
// footer (custom service lines + grand total) is only passed for the page
// that should show it — the last chunk — so the total isn't printed on
// every image when a proposal spans multiple PNGs.
async function renderOnePng(
  items: ProposalItem[],
  priceDisplay: PriceDisplay,
  footer: ProposalFooter | null
): Promise<Buffer> {
  const html = await buildProposalHtml(items, priceDisplay, footer);
  const footerRows = footer ? footer.customItems.length + 1 : 0;
  const height = HEADER_HEIGHT + items.length * CARD_MIN_HEIGHT + footerRows * CARD_MIN_HEIGHT;
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height });
    await page.setContent(html, { waitUntil: "load" });
    const png = await page.screenshot({ type: "png", fullPage: true });
    await page.close();
    return Buffer.from(png);
  });
}

// Returns one PNG per ITEMS_PER_PAGE items — keeps every image readable
// instead of one very tall image. Pages are returned as separate images
// (not zipped) because phones often can't extract a ZIP; the client shares
// or saves them individually.
export async function renderProposalPngs(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both",
  customItems: CustomLineItem[] = []
): Promise<Buffer[]> {
  const groups = chunk(items, ITEMS_PER_PAGE);
  const totals = computeTotals(items, customItems);
  const footer: ProposalFooter = { customItems, totals };

  const pngs: Buffer[] = [];
  for (let i = 0; i < groups.length; i++) {
    const isLast = i === groups.length - 1;
    pngs.push(await renderOnePng(groups[i], priceDisplay, isLast ? footer : null));
  }
  return pngs;
}
