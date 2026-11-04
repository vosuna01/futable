import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const assets = await readdir(new URL("../dist/assets/", import.meta.url));
const fonts = (
  await readdir(new URL("../dist/fonts/", import.meta.url))
).filter((f) => f.endsWith(".woff2"));
const version = createHash("sha256")
  .update(assets.join("|"))
  .digest("hex")
  .slice(0, 12);
const files = [
  "/",
  "/icon.svg",
  "/manifest.webmanifest",
  ...assets.map((f) => `/assets/${f}`),
  ...fonts.map((f) => `/fonts/${f}`),
  "/brand/liga-cordoba-logo.svg",
  "/visuals/foosball-table.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-512.png",
];
let sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
sw = sw.replace(
  /["']cordoba-shell-v1["']/,
  JSON.stringify(`cordoba-shell-${version}`),
);
sw = sw.replace(
  /\.addAll\(\[[\s\S]*?\]\)/,
  `.addAll(${JSON.stringify(files)})`,
);
await writeFile(new URL("../dist/sw.js", import.meta.url), sw);
console.log(`PWA: ${files.length} recursos públicos precargados · ${version}`);
