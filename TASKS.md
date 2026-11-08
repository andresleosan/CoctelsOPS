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

- [x] **TASK-05: Carga Móvil Segura de Fotografías a Cloudflare R2**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Carga directa desde la cámara del teléfono o galería a Cloudflare R2 con validación por magic bytes, preview instantáneo en vivo y soporte de placeholder honesto de marca.
  - **Archivos:** `src/lib/catalog/storage.ts`, `src/lib/catalog/image-validation.ts`, `src/app/api/admin/productos/[id]/image/route.ts`, `src/components/admin/ProductForm.tsx`, `tests/lib/catalog-storage.test.ts`, `tests/api/admin-product-image.test.ts`, `tests/components/product-form.test.tsx`.

- [x] **TASK-06: Arquitectura Multi-Tenant (`negocioId`), Aislamiento y Tienda Pública por Local (`/m/[slug]`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** SaaS multi-comercio para locales de granizados con aislamiento en Firestore/R2, roles de staff por comercio y storefront público por local.
  - **Archivos:** `src/types/tenant.ts`, `src/lib/firestore/tenant.ts`, `src/lib/firestore/products.ts`, `src/app/m/[slug]/page.tsx`, `src/lib/auth/permissions.ts`, `firestore.rules`, `tests/security/tenant-isolation.test.ts`.

---

### Fase 3: Asistente Conversacional Opsy Bot e Inteligencia de Menú

- [x] **TASK-07: Opsy Bot Asistente Inteligente (Integración DeepSeek con Guardrails)**
  - **Nivel Asignado:** `Argon (High)` / `3.8 Flash (High)`
  - **Objetivo:** Chatbot con Opsy el panda en servidor con guardrails de seguridad, rate limiting y sugerencias para agregar al carrito.
  - **Archivos:** `src/app/api/opsy/chat/route.ts`, `src/components/opsy/OpsyChat.tsx`, `src/lib/ai/opsy-guardrails.ts`, `tests/lib/opsy-guardrails.test.ts`, `tests/api/opsy-chat.test.ts`, `tests/components/opsy-chat.test.tsx`.

---

### Fase 4: Pruebas E2E Completas y Despliegue a Producción

- [x] **TASK-08: Batería E2E con Playwright (Flujo Completo de Cliente, Staff y Pedido)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Automatización de flujos completos extremo a extremo con Playwright y emuladores locales.
  - **Archivos:** `tests/e2e/order-flow.spec.ts`, `tests/e2e/cart.spec.ts`, `tests/e2e/staff-menu.spec.ts`, `tests/e2e/e2e-helpers.ts`.

- [x] **TASK-09: Validación Final de Producción, Auditoría de Dependencias y Lanzamiento Comercial**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Ejecución de la suite completa de gates, changelog y despliegue final a producción.
  - **Archivos:** `README.md`, `package.json`.

---

### Fase 5: Operación en Barra (KDS), QR en Mesa, Conversión y Cierre de Caja (v1.1)

- [x] **TASK-10: Tablero KDS (Kitchen/Bar Display System) en Tiempo Real con Semáforo SLA, Receta Completa y Alerta Sonora**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Incorporar modo Tablero KDS en `/admin/pedidos` y enriquecer `/admin/pedidos/[id]` con desglose completo de receta (`size`, `flavors`, `addOns`, `notes`), temporizador SLA con semáforo (`<10m` verde, `10-20m` ámbar, `>20m` rojo), alerta sonora Web Audio API ante nuevos pedidos y avance en 1 tap para bartenders.
  - **Archivos:** `src/components/admin/OrderKdsBoard.tsx`, `src/lib/orders/kds-sla.ts`, `src/app/admin/pedidos/page.tsx`, `src/app/admin/pedidos/[id]/page.tsx`, `tests/components/order-kds-board.test.tsx`.

- [x] **TASK-11: Pedido en Mesa / Recoger en Barra con Generador de Códigos QR por Local (`/m/[slug]?mesa=X`)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir pedidos por código QR en mesa o para recoger en barra además de domicilio, detectando `?mesa=X` en la carta pública y agregando un generador de códigos QR SVG descargables e imprimibles en `/admin/configuracion`.
  - **Archivos:** `src/components/admin/QrGeneratorCard.tsx`, `src/app/admin/configuracion/page.tsx`, `src/app/checkout/page.tsx`, `src/app/menu/page.tsx`, `src/app/m/[slug]/page.tsx`, `tests/components/qr-generator-card.test.tsx`.

- [x] **TASK-12: Redención Interactiva de Cupones y Descuentos en Checkout Validada en Servidor**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Habilitar campo de código promocional en `/checkout` con validación previa contra el servidor (`/api/promotions/validate`), desglose transparente de subtotal/descuento/total y verificación atómica en `/api/pedidos`.
  - **Archivos:** `src/app/api/promotions/validate/route.ts`, `src/app/checkout/page.tsx`, `tests/api/promotions-validate.test.ts`, `tests/components/checkout.test.tsx`.

- [x] **TASK-13: Cierre de Caja por Turno, Ticket Promedio y Exportación CSV / Resumen WhatsApp en Reportes**
  - **Nivel Recomendado:** `Argon (Low)`
  - **Objetivo:** Potenciar `/admin/reportes` con filtros rápidos de turno (`Hoy`, `Últimos 7 días`, `Este Mes`), KPI de Ticket Promedio, descarga de CSV compatible con Excel y botón de resumen de cierre de caja listo para compartir por WhatsApp.
  - **Archivos:** `src/app/admin/reportes/page.tsx`, `src/lib/reports/export-report.ts`, `tests/lib/export-report.test.ts`, `tests/components/admin-reports.test.tsx`.

- [x] **TASK-14: Re-Pedido en 1 Tap ("Repetir Pedido") en Historial de Cliente y Seguimiento de Orden**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir a los clientes volver a cargar en el carrito su pedido favorito con todas sus personalizaciones exactas desde `/cuenta/pedidos` y `/order-status/[id]` en un solo toque.
  - **Archivos:** `src/components/account/OrderHistory.tsx`, `src/app/order-status/[id]/page.tsx`, `src/components/account/RepeatOrderButton.tsx`, `src/lib/orders/repeat-order.ts`, `tests/components/order-repeat.test.tsx`.

---

### Fase 6: Retención, Fidelización y Calidad Operativa (v1.2)

- [x] **TASK-15: Valoración de Pedido en 1 Tap (Rating 5 Estrellas y Reseñas de Cliente en Pedidos Entregados)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir a los clientes calificar su pedido entregado con 1 toque (1 a 5 estrellas neón con microinteracciones táctiles, chips rápidos de atributos como "Sabor perfecto", "Bien frío", "Entrega rápida" y comentario opcional) desde `/order-status/[id]` y `/cuenta/pedidos/[id]`, registrando la calificación atómica en Firestore y reflejando el índice de satisfacción CSAT en `/admin/dashboard` y `/admin/reportes`.
  - **Archivos:** `src/components/orders/OrderRatingCard.tsx`, `src/app/api/pedidos/[id]/rating/route.ts`, `src/app/order-status/[id]/page.tsx`, `src/app/cuenta/pedidos/[id]/page.tsx`, `tests/components/order-rating.test.tsx`.

- [x] **TASK-16: Programa de Fidelización "Puntos Coctels" / Sellos Digitales en Pedidos Entregados**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Acumulación automática de puntos o sellos digitales por compras entregadas en el comercio (`1 punto por cada $1.000 COP`), visualización de tarjeta de fidelización interactiva en `/cuenta` y canje de recompensas o cóctel de cortesía en `/checkout`.
  - **Archivos:** `src/types/loyalty.ts`, `src/lib/firestore/loyalty.ts`, `src/components/account/LoyaltyCard.tsx`, `src/app/cuenta/page.tsx`, `src/app/checkout/page.tsx`, `src/app/api/loyalty/route.ts`, `tests/components/loyalty.test.tsx`.

- [x] **TASK-17: Notificaciones Web Push y Alertas en Tiempo Real de Pedidos para Clientes**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Implementar suscripción opcional a notificaciones Web Push / Service Worker y actualización reactiva sin refresco para avisar al cliente cuando su pedido cambie a "preparando", "en camino" y "entregado".
  - **Archivos:** `src/components/notifications/PushSubscriptionBanner.tsx`, `src/lib/notifications/web-push.ts`, `src/app/api/notifications/subscribe/route.ts`, `public/sw.js`, `tests/components/push-notifications.test.tsx`.

- [x] **TASK-18: Impresión Térmica de Comandas y Etiquetas de Barra en 1 Tap (Tickets 58mm/80mm)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir la impresión directa y formateada de comandas para la barra y etiquetas adhesivas para vasos/domicilios en impresoras térmicas (58mm y 80mm vía Web Print / Bluetooth ESC-POS) desde el Tablero KDS (`/admin/pedidos`) y el detalle del pedido (`/admin/pedidos/[id]`).
  - **Archivos:** `src/components/admin/OrderReceiptPrint.tsx`, `src/lib/orders/receipt-formatter.ts`, `src/app/admin/pedidos/[id]/page.tsx`, `src/components/admin/OrderKdsBoard.tsx`, `tests/components/order-receipt-print.test.tsx`.

---

### Fase 7: Crecimiento Comercial, Promociones Programadas y CRM (v1.3)

- [ ] **TASK-19: Promociones Automáticas "Happy Hour" por Franja Horaria y Combos en Menú / Checkout**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Permitir la configuración en `/admin/promociones` de franjas horarias automáticas de Happy Hour (ej. 2x1 o precio especial en granizados seleccionados de 5pm a 8pm los viernes/sábados) y combos especiales de carta, con validación estricta y recálculo en servidor (`/api/pedidos`), badge con cuenta regresiva interactiva en `/menu` y desglose automático en `/checkout`.
  - **Archivos:** `src/types/promotions.ts`, `src/lib/firestore/promotions.ts`, `src/components/products/HappyHourBanner.tsx`, `src/app/menu/page.tsx`, `src/app/checkout/page.tsx`, `src/lib/validation/orders.ts`, `tests/components/happy-hour.test.tsx`.
