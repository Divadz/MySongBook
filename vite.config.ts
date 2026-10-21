import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

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

export default defineConfig({
  plugins: [react(), devLibrary()],
  server: { port: 5174 },
});
