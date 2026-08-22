import { withBrowser } from "./browser";
import { buildProposalHtml, type PriceDisplay } from "./template";
import { computeTotals, type ProposalItem, type CustomLineItem } from "./data";

export async function renderProposalPdf(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both",
  customItems: CustomLineItem[] = []
): Promise<Buffer> {
  const totals = computeTotals(items, customItems);
  const html = await buildProposalHtml(items, priceDisplay, { customItems, totals });
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await page.close();
    return Buffer.from(pdf);
  });
}
