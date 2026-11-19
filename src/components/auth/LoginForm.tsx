'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowLeft, Eye, EyeOff, GlassWater, Lock, Mail, ShieldCheck } from 'lucide-react';
import type { UserCredential } from 'firebase/auth';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeDestination } from '@/lib/auth-redirect';
import { loginWithEmail, loginWithGoogle, translateAuthError } from '@/lib/auth-client';

export interface LoginFormProps {
  redirectTo?: string;
  staffRedirectTo?: string;
  initialRole?: 'customer' | 'staff';
  hideRoleToggle?: boolean;
  onRoleModeChange?: (role: 'customer' | 'staff') => void;
  showBackToStoreLink?: boolean;
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="mr-2.5 h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.44a5.51 5.51 0 0 1-2.39 3.61v3h3.86c2.26-2.08 3.58-5.15 3.58-8.85Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.86-3a7.17 7.17 0 0 1-10.67-3.76H1.41v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.4 14.34a7.21 7.21 0 0 1 0-4.68V6.57H1.41a12 12 0 0 0 0 10.86l3.99-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.41 6.57l3.99 3.09A7.17 7.17 0 0 1 12 4.75Z"
      />
    </svg>
  );
}

export function LoginForm({
  redirectTo,
  staffRedirectTo = '/admin/dashboard',
  initialRole = 'customer',
  hideRoleToggle = false,
  onRoleModeChange,
  showBackToStoreLink = true,
}: LoginFormProps) {
  const router = useRouter();
  const [roleMode, setRoleMode] = useState<'customer' | 'staff'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStaffMode = roleMode === 'staff';

  const selectRoleMode = (nextRole: 'customer' | 'staff') => {
    setRoleMode(nextRole);
    setError('');
    onRoleModeChange?.(nextRole);
  };

  const finishLogin = async (userCredential?: UserCredential) => {
    if (redirectTo) {
      router.push(safeDestination(redirectTo));
      return;
    }

    let target = isStaffMode ? staffRedirectTo : '/';

    if (userCredential) {
      try {
        const tokenResult = await userCredential.user.getIdTokenResult();
        const hasAdminOrStaff = Boolean(
          tokenResult.claims.admin || tokenResult.claims.role === 'staff' || tokenResult.claims.staff
        );
        if (hasAdminOrStaff || isStaffMode) {
          target = staffRedirectTo;
        } else {
          target = '/';
        }
      } catch {
        target = isStaffMode ? staffRedirectTo : '/';
      }
    }

    router.push(safeDestination(target));
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      const cred = await loginWithEmail(email, password);
      await finishLogin(cred);
    } catch (authError) {
      setError(translateAuthError(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  const loginWithGoogleAccount = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      const cred = await loginWithGoogle();
      await finishLogin(cred);
    } catch (authError) {
      setError(translateAuthError(authError));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Selector de Modo: Cliente vs Staff & Barra */}
      {!hideRoleToggle && (
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/15 bg-black/60 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => selectRoleMode('customer')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
              !isStaffMode
                ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-primary/50'
                : 'text-slate-300 hover:bg-white/5 hover:text-white'
            }`}
          >
            <GlassWater className="h-4 w-4" aria-hidden="true" />
            <span>Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => selectRoleMode('staff')}
            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all ${
              isStaffMode
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-400/50'
                : 'text-slate-300 hover:bg-white/5 hover:text-cyan-300'
            }`}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            <span>Staff &amp; Barra</span>
          </button>
        </div>
      )}

      {/* Indicador de Modo Staff */}
      {isStaffMode && (
        <div className="rounded-xl border border-cyan-500/35 bg-cyan-950/35 px-3 py-2 text-center">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Badge className="border-cyan-500/40 bg-cyan-500/20 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              Acceso Operativo
            </Badge>
            <span className="text-[11px] text-cyan-100/90">KDS, barra y gestión de catálogo</span>
          </div>
        </div>
      )}

      {/* Botón de Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className={`h-12 w-full rounded-xl font-semibold text-white transition-all ${
          isStaffMode
            ? 'border-cyan-500/40 bg-white/[0.04] hover:border-cyan-400 hover:bg-cyan-950/40'
            : 'border-white/20 bg-white/[0.04] hover:border-primary/60 hover:bg-white/10'
        }`}
        onClick={loginWithGoogleAccount}
        disabled={isSubmitting}
      >
        <GoogleMark />
        {isStaffMode ? 'Continuar con Google (Staff)' : 'Continuar con Google'}
      </Button>

      {/* Separador */}
      <div className="flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
        <span className="h-px flex-1 bg-white/15" /> o con tu correo <span className="h-px flex-1 bg-white/15" />
      </div>

      {/* Formulario de credenciales */}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="login-email" className="text-xs font-semibold text-slate-200">
            Correo electrónico
          </Label>
          <div className="relative">
            <Mail
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              placeholder={isStaffMode ? 'staff@coctelsops.com' : 'tu@correo.com'}
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={`h-12 rounded-xl border-white/20 bg-black/60 pl-10 text-white placeholder:text-slate-400 ${
                isStaffMode ? 'focus-visible:ring-cyan-400' : 'focus-visible:ring-primary'
              }`}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="login-password" className="text-xs font-semibold text-slate-200">
              Contraseña
            </Label>
            <Link
              href="/recuperar-acceso"
              className={`inline-flex min-h-[28px] items-center text-xs font-medium hover:underline ${
                isStaffMode ? 'text-cyan-300' : 'text-primary'
              }`}
            >
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <div className="relative">
            <Lock
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            />
            <Input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={`h-12 rounded-xl border-white/20 bg-black/60 pl-10 pr-12 text-white placeholder:text-slate-400 ${
                isStaffMode ? 'focus-visible:ring-cyan-400' : 'focus-visible:ring-primary'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              aria-label={showPassword ? 'Ocultar clave' : 'Mostrar clave'}
              className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className={`h-12 w-full rounded-xl text-sm font-bold transition-all active:scale-[0.99] ${
            isStaffMode
              ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25 hover:bg-cyan-400'
              : 'bg-primary text-white shadow-lg shadow-primary/25 hover:bg-primary/90'
          }`}
          disabled={isSubmitting}
        >
          {isSubmitting
            ? 'Ingresando...'
            : isStaffMode
            ? 'Ingresar al Panel Operativo'
            : 'Ingresar'}
        </Button>
      </form>

      {/* Enlace de registro o nota staff */}
      <div className="pt-1 text-center">
        {!isStaffMode ? (
          <p className="text-xs text-slate-300">
            ¿Aún no tienes cuenta?{' '}
            <Link href="/registro" className="font-semibold text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        ) : (
          <p className="text-[11px] text-slate-400">
            Acceso restringido para el equipo autorizado de Coctels OPS
          </p>
        )}
      </div>

      {/* Opción directa para volver a la tienda */}
      {showBackToStoreLink && (
        <div className="border-t border-white/10 pt-3">
          <Link
            href="/"
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.04] px-4 text-xs font-semibold text-white/90 transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            <span>Volver a la tienda</span>
          </Link>
        </div>
      )}
    </div>
  );
}
