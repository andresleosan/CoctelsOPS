// Service Worker Coctels OPS - Notificaciones Push y Alertas en Tiempo Real
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload = {};
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      payload = {
        title: 'Coctels OPS',
        message: event.data.text() || 'Tu pedido tiene una nueva actualización.',
      };
    }
  }

  const title = payload.title || 'Coctels OPS';
  const orderId = payload.orderId || payload.data?.orderId;
  const targetUrl = payload.url || payload.data?.url || (orderId ? `/order-status/${orderId}` : '/cuenta/pedidos');

  const options = {
    body: payload.message || payload.body || 'Tu pedido tiene una nueva actualización.',
    icon: payload.icon || '/icon.png',
    badge: payload.badge || '/icon.png',
    vibrate: [100, 50, 100],
    data: {
      url: targetUrl,
      orderId: orderId,
    },
    tag: payload.tag || (orderId ? `order-${orderId}` : 'coctels-ops-order'),
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/cuenta/pedidos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes(targetUrl) && 'focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});

const OFFLINE_SYNC_TAG = 'coctels-ops-offline-sync';
const OFFLINE_SW_MESSAGE_TYPE = 'COCTELS_OPS_SYNC_OFFLINE_QUEUE';

self.addEventListener('sync', (event) => {
  if (event.tag !== OFFLINE_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        client.postMessage({
          type: OFFLINE_SW_MESSAGE_TYPE,
          tag: event.tag,
        });
      }
    })
  );
});
