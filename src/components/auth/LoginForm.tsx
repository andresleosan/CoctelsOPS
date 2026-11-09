'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { ArrowRight, Chrome, GlassWater, ShieldCheck } from 'lucide-react';
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
        <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-1">
          <button
            type="button"
            onClick={() => {
              setRoleMode('customer');
              setError('');
            }}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all min-h-[38px] ${
              !isStaffMode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
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
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold transition-all min-h-[38px] ${
              isStaffMode
                ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20'
                : 'text-muted-foreground hover:text-cyan-400'
            }`}
          >
            <ShieldCheck className="h-4 w-4" />
            <span>Staff & Barra</span>
          </button>
        </div>
      )}

      {/* Indicador de Modo Staff */}
      {isStaffMode && (
        <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/20 p-3 text-center">
          <div className="flex items-center justify-center gap-2">
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[10px] font-bold uppercase tracking-wider">
              Acceso Operativo
            </Badge>
          </div>
          <p className="mt-1 text-xs text-cyan-200/80">
            Bartenders, cajeros y administradores con acceso a KDS, menú e inventario.
          </p>
        </div>
      )}

      {/* Botón de Google */}
      <Button
        type="button"
        variant="outline"
        className={`h-12 w-full rounded-xl transition-all ${
          isStaffMode
            ? 'border-cyan-500/40 hover:bg-cyan-950/30 text-white'
            : 'border-primary/40'
        }`}
        onClick={loginWithGoogleAccount}
        disabled={isSubmitting}
      >
        <Chrome className="h-5 w-5 mr-2" />
        {isStaffMode ? 'Continuar con Google (Staff)' : 'Continuar con Google'}
      </Button>

      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span className="h-px flex-1 bg-border" /> o con tu correo <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="login-email">Correo electrónico</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            placeholder={isStaffMode ? 'staff@coctelsops.com' : 'tu@correo.com'}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-11 rounded-xl"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Contraseña</Label>
            <Link href="/recuperar-acceso" className="text-xs text-accent hover:underline">
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
            className="h-11 rounded-xl"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          className={`h-12 w-full rounded-xl font-bold transition-all ${
            isStaffMode
              ? 'bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white shadow-lg shadow-cyan-500/20'
              : 'bg-primary text-primary-foreground font-bold shadow-lg shadow-primary/20'
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

      {/* Botón Destacado de Acceso Staff para Diferenciar / Conmutar */}
      {!isStaffMode ? (
        <div className="space-y-3 pt-2">
          <p className="text-center text-sm text-muted-foreground">
            ¿Aún no tienes cuenta?{' '}
            <Link href="/registro" className="font-semibold text-primary hover:underline">
              Regístrate
            </Link>
          </p>

          <div className="pt-2 border-t border-border/50">
            <button
              type="button"
              onClick={() => {
                setRoleMode('staff');
                setError('');
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl border border-cyan-500/30 bg-cyan-950/20 text-cyan-300 hover:bg-cyan-950/40 hover:border-cyan-500/50 transition-all text-xs font-semibold group"
            >
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition-transform shrink-0" />
                <span>¿Eres staff, bartender o admin?</span>
              </span>
              <span className="flex items-center font-bold text-cyan-400 shrink-0">
                Acceso Barra <ArrowRight className="h-3.5 w-3.5 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div className="pt-2 border-t border-border/50 text-center">
          <button
            type="button"
            onClick={() => {
              setRoleMode('customer');
              setError('');
            }}
            className="text-xs text-muted-foreground hover:text-primary transition-colors inline-flex items-center justify-center gap-1.5 py-1"
          >
            <GlassWater className="h-3.5 w-3.5 text-primary" />
            <span>¿Eres cliente? <strong className="font-semibold text-primary underline">Volver al acceso de clientes</strong></span>
          </button>
        </div>
      )}
    </div>
  );
}
