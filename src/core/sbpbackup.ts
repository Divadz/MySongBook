/**
 * Conversion d'une sauvegarde SongbookPro (.sbpbackup) en bibliothèque MySongBook.
 *
 * L'archive est un zip : dataFile.txt (ligne « 1.0 » puis JSON songs / sets /
 * folders), pdf/ (les PDF importés), settings.hive (réglages, ignorés).
 * Ce module ne lit pas le zip : il reçoit dataFile.txt et rend la liste des
 * fichiers à écrire, plus un rapport des points à vérifier.
 */
import { fileNameFromTitle, SONGS_DIR } from './library';
import { serializeSet, SETS_DIR, type SetItem } from './setlist';

interface SbpSong {
  Id: number;
  name: string;
  subTitle?: string;
  author?: string;
  /** 1 = ChordPro, 2 = PDF. */
  type: number;
  /** Texte ChordPro, ou nom du PDF dans pdf/. */
  content: string;
  /** Index de tonalité, −1 si aucune (voir KEYS). */
  key: number;
  KeyShift: number;
  Capo: number;
  TempoInt: number;
  timeSig?: string;
  Copyright?: string;
  Zoom: number;
  _displayParams?: string;
  _tags?: string;
  _folders?: string;
  Deleted: boolean | number;
  drawingPathsBackup?: string | null;
}

interface SbpSetItem {
  Order: number;
  SongId: number;
  /** 1 = morceau, 2 = note. */
  ItemType: number;
  keyOfset: number;
  NotesText?: string | null;
  Deleted: number | boolean;
  drawingPathsBackup?: string | null;
}

interface SbpData {
  songs: SbpSong[];
  sets: { details: { name: string; date?: string; Deleted: number | boolean }; contents: SbpSetItem[] }[];
  folders: { Id: number; Name: string; Deleted: number | boolean }[];
}

/** Tonalités SongbookPro : 0–11 majeures depuis La, 12–23 mineures depuis Fa#m. */
const KEYS = [
  'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab',
  'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm',
];

export interface ImportedFile {
  /** Chemin relatif à la bibliothèque. */
  path: string;
  text?: string;
  /** Fichier à recopier depuis l'archive (chemin dans le zip). */
  fromArchive?: string;
}

export interface SbpImportResult {
  files: ImportedFile[];
  /** Annotations au stylet, gardées brutes en attendant leur conversion. */
  drawings: { song: string; set?: string; data: string }[];
  /** Lignes Markdown : ce qui a été fait et ce qu'il faut vérifier. */
  report: string[];
  counts: { chordpro: number; pdf: number; sets: number; skipped: number };
}

export function parseSbpDataFile(text: string): SbpData {
  const json = text.replace(/^﻿/, '').replace(/^[^{]*/, '');
  return JSON.parse(json) as SbpData;
}

const isDeleted = (v: boolean | number) => v === true || v === 1;
const clean = (s: string | undefined) => (s ?? '').replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();

function jsonArray(s: string | undefined): unknown[] {
  try {
    const v = JSON.parse(s ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** « Titre - Artiste » quand l'artiste n'est pas renseigné (fréquent pour les PDF). */
function splitTitle(song: SbpSong): { title: string; artist: string } {
  const title = clean(song.name);
  const artist = clean(song.author);
  // « Are you gonna be my girl - The Jets », artiste « The Jets » : l'artiste n'est pas répété dans le titre.
  if (artist) return { title: title.endsWith(` - ${artist}`) ? title.slice(0, -artist.length - 3) : title, artist };
  const m = /^(.+?)\s+-\s+(.+)$/.exec(title);
  return m ? { title: m[1], artist: m[2] } : { title, artist: '' };
}

function chordproText(song: SbpSong, transpose: number): string {
  const { title, artist } = splitTitle(song);
  const head = [`{title: ${title}}`];
  if (clean(song.subTitle)) head.push(`{subtitle: ${clean(song.subTitle)}}`);
  if (artist) head.push(`{artist: ${artist}}`);
  if (KEYS[song.key]) head.push(`{key: ${KEYS[song.key]}}`);
  if (song.TempoInt > 0) head.push(`{tempo: ${song.TempoInt}}`);
  if (clean(song.timeSig)) head.push(`{time: ${clean(song.timeSig)}}`);
  if (clean(song.Copyright)) head.push(`{copyright: ${clean(song.Copyright)}}`);
  const tags = jsonArray(song._tags).map(String).filter(Boolean);
  if (tags.length) head.push(`{tags: ${tags.join(', ')}}`);
  if (song.Zoom && Math.abs(song.Zoom - 1) > 0.01) head.push(`{textsize: ${Math.round(song.Zoom * 100)}%}`);
  if (transpose) head.push(`{transpose: ${transpose}}`);
  const body = song.content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '');
  return `${head.join('\n')}\n\n${body}\n`;
}

function pdfMeta(song: SbpSong): string {
  const { title, artist } = splitTitle(song);
  const meta: Record<string, unknown> = { title };
  if (artist) meta.artist = artist;
  if (KEYS[song.key]) meta.key = KEYS[song.key];
  try {
    const p = JSON.parse(song._displayParams ?? '') as { Top: number; Left: number; Width: number; Height: number };
    const round = (n: number) => Math.round(n * 10000) / 10000;
    // « {} » : pas de recadrage enregistré.
    if ([p.Top, p.Left, p.Width, p.Height].every(Number.isFinite))
      meta.crop = { top: round(p.Top), left: round(p.Left), width: round(p.Width), height: round(p.Height) };
  } catch {
    /* pas de recadrage */
  }
  if (song.Zoom && Math.abs(song.Zoom - 1) > 0.01) meta.zoom = song.Zoom;
  return `${JSON.stringify(meta, null, 2)}\n`;
}

/**
 * @param merge dossiers SongbookPro à fusionner, nom → nom (« Kenata Chordpro » → « Kenata »)
 */
export function convertSbpBackup(dataFile: string, merge: Record<string, string> = {}): SbpImportResult {
  const data = parseSbpDataFile(dataFile);
  const files: ImportedFile[] = [];
  const drawings: SbpImportResult['drawings'] = [];
  const counts = { chordpro: 0, pdf: 0, sets: 0, skipped: 0 };

  const folderName = new Map<number, string>();
  for (const f of data.folders ?? []) {
    if (isDeleted(f.Deleted)) continue;
    const name = clean(f.Name).replace(/[\\/:*?"<>|]/g, '');
    folderName.set(f.Id, merge[name] ?? name);
  }

  const used = new Set<string>();
  const uniquePath = (dir: string, base: string, ext: string) => {
    const prefix = `${SONGS_DIR}${dir ? `${dir}/` : ''}`;
    let path = `${prefix}${base}${ext}`;
    for (let i = 2; used.has(path.toLowerCase()); i++) path = `${prefix}${base} (${i})${ext}`;
    used.add(path.toLowerCase());
    return path;
  };

  const pathById = new Map<number, string>();
  const shiftById = new Map<number, number>();
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  const multiFolder: string[] = [];
  const capo: string[] = [];
  const unknown = new Map<string, Set<string>>();

  const deletedTitle = new Map<number, string>();
  for (const song of data.songs) {
    if (isDeleted(song.Deleted)) {
      deletedTitle.set(song.Id, splitTitle(song).title);
      counts.skipped++;
      continue;
    }
    const folders = [
      ...new Set(
        jsonArray(song._folders)
          .map((id) => folderName.get(Number(id)))
          .filter((n): n is string => !!n),
      ),
    ];
    const dir = folders[0] ?? '';
    const { title, artist } = splitTitle(song);
    if (folders.length > 1) multiFolder.push(`- ${title} : ${folders.join(', ')} → ${dir}`);

    // Doublon exact (même titre, même contenu) : un seul fichier.
    const dupKey = `${song.type}|${title.toLowerCase()}|${song.content}`;
    const dup = seen.get(dupKey);
    if (dup) {
      pathById.set(song.Id, dup);
      duplicates.push(`- « ${title} » : identique à \`${dup}\`, non recopié`);
      continue;
    }

    let path: string;
    if (song.type === 2) {
      const base = fileNameFromTitle(artist ? `${title} - ${artist}` : title).replace(/\.cho$/, '');
      path = uniquePath(dir, base, '.pdf');
      files.push({ path, fromArchive: `pdf/${song.content}` });
      files.push({ path: `${path}.json`, text: pdfMeta(song) });
      counts.pdf++;
    } else {
      // Ce que SongbookPro affichait : tonalité choisie, moins le capo.
      const transpose = (song.KeyShift || 0) - (song.Capo || 0);
      if (song.Capo) capo.push(`- ${title} : capo ${song.Capo}, transposition ${song.KeyShift} → \`{transpose: ${transpose}}\``);
      path = uniquePath(dir, fileNameFromTitle(title).replace(/\.cho$/, ''), '.cho');
      files.push({ path, text: chordproText(song, transpose) });
      shiftById.set(song.Id, transpose);
      counts.chordpro++;
      for (const m of song.content.matchAll(/\{\s*([a-z_]+)/gi)) {
        const name = m[1].toLowerCase();
        if (name === 'intro' || name === 'v' || name === 'textfill') {
          if (!unknown.has(name)) unknown.set(name, new Set());
          unknown.get(name)!.add(title);
        }
      }
    }
    seen.set(dupKey, path);
    pathById.set(song.Id, path);
    if (song.drawingPathsBackup) drawings.push({ song: path, data: song.drawingPathsBackup });
  }

  // Sets
  const setReport: string[] = [];
  const setNames = new Set<string>();
  for (const s of data.sets ?? []) {
    if (isDeleted(s.details.Deleted)) continue;
    const title = clean(s.details.name) || 'Set';
    const date = /^\d{4}-\d{2}-\d{2}/.exec(s.details.date ?? '')?.[0];
    const items: SetItem[] = [];
    const contents = s.contents.filter((i) => !isDeleted(i.Deleted)).sort((a, b) => a.Order - b.Order);
    for (const it of contents) {
      if (it.ItemType === 2) {
        const text = (it.NotesText ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '');
        if (text) items.push({ kind: 'note', text });
        continue;
      }
      const path = pathById.get(it.SongId);
      if (!path) {
        const gone = deletedTitle.get(it.SongId);
        const why = gone ? `« ${gone} », supprimé dans SongbookPro` : `n° ${it.SongId}, absent de la sauvegarde`;
        items.push({ kind: 'note', text: `Morceau manquant : ${why}` });
        setReport.push(`- « ${title} » : morceau ${why} ; remplacé par une note`);
        continue;
      }
      const rel = path.slice(SONGS_DIR.length);
      items.push({ kind: 'song', path: rel });
      const shift = shiftById.get(it.SongId) ?? 0;
      if (it.keyOfset && it.keyOfset !== shift) {
        setReport.push(`- « ${title} » : \`${rel}\` transposé de ${it.keyOfset} dans ce set ; le morceau garde ${shift}`);
      }
      if (it.drawingPathsBackup) drawings.push({ song: path, set: title, data: it.drawingPathsBackup });
    }
    const stem = `${date ? `${date} ` : ''}${title}`.replace(/[\\/:*?"<>|]/g, '').trim();
    let base = stem;
    for (let i = 2; setNames.has(base.toLowerCase()); i++) base = `${stem} (${i})`;
    setNames.add(base.toLowerCase());
    const file = `${SETS_DIR}${base}.set`;
    files.push({ path: file, text: serializeSet({ file, title, date, pinned: false, items }) });
    counts.sets++;
  }

  const report = [
    `Morceaux ChordPro : ${counts.chordpro}, PDF : ${counts.pdf}, sets : ${counts.sets}, morceaux supprimés ignorés : ${counts.skipped}.`,
    '',
  ];
  const section = (heading: string, lines: string[]) => {
    if (lines.length) report.push(`## ${heading}`, '', ...lines, '');
  };
  section('Doublons', duplicates);
  section('Morceaux rangés dans plusieurs dossiers (premier dossier retenu)', multiFolder);
  section('Capo converti en transposition', capo);
  section(
    'Directives propres à SongbookPro, laissées telles quelles',
    [...unknown].map(([name, songs]) => `- \`{${name}}\` : ${[...songs].join(', ')}`),
  );
  section('Sets', setReport);
  section(
    'Annotations au stylet, gardées brutes dans .mysongbook/import/sbp-drawings.json',
    drawings.map((d) => `- \`${d.song.slice(SONGS_DIR.length)}\`${d.set ? ` (dans le set « ${d.set} »)` : ''}`),
  );
  return { files, drawings, report, counts };
}
