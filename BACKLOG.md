# BACKLOG.md — Lista Maestra de Tareas Coctels OPS

Este backlog contiene la hoja de ruta de tareas ordenadas cronológicamente para la evolución de la aplicación **Coctels OPS**. Cada vez que ejecutes `/avanzar`, se tomará la primera tarea pendiente (`- [ ]`), se planificará respetando `DESIGN.md`, se implementará con código limpio y seguro, y se verificará con la suite de pruebas antes del commit y push.

---

## 📌 Tareas Prioritarias del Proyecto

### Fase 1: Estabilidad Base, Carrito y Experiencia Móvil

- [x] **TASK-01: Modernización y Robustecimiento del Carrito de Compras (`CartContext`)**
  - **Objetivo:** Actualizar la persistencia del carrito a `coctels_ops_cart` (con migración retrocompatible de `granizado_go_cart`).
  - **Mejora:** Implementar acumulación inteligente de productos (si el cliente añade el mismo producto con exactamente la misma personalización de tamaño, sabor y adiciones, incrementar la cantidad en vez de crear filas duplicadas).
  - **Calidad & Performance:** Evitar timestamps redundantes en IDs, tipar estrictamente sin aserciones inseguras, y asegurar transiciones visuales limpias en `src/app/cart/page.tsx`.
  - **Archivos:** `src/context/cart-context.tsx`, `src/app/cart/page.tsx`, `tests/context/cart-context.test.ts`.

- [ ] **TASK-02: Retiro de Multiplicadores Ficticios y Adaptación de Presentaciones Reales de Carta Canva**
  - **Objetivo:** Eliminar los multiplicadores `0.8 / 1.0 / 1.3` en `src/components/products/ProductCustomizer.tsx` y en el cálculo de precios.
  - **Mejora:** Adaptar la interfaz para soportar las presentaciones reales comprobadas en la carta (ej. Granizados 8 oz $10.000, 16 oz $15.000, 24 oz $25.000; Malteadas 14 oz $15.000; sodas, etc.) con selección explícita y precio real en COP.
  - **Seguridad:** Asegurar que la API de validación y checkout (`src/lib/validation/orders.ts` y `/api/pedidos`) verifique los precios contra la configuración real del producto en servidor, impidiendo manipulación de precios desde el cliente.
  - **Archivos:** `src/components/products/ProductCustomizer.tsx`, `src/types/orders.ts`, `src/types/catalog.ts`, `src/lib/validation/orders.ts`, `tests/components/product-customizer.test.tsx`.

- [ ] **TASK-03: Rediseño Mobile-First del Hero y Catálogo en la Landing Page (`DESIGN.md`)**
  - **Objetivo:** Optimizar la experiencia de usuario en móvil de la página de inicio (`src/app/page.tsx`).
  - **Mejora:** Reducir la altura excesiva de 85vh del hero inicial a ~65vh en móvil, incorporando la mascota Opsy de forma armoniosa y mostrando los productos destacados y acceso directo a categorías visible en el primer scroll.
  - **Estética & A11y:** Asegurar tap targets >= 44px, contraste WCAG AA+, microinteracciones neón (`neon-shadow-magenta`, `neon-text-cyan`), y atributos `sizes` optimizados en `next/image` para LCP óptimo.
  - **Archivos:** `src/app/page.tsx`, `src/components/products/ProductCard.tsx`, `src/components/products/CocktailCarousel.tsx`.

---

### Fase 2: Panel Administrativo y Gestión Dinámica

- [ ] **TASK-04: Formulario de Productos con Filas Dinámicas y Corrección de Tokens de Contraste**
  - **Objetivo:** Reemplazar los campos de texto crudos separados por comas (`Sabores`, `Adiciones`) en `src/components/admin/ProductForm.tsx` por controles interactivos con filas dinámicas (agregar/eliminar sabor, adición y precio individual).
  - **UI Craft:** Solucionar los tokens de color del panel para erradicar cualquier caso de texto blanco o desvanecido sobre fondos claros (`text-slate-900`, bordes nítidos, focus ring visible).
  - **Categorías:** Cargar las categorías dinámicas desde la persistencia (`/api/admin/categorias`) en lugar del selector estático cableado.
  - **Archivos:** `src/components/admin/ProductForm.tsx`, `src/app/admin/productos/nueva/page.tsx`, `src/app/admin/productos/[id]/page.tsx`, `tests/components/product-form.test.tsx`.

- [ ] **TASK-05: Carga Segura y Gestión de Imágenes con Cloudflare R2**
  - **Objetivo:** Optimizar el flujo de subida de imágenes de productos hacia Cloudflare R2 con previsualización en vivo, validación de tipo MIME por magic bytes y límites de 5 MB.
  - **Resiliencia:** Si la subida falla, garantizar mensajes claros de error sin dejar estados inconsistentes en el producto. Generar placeholders con marca para productos sin fotografía.
  - **Archivos:** `src/lib/catalog/storage.ts`, `src/lib/catalog/image-validation.ts`, `src/app/api/admin/productos/[id]/image/route.ts`, `tests/lib/catalog-storage.test.ts`.

---

### Fase 3: Asistente Conversacional Opsy Bot e Inteligencia de Menú

- [ ] **TASK-06: Opsy Bot Asistente Inteligente (Integración DeepSeek con Guardrails)**
  - **Objetivo:** Implementar el asistente conversacional con Opsy el panda utilizando el modelo DeepSeek en el servidor.
  - **Seguridad & Rate Limiting:** Servidor como proxy seguro con `DEEPSEEK_API_KEY` en `server-only`. Aplicar límite de 5 solicitudes cada 10 min por usuario/IP, límite de 1.000 caracteres de entrada y 512 tokens de respuesta.
  - **Experiencia de Usuario:** Chat flotante accesible, reactivo, con tono antioqueño auténtico y sugerencias directas con enlace para agregar al carrito o ver en el menú.
  - **Archivos:** `src/app/api/opsy/chat/route.ts`, `src/components/opsy/OpsyChat.tsx`, `src/lib/ai/opsy-guardrails.ts`, `tests/api/opsy-chat.test.ts`.

---

### Fase 4: Pruebas E2E Completas y Despliegue a Producción

- [ ] **TASK-07: Batería E2E con Playwright (Flujo Completo de Cliente y Pedido)**
  - **Objetivo:** Automatizar las pruebas de extremo a extremo cubriendo la navegación del catálogo, personalización de bebida, adición al carrito, checkout con verificación de email y visualización de la confirmación del pedido.
  - **Verificación:** Ejecución local reproducible con emuladores (`corepack pnpm test:e2e:local`) y reporte detallado de estabilidad.
  - **Archivos:** `tests/e2e/order-flow.spec.ts`, `tests/e2e/cart.spec.ts`.

- [ ] **TASK-08: Validación Final de Producción, Auditoría de Dependencias y Commit de Despliegue**
  - **Objetivo:** Ejecutar la suite completa de gates de calidad (`test`, `typecheck`, `lint`, `build`, `audit`), generar el changelog de la versión y preparar el despliegue final a producción con confirmación del operador.
  - **Archivos:** `README.md`, `package.json`.

