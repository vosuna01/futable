// Cache only the public application shell. Never intercept Supabase or private data.
const ROOT = new URL("./", self.location.href).pathname;
const CACHE_PREFIX = "cordoba-shell-" + encodeURIComponent(ROOT) + "-";
const CACHE = CACHE_PREFIX + "cordoba-shell-v1";
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(["/", "/icon.svg", "/manifest.webmanifest"])),
  ),
);
self.addEventListener("message", (event) => {
  if (event.data === "ACTIVATE_UPDATE") self.skipWaiting();
});
self.addEventListener("activate", (event) =>
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (!u.pathname.startsWith(ROOT)) return;
  const pathname = "/" + u.pathname.slice(ROOT.length);
  if (
    event.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    !(
      event.request.mode === "navigate" ||
      pathname === "/icon.svg" ||
      pathname === "/manifest.webmanifest" ||
      pathname.startsWith("/assets/") ||
      pathname.startsWith("/fonts/") ||
      pathname.startsWith("/brand/") ||
      pathname.startsWith("/visuals/") ||
      pathname.startsWith("/icons/")
    )
  )
    return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          // Public same-origin files only. Development/static hosts can emit
          // Vary: Origin; preload requests and module requests differ there.
          .match(event.request, { ignoreVary: true })
          .then(
            (c) =>
              c ||
              (event.request.mode === "navigate"
                ? caches.match(ROOT)
                : Response.error()),
          ),
      ),
  );
});
