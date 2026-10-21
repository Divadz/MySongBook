/**
 * Migration d'une sauvegarde SongbookPro vers un dossier de bibliothèque MySongBook.
 *
 *   npm run import:sbp -- "<fichier.sbpbackup>" "<dossier de destination>" [--merge "Kenata Chordpro=Kenata"]
 *
 * Le dossier de destination est créé s'il n'existe pas ; un fichier déjà
 * présent n'est jamais écrasé (il est signalé dans le rapport).
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

/** Lecture minimale d'un zip (répertoire central, entrées stockées ou deflate). */
function readZip(file) {
  const buf = fs.readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('Archive zip illisible');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    // SongbookPro écrit les noms en UTF-8 sans positionner le drapeau correspondant.
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    entries.set(name, () => {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return method === 0 ? data : zlib.inflateRawSync(data);
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

const args = process.argv.slice(2);
const merge = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--merge') {
    const [from, to] = (args[++i] ?? '').split('=');
    if (from && to) merge[from.trim()] = to.trim();
  } else positional.push(args[i]);
}
const [backup, dest] = positional;
if (!backup || !dest) {
  console.error('Usage : npm run import:sbp -- "<fichier.sbpbackup>" "<dossier de destination>" [--merge "Ancien=Nouveau"]');
  process.exit(1);
}

// Le module de conversion est en TypeScript : Vite le charge tel quel.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  server: { middlewareMode: true },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const { convertSbpBackup } = await server.ssrLoadModule('/src/core/sbpbackup.ts');
  const zip = readZip(backup);
  const dataFile = zip.get('dataFile.txt');
  if (!dataFile) throw new Error('dataFile.txt absent : ce n’est pas une sauvegarde SongbookPro');
  const result = convertSbpBackup(dataFile().toString('utf8'), merge);

  const skipped = [];
  const write = (rel, content) => {
    const full = path.join(dest, rel);
    if (fs.existsSync(full)) {
      skipped.push(rel);
      return;
    }
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  };
  for (const f of result.files) {
    if (f.text !== undefined) write(f.path, f.text);
    else {
      const entry = zip.get(f.fromArchive);
      if (entry) write(f.path, entry());
      else result.report.push(`- PDF absent de l’archive : \`${f.fromArchive}\``);
    }
  }
  if (result.drawings.length) {
    write('.mysongbook/import/sbp-drawings.json', `${JSON.stringify(result.drawings, null, 1)}\n`);
  }
  if (skipped.length) result.report.push('## Fichiers déjà présents, non écrasés', '', ...skipped.map((s) => `- \`${s}\``), '');

  const report = [`# Import SongbookPro`, '', `Source : ${path.basename(backup)}`, '', ...result.report].join('\n');
  const reportPath = path.join(dest, '.mysongbook', 'import', 'rapport-sbpbackup.md');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, report);
  console.log(report);
  console.log(`\nRapport : ${reportPath}`);
} finally {
  await server.close();
}
