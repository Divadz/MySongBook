/**
 * Accès à la bibliothèque : un dossier contenant songs/, sets/, images/ et
 * .mysongbook/. Les chemins sont relatifs à la racine, séparés par « / ».
 */

export interface LibraryFS {
  /** Nom affiché (nom du dossier). */
  readonly name: string;
  /** Tous les fichiers de la bibliothèque, chemins relatifs. */
  list(): Promise<string[]>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  readBlob(path: string): Promise<Blob>;
  exists(path: string): Promise<boolean>;
  /** Supprime un fichier (pas de corbeille : Google Drive garde l'historique). */
  remove(path: string): Promise<void>;
}

export type SongKind = 'chordpro' | 'pdf';

export interface SongEntry {
  path: string;
  /** Dossier relatif à songs/ (« » pour la racine). */
  folder: string;
  fileName: string;
  kind: SongKind;
  title: string;
  artist?: string;
  key?: string;
  tags: string[];
  /** Texte normalisé pour la recherche : titre, artiste, tags, paroles. */
  searchText: string;
}

export const SONGS_DIR = 'songs/';
export const SETTINGS_PATH = '.mysongbook/settings.json';

const CHORDPRO_EXT = /\.(cho|chordpro|chopro|crd|chord|pro)$/i;
const PDF_EXT = /\.pdf$/i;

export function isSongFile(path: string): boolean {
  return path.startsWith(SONGS_DIR) && (CHORDPRO_EXT.test(path) || PDF_EXT.test(path));
}

/** Minuscules sans accents, pour la recherche. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i < 0 ? '' : path.slice(0, i);
}

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function directive(text: string, names: string): string | undefined {
  const m = new RegExp(`^\\s*\\{\\s*(?:${names})\\s*:\\s*([^}]*)\\}`, 'im').exec(text);
  return m ? m[1].trim() : undefined;
}

/** Lecture rapide des informations d'un fichier ChordPro, sans analyse complète. */
export function summarizeChordPro(path: string, text: string): SongEntry {
  const fileName = basename(path);
  const title = directive(text, 'title|t') || fileName.replace(/\.[^.]+$/, '');
  const artist = directive(text, 'artist');
  const key = directive(text, 'key');
  const tagsRaw = directive(text, 'tags|meta\\s*:\\s*tags');
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];
  // Paroles : sans directives, accords ni lignes de remarque.
  const lyrics = text
    .split(/\r?\n/)
    .filter((l) => !/^\s*[{#]/.test(l))
    .map((l) => l.replace(/\[[^\]]*\]/g, ''))
    .join(' ');
  return {
    path,
    folder: dirname(path.slice(SONGS_DIR.length)),
    fileName,
    kind: 'chordpro',
    title,
    artist,
    key,
    tags,
    searchText: normalizeText(`${title} ${artist ?? ''} ${tags.join(' ')} ${lyrics}`).replace(/\s+/g, ' '),
  };
}

function summarizePdf(path: string): SongEntry {
  const fileName = basename(path);
  const title = fileName.replace(/\.pdf$/i, '');
  return {
    path,
    folder: dirname(path.slice(SONGS_DIR.length)),
    fileName,
    kind: 'pdf',
    title,
    tags: [],
    searchText: normalizeText(title),
  };
}

/** Parcourt songs/ et résume chaque morceau. */
export async function scanLibrary(fs: LibraryFS): Promise<SongEntry[]> {
  const paths = (await fs.list()).filter(isSongFile);
  const entries = await Promise.all(
    paths.map(async (p) => {
      if (PDF_EXT.test(p)) return summarizePdf(p);
      try {
        return summarizeChordPro(p, await fs.readText(p));
      } catch {
        return null;
      }
    }),
  );
  return entries.filter((e): e is SongEntry => e !== null);
}

/** Nom de fichier sûr à partir d'un titre. */
export function fileNameFromTitle(title: string): string {
  const clean = title
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${clean || 'Nouveau morceau'}.cho`;
}

export function newSongTemplate(title: string): string {
  return `{title: ${title}}\n{artist: }\n{key: C}\n{tempo: }\n\n{start_of_verse: Couplet 1}\n[C]Paroles du couplet\n{end_of_verse}\n\n{start_of_chorus}\n[F]Paroles du refrain\n{end_of_chorus}\n`;
}
