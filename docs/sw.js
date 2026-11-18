const scope = self.registration.scope;
const prefix = "trumpgpt:" + encodeURIComponent(scope) + ":";
const version = prefix + "v1.1";
const files = ["./", "./index.html", "./style.css", "./app.js", "./comedy.mjs", "./locale.mjs", "./manifest.webmanifest", "./assets/press-mics.png", "./assets/icon-180.png", "./assets/icon-192.png", "./assets/icon-512.png"];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(version);
    const requests = files.map(path => new Request(new URL(path, scope), {cache: "reload"}));
    await cache.addAll(requests);
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== version) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(scope)) return;
  event.respondWith((async () => {
    const cache = await caches.open(version);
    const cached = await cache.match(request);
    if (cached) return cached;
    try { return await fetch(request); }
    catch (error) {
      if (request.mode === "navigate") return await cache.match(new URL("./index.html", scope).href);
      throw error;
    }
  })());
});
