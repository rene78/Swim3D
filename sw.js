/**
 * Swim3D Service Worker
 * 
 * This script allows the app to work offline by caching 3D models, 
 * scripts, and styles. It uses a "Cache-First" strategy.
 */

// 1. Configuration: Name your cache and list every local file you want available offline
const CACHE_NAME = 'swim3d-cache-v3'; // Change this name to force browsers to update the cache

const ASSETS_TO_CACHE = [
  './',                   // The root (index.html)
  './index.html',
  './css/site.css',
  './js/site.js',
  './img/site.webmanifest',
  './img/favicon-96x96.png',
  './img/favicon.svg',
  './img/favicon.ico',
  './img/apple-touch-icon.png',
  './img/web-app-manifest-192x192.png',
  './img/web-app-manifest-512x512.png',
  './img/screenshot-mobile.png',
  './img/screenshot-desktop.png',
  './3D_Assets/swimmer.glb'
];

/**
 * INSTALL EVENT
 * Triggered when the browser first sees this script.
 * We use this to "Pre-cache" all core local assets.
 */
self.addEventListener('install', (event) => {
  // event.waitUntil ensures the Service Worker doesn't install until the cache is full
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching offline assets');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
  // Forces the waiting Service Worker to become the active Service Worker immediately
  self.skipWaiting();
});

/**
 * ACTIVATE EVENT
 * Triggered after installation.
 * We use this to clean up old caches from previous versions of the app.
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // If the cache name isn't our current one, delete it
          if (cacheName !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // Ensures that updates to the service worker take effect immediately across all open tabs
  self.clients.claim();
});

/**
 * FETCH EVENT
 * Triggered every time the page asks for a file (image, script, 3D model, etc.)
 */
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      
      // A. If the file is found in the cache, return it immediately (fastest)
      if (cachedResponse) {
        return cachedResponse;
      }

      // B. If the file is NOT in the cache, try to get it from the network
      return fetch(event.request)
        .then((networkResponse) => {
          
          // Check if this is an external request to the Three.js CDN (unpkg.com)
          // If it is, we save a copy to the cache so it works offline next time
          if (event.request.url.startsWith('https://unpkg.com')) {
            return caches.open(CACHE_NAME).then((cache) => {
              // We must .clone() the response because it can only be read once
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            });
          }

          return networkResponse;
        })
        .catch((error) => {
          // C. If both the cache AND the network fail (user is offline and file wasn't cached)
          console.error('[Service Worker] Fetch failed:', error);
          
          // Optional: You could return a custom offline page or image here
        });
    })
  );
});