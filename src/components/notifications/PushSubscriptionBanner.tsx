'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, Bell, BellRing, CheckCircle2, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import {
  getNotificationPermission,
  isPushNotificationSupported,
  subscribeUserToPush,
} from '@/lib/notifications/web-push';

export interface PushSubscriptionBannerProps {
  orderId?: string;
  className?: string;
  onSubscribed?: () => void;
}

export function PushSubscriptionBanner({
  orderId,
  className = '',
  onSubscribed,
}: PushSubscriptionBannerProps) {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [loading, setLoading] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isPushNotificationSupported()) {
      setPermission('unsupported');
      return;
    }

    const current = getNotificationPermission();
    setPermission(current);
    if (current === 'granted') {
      // Check if user previously subscribed
      const dismissedStorage = sessionStorage.getItem(`coctels_push_dismissed_${orderId ?? 'global'}`);
      if (dismissedStorage) {
        setDismissed(true);
      }
    }
  }, [orderId]);

  if (permission === 'unsupported' || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(`coctels_push_dismissed_${orderId ?? 'global'}`, 'true');
  };

  const handleSubscribe = async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      let idToken: string | undefined;
      if (user) {
        idToken = await user.getIdToken();
      }

      // Fetch public VAPID key if available
      let vapidPublicKey: string | undefined;
      try {
        const res = await fetch('/api/notifications/subscribe');
        if (res.ok) {
          const data = (await res.json()) as { vapidPublicKey?: string };
          vapidPublicKey = data.vapidPublicKey || undefined;
        }
      } catch {
        // Fallback without server key
      }

      const result = await subscribeUserToPush({
        orderId,
        idToken,
        vapidPublicKey,
      });

      setPermission(result.permission);

      if (result.success) {
        setSubscribed(true);
        if (onSubscribed) onSubscribed();
      } else if (result.permission === 'denied') {
        setErrorMsg('Notificaciones bloqueadas en tu navegador. Puedes activarlas desde el ícono de candado en la barra de direcciones.');
      } else {
        setErrorMsg(result.error ?? 'No fue posible activar las notificaciones.');
      }
    } catch {
      setErrorMsg('Ocurrió un error al intentar activar las notificaciones.');
    } finally {
      setLoading(false);
    }
  };

  if (subscribed) {
    return (
      <div
        role="status"
        className={`flex items-center justify-between gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/40 p-4 text-emerald-300 backdrop-blur-md ${className}`}
      >
        <div className="flex items-center gap-2.5">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
          <p className="text-xs font-semibold sm:text-sm">
            ¡Avisos activados! Te notificaremos en tiempo real ante cualquier cambio de tu pedido.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-8 w-8 min-h-[44px] min-w-[44px] p-0 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100"
          aria-label="Cerrar aviso"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label="Aviso de suscripción a notificaciones del pedido"
      className={`relative overflow-hidden rounded-2xl border border-primary/30 bg-card/90 p-4 shadow-xl backdrop-blur-md md:p-5 ${className}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            {permission === 'denied' ? (
              <AlertCircle className="h-5 w-5 text-amber-400" />
            ) : (
              <BellRing className="h-5 w-5 animate-pulse text-primary" />
            )}
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-foreground">
              {permission === 'denied'
                ? 'Notificaciones desactivadas'
                : '¿Quieres enterarte al instante de tu pedido?'}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {permission === 'denied'
                ? (errorMsg || 'Las notificaciones están bloqueadas en tu navegador. Habilítalas en la configuración de permisos del sitio para recibir alertas automáticas.')
                : 'Te avisamos cuando tu cóctel pase a preparación, esté en camino y llegue a tu puerta, sin necesidad de refrescar la página.'}
            </p>
            {errorMsg && permission !== 'denied' && (
              <p className="text-xs font-medium text-destructive mt-1">{errorMsg}</p>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
          className="h-8 w-8 min-h-[44px] min-w-[44px] shrink-0 p-0 text-muted-foreground hover:bg-white/10 hover:text-foreground"
          aria-label="Descartar aviso de notificaciones"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {permission !== 'denied' && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 pt-1 sm:justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            className="min-h-[44px] rounded-xl text-xs text-muted-foreground hover:text-foreground"
          >
            Ahora no
          </Button>
          <Button
            size="sm"
            onClick={handleSubscribe}
            disabled={loading}
            className="min-h-[44px] rounded-xl bg-primary px-4 text-xs font-bold text-primary-foreground shadow-md transition-transform active:scale-95 hover:opacity-90"
          >
            {loading ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Activando...
              </>
            ) : (
              <>
                <Bell className="mr-1.5 h-3.5 w-3.5" />
                Activar notificaciones
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
export default PushSubscriptionBanner;
