import { config } from "dotenv";
config({ path: ".env.local" });

import { getSeedAdminAuth, getSeedAdminDb } from "./firebase-admin";

async function main(): Promise<void> {
  const arg = process.argv[2]?.trim();
  if (!arg) {
    throw new Error("Uso: pnpm exec tsx scripts/set-admin.ts <UID o Email>");
  }

  const auth = getSeedAdminAuth();
  let firebaseUser;
  if (arg.includes("@")) {
    firebaseUser = await auth.getUserByEmail(arg);
  } else {
    firebaseUser = await auth.getUser(arg);
  }

  const uid = firebaseUser.uid;
  const claims = { ...(firebaseUser.customClaims ?? {}), admin: true };
  await auth.setCustomUserClaims(uid, claims);

  const ref = getSeedAdminDb().collection("users").doc(uid);
  const existing = await ref.get();
  await ref.set({
    uid,
    email: firebaseUser.email ?? "",
    displayName: firebaseUser.displayName ?? null,
    photoURL: firebaseUser.photoURL ?? null,
    active: true,
    accountType: "admin",
    roleIds: ["admin"],
    ...(existing.exists ? {} : { telefono: null, addresses: [], createdAt: new Date().toISOString() }),
    lastLoginAt: new Date().toISOString(),
  }, { merge: true });

  console.log(`Administrador configurado con éxito para ${firebaseUser.email} (UID: ${uid}).`);
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "No fue posible configurar el administrador");
  process.exitCode = 1;
});
