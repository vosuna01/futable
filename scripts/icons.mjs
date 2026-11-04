// Render the composed SVG emblem for the installed PWA. Run: PLAYWRIGHT_CHANNEL=chrome node scripts/icons.mjs
import { chromium } from "@playwright/test";
import { readFile, mkdir } from "node:fs/promises";
const svg = await readFile(
  new URL("../public/brand/liga-cordoba-logo.svg", import.meta.url),
  "utf8",
);
const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : {},
);
try {
  await mkdir(new URL("../public/icons/", import.meta.url), {
    recursive: true,
  });
  for (const [size, name] of [
    [192, "icon-192.png"],
    [512, "icon-512.png"],
    [512, "maskable-512.png"],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<html><body style="margin:0;background:#f8fafc;display:grid;place-items:center;width:100vw;height:100vh"><img width="${size * 0.8}" height="${size * 0.8}" src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}"/></body></html>`,
    );
    await page.locator("img").evaluate((img) => img.decode());
    await page.screenshot({
      path: new URL(
        `../public/icons/${name}`,
        import.meta.url,
      ).pathname.replace(/^\/(\w:)/, "$1"),
    });
    await page.close();
  }
} finally {
  await browser.close();
}
console.log("PWA icons rendered from the league emblem.");
