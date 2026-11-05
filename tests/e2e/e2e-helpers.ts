import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { expect, type BrowserContext, type Page } from "@playwright/test";

import { getCleanupSafetyError } from "./cleanup-safety";
import { loadLocalE2EState, shouldUseLocalE2EState } from "./local-state";

export type E2ECleanupState = {
  orderIds: string[];
  productIds: string[];
  registrationEmails: string[];
};

export function newE2ECleanupState(): E2ECleanupState {
  return { orderIds: [], productIds: [], registrationEmails: [] };
}

export function getE2EEnvironment() {
  const localE2EState = shouldUseLocalE2EState() ? loadLocalE2EState() : undefined;
  const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:9002";
  const customerEmail = process.env.E2E_CUSTOMER_EMAIL ?? localE2EState?.customer.email;
  const customerPassword = process.env.E2E_CUSTOMER_PASSWORD ?? localE2EState?.customer.password;
  const staffEmail = process.env.E2E_STAFF_EMAIL ?? localE2EState?.staff.email;
  const staffPassword = process.env.E2E_STAFF_PASSWORD ?? localE2EState?.staff.password;
  const adminEmail = process.env.E2E_ADMIN_EMAIL ?? localE2EState?.admin.email;
  const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? localE2EState?.admin.password;
  const registrationDomain = process.env.E2E_REGISTRATION_DOMAIN ?? (localE2EState ? "local.test" : undefined);
  const localNavigationTimeout = 30_000;

  return {
    baseURL,
    customerEmail,
    customerPassword,
    staffEmail,
    staffPassword,
    adminEmail,
    adminPassword,
    registrationDomain,
    localNavigationTimeout,
  };
}

export async function setupEmulatorRouteMocks(page: Page): Promise<void> {
  if (shouldUseLocalE2EState()) {
    const authEmulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
    await page.route(`http://${authEmulatorHost}/**`, async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/identitytoolkit.googleapis.com/v1/")) {
        url.searchParams.set("key", "demo-key");
        await route.continue({ url: url.toString() });
        return;
      }
      await route.continue();
    });
  }

  page.on("console", (message) => {
    if (message.type() === "error") console.log(`[E2E Console] ${message.type()}: ${message.text()}`);
  });
  page.on("pageerror", (error) => console.log(`[E2E PageError] ${error.name}: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      console.log(`[E2E HTTP] ${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
}

export async function loginUser(page: Page, email: string, password: string, path: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(path)}`);
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  const authSyncResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/auth/sync" && response.request().method() === "POST";
    },
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Ingresar" }).click();
  expect((await authSyncResponse).status()).toBe(200);
  await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}(?:$|[?#])`), { timeout: 30_000 });
}

export async function loginAdmin(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/admin/login");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  const authSyncResponse = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/auth/sync" && response.request().method() === "POST";
    },
    { timeout: 30_000 },
  );
  await page.getByRole("button", { name: "Ingresar" }).click();
  expect((await authSyncResponse).status()).toBe(200);
  await expect(page).toHaveURL(/\/admin\/dashboard(?:$|[?#])/, { timeout: 30_000 });
}

export async function logoutStore(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page.getByRole("link", { name: "Ingresar" })).toBeVisible();
}

export async function logoutAdmin(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect(page).toHaveURL(/\/admin\/login(?:$|[?#])/);
}

export async function mockWhatsApp(context: BrowserContext): Promise<void> {
  await context.route("https://wa.me/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<title>WhatsApp mock</title>",
    }),
  );
}

export async function cleanupE2EArtifacts(state: E2ECleanupState): Promise<void> {
  if (
    process.env.E2E_CLEANUP !== "true" ||
    (state.orderIds.length === 0 && state.productIds.length === 0 && state.registrationEmails.length === 0)
  ) {
    return;
  }

  const safetyError = getCleanupSafetyError(process.env);
  if (safetyError) throw new Error(safetyError);
  const projectId = process.env.FIREBASE_PROJECT_ID!.trim();

  const app =
    getApps().find((candidate) => candidate.name === "e2e-cleanup") ??
    initializeApp(
      {
        projectId,
      },
      "e2e-cleanup",
    );

  const db = getFirestore(app);
  const auth = getAuth(app);

  if (state.orderIds.length > 0) {
    await Promise.all(state.orderIds.map((orderId) => db.collection("pedidos").doc(orderId).delete()));
    for (const orderId of state.orderIds) {
      const [notifications, audits] = await Promise.all([
        db.collection("notificaciones").where("orderId", "==", orderId).get(),
        db.collection("auditoria").where("module", "==", "pedidos").where("entityId", "==", orderId).get(),
      ]);
      const batch = db.batch();
      notifications.docs.forEach((doc) => batch.delete(doc.ref));
      audits.docs.forEach((doc) => batch.delete(doc.ref));
      if (notifications.size > 0 || audits.size > 0) await batch.commit();
    }
  }

  if (state.productIds.length > 0) {
    await Promise.all(state.productIds.map((productId) => db.collection("productos").doc(productId).delete()));
  }

  for (const email of state.registrationEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      await db.collection("users").doc(user.uid).delete();
      await auth.deleteUser(user.uid);
    } catch (error) {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    }
  }
}
