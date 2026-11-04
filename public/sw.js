// Cache only the public application shell. Never intercept Supabase or private data.
const CACHE = "cordoba-shell-v1";
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
            .filter((k) => k.startsWith("cordoba-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  ),
);
self.addEventListener("fetch", (event) => {
  const u = new URL(event.request.url);
  if (
    event.request.method !== "GET" ||
    u.origin !== self.location.origin ||
    !(
      event.request.mode === "navigate" ||
      u.pathname === "/icon.svg" ||
      u.pathname === "/manifest.webmanifest" ||
      u.pathname.startsWith("/assets/") ||
      u.pathname.startsWith("/fonts/") ||
      u.pathname.startsWith("/brand/") ||
      u.pathname.startsWith("/visuals/") ||
      u.pathname.startsWith("/icons/")
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
                ? caches.match("/")
                : Response.error()),
          ),
      ),
  );
});
