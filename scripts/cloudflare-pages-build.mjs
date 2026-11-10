import fs from 'node:fs';
import path from 'node:path';

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    if (fs.existsSync(dest) && !fs.statSync(dest).isDirectory()) {
      fs.rmSync(dest, { force: true });
    }
    fs.mkdirSync(dest, { recursive: true });
    for (const child of fs.readdirSync(src)) {
      copyRecursive(path.join(src, child), path.join(dest, child));
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
      console.warn(`[Cloudflare Pages Build] Advertencia al copiar ${src}: ${err.message}`);
    }
  }
}

console.log('[Cloudflare Pages Build] Preparando directorio out...');
if (fs.existsSync('out')) {
  try {
    fs.rmSync('out', { recursive: true, force: true });
  } catch (err) {
    console.warn(`[Cloudflare Pages Build] No se pudo limpiar out: ${err.message}`);
  }
}
fs.mkdirSync('out/_next', { recursive: true });

// 1. Copiar estáticos de Next.js
if (fs.existsSync('.next/static')) {
  console.log('[Cloudflare Pages Build] Copiando .next/static -> out/_next/static...');
  copyRecursive('.next/static', 'out/_next/static');
}

// 2. Copiar páginas estáticas prerenderizadas de .next/server/app
if (fs.existsSync('.next/server/app')) {
  console.log('[Cloudflare Pages Build] Copiando páginas estáticas .next/server/app -> out...');
  copyRecursive('.next/server/app', 'out');
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
        console.warn(`[Cloudflare Pages Build] No se pudo resolver body para ${item.name}: ${err.message}`);
      }
    }
  }
}
resolveBodyFiles('out');

// 4. Copiar carpeta public (al final para asegurar precedencia de assets oficiales)
if (fs.existsSync('public')) {
  console.log('[Cloudflare Pages Build] Copiando public -> out...');
  copyRecursive('public', 'out');
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
        console.warn(`[Cloudflare Pages Build] No se pudo crear index para ${item.name}: ${err.message}`);
      }
    }
  }
}
createDirectoryIndexFiles('out');

// 6. Generar _worker.js inteligente para Pages: sirve estáticos primero, y si no existe delega al Worker APP
const defaultStoreConfigJson = JSON.stringify({
  whatsappNumber: "573000000000",
  businessHours: [
    { day: "Lunes", open: "10:00", close: "22:00" },
    { day: "Martes", open: "10:00", close: "22:00" },
    { day: "Miércoles", open: "10:00", close: "22:00" },
    { day: "Jueves", open: "10:00", close: "22:00" },
    { day: "Viernes", open: "10:00", close: "23:00" },
    { day: "Sábado", open: "10:00", close: "23:00" },
    { day: "Domingo", open: "12:00", close: "20:00" },
  ],
  deliveryZones: ["Laureles", "El Poblado", "Belén"],
  estimatedDeliveryMinutes: 45,
  messages: {
    orderReceived: "Recibimos tu pedido y pronto confirmaremos la preparación.",
    orderStatus: "El estado de tu pedido cambió a {status}.",
    unavailable: "En este momento no podemos procesar el pedido.",
  },
});

const workerContent = `const DEFAULT_CONFIG = ${defaultStoreConfigJson};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. Intentar servir estáticos / páginas prerenderizadas directamente desde Cloudflare Pages ASSETS
    try {
      const response = await env.ASSETS.fetch(request);
      if (response && response.status !== 404) {
        return response;
      }
    } catch {
      // Continuar al fallback
    }

    // 2. Si no es un estático de out/ y hay backend Worker APP, delegar la petición dinámica
    if (env.APP && typeof env.APP.fetch === 'function') {
      try {
        const response = await env.APP.fetch(request);
        if (response.status >= 500 && url.pathname === '/api/configuration') {
          return new Response(JSON.stringify({ configuration: DEFAULT_CONFIG }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
          });
        }
        return response;
      } catch {
        if (url.pathname === '/api/configuration') {
          return new Response(JSON.stringify({ configuration: DEFAULT_CONFIG }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
          });
        }
        return new Response('Error en el servicio backend', { status: 502 });
      }
    }

    if (url.pathname === '/api/configuration') {
      return new Response(JSON.stringify({ configuration: DEFAULT_CONFIG }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' }
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
`;

fs.writeFileSync('out/_worker.js', workerContent, 'utf-8');
console.log('[Cloudflare Pages Build] Generado out/_worker.js con resiliencia de configuración para Cloudflare Pages');
console.log('[Cloudflare Pages Build] Finalizado con éxito.');
