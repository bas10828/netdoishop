import { withBrowser } from "./browser";
import { buildProposalHtml, type PriceDisplay } from "./template";
import type { ProposalItem } from "./data";

export async function renderProposalPdf(
  items: ProposalItem[],
  priceDisplay: PriceDisplay = "both"
): Promise<Buffer> {
  const html = await buildProposalHtml(items, priceDisplay);
  return withBrowser(async (browser) => {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({ format: "A4", printBackground: true });
    await page.close();
    return Buffer.from(pdf);
  });
}
