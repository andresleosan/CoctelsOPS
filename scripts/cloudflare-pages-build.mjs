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

// 2. Copiar carpeta public
if (fs.existsSync('public')) {
  console.log('[Cloudflare Pages Build] Copiando public -> out...');
  copyRecursive('public', 'out');
}

// 3. Copiar páginas estáticas prerenderizadas de .next/server/app
if (fs.existsSync('.next/server/app')) {
  console.log('[Cloudflare Pages Build] Copiando páginas estáticas .next/server/app -> out...');
  copyRecursive('.next/server/app', 'out');
}

// 4. Asegurar rutas index.html para todas las páginas .html (ej. login.html -> login/index.html)
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

// 5. Generar _worker.js inteligente para Pages: sirve estáticos primero, y si no existe delega al Worker APP
const workerContent = `export default {
  async fetch(request, env) {
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
      return await env.APP.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
`;

fs.writeFileSync('out/_worker.js', workerContent, 'utf8');
console.log('[Cloudflare Pages Build] out/_worker.js generado exitosamente.');
