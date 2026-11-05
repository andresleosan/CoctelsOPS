# BACKLOG.md — Lista Maestra de Tareas Coctels OPS

Este backlog contiene la hoja de ruta de tareas ordenadas cronológicamente para la evolución de la aplicación **Coctels OPS** y su expansión a plataforma SaaS para locales de granizados y cócteles. Cada vez que ejecutes `/avanzar`, se tomará la primera tarea pendiente (`- [ ]`), se planificará respetando `DESIGN.md`, se implementará con código limpio y seguro, y se verificará con la suite de pruebas antes del commit y push.

---

## 🧠 Matriz de 6 Niveles de Modelo y Esfuerzo (3.8 Flash + Argon)

Para maximizar la eficiencia de tokens y precisión técnica, cada tarea y cada cierre de `/avanzar` clasifica la próxima tarea en exactamente uno de estos 6 niveles:
1. **`3.8 Flash (Low)`**: Cambios cosméticos mínimos, textos, corrección de typos y documentación estática.
2. **`3.8 Flash (Medium)`**: Ajustes visuales de Tailwind/CSS, componentes UI simples sin estado complejo, auditorías de release.
3. **`3.8 Flash (High)`**: UI mobile-first completa, formularios dinámicos, hooks de estado, tests unitarios de UI y automatización Playwright E2E.
4. **`Argon (Low)`**: Endpoints API sencillos, consultas directas y esquemas Zod estándar.
5. **`Argon (Medium)`**: Lógica de negocio crítica en servidor, validación y recálculo de precios/órdenes, transacciones atómicas e integración segura con R2.
6. **`Argon (High)`**: Arquitectura multi-tenant profunda (`negocioId`), aislamiento cross-tenant, reglas Firestore complejas y asistentes IA con guardrails.

---

## 📌 Tareas Prioritarias del Proyecto

### Fase 1: Estabilidad Base, Carrito y Experiencia Móvil

- [x] **TASK-01: Modernización y Robustecimiento del Carrito de Compras (`CartContext`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Actualizar la persistencia del carrito a `coctels_ops_cart` (con migración retrocompatible de `granizado_go_cart`).
  - **Mejora:** Implementar acumulación inteligente de productos (si el cliente añade el mismo producto con exactamente la misma personalización de tamaño, sabor y adiciones, incrementar la cantidad en vez de crear filas duplicadas).
  - **Calidad & Performance:** Evitar timestamps redundantes en IDs, tipar estrictamente sin aserciones inseguras, y asegurar transiciones visuales limpias en `src/app/cart/page.tsx`.
  - **Archivos:** `src/context/cart-context.tsx`, `src/app/cart/page.tsx`, `src/app/checkout/page.tsx`, `tests/context/cart-context.test.tsx`, `tests/components/cart-page.test.tsx`.

- [x] **TASK-02: Retiro de Multiplicadores Ficticios y Adaptación de Presentaciones Reales de Carta Canva**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Eliminar los multiplicadores `0.8 / 1.0 / 1.3` en `src/components/products/ProductCustomizer.tsx` y en el cálculo de precios.
  - **Mejora:** Adaptar la interfaz para soportar las presentaciones reales comprobadas en la carta (ej. Granizados 8 oz $10.000, 16 oz $15.000, 24 oz $25.000; Malteadas 14 oz $15.000; sodas, etc.) con selección explícita y precio real en COP.
  - **Seguridad:** Asegurar que la API de validación y checkout (`src/lib/validation/orders.ts` y `/api/pedidos`) verifique los precios contra la configuración real del producto en servidor, impidiendo manipulación de precios desde el cliente.
  - **Archivos:** `src/components/products/ProductCustomizer.tsx`, `src/types/orders.ts`, `src/types/catalog.ts`, `src/lib/validation/orders.ts`, `tests/components/product-customizer.test.tsx`.

- [x] **TASK-03: Rediseño Mobile-First del Hero y Catálogo en la Landing Page (`DESIGN.md`)**
  - **Nivel Asignado:** `3.8 Flash (Medium)`
  - **Objetivo:** Optimizar la experiencia de usuario en móvil de la página de inicio (`src/app/page.tsx`).
  - **Mejora:** Reducir la altura excesiva de 85vh del hero inicial a ~65vh en móvil, incorporando la mascota Opsy de forma armoniosa y mostrando los productos destacados y acceso directo a categorías visible en el primer scroll.
  - **Estética & A11y:** Asegurar tap targets >= 44px, contraste WCAG AA+, microinteracciones neón (`neon-shadow-magenta`, `neon-text-cyan`), y atributos `sizes` optimizados en `next/image` para LCP óptimo.
  - **Archivos:** `src/app/page.tsx`, `src/components/products/ProductCard.tsx`, `src/components/products/CocktailCarousel.tsx`.

- [x] **TASK-03.1: Rediseño Mobile-First del Menú Público con Scroll Continuo y Sticky Category Bar (Referencia Mobbin: Shake Shack / Blank Street)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Transformar la experiencia de navegación del catálogo en `/menu` implementando el patrón visual de menú continuo con barra superior fija de categorías (*sticky category bar*).
  - **Mejoras de Experiencia e Interfaz:**
    - Barra de categorías sticky horizontal superior con iconos/indicadores de categoría (`Granizados`, `Cocteles`, `Sodas`, `Malteadas`) con sincronización bidireccional (scroll espía): al pulsar una categoría hace scroll suave a su sección, y al navegar se resalta con glow magenta neón (`neon-shadow-magenta`).
    - Agrupación del catálogo por secciones de categoría con cabeceras estilizadas y anclas automáticas.
    - Tarjetas compactas mobile-first para bebidas con imagen optimizada, notas de cata y perfil de sabor (ej. *Cítrico, Fruta fresca, Con Ron*), precio real en COP y botón táctil `(+)` accesible (>= 44px) para abrir el personalizador o añadir.
    - Buscador reactivo integrado con limpieza en 1 tap y feedback inmediato sin perder la estructura de la carta.
  - **Estética & Calidad:** Cumplimiento total de `DESIGN.md` (tap targets >= 44px, cero CLS, contraste WCAG AA+, dark mode glassmorphism) y pruebas de componentes en `tests/components/product-catalog-browser.test.tsx`.
  - **Archivos:** `src/app/menu/page.tsx`, `src/components/products/ProductCatalogBrowser.tsx`, `src/components/products/ProductCard.tsx`, `tests/components/product-catalog-browser.test.tsx`.

---

### Fase 2: Plataforma SaaS Multi-Tenant y Panel Staff del Menú

- [x] **TASK-04: Panel Staff Mobile-First para Control Total del Menú en Vivo**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir al personal/staff y dueños de locales de granizados gestionar todo su menú en tiempo real directamente desde su smartphone o tablet en la barra.
  - **Mejora en Catálogo & Disponibilidad:**
    - Switch rápido de "En Stock / Agotado" directamente en la lista de productos (sin tener que entrar al formulario para pausar un producto).
    - Editor dinámico de presentaciones y tamaños reales con precios individuales en COP (ej. 8 oz $10.000, 16 oz $15.000, 24 oz $25.000).
    - Gestor de sabores mediante chips interactivos (agregar, remover y apagar un sabor individual en 1 tap cuando se agote una pulpa).
    - Gestor dinámico de adiciones y toppings con precio individual en COP (ej. Gomitas $2.000, Lecherita $1.500, Chamoy $1.000).
    - Carga dinámica de categorías desde la persistencia (`/api/admin/categorias`) y corrección de tokens de contraste (`text-slate-900`, `bg-white`, focus visible en `DESIGN.md`).
  - **Archivos:** `src/components/admin/ProductForm.tsx`, `src/app/admin/productos/page.tsx`, `src/app/admin/productos/nueva/page.tsx`, `src/app/admin/productos/[id]/page.tsx`, `src/app/api/admin/productos/route.ts`, `src/app/api/admin/productos/[id]/route.ts`, `tests/components/product-form.test.tsx`.

- [ ] **TASK-05: Carga Móvil Segura de Fotografías a Cloudflare R2**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Permitir al staff subir fotos reales de sus cócteles y granizados desde la cámara o galería del teléfono directamente a Cloudflare R2 sin necesidad de ingresar URLs manuales.
  - **Resiliencia & Validación:** Previsualización instantánea en vivo, validación de tipo MIME por magic bytes (JPEG, PNG, WebP) hasta 5 MB y generación de placeholders honestos con marca para productos sin fotografía.
  - **Archivos:** `src/lib/catalog/storage.ts`, `src/lib/catalog/image-validation.ts`, `src/app/api/admin/productos/[id]/image/route.ts`, `tests/lib/catalog-storage.test.ts`.

- [ ] **TASK-06: Arquitectura Multi-Tenant (`negocioId`), Aislamiento y Tienda Pública por Local (`/m/[slug]`)**
  - **Nivel Recomendado:** `Argon (High)`
  - **Objetivo:** Convertir la plataforma en un SaaS multi-comercio comercializable para locales de granizados en Medellín (patrón probado de La Parada).
  - **Aislamiento Multi-Tenant:**
    - Incorporar `negocioId` inmutable en colecciones de Firestore (`productos`, `categorias`, `configuracion`, `pedidos`) y en claves de R2 (`tenants/{negocioId}/...`).
    - Roles de staff por negocio (`usuarios_negocio/{uid}`): el staff de un local solo puede ver y editar sus propios productos y pedidos, con aislamiento garantizado en servidor.
    - Storefront por local: ruta pública dinámica `/m/[slug]` donde el cliente ve la marca, logo, colores, menú personalizado y WhatsApp de pedidos del negocio respectivo.
    - Superadmin global para dar de alta nuevos locales y configurar su plan.
  - **Archivos:** `src/types/tenant.ts`, `src/lib/firestore/tenant.ts`, `src/lib/firestore/products.ts`, `src/app/m/[slug]/page.tsx`, `src/lib/auth/permissions.ts`, `firestore.rules`, `tests/security/tenant-isolation.test.ts`.

---

### Fase 3: Asistente Conversacional Opsy Bot e Inteligencia de Menú

- [ ] **TASK-07: Opsy Bot Asistente Inteligente (Integración DeepSeek con Guardrails)**
  - **Nivel Recomendado:** `Argon (High)`
  - **Objetivo:** Implementar el asistente conversacional con Opsy el panda utilizando el modelo DeepSeek en el servidor.
  - **Seguridad & Rate Limiting:** Servidor como proxy seguro con `DEEPSEEK_API_KEY` en `server-only`. Aplicar límite de 5 solicitudes cada 10 min por usuario/IP, límite de 1.000 caracteres de entrada y 512 tokens de respuesta.
  - **Experiencia de Usuario:** Chat flotante accesible, reactivo, con tono antioqueño auténtico y sugerencias directas con enlace para agregar al carrito o ver en el menú del negocio activo.
  - **Archivos:** `src/app/api/opsy/chat/route.ts`, `src/components/opsy/OpsyChat.tsx`, `src/lib/ai/opsy-guardrails.ts`, `tests/api/opsy-chat.test.ts`.

---

### Fase 4: Pruebas E2E Completas y Despliegue a Producción

- [ ] **TASK-08: Batería E2E con Playwright (Flujo Completo de Cliente, Staff y Pedido)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Automatizar las pruebas de extremo a extremo cubriendo la navegación del catálogo, personalización de bebida, adición al carrito, checkout con verificación de email, gestión de staff y visualización de la confirmación del pedido.
  - **Verificación:** Ejecución local reproducible con emuladores (`corepack pnpm test:e2e:local`) y reporte detallado de estabilidad.
  - **Archivos:** `tests/e2e/order-flow.spec.ts`, `tests/e2e/cart.spec.ts`, `tests/e2e/staff-menu.spec.ts`.

- [ ] **TASK-09: Validación Final de Producción, Auditoría de Dependencias y Lanzamiento Comercial**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Ejecutar la suite completa de gates de calidad (`test`, `typecheck`, `lint`, `build`, `audit`), generar el changelog de la versión y preparar el despliegue final a producción con confirmación del operador.
  - **Archivos:** `README.md`, `package.json`.
