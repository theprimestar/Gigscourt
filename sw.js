// ========================================
// GigsCourt Service Worker
// Offline Support + Caching + Instant Back
// ========================================

const CACHE_NAME = 'gigscourt-v1';
const OFFLINE_URL = '/offline.html';

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
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
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
          // Offline fallback - return from cache
          return cache.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            // Return offline page for HTML requests
            if (request.headers.get('accept').includes('text/html')) {
              return cache.match(OFFLINE_URL);
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
  // Will implement when online queue is needed
  console.log('Syncing offline messages...');
}
