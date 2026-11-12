/**
 * Découpage du modèle en « unités » mesurables, puis répartition des unités
 * en pages et colonnes à partir de leurs hauteurs mesurées.
 */
import type { Block, SongLine, SongMeta, CommentStyle } from '../core/song';
import { parseGridLine } from '../core/grid';

/**
 * source : ligne du fichier .cho d'où vient l'unité (0 pour le titre), à
 * laquelle les annotations au stylet sont rattachées.
 */
export type Unit = (
  | { id: string; kind: 'title'; meta: SongMeta }
  | { id: string; kind: 'header'; type: string; label: string }
  | {
      id: string;
      kind: 'line';
      type: string;
      line: SongLine;
      first: boolean;
      last: boolean;
      /** Mise en page commune aux lignes d'une même grille, pour que les cases s'alignent. */
      grid?: GridLayout;
    }
  | { id: string; kind: 'abc'; abc: string; label?: string; scale?: number; width?: string }
  | { id: string; kind: 'image'; src: string; width?: string }
  | { id: string; kind: 'comment'; text: string; style: CommentStyle }
  | { id: string; kind: 'break'; which: 'new_page' | 'column_break' }
) & { source?: number };

/** Colonnes d'une grille : marge gauche, cases, texte à droite (largeurs en caractères). */
export interface GridLayout {
  label: number;
  cells: number;
  comment: number;
}

function gridLayout(lines: SongLine[]): GridLayout {
  const layout: GridLayout = { label: 0, cells: 0, comment: 0 };
  for (const l of lines) {
    const row = l.kind === 'literal' ? parseGridLine(l.text) : null;
    if (!row) continue;
    layout.label = Math.max(layout.label, row.label?.length ?? 0);
    layout.cells = Math.max(layout.cells, row.cells.length);
    layout.comment = Math.max(layout.comment, row.comment?.length ?? 0);
  }
  return layout;
}

export function buildUnits(meta: SongMeta, blocks: Block[], showLabels: (type: string) => boolean): Unit[] {
  const units: Unit[] = [{ id: 'title', kind: 'title', meta, source: 0 }];
  blocks.forEach((block, bi) => {
    const id = `b${bi}`;
    switch (block.kind) {
      case 'section': {
        const label = block.label ?? defaultLabel(block.type);
        if (label && showLabels(block.type)) units.push({ id: `${id}h`, kind: 'header', type: block.type, label, source: block.source });
        const grid = block.type === 'grid' ? gridLayout(block.lines) : undefined;
        block.lines.forEach((line, li) => {
          units.push({
            id: `${id}l${li}`,
            kind: 'line',
            type: block.type,
            line,
            first: li === 0,
            last: li === block.lines.length - 1,
            grid,
            source: line.source,
          });
        });
        break;
      }
      case 'abc':
        units.push({ id, kind: 'abc', abc: block.abc, label: block.label, scale: block.scale, width: block.width, source: block.source });
        break;
      case 'image':
        units.push({ id, kind: 'image', src: block.src, width: block.width, source: block.source });
        break;
      case 'comment':
        units.push({ id, kind: 'comment', text: block.text, style: block.style, source: block.source });
        break;
      case 'new_page':
      case 'column_break':
        units.push({ id, kind: 'break', which: block.kind });
        break;
    }
  });
  return units;
}

function defaultLabel(type: string): string {
  switch (type) {
    case 'chorus':
      return 'Refrain';
    case 'bridge':
      return 'Pont';
    case 'verse':
      return 'Couplet';
    default:
      return '';
  }
}

/** Une colonne d'une page : indices d'unités et largeur en mm. */
export interface PageColumn {
  units: number[];
  width: number;
}

/** pages → colonnes */
export type Layout = PageColumn[][];

/** Colonne remplie en hauteur, avant d'être placée sur une page. */
export interface FilledColumn {
  units: number[];
  /** Commence une nouvelle page ({new_page}). */
  newPage: boolean;
}

/**
 * Remplissage glouton en hauteur : on remplit chaque colonne jusqu'à sa
 * hauteur, un en-tête de section reste avec la ligne qui le suit, les sauts
 * explicites ({column_break}, {new_page}) sont respectés.
 */
export function fillColumns(units: Unit[], heights: number[], columnHeight: number): FilledColumn[] {
  const columns: FilledColumn[] = [];
  let col: number[] = [];
  let used = 0;
  let newPage = false;
  const flush = () => {
    if (col.length > 0) columns.push({ units: col, newPage });
    else if (newPage) return; // saut de page en attente : il s'applique à la colonne suivante
    col = [];
    used = 0;
    newPage = false;
  };
  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.kind === 'break') {
      flush();
      if (unit.which === 'new_page' && columns.length > 0) newPage = true;
      continue;
    }
    let h = heights[i] ?? 0;
    // Un en-tête ne reste jamais seul en bas de colonne.
    if (unit.kind === 'header' && i + 1 < units.length) h += heights[i + 1] ?? 0;
    if (used > 0 && used + h > columnHeight) flush();
    // Ligne blanche en haut de colonne : inutile, elle est sautée.
    if (col.length === 0 && unit.kind === 'line' && unit.line.kind === 'blank') continue;
    col.push(i);
    used += heights[i] ?? 0;
  }
  flush();
  return columns;
}

/**
 * Placement des colonnes sur les pages, de gauche à droite : une colonne va
 * sur la page en cours si elle tient dans la largeur restante (et si la page
 * n'a pas déjà maxColumns colonnes), sinon elle ouvre une nouvelle page.
 */
export function packColumns(
  columns: FilledColumn[],
  widthOf: (c: FilledColumn) => number,
  pageWidth: number,
  gap: number,
  maxColumns = Infinity,
): Layout {
  const pages: Layout = [];
  let page: PageColumn[] = [];
  let used = 0;
  for (const c of columns) {
    const width = widthOf(c);
    if (page.length > 0 && (c.newPage || page.length >= maxColumns || used + gap + width > pageWidth + 0.01)) {
      pages.push(page);
      page = [];
      used = 0;
    }
    used += (page.length > 0 ? gap : 0) + width;
    page.push({ units: c.units, width });
  }
  if (page.length > 0) pages.push(page);
  if (pages.length === 0) pages.push([{ units: [], width: pageWidth }]);
  return pages;
}
