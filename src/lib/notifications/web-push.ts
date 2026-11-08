export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function registerServiceWorker(swPath = '/sw.js'): Promise<ServiceWorkerRegistration | null> {
  if (!isPushNotificationSupported()) return null;
  try {
    const registration = await navigator.serviceWorker.register(swPath, { scope: '/' });
    return registration;
  } catch (error) {
    console.error('[WebPush] Error registrando el Service Worker:', error);
    return null;
  }
}

export interface SubscribeOptions {
  orderId?: string;
  idToken?: string;
  vapidPublicKey?: string;
}

export interface SubscribeResult {
  success: boolean;
  permission: NotificationPermission | 'unsupported';
  subscription?: PushSubscription;
  error?: string;
}

export async function subscribeUserToPush(options: SubscribeOptions = {}): Promise<SubscribeResult> {
  if (!isPushNotificationSupported()) {
    return { success: false, permission: 'unsupported', error: 'Navegador no soporta notificaciones push.' };
  }

  try {
    let currentPermission = Notification.permission;
    if (currentPermission !== 'granted') {
      currentPermission = await Notification.requestPermission();
    }

    if (currentPermission !== 'granted') {
      return { success: false, permission: currentPermission, error: 'Permiso de notificaciones denegado.' };
    }

    const registration = await registerServiceWorker();
    if (!registration) {
      return { success: false, permission: currentPermission, error: 'No fue posible registrar el Service Worker.' };
    }

    const readyRegistration = await navigator.serviceWorker.ready;
    let subscription = await readyRegistration.pushManager.getSubscription();

    if (!subscription) {
      const subscribeOptions: PushSubscriptionOptionsInit = {
        userVisibleOnly: true,
      };

      if (options.vapidPublicKey) {
        subscribeOptions.applicationServerKey = urlBase64ToUint8Array(options.vapidPublicKey);
      }

      subscription = await readyRegistration.pushManager.subscribe(subscribeOptions);
    }

    // Persist subscription in backend if token provided or session active
    const subscriptionJson = subscription.toJSON();
    if (subscriptionJson.endpoint && subscriptionJson.keys) {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (options.idToken) {
        headers.Authorization = `Bearer ${options.idToken}`;
      }

      await fetch('/api/notifications/subscribe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          subscription: {
            endpoint: subscriptionJson.endpoint,
            expirationTime: subscriptionJson.expirationTime,
            keys: subscriptionJson.keys,
          },
          orderId: options.orderId,
        }),
      }).catch((err) => {
        console.warn('[WebPush] Falló guardado en backend:', err);
      });
    }

    return {
      success: true,
      permission: currentPermission,
      subscription,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error al suscribirse a notificaciones.';
    return { success: false, permission: Notification.permission, error: message };
  }
}

export async function unsubscribeUserFromPush(idToken?: string): Promise<boolean> {
  if (!isPushNotificationSupported()) return false;
  try {
    const readyRegistration = await navigator.serviceWorker.ready;
    const subscription = await readyRegistration.pushManager.getSubscription();
    if (!subscription) return true;

    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (idToken) headers.Authorization = `Bearer ${idToken}`;

    await fetch('/api/notifications/subscribe', {
      method: 'DELETE',
      headers,
      body: JSON.stringify({ endpoint }),
    }).catch(() => undefined);

    return true;
  } catch {
    return false;
  }
}

export async function triggerLocalNotification(title: string, options: NotificationOptions = {}): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission !== 'granted') return false;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready.catch(() => null);
      if (registration && typeof registration.showNotification === 'function') {
        await registration.showNotification(title, {
          icon: '/icon.png',
          badge: '/icon.png',
          ...options,
        });
        return true;
      }
    }
    new Notification(title, {
      icon: '/icon.png',
      ...options,
    });
    return true;
  } catch {
    return false;
  }
}

export function playOrderNotificationSound(): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(1050, now + 0.15);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  } catch {
    // Silent fail if audio context blocked by browser autoplay policy
  }
}
