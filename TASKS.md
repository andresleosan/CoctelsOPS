# TASKS.md — Lista Maestra y Clasificación de Tareas Coctels OPS

> Este documento es la fuente de tareas y clasificación de modelo/esfuerzo para el comando `/avanzar`.
> Está sincronizado directamente con `BACKLOG.md`.

---

## 🧠 Matriz de 6 Niveles de Modelo y Esfuerzo (3.8 Flash + Argon)

Para maximizar la eficiencia de tokens y precisión técnica, cada tarea y cada cierre de `/avanzar` clasifica la próxima tarea eligiendo exactamente uno de estos 6 niveles:

1. **`3.8 Flash (Low)`**: Cambios cosméticos mínimos, textos, corrección de typos y documentación estática.
2. **`3.8 Flash (Medium)`**: Ajustes visuales de Tailwind/CSS, componentes UI simples sin estado complejo, auditorías de release.
3. **`3.8 Flash (High)`**: UI mobile-first completa, formularios dinámicos, hooks de estado, tests unitarios de UI y automatización Playwright E2E.
4. **`Argon (Low)`**: Endpoints API sencillos, consultas directas y esquemas Zod estándar.
5. **`Argon (Medium)`**: Lógica de negocio crítica en servidor, validación y recálculo de precios/órdenes, transacciones atómicas e integración segura con R2.
6. **`Argon (High)`**: Arquitectura multi-tenant profunda (`negocioId`), aislamiento cross-tenant, reglas Firestore complejas y asistentes IA con guardrails.

---

## 📌 Tareas del Proyecto y Clasificación

### Fase 1: Estabilidad Base, Carrito y Experiencia Móvil

- [x] **TASK-01: Modernización y Robustecimiento del Carrito de Compras (`CartContext`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Actualizar la persistencia del carrito a `coctels_ops_cart` (con migración retrocompatible de `granizado_go_cart`).
  - **Mejora:** Acumulación inteligente de productos duplicados.
  - **Archivos:** `src/context/cart-context.tsx`, `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `tests/context/cart-context.test.tsx`, `tests/components/cart-page.test.tsx`.

- [x] **TASK-02: Retiro de Multiplicadores Ficticios y Adaptación de Presentaciones Reales de Carta Canva**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Eliminar multiplicadores genéricos y validar precios exactos en servidor sin manipulación cliente.
  - **Archivos:** `src/components/products/ProductCustomizer.tsx`, `src/types/orders.ts`, `src/types/catalog.ts`, `src/lib/validation/orders.ts`, `tests/components/product-customizer.test.tsx`.

- [x] **TASK-03: Rediseño Mobile-First del Hero y Catálogo en la Landing Page (`DESIGN.md`)**
  - **Nivel Asignado:** `3.8 Flash (Medium)`
  - **Objetivo:** Hero móvil a ~65vh con mascota Opsy, productos destacados visibles en primer scroll y microinteracciones neón.
  - **Archivos:** `src/app/page.tsx`, `src/components/products/ProductCard.tsx`, `src/components/products/CocktailCarousel.tsx`.

- [x] **TASK-03.1: Rediseño Mobile-First del Menú Público con Scroll Continuo y Sticky Category Bar (Referencia Mobbin: Shake Shack / Blank Street)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Sticky category bar superior con scroll espía bidireccional, anclas automáticas por categoría, tarjetas compactas con notas de sabor en COP y buscador reactivo con limpieza 1-tap.
  - **Archivos:** `src/app/menu/page.tsx`, `src/components/products/ProductCatalogBrowser.tsx`, `src/components/products/ProductCard.tsx`, `tests/components/product-catalog-browser.test.tsx`.

---

### Fase 2: Plataforma SaaS Multi-Tenant y Panel Staff del Menú

- [x] **TASK-04: Panel Staff Mobile-First para Control Total del Menú en Vivo**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Gestión del menú en tiempo real desde smartphones/tablets en la barra (switch rápido de stock, editor dinámico de presentaciones en COP, chips dinámicos de sabores y adiciones).
  - **Archivos:** `src/components/admin/ProductForm.tsx`, `src/app/admin/productos/page.tsx`, `src/app/admin/productos/nueva/page.tsx`, `src/app/admin/productos/[id]/page.tsx`, `src/app/api/admin/productos/route.ts`, `src/app/api/admin/productos/[id]/route.ts`, `tests/components/product-form.test.tsx`, `tests/components/product-admin-list.test.tsx`.

- [ ] **TASK-05: Carga Móvil Segura de Fotografías a Cloudflare R2**
  - **Nivel Recomendado:** `3.8 Flash (High)` *(Alternativa: Argon Medium)*
  - **Objetivo:** Carga directa desde la cámara del teléfono a Cloudflare R2 con validación por magic bytes y preview instantáneo.
  - **Archivos:** `src/lib/catalog/storage.ts`, `src/lib/catalog/image-validation.ts`, `src/app/api/admin/productos/[id]/image/route.ts`, `tests/lib/catalog-storage.test.ts`.

- [ ] **TASK-06: Arquitectura Multi-Tenant (`negocioId`), Aislamiento y Tienda Pública por Local (`/m/[slug]`)**
  - **Nivel Recomendado:** `3.8 Flash (High)` *(Alternativa: Argon High)*
  - **Objetivo:** SaaS multi-comercio para locales de granizados con aislamiento en Firestore/R2, roles de staff por comercio y storefront público por local.
  - **Archivos:** `src/types/tenant.ts`, `src/lib/firestore/tenant.ts`, `src/lib/firestore/products.ts`, `src/app/m/[slug]/page.tsx`, `src/lib/auth/permissions.ts`, `firestore.rules`, `tests/security/tenant-isolation.test.ts`.

---

### Fase 3: Asistente Conversacional Opsy Bot e Inteligencia de Menú

- [ ] **TASK-07: Opsy Bot Asistente Inteligente (Integración DeepSeek con Guardrails)**
  - **Nivel Recomendado:** `3.8 Flash (High)` / `DeepSeek`
  - **Objetivo:** Chatbot con Opsy el panda en servidor con guardrails de seguridad, rate limiting y sugerencias para agregar al carrito.
  - **Archivos:** `src/app/api/opsy/chat/route.ts`, `src/components/opsy/OpsyChat.tsx`, `src/lib/ai/opsy-guardrails.ts`, `tests/api/opsy-chat.test.ts`.

---

### Fase 4: Pruebas E2E Completas y Despliegue a Producción

- [ ] **TASK-08: Batería E2E con Playwright (Flujo Completo de Cliente, Staff y Pedido)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Automatización de flujos completos extremo a extremo con Playwright y emuladores locales.
  - **Archivos:** `tests/e2e/order-flow.spec.ts`, `tests/e2e/cart.spec.ts`, `tests/e2e/staff-menu.spec.ts`.

- [ ] **TASK-09: Validación Final de Producción, Auditoría de Dependencias y Lanzamiento Comercial**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Ejecución de la suite completa de gates, changelog y despliegue final a producción.
  - **Archivos:** `README.md`, `package.json`.

