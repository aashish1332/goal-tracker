/**
 * TrackerPro — Service Worker
 * (PWA & Offline Support)
 */

const CACHE_NAME = 'trackerpro-v2';
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
    // Cleanup old caches
    e.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        )).then(() => clients.claim())
    );
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

    // Default strategy: Network First, falling back to Cache
    // This solves the 'must hard refresh' issue while keeping offline support
    e.respondWith(
        fetch(e.request).then(networkRes => {
            // Update cache with new version from network
            if (networkRes && networkRes.status === 200) {
                const clone = networkRes.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
            }
            return networkRes;
        }).catch(async () => {
            // Offline: try to serve from cache
            const cached = await caches.match(e.request);
            if (cached) return cached;
            
            // Handle API specifically or other fallbacks
            if (e.request.url.includes('/api/')) {
                return new Response(JSON.stringify({ error: 'Offline', message: 'Connection failed' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
            return new Response('Network error occurred', { status: 408 });
        })
    );
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
