# Coctels OPS

## Contexto del proyecto

- Es una tienda mobile-first y panel operativo en Next.js 16 App Router; las rutas y layouts viven en `src/app/`.
- El alias TypeScript `@/*` apunta a `src/*`; reutiliza las capas existentes en `src/components/`, `src/lib/`, `src/firebase/`, `src/types/` y `src/context/` antes de crear otra.
- La autenticación y autorización pasan por Firebase Auth, `src/lib/auth/verify-request.ts` y `src/lib/auth/permissions.ts`; las rutas protegidas deben conservar esa verificación.
- Firebase Admin/Firestore es exclusivamente código servidor (`src/lib/firebase-admin.ts` y `src/lib/firestore/`); no importes módulos con `server-only` desde componentes cliente.
- Las colecciones operativas actuales incluyen `pedidos`, `productos`, `categorias`, `users`, `roles`, `promociones`, `inventario_movimientos`, `notificaciones`, `auditoria` y `configuracion`.
- Las imágenes del catálogo usan Cloudflare R2 mediante `src/lib/catalog/`; las credenciales R2 son privadas y `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` solo contiene la base HTTPS pública.
- `next.config.ts` genera los `remotePatterns` de imágenes desde `src/lib/catalog/image-hosts.ts`; actualiza esa fuente al cambiar dominios de imágenes.

## Comandos

- Instalar: `pnpm install --frozen-lockfile`.
- Desarrollo: `pnpm dev` y abrir `http://localhost:9002`.
- Gate recomendado: `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm build`.
- Auditoría de dependencias: `pnpm audit --prod --audit-level high`; revisar antes de aceptar cambios de dependencias.
- Test unitario enfocado: `pnpm exec vitest run tests/lib/<archivo>.test.ts`.
- `pnpm test` excluye `tests/e2e/**`; el test `tests/firestore-rules-emulator.test.ts` también queda excluido salvo que `FIRESTORE_RULES_EMULATOR=true`.
- Reglas Firestore con emulator: `pnpm test:firestore-rules`.
- E2E reproducible: `pnpm test:e2e:local`; requiere Firebase CLI y Java 11+. Usa Auth/Firestore Emulator, puertos loopback dinámicos y limpia solo el estado efímero de `.tmp/e2e/`.
- E2E externo: `pnpm test:e2e`; con `E2E_BASE_URL` usa una app existente, y sin esa variable inicia `pnpm dev`, pero no inicia los emuladores; requiere navegadores y variables/credenciales de prueba.
- El MCP de Playwright está definido en `opencode.json` pero deshabilitado; no asumir que está disponible.

## Datos y operaciones

- Copia `.env.example` a `.env.local`; nunca guardes credenciales Firebase Admin, R2 o tokens en Git, tests, respuestas HTTP o logs.
- Los emuladores solo deben activarse explícitamente con `FIREBASE_EMULATORS=true` y `NEXT_PUBLIC_FIREBASE_EMULATORS=true`, usando hosts `localhost`/`127.0.0.1`; fuera de ese modo Firebase Admin exige `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` y `FIREBASE_PRIVATE_KEY`.
- WhatsApp se administra mediante `configuracion/principal`; los consumidores públicos usan `StoreConfiguration` y no una variable pública.
- El manifiesto real `scripts/catalog/products.json` y `scripts/catalog/images/` están ignorados por Git. `pnpm catalog:import` hace dry-run; para escribir se usa `pnpm catalog:import --write` y requiere acceso/variables de Firebase y R2.
- La migración `pnpm exec tsx scripts/migrate-orders.ts` copia `orders/{id}` a `pedidos/{id}` sin borrar la fuente; verifica con `pnpm exec tsx scripts/verify-migration.ts`. Contra staging/producción exige backup verificable y aprobación explícita.
- El despliegue de reglas/índices usa `firebase deploy --project "$env:FIREBASE_PROJECT_ID" --only firestore:rules,firestore:indexes`; revisar siempre el proyecto objetivo antes de ejecutarlo.
- No ejecutar despliegues, migraciones, seeds (`scripts/seed-catalog.ts`) ni importaciones con escritura contra un proyecto remoto sin confirmación del operador.

## Referencias

- `README.md` contiene el setup local, variables de entorno, QA con emuladores y rutas principales (`/menu`, `/checkout`, `/admin/dashboard`).
- `firebase.json`, `firestore.rules` y `firestore.indexes.json` son la fuente ejecutable para Firestore y emuladores.
