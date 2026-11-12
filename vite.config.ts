import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Développement seulement : expose un dossier de bibliothèque en HTTP pour
 * tester l'application sans le sélecteur de dossier du navigateur.
 * Dossier : variable MSB_LIBRARY, sinon fixtures/library.
 */
function devLibrary(): Plugin {
  const root = path.resolve(process.env.MSB_LIBRARY ?? 'fixtures/library');
  const safe = (rel: string): string => {
    const full = path.resolve(root, rel);
    if (full !== root && !full.startsWith(root + path.sep)) throw new Error('Chemin hors bibliothèque');
    return full;
  };
  const walk = (dir: string, prefix: string, out: string[]) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) walk(path.join(dir, e.name), `${prefix}${e.name}/`, out);
      else out.push(`${prefix}${e.name}`);
    }
  };
  return {
    name: 'devLibrary',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__library', (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x');
          if (!fs.existsSync(root)) {
            res.statusCode = 404;
            return res.end();
          }
          if (url.pathname === '/info') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ name: path.basename(root) }));
          }
          if (url.pathname === '/list') {
            const out: string[] = [];
            walk(root, '', out);
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(out));
          }
          if (url.pathname === '/file') {
            const full = safe(url.searchParams.get('path') ?? '');
            if (req.method === 'PUT') {
              const chunks: Buffer[] = [];
              req.on('data', (c: Buffer) => chunks.push(c));
              req.on('end', () => {
                fs.mkdirSync(path.dirname(full), { recursive: true });
                fs.writeFileSync(full, Buffer.concat(chunks));
                res.end('ok');
              });
              return;
            }
            if (!fs.existsSync(full)) {
              res.statusCode = 404;
              return res.end();
            }
            if (req.method === 'HEAD') return res.end();
            if (req.method === 'DELETE') {
              fs.unlinkSync(full);
              return res.end('ok');
            }
            return res.end(fs.readFileSync(full));
          }
          res.statusCode = 404;
          res.end();
        } catch (e) {
          res.statusCode = 400;
          res.end(String(e));
        }
      });
    },
  };
}

/**
 * Mode hors ligne du site (PC) : service worker qui met en cache, dès la
 * première visite, tous les fichiers de l'application (code, polices, pdf.js,
 * échantillons). Son nom de cache dépend du contenu : une nouvelle version
 * remplace l'ancienne au chargement suivant. Les morceaux, eux, sont lus dans
 * le dossier local et ne passent jamais par le réseau.
 */
function offline(): Plugin {
  let publicDir = 'public';
  return {
    name: 'offline',
    apply: 'build',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    generateBundle(_options, bundle) {
      const files: string[] = [];
      const hash = crypto.createHash('sha256');
      for (const [name, item] of Object.entries(bundle)) {
        files.push(name);
        hash.update(name);
        hash.update(item.type === 'chunk' ? item.code : item.source);
      }
      const walk = (dir: string, prefix: string) => {
        if (!fs.existsSync(dir)) return;
        for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full, `${prefix}${e.name}/`);
          else {
            files.push(`${prefix}${e.name}`);
            hash.update(`${prefix}${e.name}`);
            hash.update(fs.readFileSync(full));
          }
        }
      };
      walk(publicDir, '');
      const list = files.filter((f) => f !== 'sw.js').sort();
      const cache = `msb-${hash.digest('hex').slice(0, 12)}`;
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `// Généré à la construction (vite.config.ts, offline()).
const CACHE = ${JSON.stringify(cache)};
const FILES = ${JSON.stringify(['./', ...list.map((f) => `./${f}`)])};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('msb-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Page : la version en cache (hors ligne et rapide) ; la suivante s'installe en arrière-plan.
  const key = req.mode === 'navigate' ? new URL('./', self.registration.scope).href : req;
  e.respondWith(caches.match(key, { ignoreSearch: true }).then((hit) => hit || fetch(req)));
});
`,
      });
    },
  };
}

export default defineConfig({
  // Site GitHub Pages : servi sous /MySongBook/ (MSB_BASE fixé par le workflow) ; APK et local : racine.
  base: process.env.MSB_BASE ?? '/',
  plugins: [react(), devLibrary(), offline()],
  server: { port: 5174 },
});
