---
name: avanzar
description: >-
  Ejecuta la siguiente tarea pendiente del backlog de Coctels OPS paso a paso.
  Aplica el flujo de planificación con /brainstorming, /writing-plans y /grill-me,
  garantiza el cumplimiento de DESIGN.md con /impeccable, /taste-skill, /redesign-skill,
  /security-best-practices, /frontend-security-coder, /antislop, /web-performance-optimization,
  /ponytail, optimiza el consumo de tokens con la Matriz de 6 Niveles (3.8 Flash + Argon),
  y ejecuta el ciclo de pruebas y verificación antes de hacer commit y push.
---

# Skill: /avanzar — Motor de Ejecución Paso a Paso Coctels OPS

Esta skill guía la ejecución sistemática de la siguiente tarea del proyecto **Coctels OPS**, manteniendo los más altos estándares de arquitectura, diseño visual, seguridad, rendimiento y eficiencia en el uso de modelos y tokens.

---

## 🧠 Matriz de 6 Niveles de Modelo y Esfuerzo (3.8 Flash + Argon)

Para maximizar la eficiencia de tokens y la precisión técnica, **cada tarea en `TASKS.md` / `BACKLOG.md` y cada cierre del comando `/avanzar` debe clasificar la próxima tarea eligiendo exactamente uno de estos 6 niveles**:

| Nivel | Tipo de Trabajo Ideal | Criterios de Selección |
|---|---|---|
| **`3.8 Flash (Low)`** | Ajustes cosméticos mínimos y textos | Cambios de copys o textos, corrección de typos, edición simple de documentación o `README.md`, alternar flags booleanos simples sin impacto en lógica de negocio. |
| **`3.8 Flash (Medium)`** | UI ligera y refactorización simple | Ajustes cosméticos de clases Tailwind/CSS, componentes visuales puros sin estado interno complejo, optimizaciones menores de estilos o microinteracciones. |
| **`3.8 Flash (High)`** | UI mobile-first completa y componentes interactivos | Rediseño y creación de vistas mobile-first, formularios interactivos con react-hook-form y validación local, hooks de UI y estado local, suites de pruebas unitarias/integración de componentes (`@testing-library/react`), pruebas E2E en Playwright. |
| **`Argon (Low)`** | Backend ligero y esquemas directos | Endpoints API CRUD estándar sin transacciones atómicas, consultas directas simples a Firestore, definición básica de esquemas Zod sin dependencias cruzadas. |
| **`Argon (Medium)`** | Lógica de negocio crítica y seguridad intermedia | Validación y recálculo estricto de órdenes en servidor, mutaciones con transacciones atómicas e idempotencia, autenticación y verificación de claims RBAC (`verify-request.ts`), integración y validación segura de uploads a Cloudflare R2 (magic bytes). |
| **`Argon (High)`** | Arquitectura profunda, multi-tenancy y seguridad avanzada | Aislamiento multi-tenant integral (`negocioId`), reglas de seguridad de Firestore complejas (`firestore.rules`), migraciones de base de datos en caliente con script de verificación, agentes conversacionales IA (GenKit/DeepSeek) con guardrails de seguridad y rate-limiting estricto. |

---

## Procedimiento de Ejecución

Cada vez que el usuario llame a `/avanzar`, ejecuta estrictamente los siguientes pasos:

### 1. Detección y Clasificación de la Próxima Tarea
1. Abre y lee el archivo `TASKS.md` (o `BACKLOG.md` en su defecto) en la raíz del proyecto.
2. Identifica el primer ítem no completado (`- [ ]`).
3. Si todas las tareas están completadas (`- [x]`), informa al usuario que el backlog está al día y sugiere nuevas mejoras de valor.
4. Identifica el **Nivel de Modelo y Esfuerzo recomendado** de la tarea según la matriz de 6 niveles (`3.8 Flash (Low/Medium/High)` o `Argon (Low/Medium/High)`).
5. Muestra un resumen conciso:
   - **ID y Título:** Identificador único de la tarea.
   - **Nivel Recomendado:** Nivel exacto de la matriz.
   - **Alcance y Archivos Clave:** Módulos a intervenir.
   - **Alineación de Modelo:** Si el modelo seleccionado por el operador difiere sustancialmente del recomendado, indícaselo como sugerencia de optimización de tokens y precisión.

### 2. Planificación y Validación de Decisiones (`/brainstorming`, `/writing-plans`, `/grill-me`)
1. **Brainstorming senior:** Evalúa la arquitectura existente y la mejor ruta de implementación minimizando la deuda técnica.
2. **Grill-me & Criterio Crítico:** Cuestiona asunciones frágiles. Si existe una tensión de diseño o una ambigüedad crítica de producto, formúlala claramente al operador antes de escribir código.
3. **Plan detallado (`writing-plans`):** Estructura el plan con:
   - Archivos a crear o modificar.
   - Contratos de tipos y firmas de funciones.
   - Afirmaciones de prueba esperadas (`expect(...)`).
   - Criterios de aceptación verificables.

### 3. Reglas de Diseño, Seguridad y Calidad (`DESIGN.md`)
Verifica que el plan cumpla rigurosamente con los 4 pilares de `DESIGN.md`:
- **Estética & UI/UX (`/impeccable`, `/taste-skill`, `/redesign-skill`):**
  - Identidad Coctels OPS: Fondo negro/slate, acentos Neon Magenta (`#E5196E`), Cyan (`#00BCD4`) y Violeta Opsy (`#8A2BE2`).
  - Mobile-First: Tap targets >= 44px, navegación con una sola mano, sin CLS, transiciones fluidas con respeto a `prefers-reduced-motion`.
  - Carta Canva fiel: Precios exactos en COP sin multiplicadores artificiales (`0.8/1/1.3`).
  - Panel administrativo: Contraste impecable (eliminar texto blanco sobre fondo blanco).
- **Seguridad (`/security-best-practices`, `/frontend-security-coder`):**
  - Cero confianza en cliente: El servidor recalcula siempre precios, stock y disponibilidad.
  - Autenticación Firebase Auth + RBAC en servidor (`verify-request.ts`).
  - Módulos sensibles con `import "server-only";`. Secretos jamás expuestos al cliente.
  - Validaciones Zod estrictas y transacciones atómicas con idempotencia.
- **Limpieza de Código y Rendimiento (`/antislop`, `/web-performance-optimization`, `/ponytail`):**
  - Antislop: Cero abstracciones inútiles o wrappers vacíos. Tipado estricto sin `any`.
  - Web Performance: Prioridad en imágenes LCP, Server Components por defecto, lazy loading en componentes pesados.
  - Next.js 16: Incluir `export const dynamic = 'force-dynamic';` en páginas que consultan bases de datos en vivo para asegurar builds limpios.

### 4. Implementación Quirúrgica
1. Aplica los cambios paso a paso utilizando las herramientas de edición de archivos.
2. Mantén la integridad de comentarios y documentación existente.
3. Asegura compatibilidad con el resto de la aplicación.

### 5. Ciclo de Verificación y Pruebas (`/superpowers` y Playwright)
Ejecuta la batería de validación local obligatoria:
```bash
# 1. Pruebas unitarias y de integración
corepack pnpm test

# 2. Comprobación de tipos estricta
corepack pnpm typecheck

# 3. Linter
corepack pnpm lint

# 4. Compilación del proyecto
node node_modules/next/dist/bin/next build --webpack
```
Si la tarea involucra flujos de usuario visuales o interactivos, ejecuta las pruebas E2E correspondientes con Playwright (`corepack pnpm test:e2e:local` o MCP Playwright).
Cero errores o warnings son tolerados. Si una prueba falla, corrígela de inmediato antes de continuar.

### 6. Cierre, Commit, Push y Clasificación de la Siguiente Tarea
1. Actualiza `TASKS.md` y `BACKLOG.md` marcando la tarea realizada con `[x]`.
2. Realiza el commit descriptivo usando conventional commits (ej. `feat(catalogo): implementar presentaciones reales de carta Canva`).
3. Realiza el push a la rama del repositorio para que la integración continua proceda con el despliegue a producción.
4. **Clasificación Obligatoria de la Próxima Tarea:**
   - Identifica la siguiente tarea pendiente (`- [ ]`).
   - Elige exactamente **uno de los 6 niveles de la Matriz** (`3.8 Flash (Low)`, `3.8 Flash (Medium)`, `3.8 Flash (High)`, `Argon (Low)`, `Argon (Medium)`, `Argon (High)`).
   - Incluye en la respuesta final de cierre la recomendación explícita para que el usuario configure el modelo y esfuerzo óptimo en la próxima invocación de `/avanzar`.
