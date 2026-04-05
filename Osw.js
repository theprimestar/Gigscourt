// ========================================
// GigsCourt Service Worker v2
// Offline Support + Caching + Instant Back
// Version bump to bust stale cache
// ========================================

const CACHE_NAME = 'gigscourt-v2';  // ← BUMPED to v2
const OFFLINE_FALLBACK = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>GigsCourt - Offline</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0a0c0f;color:#f5f5f0;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;padding:20px;text-align:center;}div{max-width:300px;}h1{color:#d35400;}button{margin-top:20px;padding:12px 24px;background:#d35400;border:none;border-radius:40px;color:white;font-weight:600;cursor:pointer;}</style></head><body><div><h1>📡 You\'re Offline</h1><p>GigsCourt needs an internet connection to load gigs and messages.</p><button onclick="location.reload()">Try Again</button></div></body></html>';

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('SW v2 installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches (v1)
self.addEventListener('activate', (event) => {
  console.log('SW v2 activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

// Fetch event - stale-while-revalidate strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip Supabase API calls (always fresh)
  if (request.url.includes('supabase.co')) {
    event.respondWith(fetch(request));
    return;
  }
  
  // Skip ImageKit transforms (always fresh)
  if (request.url.includes('ik.imagekit.io')) {
    event.respondWith(fetch(request));
    return;
  }
  
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.status === 200) {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          return cache.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return inline offline HTML for HTML requests
            if (request.headers.get('accept')?.includes('text/html')) {
              return new Response(OFFLINE_FALLBACK, {
                status: 200,
                headers: { 'Content-Type': 'text/html' }
              });
            }
            return new Response('Offline - GigsCourt', {
              status: 503,
              statusText: 'Service Unavailable'
            });
          });
        });
    })
  );
});

// Background sync for offline messages (future enhancement)
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(syncMessages());
  }
});

async function syncMessages() {
  console.log('Syncing offline messages...');
}
