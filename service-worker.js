const CACHE_NAME = 'nosso-mes-static-v14';
const APP_SHELL = ['./', './index.html', './styles.css', './compact.css', './app.js', './backend-config.js', './manifest.json', './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png'];
const APP_SHELL_PATHS = new Set(APP_SHELL.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nosso-mes-static-') && key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  const scopePath = new URL(self.registration.scope).pathname;
  const isAppNavigation = request.mode === 'navigate' && (url.pathname === scopePath || url.pathname === `${scopePath}index.html`);
  if (request.method !== 'GET' || url.origin !== self.location.origin || (!isAppNavigation && !APP_SHELL_PATHS.has(url.pathname))) return;
  event.respondWith(caches.match(request).then(cached => {
    if (cached) return cached;
    return fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  }));
});

