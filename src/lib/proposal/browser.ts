import puppeteer, { type Browser } from "puppeteer-core";

// Real Chromium is the rendering engine here specifically because pure-JS
// PDF/image renderers (tested: @react-pdf/renderer, satori/resvg via next/og)
// both mis-shape Thai combining marks (tone marks/sara am drop or float to
// the wrong position) — Chromium's text engine is the same one already
// rendering this site correctly in every browser.
export async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const executablePath = process.env.CHROMIUM_PATH;
  if (!executablePath) {
    throw new Error("CHROMIUM_PATH is not set (see .env.example)");
  }
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}
