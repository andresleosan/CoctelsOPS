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
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir al personal/staff y dueños de locales de granizados gestionar todo su menú en tiempo real directamente desde su smartphone o tablet en la barra.
  - **Mejora en Catálogo & Disponibilidad:**
    - Switch rápido de "En Stock / Agotado" directamente en la lista de productos (sin tener que entrar al formulario para pausar un producto).
    - Editor dinámico de presentaciones y tamaños reales con precios individuales en COP (ej. 8 oz $10.000, 16 oz $15.000, 24 oz $25.000).
    - Gestor de sabores mediante chips interactivos (agregar, remover y apagar un sabor individual en 1 tap cuando se agote una pulpa).
    - Gestor dinámico de adiciones y toppings con precio individual en COP (ej. Gomitas $2.000, Lecherita $1.500, Chamoy $1.000).
    - Carga dinámica de categorías desde la persistencia (`/api/admin/categorias`) y corrección de tokens de contraste (`text-slate-900`, `bg-white`, focus visible en `DESIGN.md`).
  - **Archivos:** `src/components/admin/ProductForm.tsx`, `src/app/admin/productos/page.tsx`, `src/app/admin/productos/nueva/page.tsx`, `src/app/admin/productos/[id]/page.tsx`, `src/app/api/admin/productos/route.ts`, `src/app/api/admin/productos/[id]/route.ts`, `tests/components/product-form.test.tsx`.

- [x] **TASK-05: Carga Móvil Segura de Fotografías a Cloudflare R2**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir al staff subir fotos reales de sus cócteles y granizados desde la cámara o galería del teléfono directamente a Cloudflare R2 sin necesidad de ingresar URLs manuales.
  - **Resiliencia & Validación:** Previsualización instantánea en vivo, validación de tipo MIME por magic bytes (JPEG, PNG, WebP) hasta 5 MB, endpoint DELETE para restablecer a placeholder honesto de marca y captura táctil móvil con `capture="environment"`.
  - **Archivos:** `src/lib/catalog/storage.ts`, `src/lib/catalog/image-validation.ts`, `src/app/api/admin/productos/[id]/image/route.ts`, `src/components/admin/ProductForm.tsx`, `tests/lib/catalog-storage.test.ts`, `tests/api/admin-product-image.test.ts`, `tests/components/product-form.test.tsx`.

- [x] **TASK-06: Arquitectura Multi-Tenant (`negocioId`), Aislamiento y Tienda Pública por Local (`/m/[slug]`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Convertir la plataforma en un SaaS multi-comercio comercializable para locales de granizados en Medellín (patrón probado de La Parada).
  - **Aislamiento Multi-Tenant:**
    - Incorporar `negocioId` inmutable en colecciones de Firestore (`productos`, `categorias`, `configuracion`, `pedidos`) y en claves de R2 (`tenants/{negocioId}/...`).
    - Roles de staff por negocio (`usuarios_negocio/{uid}`): el staff de un local solo puede ver y editar sus propios productos y pedidos, con aislamiento garantizado en servidor.
    - Storefront por local: ruta pública dinámica `/m/[slug]` donde el cliente ve la marca, logo, colores, menú personalizado y WhatsApp de pedidos del negocio respectivo.
    - Superadmin global para dar de alta nuevos locales y configurar su plan.
  - **Archivos:** `src/types/tenant.ts`, `src/lib/firestore/tenant.ts`, `src/lib/firestore/products.ts`, `src/app/m/[slug]/page.tsx`, `src/lib/auth/permissions.ts`, `firestore.rules`, `tests/security/tenant-isolation.test.ts`.

---

### Fase 3: Asistente Conversacional Opsy Bot e Inteligencia de Menú

- [x] **TASK-07: Opsy Bot Asistente Inteligente (Integración DeepSeek con Guardrails)**
  - **Nivel Asignado:** `Argon (High)` / `3.8 Flash (High)`
  - **Objetivo:** Implementar el asistente conversacional con Opsy el panda utilizando el modelo DeepSeek en el servidor.
  - **Seguridad & Rate Limiting:** Servidor como proxy seguro con `DEEPSEEK_API_KEY` en `server-only`. Aplicar límite de 5 solicitudes cada 10 min por usuario/IP, límite de 1.000 caracteres de entrada y 512 tokens de respuesta.
  - **Experiencia de Usuario:** Chat flotante accesible, reactivo, con tono antioqueño auténtico y sugerencias directas con enlace para agregar al carrito o ver en el menú del negocio activo.
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
  - **Objetivo:** Transformar `/admin/pedidos` y `/admin/pedidos/[id]` en una estación operativa de barra en tiempo real para bartenders y staff.
  - **Mejoras Operativas:**
    - Selector de vista en `/admin/pedidos`: **Tablero KDS (Barra en Vivo)** con columnas Kanban (`Por Confirmar`, `En Preparación`, `En Camino / Listo`, `Finalizados`) y **Vista Lista Clásica**.
    - Receta completa visible en cada tarjeta KDS y en el detalle del pedido (`/admin/pedidos/[id]`): presentación (`size`), sabores (`flavors`), adiciones/toppings (`addOns`) y notas de entrega (`notes`).
    - Semáforo SLA en vivo calculado desde `createdAt`: `< 10 min` (`A tiempo` esmeralda), `10-20 min` (`Atención` ámbar), `> 20 min` (`Demorado` rojo con alerta visual).
    - Auto-actualización configurable (cada 15s) y alerta sonora sintetizada con Web Audio API (sin dependencias pesadas) cuando ingresa un nuevo pedido `pendiente`.
    - Avance rápido en 1 tap desde el tablero KDS (manteniendo confirmación de seguridad en la vista clásica y en el detalle individual).
  - **Archivos:** `src/components/admin/OrderKdsBoard.tsx`, `src/lib/orders/kds-sla.ts`, `src/app/admin/pedidos/page.tsx`, `src/app/admin/pedidos/[id]/page.tsx`, `tests/components/order-kds-board.test.tsx`.

- [x] **TASK-11: Pedido en Mesa / Recoger en Barra con Generador de Códigos QR por Local (`/m/[slug]?mesa=X`)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Soportar pedidos presenciales desde código QR en mesa o en barra además de domicilio, y proveer al comercio un generador de QR listo para imprimir desde `/admin/configuracion`.
  - **Archivos:** `src/components/admin/QrGeneratorCard.tsx`, `src/app/admin/configuracion/page.tsx`, `src/app/checkout/page.tsx`, `src/app/menu/page.tsx`, `src/app/m/[slug]/page.tsx`, `tests/components/qr-generator-card.test.tsx`.

- [x] **TASK-12: Redención Interactiva de Cupones y Descuentos en Checkout Validada en Servidor**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Permitir al cliente aplicar códigos promocionales en `/checkout` con validación en vivo contra `/api/promotions/validate`, desglose de descuento en COP y aplicación atómica en `/api/pedidos`.
  - **Archivos:** `src/app/api/promotions/validate/route.ts`, `src/app/checkout/page.tsx`, `tests/api/promotions-validate.test.ts`, `tests/components/checkout.test.tsx`.

- [x] **TASK-13: Cierre de Caja por Turno, Ticket Promedio y Exportación CSV / Resumen WhatsApp en Reportes**
  - **Nivel Recomendado:** `Argon (Low)`
  - **Objetivo:** Dotar a `/admin/reportes` de atajos de turno (`Hoy`, `Últimos 7 días`, `Este Mes`), KPI de Ticket Promedio, exportación directa a CSV (UTF-8 BOM) y copiado de reporte ejecutivo para WhatsApp.
  - **Archivos:** `src/app/admin/reportes/page.tsx`, `src/lib/reports/export-report.ts`, `tests/lib/export-report.test.ts`, `tests/components/admin-reports.test.tsx`.

- [x] **TASK-14: Re-Pedido en 1 Tap ("Repetir Pedido") en Historial de Cliente y Seguimiento de Orden**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Permitir a los clientes repetir cualquier pedido previo con sus presentaciones, sabores y toppings exactos hacia `CartContext` desde `/cuenta/pedidos` y `/order-status/[id]`.
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

- [x] **TASK-19: Promociones Automáticas "Happy Hour" por Franja Horaria y Combos en Menú / Checkout**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Permitir la configuración en `/admin/promociones` de franjas horarias automáticas de Happy Hour (ej. 2x1 o precio especial en granizados seleccionados de 5pm a 8pm los viernes/sábados) y combos especiales de carta, con validación estricta y recálculo en servidor (`/api/pedidos`), badge con cuenta regresiva interactiva en `/menu` y desglose automático en `/checkout`.
  - **Archivos:** `src/types/promotions.ts`, `src/lib/firestore/promotions.ts`, `src/components/products/HappyHourBanner.tsx`, `src/app/menu/page.tsx`, `src/app/checkout/page.tsx`, `src/lib/validation/orders.ts`, `tests/components/happy-hour.test.tsx`.

- [x] **TASK-20: Módulo CRM de Clientes VIP y Campañas de Re-activación por WhatsApp con 1 Tap (`/admin/clientes`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Enriquecer `/admin/clientes` con segmentación automática de clientes (Nuevos, Frecuentes, VIP, Inactivos > 15 días con saldo de puntos), historial consolidado de compras con ticket promedio individual y generador de mensajes personalizados de WhatsApp con 1 tap ("¡Hola [Nombre]! Hace días no te vemos en Coctels OPS, tienes [X] puntos listos para canjear y Happy Hour activo hoy") para maximizar la recompra.
  - **Archivos:** `src/app/admin/clientes/page.tsx`, `src/lib/customers/crm.ts`, `src/components/admin/CustomerSegmentBadge.tsx`, `src/lib/loyalty/calculator.ts`, `tests/lib/crm.test.ts`, `tests/components/admin-customers.test.tsx`, `tests/api/admin-customers.test.ts`.

---

### Fase 8: Logística de Barra, Insumos Críticos y Reparto (v1.4)

- [x] **TASK-21: Control de Insumos, Materia Prima y Stock Crítico de Barra (`/admin/inventario`)**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Controlar el stock de insumos críticos de coctelería y granizados (botellas de licor como Ron/Vodka/Tequila, pulpas de fruta, jarabes, vasos de 8/16/24 oz y pitillos) en Firestore (`insumos`), registrar movimientos de entrada/merma/ajuste con auditoría, definir umbrales de stock mínimo con alertas visuales de semáforo ("OK", "Bajo", "Crítico/Agotado") y permitir al staff de barra consultar y ajustar existencias en 1 tap desde smartphones.
  - **Archivos:** `src/types/supplies.ts`, `src/lib/firestore/supplies.ts`, `src/app/api/admin/insumos/route.ts`, `src/app/api/admin/insumos/[id]/route.ts`, `src/components/admin/SuppliesManager.tsx`, `src/app/admin/inventario/page.tsx`, `tests/lib/supplies.test.ts`, `tests/api/admin-supplies.test.ts`, `tests/components/supplies-manager.test.tsx`.

- [x] **TASK-22: Panel Móvil del Repartidor / Domiciliario en Moto (`/repartidor/[pedidoId]`)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Vista mobile-first ultra-rápida para el mensajero con 1 tap para llamar por teléfono o escribir por WhatsApp al cliente, botón de navegación GPS (Waze/Google Maps) y confirmación de cobro marcando el pedido como entregado.
  - **Archivos:** `src/app/repartidor/[pedidoId]/page.tsx`, `src/components/delivery/DriverOrderView.tsx`, `tests/components/driver-order-view.test.tsx`.

- [x] **TASK-23: Modo Resiliencia Offline PWA para Barra y Caja en Horas Pico**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Soporte PWA con IndexedDB y Background Sync para registrar comandas y ventas en barra aunque falle la conectividad WiFi del local durante la rumba de viernes o sábado.
  - **Archivos:** `src/lib/offline/db.ts`, `src/lib/offline/sync.ts`, `public/sw.js`, `src/app/admin/pedidos/page.tsx`, `tests/lib/offline-sync.test.ts`.

---

## Fase 9: Eficiencia Financiera, Escandallo de Recetas y Terminal POS en Barra (v1.5)

- [x] **TASK-24: Terminal POS Rápido de Caja en Barra con Cobro Mixto (Efectivo / Nequi / Código QR)**
  - **Nivel Asignado:** `3.8 Flash (High)`
  - **Objetivo:** Interfaz táctil rápida en `/admin/pedidos` o `/admin/pos` para que el cajero en barra tome pedidos presenciales en menos de 10 segundos con cálculo automático de vueltas en efectivo, desglose de cobro mixto (Efectivo + Nequi/Daviplata) y encolado resiliente offline.
  - **Archivos:** `src/components/admin/QuickBarPosModal.tsx`, `src/lib/orders/pos-calculator.ts`, `src/app/admin/pedidos/page.tsx`, `tests/components/quick-bar-pos.test.tsx`.

- [x] **TASK-25: Escandallo y Recetas Estándar con Descuento Automático de Insumos al Preparar Comanda**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Vincular cada producto/presentación de la carta con su receta de insumos (`insumos` en ml, oz y unidades de vaso/pitillo) para descontar automáticamente las existencias de barra y calcular el costo real por cóctel cuando el pedido pasa a `preparando` o `entregado`.
  - **Archivos:** `src/types/recipes.ts`, `src/lib/firestore/recipes.ts`, `src/lib/firestore/orders.ts`, `tests/lib/recipes-depletion.test.ts`.

---

## Fase 10: Rentabilidad, Arqueo de Caja, Cuentas por Mesa y Compras (v1.6)

- [x] **TASK-26: Editor Visual de Recetas (Escandallo) y Dashboard de Rentabilidad por Cóctel**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Proveer una interfaz mobile-first en el panel administrativo para configurar las recetas de insumos creadas en `TASK-25` por producto y presentación, calculando el costo real, margen bruto (%) por cóctel y alertas de productos con baja rentabilidad en `/admin/reportes`.
  - **Archivos:** `src/components/admin/RecipeEditor.tsx`, `src/app/admin/inventario/page.tsx`, `src/app/admin/reportes/page.tsx`, `src/app/api/admin/recetas/route.ts`, `tests/components/recipe-editor.test.tsx`.

- [x] **TASK-27: Apertura, Arqueo y Cierre de Caja por Turno con Gastos de Barra (`/admin/caja`)**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Implementar el flujo completo de control de caja por turno: apertura con base inicial en efectivo, conciliación automática de ingresos (Efectivo, Nequi, Daviplata, QR) desde pedidos/POS, registro de salidas menores de barra (hielo, fruta, domicilios), arqueo ciego con cálculo de sobrante/faltante y trazabilidad de auditoría por cajero.
  - **Archivos:** `src/types/cash-register.ts`, `src/lib/firestore/cash-register.ts`, `src/app/api/admin/caja/route.ts`, `src/app/admin/caja/page.tsx`, `tests/lib/cash-register.test.ts`.

- [x] **TASK-28: Cuentas Abiertas por Mesa (Bar Tabs) con Rondas al KDS y División de Cuenta**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Permitir que mesas QR o clientes en barra acumulen múltiples rondas sobre una cuenta abierta, despachando cada ronda al KDS en tiempo real y permitiendo cerrar la cuenta con cobro mixto o división entre comensales.
  - **Archivos:** `src/types/tabs.ts`, `src/lib/firestore/tabs.ts`, `src/app/api/admin/mesas/route.ts`, `src/app/admin/mesas/page.tsx`, `tests/lib/bar-tabs.test.ts`.

- [x] **TASK-29: Lista de Compras Automática a Proveedores desde Stock Crítico y Consumo**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Generar automáticamente la orden de reposición para insumos en semáforo "Bajo" o "Crítico" en `/admin/inventario`, estimando cantidades sugeridas y habilitando envío en 1 tap por WhatsApp al proveedor.
  - **Archivos:** `src/lib/inventory/restock-list.ts`, `src/components/admin/RestockListCard.tsx`, `src/app/admin/inventario/page.tsx`, `tests/components/restock-list.test.tsx`.

- [x] **TASK-30: Auditoría de Seguridad, Suite E2E de Fases 8–9 y Release v1.6**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Ampliar cobertura E2E para POS rápido, escandallo y Opsy Bot con armado de carrito, ejecutar auditoría de dependencias (`pnpm audit --prod`) y validar paridad de despliegue en Cloudflare Pages/Worker.
  - **Archivos:** `tests/e2e/pos-and-opsy.spec.ts`, `README.md`, `package.json`.

---

## Fase 11: Autopedido QR en Vivo, Verificación de Pagos, Multi-Tenant v1.7 y Logística Avanzada (v1.7)

- [x] **TASK-31: Autopedido QR en Mesa sin Fricción + Cuenta en Vivo del Cliente**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Conectar `/m/[slug]?mesa=X`, `/menu?mesa=X` y `/cart` con las cuentas abiertas por mesa (`cuentas_mesas`) permitiendo a clientes en mesa agregar rondas sin bloqueo de verificación de email, consultar su cuenta acumulada en vivo y solicitar la cuenta o división en 1 tap.
  - **Archivos:** `src/types/tabs.ts`, `src/lib/firestore/tabs.ts`, `src/app/api/mesas/[mesaId]/route.ts`, `src/components/orders/LiveTableTabSheet.tsx`, `src/components/products/TableServiceBanner.tsx`, `src/app/menu/page.tsx`, `src/app/m/[slug]/page.tsx`, `src/app/cart/page.tsx`, `tests/api/public-table-tab.test.ts`, `tests/components/live-table-tab.test.tsx`, `tests/components/cart-page.test.tsx`.

- [x] **TASK-32: Comprobante de Transferencia (Nequi / Daviplata / Bancolombia) con Subida a R2 y Verificación 1-Tap en Caja y KDS**
  - **Nivel Asignado:** `Argon (Medium)`
  - **Objetivo:** Permitir al cliente adjuntar la captura del comprobante de transferencia en `/checkout` y `/order-status/[id]` (validada por magic bytes en Cloudflare R2) y habilitar estados de verificación de pago (`pendiente_verificacion`, `verificado`, `rechazado`) con aprobación/rechazo en 1 tap desde `/admin/pedidos` (KDS, lista y detalle) y `/admin/caja`.
  - **Archivos:** `src/types/orders.ts`, `src/types/cash-register.ts`, `src/lib/orders/customer-order.ts`, `src/lib/orders/payment-verification.ts`, `src/lib/catalog/image-validation.ts`, `src/lib/catalog/storage-core.ts`, `src/lib/catalog/storage.ts`, `src/lib/validation/orders.ts`, `src/lib/firestore/orders.ts`, `src/lib/firestore/cash-register.ts`, `src/app/api/pedidos/[id]/comprobante/route.ts`, `src/app/checkout/page.tsx`, `src/app/order-status/[id]/page.tsx`, `src/components/admin/PaymentProofVerificationControls.tsx`, `src/components/admin/OrderKdsBoard.tsx`, `src/app/admin/pedidos/page.tsx`, `src/app/admin/pedidos/[id]/page.tsx`, `src/app/admin/caja/page.tsx`, `tests/api/order-payment-proof.test.ts`, `tests/components/order-payment-proof.test.tsx`.

- [x] **TASK-33: Paridad Multi-Tenant Integral en Módulos v1.4–v1.6, Reglas Firestore y Accesos Operativos en Dashboard**
  - **Nivel Recomendado:** `Argon (High)`
  - **Objetivo:** Garantizar aislamiento estricto por `negocioId` en `insumos`, `recetas`, `caja_turnos` y `cuentas_mesas`, actualizar `firestore.rules` (delegando al subagente `firestore-rules-author`), e incorporar accesos directos y KPIs en vivo de Caja (`/admin/caja`) y Mesas (`/admin/mesas`) en `/admin/dashboard`.
  - **Archivos:** `src/lib/auth/permissions.ts`, `src/lib/validation/supplies.ts`, `src/lib/validation/cash-register.ts`, `src/lib/firestore/supplies.ts`, `src/lib/firestore/recipes.ts`, `src/lib/firestore/cash-register.ts`, `src/lib/firestore/tabs.ts`, `src/lib/firestore/orders.ts`, `src/app/api/admin/insumos/route.ts`, `src/app/api/admin/insumos/[id]/route.ts`, `src/app/api/admin/insumos/[id]/movimiento/route.ts`, `src/app/api/admin/caja/route.ts`, `src/app/api/admin/mesas/route.ts`, `src/app/api/admin/stats/route.ts`, `src/components/admin/DashboardOperationsCards.tsx`, `src/app/admin/dashboard/page.tsx`, `firestore.rules`, `tests/firestore-rules-emulator.test.ts`, `tests/security/tenant-isolation-v17.test.ts`, `tests/components/dashboard-operations.test.tsx`.

- [ ] **TASK-34: Zonas de Cobertura con Tarifas Dinámicas de Domicilio y Tablero Multi-Pedido del Repartidor (`/repartidor`)**
  - **Nivel Recomendado:** `3.8 Flash (High)`
  - **Objetivo:** Configurar zonas/barrios de entrega con costo y tiempo estimado dinámico en `/admin/configuracion` y `/checkout`, permitir asignar domiciliarios desde el KDS y crear el tablero consolidado `/repartidor` con la cola de entregas activas.
  - **Archivos:** `src/types/operations.ts`, `src/lib/orders/delivery-zones.ts`, `src/app/admin/configuracion/page.tsx`, `src/app/checkout/page.tsx`, `src/app/repartidor/page.tsx`, `tests/components/delivery-zones.test.tsx`.

- [ ] **TASK-35: Pasarela de Pago Online (Wompi / Bold) con Webhook Firmado HMAC y Liquidación de Propinas de Staff en Cierre de Caja**
  - **Nivel Recomendado:** `Argon (Medium)`
  - **Objetivo:** Soportar confirmación automática de pagos digitales mediante webhook firmado HMAC en servidor y agregar el registro/distribución de propinas y comisiones de staff (bartenders, meseros y domiciliarios) en el arqueo y cierre de turno de `/admin/caja` y `/admin/reportes`.
  - **Archivos:** `src/app/api/webhooks/payments/route.ts`, `src/lib/payments/webhook-signature.ts`, `src/types/cash-register.ts`, `src/lib/cash-register/calculator.ts`, `src/app/admin/caja/page.tsx`, `tests/lib/payments-and-tips.test.ts`.

- [ ] **TASK-36: Suite E2E de Fase 11, Auditoría de Seguridad y Release v1.7.0**
  - **Nivel Recomendado:** `3.8 Flash (Medium)`
  - **Objetivo:** Validar con Playwright E2E y gates completos los flujos de autopedido en mesa, comprobantes de transferencia, multi-tenancy y reparto por zonas, actualizando changelog y versión `1.7.0`.
  - **Archivos:** `tests/e2e/table-tab-and-payments.spec.ts`, `README.md`, `package.json`.
