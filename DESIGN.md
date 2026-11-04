# DESIGN.md — Guía y Estándares de Diseño y Calidad: Coctels OPS

Este documento reúne todas las reglas, tokens, principios de experiencia (UI/UX), directrices de seguridad y estándares de ingeniería limpia que rigen el proyecto **Coctels OPS**. Es de consulta y aplicación obligatoria para todo plan, diseño e implementación ejecutados en el flujo de trabajo (`/avanzar`).

---

## 1. Identidad Visual y Sistema de Tokens

Coctels OPS es una marca nocturna, vibrante, fresca y de alto impacto nacida en Medellín. La identidad visual combina la estética urbana/neón de cócteles y granizados artesanales con la calidez de su mascota oficial (**Opsy el Panda**).

### Paleta de Colores
- **Fondo Tienda (Background):** Negro puro `#000000` y Dark Slate `#0A0A0A` con transparencias sutiles para efecto glassmorphism (`bg-card/40 backdrop-blur-xl`).
- **Primario (Neon Magenta):** `#E5196E` / `#E91E63`. Utilizado en CTAs principales, badges destacados, acentos de marca y glow neón (`neon-text-magenta`, `neon-shadow-magenta`).
- **Acento Funcional (Cyan Eléctrico):** `#00BCD4` / `#06B6D4`. Utilizado en indicadores de estado, enlaces secundarios, selector de categorías y acentos (`neon-text-cyan`).
- **Acento Mascota (Violeta Opsy):** `#8A2BE2` / `#D98FD6`. Inspirado en los tonos de la mascota panda Opsy, ideal para el asistente conversacional (Opsy Bot) y detalles especiales.
- **Bordes y Separadores:** Translucidez controlada (`border-primary/20`, `border-white/10`).
- **Contraste en Panel Administrativo:** El panel administrativo debe usar tokens claros u oscuros con alto contraste legible (WCAG AA+). **Regla estricta:** Eliminar cualquier ocurrencia de texto blanco sobre fondos claros o campos de formulario desprovistos de contraste (`text-slate-900`, `bg-white`, `border-slate-300` en tema claro, o tokens contrastados de tema oscuro).

### Tipografía
- **Titulares y Display:** `Poppins` (o `font-headline`), en mayúsculas sostenidas (`uppercase`), pesos bold/extrabold (`font-bold`, `font-black`), tracking apretado (`tracking-tight` / `tracking-tighter`).
- **Cuerpo y Controles:** Inter / sans-serif contemporáneo, limpio, con jerarquía visual nítida y excelente legibilidad para nombres, adiciones y precios en COP (`$15.000 COP`).

### Motion y Microinteracciones
- Transiciones suaves (150ms–300ms) en botones, cards y toggles (`transition-all active:scale-95`).
- Feedback táctil e interactivo inmediato: toasts animados al agregar al carrito, badges reactivos de cantidad y animaciones de carga elegantes (skeletons discretos, `animate-pulse`).
- Respeto absoluto a la directiva de accesibilidad `prefers-reduced-motion` (desactivar loops y pulsos cuando el usuario lo solicite en su sistema).

---

## 2. Experiencia de Usuario y UI Craft (`/impeccable`, `/taste-skill`, `/redesign-skill`)

### Mobile-First Nativo
- La tienda está diseñada primordialmente para dispositivos móviles (desde pantallas compactas de 375px hasta desktops ultrawide).
- **Tap Targets:** Todos los elementos interactivos (botones, checkboxes, radios, enlaces) deben tener una superficie mínima de toque de 44x44px (preferible 48px en móvil).
- **Above the Fold optimizado:** El hero inicial en móvil no debe superar el 60-70vh para que el usuario descubra los productos y categorías inmediatamente sin scroll excesivo.
- **Sticky Actions:** El botón de acceso rápido al carrito y el checkout deben ser accesibles con una mano en móvil.

### Catálogo Fiel a la Carta Comercial (Canva 2025/2026)
- **Cero multiplicadores ficticios:** Quedan terminantemente prohibidos los multiplicadores genéricos `0.8 / 1.0 / 1.3`. Cada producto tiene presentaciones explícitas y exactas (ej. Granizados OPS: 8 oz $10.000, 16 oz $15.000, 24 oz $25.000; Malteadas 14 oz $15.000).
- **Personalización estructurada:** 
  - Selección obligatoria de tamaño/presentación.
  - Selección de sabor (con o sin licor, respetando las combinaciones reales de la carta).
  - Base requerida cuando aplique (cerveza, soda, agua, leche).
  - Toppings y adiciones explícitas con su precio individual real.
- **Transparencia comercial:** Productos sin precio definido se guardan como borradores inactivos y no se muestran al cliente final con precios ficticios de $0.
- **Fotografías reales:** Soporte para Cloudflare R2 con preview optimizado; imágenes pendientes deben usar un placeholder honesto con marca (`/catalog-placeholder.svg`), nunca fotos falsas de stock ajenas al producto.

### Panel Administrativo Eficiente
- Formulario de productos con **filas dinámicas y controles visuales** para sabores y adiciones (eliminar la entrada de texto crudo separado por comas o dos puntos).
- Categorías dinámicas administrables desde la persistencia (no `<select>` estático cableado).
- Confirmaciones destructivas explícitas (modales claros con nombres del elemento a eliminar).

---

## 3. Seguridad y Límites de Confianza (`/security-best-practices`, `/frontend-security-coder`)

### Principio de Cero Confianza en el Cliente
- **Validación Dual:** Toda validación realizada en cliente con Zod (`react-hook-form`) debe ser revalidada en el servidor antes de cualquier mutación o persistencia.
- **Precios e Importes Inmutables desde Servidor:** El cliente solo envía el `productId`, las opciones seleccionadas (`size`, `flavors`, `addOns`) y la cantidad. El servidor recalcula el precio unitario, los subtotales y el costo de envío a partir de la fuente de verdad. El cliente nunca impone el precio final.
- **Idempotencia de Pedidos:** Todo pedido requiere un `idempotencyKey` único por cliente/sesión para evitar cobros dobles o duplicación ante desconexiones.

### Autenticación y Autorización (RBAC)
- **Firebase Auth + JWT:** Autenticación de identidades delegada en Firebase Auth. Verificación estricta de tokens en servidor con validación de expiración, algoritmo, emisor, audiencia y claims (`verify-request.ts`).
- **Verificación de Email:** Clientes deben tener su correo verificado para proceder con el checkout de pedidos.
- **Roles y Permisos:** 
  - Administrador exige custom claim `admin: true` y perfil activo.
  - Permisos granulares (`productos.read`, `productos.write`, `pedidos.write`, etc.) comprobados tanto en Server Actions / API Routes como en gates de interfaz (`<AdminGuard>`, `<PermissionGate>`).
- **Protección contra Escalada:** Un usuario no puede auto-asignarse roles ni modificar perfiles ajenos. Protección del último administrador del sistema para evitar bloqueo operativo.

### Secretos y Frontera de Entornos
- `server-only`: Los módulos que manejan credenciales de Firebase Admin, Cloudflare D1/R2 o DeepSeek (`DEEPSEEK_API_KEY`) deben tener la directiva `import "server-only";` y jamás importarse desde componentes cliente.
- Variables públicas: Solo se permite exponer `NEXT_PUBLIC_` para valores no sensibles (ej. base URL de R2 para imágenes públicas, Firebase Client API Key pública).
- Sanitización de Entradas y Cargas de Archivos:
  - Validación de tipos MIME reales por magic bytes (JPEG, PNG, WebP) hasta 5 MB.
  - Claves de almacenamiento R2 normalizadas y versionadas para evitar colisiones de archivos o inyección de rutas (`../`).

---

## 4. Limpieza de Código y Alto Rendimiento (`/antislop`, `/web-performance-optimization`, `/ponytail`)

### Antislop: Código Conciso, Robusto y Necesario
- **Cero Abstracciones Inútiles:** No crear wrappers sobre wrappers ni carpetas vacías sin justificación de dominio. Reutilizar la arquitectura establecida (`src/components/`, `src/lib/`, `src/types/`, `src/hooks/`).
- **TypeScript Estricto:** Prohibido el uso de `any` o aserciones inseguras (`as unknown as Type`). Todo contrato debe tener su tipo o interfaz explícita en `src/types/`.
- **Eliminación de Residuos:** No dejar código muerto comentado, `console.log` de depuración en rutas de producción, ni TODOs huérfanos.

### Web Performance & Core Web Vitals
- **LCP (Largest Contentful Paint):** La imagen principal del Hero y los primeros productos del catálogo deben cargar con `priority` y tamaños adaptativos (`sizes="(max-width: 768px) 100vw, 50vw"`).
- **CLS (Cumulative Layout Shift):** Las imágenes deben tener dimensiones explícitas o contenedores con `aspect-ratio` definido para evitar saltos de página.
- **Server vs. Client Components:** Usar Server Components por defecto para obtener datos y renderizar HTML estático/dinámico. Reservar `"use client"` exclusivamente para hojas de árbol que requieran interacción (hooks de estado, eventos DOM, context consumers).
- **Rutas Dinámicas:** Declarar explícitamente `export const dynamic = 'force-dynamic';` en páginas que interactúen con bases de datos en vivo (Firestore / D1) para evitar fallos de compilación estática durante el build.

### Estado y Almacenamiento Local Limpio
- El carrito debe usar claves de almacenamiento limpias y con namespace de la marca (`coctels_ops_cart`).
- Agrupación inteligente de items: Si un cliente agrega el mismo producto con exactamente las mismas personalizaciones, se incrementa la cantidad en vez de duplicar líneas sueltas.

---

## 5. Ciclo de Construcción y Verificación (`/superpowers`, Testing & Playwright)

### Calidad Continua
1. **Pruebas Unitarias y de Integración (Vitest):** Cobertura de validaciones Zod, repositorios, control de inventario concurrente, reglas de permisos y cálculo de montos. Comando: `corepack pnpm test`.
2. **Chequeo de Tipos (TypeScript):** Cero errores en `tsc --noEmit`. Comando: `corepack pnpm typecheck`.
3. **Linter (ESLint):** Cero warnings y errores en código fuente. Comando: `corepack pnpm lint`.
4. **Build de Producción:** El artefacto debe compilar limpiamente con `corepack pnpm build`.
5. **E2E / Pruebas Visuales:** Pruebas funcionales de flujo completo (Catálogo -> Personalización -> Carrito -> Checkout -> Seguimiento) con emuladores locales (`corepack pnpm test:e2e:local`) o mediante MCP Playwright.

### Política de Despliegue a Producción
- Una vez completado y verificado el ciclo de construcción, las pruebas garantizan que el código es apto para commit y push.
- Despliegues destructivos, migraciones de datos remotos o modificaciones de infraestructura requieren la validación y confirmación previa del operador según `AGENTS.md`.

