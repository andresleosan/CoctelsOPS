import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";

import { assertLoopbackEmulatorHosts } from "../src/firebase/emulators";
import { isAllowedCatalogImage } from "../src/lib/catalog/image-hosts";
import { DEFAULT_STORE_CONFIGURATION } from "../src/types/operations";
import { PRODUCTS, type Product } from "../src/app/lib/products";

export const LOCAL_E2E_ROLES = ["customer", "staff", "admin"] as const;
export type LocalE2ERole = (typeof LOCAL_E2E_ROLES)[number];
export const LOCAL_E2E_STATE_VERSION = 1 as const;
export const LOCAL_E2E_OWNERSHIP_FIELD = "e2eRunId" as const;

export type LocalE2EUser = {
  email: string;
  password: string;
  uid: string;
};

export type LocalE2EResources = {
  roles: string[];
  products: string[];
  categories: string[];
  configuration: string[];
};

export type LocalE2EState = {
  version: typeof LOCAL_E2E_STATE_VERSION;
  runId: string;
  customer: LocalE2EUser;
  staff: LocalE2EUser;
  admin: LocalE2EUser;
  resources: LocalE2EResources;
};

export type LocalE2EResourceRef = {
  collection: "users" | "roles" | "productos" | "categorias" | "configuracion";
  id: string;
};

const ROLE_SEEDS: Record<LocalE2ERole, {
  accountType: LocalE2ERole;
  name: string;
  permissions: string[];
}> = {
  customer: {
    accountType: "customer",
    name: "Cliente E2E",
    permissions: [],
  },
  staff: {
    accountType: "staff",
    name: "Staff E2E",
    permissions: [
      "pedidos.read",
      "pedidos.update",
      "categorias.read",
      "categorias.write",
      "clientes.read",
      "usuarios.read",
      "notificaciones.read",
      "roles.read",
    ],
  },
  admin: {
    accountType: "admin",
    name: "Administrador E2E",
    permissions: [],
  },
};

const CATEGORY_SEEDS = {
  granizado: { name: "Granizados", active: true, order: 1 },
  cocktail: { name: "Cocteles", active: true, order: 2 },
  special: { name: "Especiales", active: true, order: 3 },
} as const;

function expectedResources(): LocalE2EResources {
  return {
    roles: ["customer", "staff", "admin"],
    products: PRODUCTS.map((product) => product.id),
    categories: Object.keys(CATEGORY_SEEDS),
    configuration: ["principal"],
  };
}

async function deleteCreatedReferences(db: Firestore, resources: readonly LocalE2EResourceRef[]): Promise<void> {
  let batch = db.batch();
  let pending = 0;

  for (const resource of resources) {
    batch.delete(db.collection(resource.collection).doc(resource.id));
    pending += 1;
    if (pending === 500) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending > 0) await batch.commit();
}

function formatRollbackError(error: unknown): string {
  return error instanceof Error ? error.message : "Error desconocido";
}

async function rollbackCreatedLocalE2EData(
  auth: Auth,
  db: Firestore,
  createdUserIds: readonly string[],
  createdResources: readonly LocalE2EResourceRef[],
): Promise<void> {
  const failures: string[] = [];

  try {
    await deleteCreatedReferences(db, createdResources);
  } catch (error) {
    failures.push(`Firestore: ${formatRollbackError(error)}`);
  }

  for (const uid of [...new Set(createdUserIds)]) {
    try {
      await auth.deleteUser(uid);
    } catch (error) {
      failures.push(`Auth ${uid}: ${formatRollbackError(error)}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`Rollback transaccional incompleto: ${failures.join("; ")}`);
  }
}

export function getLocalE2EStatePath(environment: Record<string, string | undefined> = process.env): string {
  const configuredPath = environment.E2E_STATE_FILE?.trim();
  return path.resolve(process.cwd(), configuredPath || ".tmp/e2e/local-state.json");
}

export function createLocalE2EPassword(): string {
  return randomBytes(24).toString("hex");
}

export function getLocalE2EProductImage(product: Pick<Product, "id" | "image">): string {
  const image = product.image.trim();
  return image && isAllowedCatalogImage(image)
    ? image
    : "/catalog-placeholder.svg";
}

export function createLocalE2EState(timestamp = Date.now()): LocalE2EState {
  const runId = `e2e-${timestamp}-${randomBytes(8).toString("hex")}`;
  const createUser = (role: LocalE2ERole): LocalE2EUser => ({
    email: `${role}-${runId}@local.test`,
    password: createLocalE2EPassword(),
    uid: `${runId}-${role}`,
  });

  return {
    version: LOCAL_E2E_STATE_VERSION,
    runId,
    customer: createUser("customer"),
    staff: createUser("staff"),
    admin: createUser("admin"),
    resources: expectedResources(),
  };
}

function hasExactKeys(value: object, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value).sort();
  return actualKeys.length === keys.length && actualKeys.every((key, index) => key === [...keys].sort()[index]);
}

function hasExpectedResources(value: unknown): value is LocalE2EResources {
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasExactKeys(value, ["roles", "products", "categories", "configuration"])) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const expected = expectedResources();
  return Object.keys(expected).every((key) => {
    const actual = candidate[key];
    const expectedValues = expected[key as keyof LocalE2EResources];
    return Array.isArray(actual)
      && actual.length === expectedValues.length
      && actual.every((item, index) => item === expectedValues[index]);
  });
}

export function isLocalE2EState(value: unknown): value is LocalE2EState {
  if (!value || typeof value !== "object" || Array.isArray(value) || !hasExactKeys(value, ["version", "runId", "customer", "staff", "admin", "resources"])) {
    return false;
  }

  const candidateState = value as Record<string, unknown>;
  if (candidateState.version !== LOCAL_E2E_STATE_VERSION
    || typeof candidateState.runId !== "string"
    || !/^e2e-\d+-[a-f0-9]{16}$/.test(candidateState.runId)
    || !hasExpectedResources(candidateState.resources)) {
    return false;
  }

  return (Object.keys(ROLE_SEEDS) as LocalE2ERole[]).every((role) => {
    const user = candidateState[role];
    if (!user || typeof user !== "object" || Array.isArray(user) || !hasExactKeys(user, ["email", "password", "uid"])) return false;
    const candidate = user as Record<string, unknown>;
    return candidate.email === `${role}-${candidateState.runId}@local.test`
      && typeof candidate.password === "string"
      && candidate.password.length >= 12
      && candidate.uid === `${candidateState.runId}-${role}`;
  });
}

export function getLocalE2EResourcePlan(state: LocalE2EState): LocalE2EResourceRef[] {
  if (!isLocalE2EState(state)) throw new Error("El estado E2E no tiene el formato esperado.");

  return [
    ...(["customer", "staff", "admin"] as const).map((role) => ({ collection: "users" as const, id: state[role].uid })),
    ...state.resources.roles.map((id) => ({ collection: "roles" as const, id })),
    ...state.resources.products.map((id) => ({ collection: "productos" as const, id })),
    ...state.resources.categories.map((id) => ({ collection: "categorias" as const, id })),
    ...state.resources.configuration.map((id) => ({ collection: "configuracion" as const, id })),
  ];
}

function assertLocalEmulatorEnvironment(): void {
  if (process.env.FIREBASE_EMULATORS !== "true") {
    throw new Error("El setup E2E solo puede ejecutarse con FIREBASE_EMULATORS=true.");
  }
  if (!process.env.FIREBASE_PROJECT_ID?.trim()) {
    throw new Error("El setup E2E requiere FIREBASE_PROJECT_ID para el proyecto demo local.");
  }
  assertLoopbackEmulatorHosts(process.env);
}

function writeLocalE2EState(state: LocalE2EState): void {
  const stateFile = getLocalE2EStatePath();
  mkdirSync(path.dirname(stateFile), { recursive: true });
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

function removeLocalE2EStateFile(): void {
  const stateFile = getLocalE2EStatePath();
  if (existsSync(stateFile)) unlinkSync(stateFile);
}

export async function prepareLocalE2EState(): Promise<LocalE2EState> {
  assertLocalEmulatorEnvironment();
  if (existsSync(getLocalE2EStatePath())) {
    throw new Error("Ya existe un archivo de estado E2E; ejecuta cleanup antes de preparar otra corrida.");
  }

  const { getAdminAuth, getAdminDb } = await import("../src/lib/firebase-admin");
  const auth = getAdminAuth();
  const db = getAdminDb();
  const state = createLocalE2EState();
  const now = new Date().toISOString();
  const createdAuthUserIds: string[] = [];
  const createdResources: LocalE2EResourceRef[] = [];
  let stateFileCreated = false;
  const markCreated = (resource: LocalE2EResourceRef): void => {
    createdResources.push(resource);
  };

  try {
    for (const role of Object.keys(ROLE_SEEDS) as LocalE2ERole[]) {
      const user = await auth.createUser({
        email: state[role].email,
        password: state[role].password,
        emailVerified: true,
        displayName: ROLE_SEEDS[role].name,
        uid: state[role].uid,
      });
      createdAuthUserIds.push(user.uid);
      if (user.uid !== state[role].uid) throw new Error("Firebase Auth no devolvio el UID E2E esperado.");
    }

    for (const role of LOCAL_E2E_ROLES) {
      await auth.setCustomUserClaims(state[role].uid, {
        e2eRunId: state.runId,
        ...(role === "admin" ? { admin: true } : {}),
      });
    }

    for (const role of Object.keys(ROLE_SEEDS) as LocalE2ERole[]) {
      const seed = ROLE_SEEDS[role];
      await db.collection("users").doc(state[role].uid).create({
        [LOCAL_E2E_OWNERSHIP_FIELD]: state.runId,
        e2eManaged: true,
        uid: state[role].uid,
        email: state[role].email,
        displayName: seed.name,
        photoURL: null,
        telefono: null,
        addresses: [],
        active: true,
        accountType: seed.accountType,
        roleIds: [role],
        permissions: [],
        createdAt: now,
        lastLoginAt: now,
      });
      markCreated({ collection: "users", id: state[role].uid });
    }

    for (const [id, seed] of Object.entries(ROLE_SEEDS)) {
      await db.collection("roles").doc(id).create({
        [LOCAL_E2E_OWNERSHIP_FIELD]: state.runId,
        e2eManaged: true,
        name: seed.name,
        description: `Rol local para pruebas E2E (${id}).`,
        active: true,
        permissions: seed.permissions,
        createdAt: now,
        updatedAt: now,
      });
      markCreated({ collection: "roles", id });
    }

    for (const product of PRODUCTS) {
      const { id, ...data } = { ...product, image: getLocalE2EProductImage(product) };
      await db.collection("productos").doc(id).create({
        ...data,
        [LOCAL_E2E_OWNERSHIP_FIELD]: state.runId,
        e2eManaged: true,
        updatedAt: now,
      });
      markCreated({ collection: "productos", id });
    }

    for (const [id, data] of Object.entries(CATEGORY_SEEDS)) {
      await db.collection("categorias").doc(id).create({
        ...data,
        [LOCAL_E2E_OWNERSHIP_FIELD]: state.runId,
        e2eManaged: true,
        updatedAt: now,
      });
      markCreated({ collection: "categorias", id });
    }

    await db.collection("configuracion").doc("principal").create({
      ...DEFAULT_STORE_CONFIGURATION,
      businessHours: DEFAULT_STORE_CONFIGURATION.businessHours.map((hour) => ({
        ...hour,
        open: "00:00",
        close: "23:59",
        closed: false,
      })),
      [LOCAL_E2E_OWNERSHIP_FIELD]: state.runId,
      e2eManaged: true,
      updatedAt: now,
    });
    markCreated({ collection: "configuracion", id: "principal" });

    writeLocalE2EState(state);
    stateFileCreated = true;
    return state;
  } catch (error) {
    try {
      await rollbackCreatedLocalE2EData(auth, db, createdAuthUserIds, createdResources);
      if (stateFileCreated) removeLocalE2EStateFile();
    } catch (rollbackError) {
      throw new Error(`Fallo de setup E2E y rollback incompleto: ${rollbackError instanceof Error ? rollbackError.message : "Error desconocido"}`);
    }
    throw error;
  }
}

if (require.main === module) {
  prepareLocalE2EState()
    .then(() => {
      console.log(`Estado E2E local preparado para ${LOCAL_E2E_ROLES.length} usuarios.`);
    })
    .catch((error: unknown) => {
      console.error("No fue posible preparar el estado E2E local", error instanceof Error ? error.message : "Error desconocido");
      process.exitCode = 1;
    });
}
