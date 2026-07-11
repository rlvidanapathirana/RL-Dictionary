const VERSION = "rl-dictionary-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const DATA_CACHE = `${VERSION}-data`;

const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/styles.css",
  "./js/app.js",
  "./js/transliterate.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

const DATA_FILES = [
  "./data/en_si.json",
  "./data/si_en.json",
  "./data/si_sg.json",
  "./data/sg_si.json",
  "./data/fuzzy_sg_si.json",
  "./data/en_ta.json",
  "./data/ta_en.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith("rl-dictionary-") && k !== SHELL_CACHE && k !== DATA_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  const isData = DATA_FILES.some((f) => url.pathname.endsWith(f.replace("./", "/")));

  if (isData) {
    // Cache-first for large dictionary JSON — content is static, saves bandwidth.
    event.respondWith(
      caches.open(DATA_CACHE).then((cache) =>
        cache.match(event.request).then(
          (cached) =>
            cached ||
            fetch(event.request).then((resp) => {
              if (resp.ok) cache.put(event.request, resp.clone());
              return resp;
            })
        )
      )
    );
    return;
  }

  // Network-first for the app shell, so updates are picked up when online.
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, clone));
        }
        return resp;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("./index.html")))
  );
});
