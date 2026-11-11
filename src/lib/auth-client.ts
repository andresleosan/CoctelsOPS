'use client';

import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification as firebaseSendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
  type UserCredential,
} from 'firebase/auth';

import { getFirebaseAuth } from '@/firebase';

const MIN_PASSWORD_LENGTH = 8;

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': 'El correo o la contraseña no son correctos.',
  'auth/wrong-password': 'El correo o la contraseña no son correctos.',
  'auth/user-not-found': 'El correo o la contraseña no son correctos.',
  'auth/email-already-in-use': 'Ya existe una cuenta con este correo.',
  'auth/weak-password': 'La contraseña debe tener al menos 8 caracteres.',
  'auth/invalid-email': 'Escribe un correo electrónico válido.',
  'auth/network-request-failed': 'No pudimos conectarnos. Revisa tu conexión e inténtalo de nuevo.',
  'auth/too-many-requests': 'Demasiados intentos. Espera un momento e inténtalo de nuevo.',
  'auth/popup-blocked': 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo de nuevo.',
  'auth/popup-closed-by-user': 'Cerraste el acceso de Google antes de completarlo.',
};

function getAuthCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

function getClientAuth() {
  return getFirebaseAuth();
}

function createAuthError(code: string): Error & { code: string } {
  const error = new Error(AUTH_ERROR_MESSAGES[code] ?? 'Error de autenticación');
  return Object.assign(error, { code });
}

export function translateAuthError(error: unknown): string {
  return AUTH_ERROR_MESSAGES[getAuthCode(error) ?? ''] ?? 'No pudimos completar el acceso. Inténtalo de nuevo.';
}

export async function loginWithGoogle(): Promise<UserCredential> {
  return signInWithPopup(getClientAuth(), new GoogleAuthProvider());
}

export async function loginWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(getClientAuth(), email.trim(), password);
}

export async function registerWithEmail(
  email: string,
  password: string,
  displayName: string,
): Promise<UserCredential> {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw createAuthError('auth/weak-password');
  }

  const credential = await createUserWithEmailAndPassword(getClientAuth(), email.trim(), password);
  const name = displayName.trim();

  if (name) {
    await updateProfile(credential.user, { displayName: name });
  }

  await sendVerificationEmail(credential.user);
  return credential;
}

export async function sendPasswordReset(email: string): Promise<void> {
  await sendPasswordResetEmail(getClientAuth(), email.trim());
}

export async function sendVerificationEmail(user: User): Promise<void> {
  await firebaseSendEmailVerification(user);
}

export async function logout(): Promise<void> {
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('coctels_admin_authenticated');
    } catch {}
  }
  await signOut(getClientAuth());
}
