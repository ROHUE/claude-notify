// Service Worker for Claude Notify PWA

const CACHE_NAME = 'claude-notify-v1';
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/app.js',
  '/manifest.json'
];

// Install - cache essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(OFFLINE_URLS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch - network first, fallback to cache
self.addEventListener('fetch', event => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') return;

  // Skip API requests (always go to network)
  if (event.request.url.includes('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Cache successful responses
        if (response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME)
            .then(cache => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});

// Push notification received
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    tag: `claude-${data.data?.id || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    data: data.data,
    actions: [
      ...(data.data?.terminalUrl ? [{ action: 'terminal', title: 'Open Terminal' }] : []),
      { action: 'view', title: 'View' },
      { action: 'dismiss', title: 'Dismiss' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
      .then(() => updateBadgeCount())
  );
});

// Update badge count based on unread notifications
async function updateBadgeCount() {
  try {
    const res = await fetch('/api/notifications');
    if (res.ok) {
      const notifications = await res.json();
      const unreadCount = notifications.filter(n => !n.read).length;
      if ('setAppBadge' in navigator) {
        if (unreadCount > 0) {
          navigator.setAppBadge(unreadCount);
        } else {
          navigator.clearAppBadge();
        }
      }
    }
  } catch (e) {
    // Ignore errors
  }
}

// Listen for messages from the app to update badge
self.addEventListener('message', event => {
  if (event.data === 'updateBadge') {
    updateBadgeCount();
  } else if (event.data === 'clearBadge') {
    if ('clearAppBadge' in navigator) {
      navigator.clearAppBadge();
    }
  }
});

// Notification clicked
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const terminalUrl = event.notification.data?.terminalUrl;

  if (event.action === 'terminal' && terminalUrl) {
    event.waitUntil(
      clients.openWindow(terminalUrl)
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        for (const client of windowClients) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Notification closed
self.addEventListener('notificationclose', event => {
  const notificationId = event.notification.data?.id;
  if (notificationId) {
    // Mark as read when dismissed
    fetch(`/api/notifications/${notificationId}/read`, { method: 'PATCH' })
      .catch(() => {}); // Ignore errors
  }
});
