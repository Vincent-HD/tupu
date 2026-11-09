/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;
declare const __BUILD_ID__: string;
declare const __PRECACHE__: ReadonlyArray<string>;

const cacheName = `tupu-${__BUILD_ID__}`;
const shell = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(cacheName).then((cache) => cache.addAll([...__PRECACHE__])));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("tupu-") && key !== cacheName)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") void self.skipWaiting();
});

const fromNetwork = async (request: Request) => {
  const response = await fetch(request);
  if (response.ok && response.type === "basic") {
    const cache = await caches.open(cacheName);
    await cache.put(request, response.clone());
  }
  return response;
};

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      caches
        .match(shell, { ignoreVary: true })
        .then((cached) => cached ?? caches.match("/", { ignoreVary: true }))
        .then((cached) => cached ?? fetch(request)),
    );
    return;
  }
  event.respondWith(
    caches.match(request, { ignoreVary: true }).then((cached) => cached ?? fromNetwork(request)),
  );
});

export {};
