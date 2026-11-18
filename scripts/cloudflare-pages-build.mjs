import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Excluye la carpeta /api y los artefactos internos de servidor de Next.js
 * para evitar que Cloudflare Pages ASSETS intercepte peticiones a APIs con 405.
 *
 * @param {string} relativePath
 * @param {boolean} isDirectory
 * @returns {boolean}
 */
export function shouldCopyAppServerEntry(relativePath, isDirectory) {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return true;
  if (normalized === 'api' || normalized.startsWith('api/')) {
    return false;
  }
  if (!isDirectory && (normalized.endsWith('.js') || normalized.endsWith('.nft.json') || normalized.endsWith('.meta'))) {
    return false;
  }
  return true;
}

function copyRecursive(src, dest, filter, baseDir = src) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  const relativePath = path.relative(baseDir, src);

  if (filter && relativePath && !filter(relativePath, stats.isDirectory())) {
    return;
  }

  if (stats.isDirectory()) {
    if (fs.existsSync(dest) && !fs.statSync(dest).isDirectory()) {
      fs.rmSync(dest, { force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child), filter, baseDir);
    }
  } else {
    if (fs.existsSync(dest) && fs.statSync(dest).isDirectory()) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    try {
      if (fs.existsSync(dest)) {
        fs.rmSync(dest, { force: true });
      }
      fs.copyFileSync(src, dest);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Cloudflare Pages Build] Advertencia al copiar ${src}: ${message}`);
    }
  }
}

// 3. Resolver archivos .body generados por Next.js App Router (ej. icon.png.body -> icon.png)
function resolveBodyFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      resolveBodyFiles(fullPath);
    } else if (item.isFile() && item.name.endsWith('.body')) {
      const targetName = item.name.replace(/\.body$/, '');
      const targetPath = path.join(dir, targetName);
      try {
        if (fs.existsSync(targetPath)) {
          fs.rmSync(targetPath, { recursive: true, force: true });
        }
        fs.copyFileSync(fullPath, targetPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[Cloudflare Pages Build] No se pudo resolver body para ${item.name}: ${message}`);
      }
    }
  }
}

// 5. Asegurar rutas index.html para todas las páginas .html (ej. login.html -> login/index.html)
function createDirectoryIndexFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      createDirectoryIndexFiles(fullPath);
    } else if (item.isFile() && item.name.endsWith('.html') && item.name !== 'index.html') {
      const baseName = item.name.replace(/\.html$/, '');
      const subDir = path.join(dir, baseName);
      const indexFile = path.join(subDir, 'index.html');
      try {
        fs.mkdirSync(subDir, { recursive: true });
        if (!fs.existsSync(indexFile)) {
          fs.copyFileSync(fullPath, indexFile);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`[Cloudflare Pages Build] No se pudo crear index para ${item.name}: ${message}`);
      }
    }
  }
}

const DEFAULT_STORE_CONFIG = {
  whatsappNumber: '573000000000',
  businessHours: [
    { day: 'Lunes', open: '10:00', close: '22:00' },
    { day: 'Martes', open: '10:00', close: '22:00' },
    { day: 'Miércoles', open: '10:00', close: '22:00' },
    { day: 'Jueves', open: '10:00', close: '22:00' },
    { day: 'Viernes', open: '10:00', close: '23:00' },
    { day: 'Sábado', open: '10:00', close: '23:00' },
    { day: 'Domingo', open: '12:00', close: '20:00' },
  ],
  deliveryZones: ['Laureles', 'El Poblado', 'Belén'],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: 'Recibimos tu pedido y pronto confirmaremos la preparación.',
    orderStatus: 'El estado de tu pedido cambió a {status}.',
    unavailable: 'En este momento no podemos procesar el pedido.',
  },
};

/**
 * Genera el contenido de out/_worker.js para Cloudflare Pages.
 * Las peticiones /api/* y cualquier método distinto de GET/HEAD se delegan
 * directamente al Worker APP sin pasar por env.ASSETS.
 *
 * @returns {string}
 */
export function buildPagesWorkerContent() {
  const defaultStoreConfigJson = JSON.stringify(DEFAULT_STORE_CONFIG);

  return `const DEFAULT_CONFIG = ${defaultStoreConfigJson};

const configurationFallback = () => new Response(JSON.stringify({ configuration: DEFAULT_CONFIG }), {
  status: 200,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
});

// La autenticacion y autorizacion las resuelve unicamente el Worker APP (verifica la firma
// del token de Firebase y el perfil en D1). Este gateway nunca fabrica sesiones.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isApiRequest = url.pathname === '/api' || url.pathname.startsWith('/api/');

    // 1. Estaticos / paginas prerenderizadas desde Cloudflare Pages ASSETS.
    // Solo se consultan para GET/HEAD fuera de /api/*; asi evitar respuestas 405 estaticas.
    if (!isApiRequest && (request.method === 'GET' || request.method === 'HEAD') && env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      try {
        const response = await env.ASSETS.fetch(request);
        if (response && response.status !== 404 && response.status !== 405) {
          return response;
        }
      } catch {
        // Continuar al fallback
      }
    }

    // 2. Delegar la peticion dinamica al Worker APP
    if (env?.APP && typeof env.APP.fetch === 'function') {
      try {
        const response = await env.APP.fetch(request.clone());
        if (response.status >= 500 && url.pathname === '/api/configuration') {
          return configurationFallback();
        }
        return response;
      } catch {
        if (url.pathname === '/api/configuration') {
          return configurationFallback();
        }
        return new Response('Error en el servicio backend', { status: 502 });
      }
    }

    if (url.pathname === '/api/configuration') {
      return configurationFallback();
    }

    return new Response('Not Found', { status: 404 });
  }
};
`;
}

/**
 * Empaqueta la salida estática y el _worker.js para Cloudflare Pages.
 *
 * @param {{ rootDir?: string, log?: (message: string) => void }} [options]
 */
export function buildCloudflarePages(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const log = options.log ?? ((message) => console.log(message));
  const outDir = path.join(rootDir, 'out');
  const nextStaticDir = path.join(rootDir, '.next', 'static');
  const nextServerAppDir = path.join(rootDir, '.next', 'server', 'app');
  const publicDir = path.join(rootDir, 'public');

  log('[Cloudflare Pages Build] Preparando directorio out...');
  if (fs.existsSync(outDir)) {
    try {
      fs.rmSync(outDir, { recursive: true, force: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Cloudflare Pages Build] No se pudo limpiar out: ${message}`);
    }
  }
  fs.mkdirSync(path.join(outDir, '_next'), { recursive: true });

  // 1. Copiar estáticos de Next.js
  if (fs.existsSync(nextStaticDir)) {
    log('[Cloudflare Pages Build] Copiando .next/static -> out/_next/static...');
    copyRecursive(nextStaticDir, path.join(outDir, '_next', 'static'));
  }

  // 2. Copiar páginas estáticas prerenderizadas de .next/server/app sin /api ni código servidor
  if (fs.existsSync(nextServerAppDir)) {
    log('[Cloudflare Pages Build] Copiando páginas estáticas .next/server/app -> out...');
    copyRecursive(nextServerAppDir, outDir, shouldCopyAppServerEntry);
  }

  // 3. Resolver archivos .body generados por Next.js App Router
  resolveBodyFiles(outDir);

  // 4. Copiar carpeta public (al final para asegurar precedencia de assets oficiales)
  if (fs.existsSync(publicDir)) {
    log('[Cloudflare Pages Build] Copiando public -> out...');
    copyRecursive(publicDir, outDir);
  }

  // Garantizar que out/api nunca exista como carpeta de assets estáticos en Pages
  fs.rmSync(path.join(outDir, 'api'), { recursive: true, force: true });

  // 5. Asegurar rutas index.html para todas las páginas .html
  createDirectoryIndexFiles(outDir);

  // 6. Generar _worker.js inteligente para Pages: /api/* y métodos mutables van directo a env.APP
  fs.writeFileSync(path.join(outDir, '_worker.js'), buildPagesWorkerContent(), 'utf-8');
  log('[Cloudflare Pages Build] Generado out/_worker.js con enrutamiento directo /api/* al Worker APP');
  log('[Cloudflare Pages Build] Finalizado con éxito.');
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase() === path.resolve(process.argv[1]).toLowerCase();

if (isDirectExecution) {
  buildCloudflarePages();
}
