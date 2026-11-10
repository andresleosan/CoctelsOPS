'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { Chrome, GlassWater, ShieldCheck } from 'lucide-react';
import type { UserCredential } from 'firebase/auth';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { safeDestination } from '@/lib/auth-redirect';
import { loginWithEmail, loginWithGoogle, translateAuthError } from '@/lib/auth-client';

export interface LoginFormProps {
  redirectTo?: string;
  initialRole?: 'customer' | 'staff';
  hideRoleToggle?: boolean;
}

export function LoginForm({
  redirectTo,
  initialRole = 'customer',
  hideRoleToggle = false,
}: LoginFormProps) {
  const router = useRouter();
  const [roleMode, setRoleMode] = useState<'customer' | 'staff'>(initialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isStaffMode = roleMode === 'staff';

  const finishLogin = async (userCredential?: UserCredential) => {
    let target = redirectTo;

    if (!target && userCredential) {
      try {
        const tokenResult = await userCredential.user.getIdTokenResult();
        const hasAdminOrStaff = Boolean(
          tokenResult.claims.admin || tokenResult.claims.role === 'staff' || tokenResult.claims.staff
        );
        if (hasAdminOrStaff || isStaffMode) {
          target = '/admin/dashboard';
        }
      } catch {
        if (isStaffMode) target = '/admin/dashboard';
      }
    } else if (!target && isStaffMode) {
      target = '/admin/dashboard';
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
    <div className="space-y-5">
      {/* Selector de Modo: Cliente vs Staff & Barra */}
      {!hideRoleToggle && (
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl border border-white/10 bg-black/40 p-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              setRoleMode('customer');
              setError('');
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all min-h-[44px] ${
              !isStaffMode
                ? 'bg-primary text-white shadow-lg shadow-primary/25 ring-1 ring-primary/50'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <GlassWater className="h-4 w-4" />
            <span>Cliente</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setRoleMode('staff');
              setError('');
            }}
            className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition-all min-h-[44px] ${
              isStaffMode
                ? 'bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/25 ring-1 ring-cyan-400/50'
                : 'text-slate-400 hover:text-cyan-400 hover:bg-white/5'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Staff & Barra</span>
          </button>
        </div>
      )}

      {/* Indicador sutil de Modo Staff */}
      {isStaffMode && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 py-2 text-center">
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider">
              Acceso Operativo
            </Badge>
            <span className="text-[11px] text-cyan-200/80">KDS, barra y gestión de catálogo</span>
          </div>
        </div>
      )}

      {/* Botón de Google OAuth */}
      <Button
        type="button"
        variant="outline"
        className={`h-12 w-full rounded-xl transition-all font-semibold ${
          isStaffMode
            ? 'border-cyan-500/40 bg-card/60 hover:bg-cyan-950/40 text-white shadow-sm hover:border-cyan-400'
            : 'border-white/15 bg-card/60 hover:bg-white/10 text-white shadow-sm hover:border-primary/50'
        }`}
        onClick={loginWithGoogleAccount}
        disabled={isSubmitting}
      >
        <Chrome className="h-5 w-5 mr-2.5 text-primary" />
        {isStaffMode ? 'Continuar con Google (Staff)' : 'Continuar con Google'}
      </Button>

      {/* Separador */}
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-slate-500">
        <span className="h-px flex-1 bg-white/10" /> o con tu correo <span className="h-px flex-1 bg-white/10" />
      </div>

      {/* Formulario de credenciales */}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email" className="text-xs font-semibold text-slate-300">
            Correo electrónico
          </Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder={isStaffMode ? 'staff@coctelsops.com' : 'tu@correo.com'}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-xl border-white/15 bg-black/40 text-white placeholder:text-slate-500 focus-visible:ring-primary"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password" className="text-xs font-semibold text-slate-300">
              Contraseña
            </Label>
            <Link href="/recuperar-acceso" className="text-xs text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-11 rounded-xl border-white/15 bg-black/40 text-white placeholder:text-slate-500 focus-visible:ring-primary"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className={`h-12 w-full rounded-xl font-bold transition-all text-sm ${
            isStaffMode
              ? 'bg-cyan-500 text-slate-950 hover:bg-cyan-400 shadow-lg shadow-cyan-500/25'
              : 'bg-primary text-white hover:bg-primary/90 shadow-lg shadow-primary/25'
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
      <div className="pt-2 text-center">
        {!isStaffMode ? (
          <p className="text-xs text-slate-400">
            ¿Aún no tienes cuenta?{' '}
            <Link href="/registro" className="font-semibold text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        ) : (
          <p className="text-[11px] text-slate-500">
            Acceso restringido para el equipo autorizado de Coctels OPS
          </p>
        )}
      </div>
    </div>
  );
}
