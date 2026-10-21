/**
 * Modèle d'un morceau ChordPro, construit à partir de ChordSheetJS.
 *
 * ChordSheetJS fournit l'analyse syntaxique, les métadonnées et la
 * transposition. Le découpage en sections est refait ici en parcourant les
 * lignes et les balises start_of_* / end_of_*, parce que les « paragraphes »
 * de ChordSheetJS dépendent des lignes vides et fusionnent des sections
 * collées.
 */
import { ChordProParser, ChordLyricsPair, Tag, Comment, Literal, Song } from 'chordsheetjs';

export interface ChordLyric {
  chords: string;
  lyrics: string;
}

export type SongLine =
  | { kind: 'pairs'; items: ChordLyric[]; chordsOnly: boolean }
  | { kind: 'literal'; text: string }
  | { kind: 'comment'; text: string; style: CommentStyle };

export type CommentStyle = 'plain' | 'italic' | 'box';

export interface SectionBlock {
  kind: 'section';
  type: string;
  label?: string;
  lines: SongLine[];
}

export interface AbcBlock {
  kind: 'abc';
  label?: string;
  abc: string;
}

export interface ImageBlock {
  kind: 'image';
  src: string;
  /** Largeur CSS (« 70% », « 60mm »…), facultative. */
  width?: string;
}

export interface CommentBlock {
  kind: 'comment';
  text: string;
  style: CommentStyle;
}

export interface BreakBlock {
  kind: 'new_page' | 'column_break';
}

export type Block = SectionBlock | AbcBlock | ImageBlock | CommentBlock | BreakBlock;

export interface SongMeta {
  title: string;
  subtitle?: string;
  artist?: string;
  key?: string;
  tempo?: string;
  time?: string;
  tags: string[];
  /** Directive {textsize:} du fichier, en points. */
  textsize?: number;
  /** Directive {columns:} du fichier. */
  columns?: number;
}

export interface SongModel {
  meta: SongMeta;
  blocks: Block[];
  /** Valeur de la directive {transpose:} du fichier (0 si absente). */
  fileTranspose: number;
  /** Transposition totale appliquée au rendu (directive + demande). */
  totalTranspose: number;
}

const TRANSPOSE_RE = /^[ \t]*\{(?:transpose|x_msb_transpose)\s*:\s*([+-]?\d+)\s*\}[ \t]*\r?\n?/im;

/** Lit la directive {transpose:} et renvoie le texte sans elle. */
export function extractTranspose(source: string): { source: string; transpose: number } {
  const m = TRANSPOSE_RE.exec(source);
  if (!m) return { source, transpose: 0 };
  return { source: source.replace(TRANSPOSE_RE, ''), transpose: parseInt(m[1], 10) };
}

/** Réécrit la directive {transpose:} dans le texte (ajoutée après les métadonnées de tête si absente). */
export function writeTranspose(source: string, transpose: number): string {
  const stripped = source.replace(TRANSPOSE_RE, '');
  if (transpose === 0) return stripped;
  const directive = `{transpose: ${transpose}}`;
  const lines = stripped.split(/\r?\n/);
  let insertAt = 0;
  while (insertAt < lines.length && /^\s*\{[^}]*\}\s*$/.test(lines[insertAt])) insertAt++;
  lines.splice(insertAt, 0, directive);
  return lines.join('\n');
}

function readTags(source: string): string[] {
  const m = /\{\s*(?:tags|meta\s*:\s*tags)\s*:?\s*([^}]*)\}/i.exec(source);
  if (!m) return [];
  return m[1]
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

function readNumberDirective(source: string, name: string): number | undefined {
  const m = new RegExp(`\\{\\s*${name}\\s*:\\s*(\\d+)\\s*\\}`, 'i').exec(source);
  return m ? parseInt(m[1], 10) : undefined;
}

function metaString(song: Song, name: string): string | undefined {
  const v = song.metadata.get(name);
  if (v === undefined || v === null) return undefined;
  return Array.isArray(v) ? v.join(', ') : String(v);
}

function parseImage(value: string): ImageBlock {
  const parts = value.trim().split(/\s+/);
  const src = parts[0] ?? '';
  let width: string | undefined;
  for (const p of parts.slice(1)) {
    const m = /^width\s*=\s*(.+)$/i.exec(p);
    if (m) width = m[1];
  }
  return { kind: 'image', src, width };
}

const COMMENT_STYLES: Record<string, CommentStyle> = {
  comment: 'plain',
  comment_italic: 'italic',
  comment_box: 'box',
};

/**
 * Analyse un fichier ChordPro et construit le modèle de rendu.
 * @param source texte du fichier
 * @param extraTranspose demi-tons ajoutés à la directive du fichier
 */
export function parseSong(source: string, extraTranspose = 0): SongModel {
  const { source: cleaned, transpose: fileTranspose } = extractTranspose(source);
  const totalTranspose = fileTranspose + extraTranspose;

  let song = new ChordProParser().parse(cleaned);
  if (totalTranspose !== 0) song = song.transpose(totalTranspose);

  const meta: SongMeta = {
    title: metaString(song, 'title') ?? 'Sans titre',
    subtitle: metaString(song, 'subtitle'),
    artist: metaString(song, 'artist'),
    key: metaString(song, 'key'),
    tempo: metaString(song, 'tempo'),
    time: metaString(song, 'time'),
    tags: readTags(cleaned),
    textsize: readNumberDirective(cleaned, 'textsize'),
    columns: readNumberDirective(cleaned, 'columns'),
  };

  const blocks: Block[] = [];
  let section: SectionBlock | null = null;
  let abc: AbcBlock | null = null;
  const state: { lastChorus: SectionBlock | null } = { lastChorus: null };

  const closeSection = () => {
    if (section && section.lines.length > 0) {
      blocks.push(section);
      if (section.type === 'chorus') state.lastChorus = section;
    }
    section = null;
  };
  const ensureSection = (): SectionBlock => {
    if (!section) section = { kind: 'section', type: 'none', lines: [] };
    return section;
  };

  for (const line of song.lines) {
    const items = line.items;

    // Bloc abc en cours : tout est du texte brut jusqu'à end_of_abc.
    if (abc) {
      const endTag = items.find((it) => it instanceof Tag && it.name === 'end_of_abc') as Tag | undefined;
      if (endTag) {
        blocks.push(abc);
        abc = null;
        continue;
      }
      const text = items
        .map((it) => (it instanceof Literal ? it.string : it instanceof ChordLyricsPair ? `${it.chords}${it.lyrics}` : ''))
        .join('');
      abc.abc += (abc.abc ? '\n' : '') + text;
      continue;
    }

    const tags = items.filter((it): it is Tag => it instanceof Tag);
    const structural = tags.find((t) => t.isSectionDelimiter());
    if (structural) {
      const name = structural.name;
      if (name.startsWith('start_of_')) {
        closeSection();
        const type = name.slice('start_of_'.length);
        const label = structural.value?.trim() || undefined;
        if (type === 'abc') {
          abc = { kind: 'abc', label, abc: '' };
        } else {
          section = { kind: 'section', type, label, lines: [] };
        }
      } else if (name.startsWith('end_of_')) {
        closeSection();
      }
      continue;
    }

    let handled = false;
    for (const tag of tags) {
      const name = tag.name;
      const value = tag.value ?? '';
      if (name === 'image') {
        closeSection();
        blocks.push(parseImage(value));
        handled = true;
      } else if (name === 'new_page' || name === 'column_break') {
        closeSection();
        blocks.push({ kind: name });
        handled = true;
      } else if (name === 'chorus') {
        closeSection();
        const lc = state.lastChorus;
        if (lc) blocks.push({ ...lc, label: value.trim() || lc.label });
        handled = true;
      } else if (name in COMMENT_STYLES) {
        const style = COMMENT_STYLES[name];
        if (section) section.lines.push({ kind: 'comment', text: value, style });
        else blocks.push({ kind: 'comment', text: value, style });
        handled = true;
      } else if (name === 'textsize' || name === 'columns' || name === 'meta' || name.startsWith('x_')) {
        handled = true; // lues ailleurs ou ignorées
      }
    }
    if (handled) continue;

    const pairs = items.filter((it): it is ChordLyricsPair => it instanceof ChordLyricsPair);
    const literals = items.filter((it): it is Literal => it instanceof Literal);
    const comments = items.filter((it): it is Comment => it instanceof Comment);

    if (literals.length > 0) {
      ensureSection().lines.push({ kind: 'literal', text: literals.map((l) => l.string).join('') });
    } else if (pairs.length > 0) {
      const clean = pairs
        .map((p) => ({ chords: p.chords.trim(), lyrics: p.lyrics ?? '' }))
        .filter((p) => p.chords !== '' || p.lyrics !== '');
      if (clean.length === 0) continue;
      const chordsOnly = clean.every((p) => p.lyrics.trim() === '');
      ensureSection().lines.push({ kind: 'pairs', items: clean, chordsOnly });
    } else if (comments.length > 0) {
      // Commentaires « # » du fichier : ignorés à l'affichage.
      continue;
    }
  }
  closeSection();
  if (abc) blocks.push(abc);

  return { meta, blocks, fileTranspose, totalTranspose };
}
