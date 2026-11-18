// @vitest-environment node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildCloudflarePages,
  buildPagesWorkerContent,
  shouldCopyAppServerEntry,
} from '../../scripts/cloudflare-pages-build.mjs';

type WorkerModule = {
  default: {
    fetch(
      request: Request,
      env: {
        ASSETS?: { fetch: (req: Request) => Promise<Response> };
        APP?: { fetch: (req: Request) => Promise<Response> };
      },
    ): Promise<Response>;
  };
};

describe('cloudflare-pages-build', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  function createFixtureRoot(): string {
    const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cf-pages-build-'));
    tempDirs.push(rootDir);

    fs.mkdirSync(path.join(rootDir, '.next', 'static', 'chunks'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.next', 'static', 'chunks', 'app.js'), 'console.log("ok");');

    fs.mkdirSync(path.join(rootDir, '.next', 'server', 'app', 'api', 'auth', 'sync'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'api', 'auth', 'sync', 'route.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'api', 'auth', 'sync', 'route.js.nft.json'), '{}');

    fs.mkdirSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta.html'), '<html><body>Cuenta</body></html>');
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta.meta'), '{}');
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta.rsc'), 'rsc-data');
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta', 'page.js'), 'module.exports = {};');
    fs.writeFileSync(path.join(rootDir, '.next', 'server', 'app', 'cuenta', 'page.js.nft.json'), '{}');

    fs.mkdirSync(path.join(rootDir, 'public', 'brand'), { recursive: true });
    fs.writeFileSync(path.join(rootDir, 'public', 'brand', 'logo.png'), 'png');

    return rootDir;
  }

  async function loadGeneratedWorker(rootDir: string): Promise<WorkerModule['default']> {
    const workerPath = path.join(rootDir, 'out', '_worker.js');
    const loaded = (await import(/* @vite-ignore */ pathToFileURL(workerPath).href)) as WorkerModule;
    return loaded.default;
  }

  it('filtra /api y artefactos internos del servidor al copiar .next/server/app', () => {
    expect(shouldCopyAppServerEntry('api', true)).toBe(false);
    expect(shouldCopyAppServerEntry('api/auth/sync/route.js', false)).toBe(false);
    expect(shouldCopyAppServerEntry('cuenta/page.js', false)).toBe(false);
    expect(shouldCopyAppServerEntry('cuenta/page.js.nft.json', false)).toBe(false);
    expect(shouldCopyAppServerEntry('cuenta.meta', false)).toBe(false);
    expect(shouldCopyAppServerEntry('cuenta.html', false)).toBe(true);
    expect(shouldCopyAppServerEntry('cuenta.rsc', false)).toBe(true);

    const rootDir = createFixtureRoot();
    buildCloudflarePages({ rootDir, log: () => {} });

    expect(fs.existsSync(path.join(rootDir, 'out', 'api'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta.html'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta.rsc'))).toBe(true);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta.meta'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta', 'page.js'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'out', 'cuenta', 'page.js.nft.json'))).toBe(false);
    expect(fs.existsSync(path.join(rootDir, 'out', '_worker.js'))).toBe(true);
  });

  it('delega /api/* y metodos mutables directamente a env.APP sin consultar env.ASSETS', async () => {
    const rootDir = createFixtureRoot();
    buildCloudflarePages({ rootDir, log: () => {} });
    const worker = await loadGeneratedWorker(rootDir);

    const assetsFetch = vi.fn(async () => new Response('Method Not Allowed', { status: 405 }));
    const appFetch = vi.fn(async (req: Request) => {
      const { pathname } = new URL(req.url);
      return Response.json({ routedToApp: true, method: req.method, pathname }, { status: 200 });
    });
    const env = { ASSETS: { fetch: assetsFetch }, APP: { fetch: appFetch } };

    const syncRes = await worker.fetch(
      new Request('https://coctelsops.pages.dev/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify({ uid: 'm9gGqPPMK2QqE0H8fkrhR1tkGbP2' }),
      }),
      env,
    );
    expect(syncRes.status).toBe(200);
    expect(await syncRes.json()).toEqual({
      routedToApp: true,
      method: 'POST',
      pathname: '/api/auth/sync',
    });

    const sessionRes = await worker.fetch(new Request('https://coctelsops.pages.dev/api/auth/session', { method: 'GET' }), env);
    expect(sessionRes.status).toBe(200);
    expect(await sessionRes.json()).toEqual({
      routedToApp: true,
      method: 'GET',
      pathname: '/api/auth/session',
    });

    const loyaltyRes = await worker.fetch(new Request('https://coctelsops.pages.dev/api/loyalty', { method: 'GET' }), env);
    expect(loyaltyRes.status).toBe(200);
    expect(await loyaltyRes.json()).toEqual({
      routedToApp: true,
      method: 'GET',
      pathname: '/api/loyalty',
    });

    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const mutableRes = await worker.fetch(
        new Request('https://coctelsops.pages.dev/cuenta', { method }),
        env,
      );
      expect(mutableRes.status).toBe(200);
      expect(await mutableRes.json()).toEqual({
        routedToApp: true,
        method,
        pathname: '/cuenta',
      });
    }

    expect(assetsFetch).not.toHaveBeenCalled();
    expect(appFetch).toHaveBeenCalledTimes(7);
  });

  it('sirve assets estaticos para GET /cuenta cuando env.ASSETS responde 200 y hace fallback ante 404/405', async () => {
    const rootDir = createFixtureRoot();
    buildCloudflarePages({ rootDir, log: () => {} });
    const worker = await loadGeneratedWorker(rootDir);

    const assetsFetch = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(new Response('<html>Cuenta</html>', { status: 200 }))
      .mockResolvedValueOnce(new Response('Method Not Allowed', { status: 405 }));
    const appFetch = vi.fn(async () => new Response('from-app', { status: 200 }));
    const env = { ASSETS: { fetch: assetsFetch }, APP: { fetch: appFetch } };

    const staticRes = await worker.fetch(new Request('https://coctelsops.pages.dev/cuenta', { method: 'GET' }), env);
    expect(staticRes.status).toBe(200);
    expect(await staticRes.text()).toBe('<html>Cuenta</html>');
    expect(appFetch).not.toHaveBeenCalled();

    const fallbackRes = await worker.fetch(new Request('https://coctelsops.pages.dev/admin/dashboard', { method: 'GET' }), env);
    expect(fallbackRes.status).toBe(200);
    expect(await fallbackRes.text()).toBe('from-app');
    expect(assetsFetch).toHaveBeenCalledTimes(2);
    expect(appFetch).toHaveBeenCalledTimes(1);
    expect(buildPagesWorkerContent()).toContain("url.pathname === '/api' || url.pathname.startsWith('/api/')");
  });
});
