import { readFile, writeFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const base = process.env.SITE_BASE_PATH || "/";
if (!base.startsWith("/") || !base.endsWith("/") || base.includes(".."))
  throw new Error("Invalid SITE_BASE_PATH");
const manifestPath = new URL("../dist/manifest.webmanifest", import.meta.url);
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
Object.assign(manifest, { id: base, start_url: base, scope: base });
manifest.icons = manifest.icons.map((icon) => ({
  ...icon,
  src: base + icon.src.replace(/^\/+/, ""),
}));
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
const assets = await readdir(new URL("../dist/assets/", import.meta.url));
const fonts = (
  await readdir(new URL("../dist/fonts/", import.meta.url))
).filter((f) => f.endsWith(".woff2"));
const version = createHash("sha256")
  .update(base + assets.join("|"))
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
  `.addAll(${JSON.stringify(files.map((file) => base + file.replace(/^\/+/, "")))})`,
);
await writeFile(new URL("../dist/sw.js", import.meta.url), sw);
console.log(`PWA: ${files.length} recursos públicos precargados · ${version}`);
