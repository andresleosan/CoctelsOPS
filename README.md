# Coctels OPS

Coctels OPS es una plataforma SaaS mobile-first integral de pedidos y panel operativo para locales de cócteles y granizados artesanales, construida con Next.js 16 (App Router), Firebase Auth, Firestore y Cloudflare R2. Soporta storefronts públicos personalizados por local (`/m/[slug]`), asistente conversacional inteligente (Opsy Bot con DeepSeek), gestión de menú en tiempo real para staff de barra y checkout mobile-first con confirmación rápida por WhatsApp.

Producción actual: <https://coctelsops.vercel.app/>

## Requisitos

- Node.js 22 o superior y pnpm 11.
- Firebase CLI para publicar reglas e índices y ejecutar emuladores locales.
- Java 11 o superior para Firebase Emulator Suite.
- Un proyecto Firebase separado para desarrollo, staging o producción.
- Credenciales de Firebase Admin entregadas por un operador autorizado únicamente mediante variables de entorno.
- Un bucket de Cloudflare R2 para las imágenes del catálogo y credenciales R2 entregadas únicamente mediante variables de entorno.

## Configuración local

1. Instala dependencias: `pnpm install --frozen-lockfile`.
2. Verifica las herramientas locales: `firebase --version` y `java -version`. Si falta Firebase CLI, instálalo con `pnpm add --global firebase-tools`; Java 11 o superior es requisito de Firebase Emulator Suite.
3. Copia `.env.example` a `.env.local` y reemplaza todos los valores de ejemplo con la configuración de tu proyecto. No subas `.env.local`.
4. En Firebase Console habilita Authentication con estos proveedores:
   - Email/Password.
   - Google, con los dominios autorizados configurados.
   - Verificación de correo y recuperación de contraseña mediante las plantillas de correo de Firebase.
5. Publica reglas e índices desde el directorio raíz, después de revisar el proyecto seleccionado:
   ```powershell
   firebase login
   firebase projects:list
   firebase deploy --project "$env:FIREBASE_PROJECT_ID" --only firestore:rules,firestore:indexes
   ```
6. Inicia el servidor: `pnpm dev`. La aplicación queda en `http://localhost:9002`.

`firebase.json` referencia `firestore.rules` y `firestore.indexes.json`, configura los emuladores locales y no contiene secretos. El flujo oficial de QA local usa los runners descritos abajo, selecciona puertos loopback dinámicos y crea configuración temporal; no requiere un proyecto Firebase remoto.

## QA local con Firebase Emulator Suite

Ejecuta primero `pnpm install --frozen-lockfile`, `firebase --version` y `java -version`. Java 11 o superior es requisito del Emulator Suite.

```powershell
pnpm test:firestore-rules
pnpm test:e2e:local
```

`pnpm test:firestore-rules` inicia solo Firestore Emulator, carga las reglas e índices del repositorio y valida cinco casos reales de autorización para cliente, staff y admin. Usa fixtures namespaced, elimina únicamente sus documentos y borra la configuración temporal al finalizar.

`pnpm test:e2e:local` inicia Auth y Firestore Emulator en puertos loopback libres, prepara estado y credenciales efímeras, ejecuta los tres escenarios browser locales y ejecuta cleanup aunque haya fallos. El reporte HTML queda en `qa/reports`, los resultados/screenshot/traces en `qa/test-results` y el estado/configuración efímeros en `.tmp/e2e`.

El runner establece únicamente variables locales como `FIREBASE_EMULATORS=true`, `NEXT_PUBLIC_FIREBASE_EMULATORS=true`, `FIREBASE_PROJECT_ID=demo-coctels-e2e`, hosts `127.0.0.1:<puerto>`, `E2E_CLEANUP=true` y `E2E_CLEANUP_CONFIRM=DELETE_E2E_DATA`. No uses credenciales reales. No ejecutes `firebase deploy`, seed ni migraciones desde este flujo; las operaciones remotas necesitan backup y aprobación explícita del operador.

## Variables de entorno

`.env.example` lista estas variables públicas como contrato de configuración del cliente; no sustituyen las reglas de Firebase:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_WHATSAPP_PHONE`

Las variables privadas son obligatorias para las rutas protegidas y los scripts administrativos:

- `FIREBASE_PROJECT_ID`
- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`, con `\n` escapados si se entrega en una sola línea.
- `DEEPSEEK_API_KEY`, clave privada obligatoria en el servidor para el asistente conversacional Opsy Bot.

## Sugeridor AI

`/ai-suggest` está disponible sin iniciar sesión. Las preferencias se recortan y se limitan a
240 caracteres antes de invocar Gemini; la llamada espera como máximo 10 segundos. Si Gemini
falla, expira o devuelve una respuesta inválida, la interfaz muestra un mensaje genérico y no
expone detalles técnicos.

El Sugeridor AI permite cinco solicitudes por identidad durante cada ventana de diez minutos.
La identidad se obtiene de los headers de proxy confiables y, si no hay uno disponible, usa un
bucket anónimo compartido. `AI_RATE_LIMIT_SECRET` es un secreto privado obligatorio en el
servidor; configúralo en cada entorno que ejecute la action. Firestore solo guarda un digest
HMAC de la identidad, nunca la IP cruda, las preferencias ni la respuesta. Los documentos de
`ai_rate_limits` se reinician lógicamente al vencer la ventana y no tienen limpieza inmediata.
Si se supera el límite o falta configuración, la interfaz conserva el mensaje genérico
`No pudimos generar una sugerencia en este momento.`

La sugerencia no crea productos, pedidos ni una compra directa. El botón `Ver menú y pedir`
navega a `/menu`; el flujo existente continúa solicitando autenticación y verificación de correo
al llegar al checkout.

Gemini es un servicio con facturación por uso. No hay una cuota mensual defendible documentada
sin un volumen de solicitudes real; antes de habilitar tráfico significativo o una campaña,
configura una alerta y un límite de facturación en Google AI/Cloud para el proyecto utilizado.

R2 ya es el backend de imágenes del catálogo. Firebase Admin, Firebase Auth y Firestore siguen siendo necesarios para las rutas protegidas, el login y los datos de productos. Configura estas variables privadas en el entorno del servidor o de los scripts:

- `R2_ACCOUNT_ID`
- `R2_BUCKET_NAME`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_PUBLIC_BASE_URL`, por ejemplo `https://img.example.com`.

Para que la validación y el build del cliente acepten las imágenes R2, `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` debe coincidir con `R2_PUBLIC_BASE_URL`. Esta variable pública solo contiene la base HTTPS, nunca credenciales.

El token de R2 debe tener permisos limitados al bucket del catálogo, sin acceso a otros buckets ni permisos administrativos. `r2.dev` es solo para pruebas; para imágenes públicas usa un dominio controlado mediante `R2_PUBLIC_BASE_URL`. No pegues credenciales R2 o Firebase en el chat, no las imprimas en logs y no las guardes en Git.

Nunca pongas una clave privada, un token de servicio o una contraseña en `README.md`, tests, `src/firebase/config.ts` ni en el repositorio. Los valores de `.env.example` son placeholders. Antes de desplegar, verifica que la configuración pública del cliente y el proyecto usado por Firebase Admin sean el mismo proyecto.

El importador del catálogo lee el manifiesto privado `scripts/catalog/products.json` y las imágenes desde `scripts/catalog/images/`. Valida todo, ejecuta un dry-run por defecto y usa R2 para las imágenes cuando se autoriza `--write`; Firestore conserva los productos y la auditoría. No borra productos ausentes y no se deben agregar imágenes binarias ni credenciales al repositorio.

Nota: el bootstrap actual del cliente importa `src/firebase/config.ts` directamente. Antes de usar otro proyecto Firebase, verifica y actualiza esa configuración pública mediante el mecanismo de despliegue aprobado; no asumas que definir `NEXT_PUBLIC_*` cambia por sí solo el proyecto del navegador.

## Asistente Conversacional Opsy Bot

Opsy Bot (`/api/opsy/chat`) es el asistente inteligente de la plataforma impulsado por DeepSeek en el servidor, con personalidad antioqueña cálida y enfocada en coctelería y granizados:
- **Seguridad y Guardrails:** La clave `DEEPSEEK_API_KEY` reside exclusivamente en `server-only`. El endpoint limita entradas a 1.000 caracteres, respuestas a 512 tokens y aplica un rate limiter de 5 solicitudes cada 10 minutos por IP/usuario.
- **Resiliencia:** En caso de indisponibilidad temporal de la API externa, Opsy se recupera automáticamente con un fallback local contextual sin interrumpir la experiencia.
- **Acciones Directas:** Recomienda productos de la carta y genera botones de acción rápida para agregar al carrito o abrir el personalizador en 1 tap.

## Plataforma SaaS Multi-Tenant (`/m/[slug]`)

Coctels OPS opera como plataforma SaaS multi-comercio para locales de granizados y cócteles:
- **Aislamiento en Base de Datos:** Colecciones de Firestore (`productos`, `categorias`, `configuracion`, `pedidos`) y almacenamiento R2 (`tenants/{negocioId}/...`) incorporan la clave `negocioId`.
- **Reglas de Seguridad Estrictas:** `firestore.rules` garantiza que el staff de un local solo pueda consultar y mutar los recursos pertenecientes a su `negocioId`.
- **Storefront Público Dinámico:** La ruta `/m/[slug]` renderiza la identidad de marca, menú, banners y contacto de WhatsApp específicos de cada negocio registrado.

## Panel Staff Mobile-First y Carga Móvil a R2

Diseñado para uso en teléfonos y tablets directamente en la barra de atención:
- **Control de Stock en 1-Tap:** Switch rápido para pausar o activar productos al instante sin editar la ficha completa.
- **Editor de Presentaciones Reales:** Gestión de tamaños reales en COP (ej. 8 oz, 16 oz, 24 oz) y chips interactivos para activar/desactivar sabores o adiciones según la disponibilidad de ingredientes.
- **Carga Directa a R2:** Captura fotográfica directa desde la cámara del smartphone (`capture="environment"`) con validación de magic bytes (JPEG, PNG, WebP) de hasta 5 MB y previsualización en vivo.

## Primer administrador y catálogo

1. Registra el usuario en Firebase Auth y copia su UID desde Firebase Console.
2. Con las variables privadas cargadas, ejecuta `pnpm exec tsx scripts/set-admin.ts <UID>`.
3. Comprueba que el claim se haya renovado cerrando sesión y entrando de nuevo.
4. Si el catálogo todavía no existe en Firestore, ejecuta `pnpm exec tsx scripts/seed-catalog.ts`. El script escribe IDs estables y es idempotente.

El bootstrap de administrador y la siembra del catálogo requieren acceso real al proyecto Firebase. No se ejecutan como parte de `pnpm test`, `pnpm build` ni durante el arranque de Next.js.

## Migración de pedidos heredados

La migración copia `orders/{id}` a `pedidos/{id}`, conserva los documentos fuente y omite los destinos ya migrados. Antes de tocar un proyecto compartido o producción son obligatorios un backup verificable, credenciales configuradas, una ventana operativa y aprobación explícita del operador:

```powershell
pnpm exec tsx scripts/migrate-orders.ts
pnpm exec tsx scripts/verify-migration.ts
```

No ejecutes esos comandos contra producción sin completar esas condiciones. La aplicación no elimina automáticamente la colección heredada `orders`.

## Verificación

```powershell
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:firestore-rules
pnpm test:e2e:local
```

Los tests de Vitest excluyen `tests/e2e/**`. `pnpm test:e2e` sigue siendo la suite externa y requiere una aplicación levantada, navegadores instalados y variables de prueba; `pnpm test:e2e:local` es la vía reproducible contra emuladores locales y no necesita proyecto remoto. No uses credenciales reales en archivos de test ni reportes.

La limpieza de datos temporales solo funciona contra emuladores locales: el runner define `E2E_CLEANUP=true`, `E2E_CLEANUP_CONFIRM=DELETE_E2E_DATA` y hosts loopback dinámicos. El hook exige ambos hosts, rechaza cualquier host que no sea `localhost` o `127.0.0.1` y falla cerrado antes de borrar si falta alguna variable. Elimina únicamente los pedidos y usuarios generados en la ejecución emulada. Sin hosts loopback y confirmación explícita no borra nada; no puede apuntar a producción ni a un proyecto Firebase remoto.

El reporte de release con resultados, riesgos y limitaciones está en `docs/superpowers/reports/2026-08-04-auth-clientes-admin.md`.

## Rutas principales

- Tienda: `/menu`.
- Login y registro: `/login`, `/registro`.
- Cuenta e historial: `/cuenta`, `/cuenta/perfil`, `/cuenta/pedidos`.
- Checkout autenticado: `/checkout`.
- Panel operativo: `/admin/login` y `/admin/dashboard`.
- Storefront Público Multi-Tenant por Local: `/m/[slug]`.
- Carrito de compras mobile-first: `/cart`.
- Gestión de Menú Staff en Tiempo Real: `/admin/productos`, `/admin/productos/nueva`, `/admin/productos/[id]`.
- Asistente inteligente Opsy Bot: `/api/opsy/chat`.
- Auditoría, inventario y roles: `/admin/auditoria`, `/admin/inventario`, `/admin/roles`.

---

## 🚀 Notas de Lanzamiento Comercial (v1.0.0)

Esta versión marca el paso de prototipo a plataforma SaaS comercializable para locales de granizados y cócteles:

1. **Fase 1 (Experiencia Móvil y Carrito):** Carrito blindado con persistencia `coctels_ops_cart`, migración automática de datos heredados, cartas reales de Canva en COP sin multiplicadores artificiales, landing page con hero compacto (~65vh) y catálogo continuo `/menu` con barra sticky de categorías y scroll espía.
2. **Fase 2 (SaaS Multi-Tenant y Staff Móvil):** Aislamiento de comercios por `negocioId` en Firestore y Cloudflare R2, storefront por comercio `/m/[slug]`, panel staff para celular en la barra con switch 1-tap de stock y carga móvil de fotos directa a R2 con validación por magic bytes.
3. **Fase 3 (Asistente Opsy Bot):** Asistente conversacional antioqueño en servidor (DeepSeek) con guardrails de seguridad, rate limiting y adición 1-tap al carrito.
4. **Fase 4 (Calidad y Verificación Integral):** Suite de pruebas unitarias/integración (70 suites, 418+ tests pasando al 100%), Playwright E2E automatizado para flujos de cliente, staff y pedidos, comprobación estricta de tipos (`tsc --noEmit`), cero advertencias de ESLint y compilación de producción validada en Next.js 16.
