/**
 * Setlists : un fichier texte par set dans sets/.
 *
 *   {title: Fête de la musique 2027}
 *   {date: 2027-06-21}
 *   {pinned: true}
 *
 *   Kenata/Toujours debout.cho
 *   # Pause : changement de clavier
 *   # cinq minutes
 *   Autres/Amazing Grace.cho
 *
 * Chemins relatifs à songs/. Les lignes « # » consécutives forment une
 * note intercalée (une page de note pendant le set) ; une ligne vide ou un
 * morceau la termine.
 */
import type { LibraryFS } from './library';

export const SETS_DIR = 'sets/';

export type SetItem = { kind: 'song'; path: string } | { kind: 'note'; text: string };

export interface Setlist {
  /** Chemin du fichier, relatif à la bibliothèque. */
  file: string;
  title: string;
  /** AAAA-MM-JJ, facultatif. */
  date?: string;
  pinned: boolean;
  items: SetItem[];
}

export function parseSet(file: string, text: string): Setlist {
  const set: Setlist = { file, title: '', pinned: false, items: [] };
  let note: string[] | null = null;
  const closeNote = () => {
    if (note) set.items.push({ kind: 'note', text: note.join('\n') });
    note = null;
  };
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    const directive = /^\{\s*([a-z_]+)\s*:?\s*(.*?)\s*\}$/i.exec(line);
    if (directive) {
      closeNote();
      const [, name, value] = directive;
      if (/^(title|t)$/i.test(name)) set.title = value;
      else if (/^date$/i.test(name)) set.date = value || undefined;
      else if (/^pinned$/i.test(name)) set.pinned = /^(true|oui|1)$/i.test(value);
    } else if (line.startsWith('#')) {
      (note ??= []).push(line.replace(/^#\s?/, ''));
    } else if (line === '') {
      closeNote();
    } else {
      closeNote();
      set.items.push({ kind: 'song', path: line.replace(/\\/g, '/') });
    }
  }
  closeNote();
  if (!set.title) set.title = file.replace(/^.*\//, '').replace(/\.set$/i, '');
  return set;
}

export function serializeSet(set: Setlist): string {
  const head = [`{title: ${set.title}}`];
  if (set.date) head.push(`{date: ${set.date}}`);
  if (set.pinned) head.push('{pinned: true}');
  const body: string[] = [];
  set.items.forEach((item, i) => {
    if (item.kind === 'song') body.push(item.path);
    else {
      // Deux notes qui se suivent sont séparées par une ligne vide.
      if (i > 0 && set.items[i - 1].kind === 'note') body.push('');
      for (const l of item.text.split('\n')) body.push(`# ${l}`.trimEnd());
    }
  });
  return `${head.join('\n')}\n\n${body.join('\n')}\n`;
}

/** Sets épinglés d'abord, puis du plus récent au plus ancien, puis par titre. */
export function sortSets(sets: Setlist[]): Setlist[] {
  return [...sets].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      (b.date ?? '').localeCompare(a.date ?? '') ||
      a.title.localeCompare(b.title, 'fr'),
  );
}

export async function scanSets(fs: LibraryFS): Promise<Setlist[]> {
  const files = (await fs.list()).filter((p) => p.startsWith(SETS_DIR) && /\.set$/i.test(p));
  const sets = await Promise.all(
    files.map(async (f) => {
      try {
        return parseSet(f, await fs.readText(f));
      } catch {
        return null;
      }
    }),
  );
  return sortSets(sets.filter((s): s is Setlist => s !== null));
}

/** Nom de fichier libre pour un nouveau set. */
export async function newSetFile(fs: LibraryFS, title: string, date?: string): Promise<string> {
  const base = `${date ? `${date} ` : ''}${title}`.replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim() || 'Nouveau set';
  let file = `${SETS_DIR}${base}.set`;
  for (let i = 2; await fs.exists(file); i++) file = `${SETS_DIR}${base} (${i}).set`;
  return file;
}

/** Texte ChordPro d'affichage d'une note de set : première ligne en titre. */
export function noteAsChordPro(text: string): string {
  const clean = (s: string) => s.replace(/[{}]/g, '');
  const [first, ...rest] = text.split('\n');
  return [`{title: ${clean(first) || 'Note'}}`, ...rest.filter((l) => l.trim()).map((l) => `{comment: ${clean(l)}}`)].join('\n');
}
