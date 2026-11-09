import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let seedApp: App | undefined;

function requireSeedEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

export function getSeedAdminApp(): App {
  if (!seedApp) {
    seedApp = getApps()[0] ?? initializeApp({
      credential: cert({
        projectId: requireSeedEnv("FIREBASE_PROJECT_ID"),
        clientEmail: requireSeedEnv("FIREBASE_CLIENT_EMAIL"),
        privateKey: requireSeedEnv("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n"),
      }),
    });
  }

  return seedApp;
}

export function getSeedAdminDb(): Firestore {
  return getFirestore(getSeedAdminApp());
}

export function getSeedAdminAuth(): Auth {
  return getAuth(getSeedAdminApp());
}
