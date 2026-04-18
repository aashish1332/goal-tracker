/**
 * TrackerPro — Service Worker
 * (PWA & Offline Support)
 */

const CACHE_NAME = 'trackerpro-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/utils.js',
    '/api.js',
    '/pomo.js',
    '/charts-module.js',
    'https://unpkg.com/boxicons@2.1.4/css/boxicons.min.css',
    'https://cdn.jsdelivr.net/npm/chart.js'
];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(clients.claim());
});

self.addEventListener('fetch', e => {
    // For navigation requests (loading index.html), try Network First
    if (e.request.mode === 'navigate') {
        e.respondWith(
            fetch(e.request)
                .catch(() => caches.match(e.request) || caches.match('/index.html'))
        );
        return;
    }

    // Default Cache Strategy for assets, Network First for API
    if (e.request.url.includes('/api/')) {
        e.respondWith(
            fetch(e.request).catch(async () => {
                const cached = await caches.match(e.request);
                if (cached) return cached;
                // If API fails AND not in cache, return a valid 503 response instead of undefined
                return new Response(JSON.stringify({ error: 'Offline', message: 'Connection failed' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
    } else {
        e.respondWith(
            caches.match(e.request).then(res => {
                return res || fetch(e.request).then(networkRes => {
                    return networkRes;
                }).catch(() => {
                    // Fail gracefully for assets too
                    return new Response('Network error occurred', { status: 408 });
                });
            })
        );
    }
});

// Logic for Push Notifications can be added here
self.addEventListener('push', e => {
    const data = e.data ? e.data.json() : { title: 'TrackerPro', body: 'Goal deadline approaching!' };
    e.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icon.png',
            badge: '/badge.png'
        })
    );
});
