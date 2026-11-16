// Sudoku — service worker: l'app funziona senza rete dopo la prima apertura.
// Strategia: si risponde subito dalla copia locale e intanto la si confronta con il server
// (senza passare dalla cache del browser). Se un file è cambiato, la pagina viene avvisata
// e propone di aggiornare.
'use strict';

const CACHE = 'sudoku-v4';
const FILES = [
    './', 'index.html', 'style.css', 'app.js', 'logic.js', 'ocr.js', 'puzzles.js',
    'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png',
];

self.addEventListener('install', e => {
    // cache: 'reload' = sempre dal server, mai dalla copia del browser (che GitHub tiene valida 10 minuti)
    e.waitUntil(
        caches.open(CACHE)
            .then(c => c.addAll(FILES.map(f => new Request(f, { cache: 'reload' }))))
            .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
    e.waitUntil((async () => {
        const old = (await caches.keys()).filter(k => k !== CACHE);
        await Promise.all(old.map(k => caches.delete(k)));
        await self.clients.claim();
        // passaggio da una versione precedente del service worker: le pagine aperte ripartono con i file nuovi
        if (old.length) for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url).catch(() => { });
    })());
});

const stamp = res => res ? (res.headers.get('etag') || res.headers.get('last-modified') || '') : '';

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
    e.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });
        const refresh = fetch(req.url, { cache: 'no-cache' }).then(async res => {
            if (!res || !res.ok) return res;
            const changed = cached && stamp(cached) && stamp(res) && stamp(cached) !== stamp(res);
            await cache.put(req, res.clone());
            if (changed) for (const c of await self.clients.matchAll({ type: 'window' })) c.postMessage({ type: 'updated' });
            return res;
        }).catch(() => cached);
        if (cached) { e.waitUntil(refresh); return cached; }
        return refresh;
    })());
});
