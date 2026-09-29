import { withBrowser } from "./browser";
import {
  buildProposalHtml,
  makeProposalMeta,
  WIDTH,
  ITEMS_PER_PAGE,
  type PriceDisplay,
  type ProposalFooter,
  type ProposalMeta,
  type PageInfo,
} from "./template";
import { computeTotals, type ProposalItem, type CustomLineItem } from "./data";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// The viewport starts deliberately short: fullPage capture grows it to the
// rendered document height, so the image is exactly as tall as the content
// (a taller starting viewport left blank space under the last card).
// footer (custom service lines + grand total) is only passed for the page
// that should show it — the last chunk — so the total isn't printed on
// every image when a proposal spans multiple PNGs.
async function renderOnePng(
  items: ProposalItem[],
  priceDisplay: PriceDisplay,
  footer: ProposalFooter | null,
  meta: ProposalMeta,
  pageInfo: PageInfo,
  firstItemNo: number
): Promise<Buffer> {
  const html = await buildProposalHtml(items, priceDisplay, footer, meta, pageInfo, firstItemNo);
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setViewport({ width: WIDTH, height: 100 });
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
  const meta = makeProposalMeta();

  const pngs: Buffer[] = [];
  for (let i = 0; i < groups.length; i++) {
    const isLast = i === groups.length - 1;
    const page = { index: i, total: groups.length };
    const firstItemNo = i * ITEMS_PER_PAGE + 1;
    pngs.push(await renderOnePng(groups[i], priceDisplay, isLast ? footer : null, meta, page, firstItemNo));
  }
  return pngs;
}
