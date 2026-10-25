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

/** pages → colonnes → indices d'unités */
export type Layout = number[][][];

/**
 * Répartition gloutonne : on remplit chaque colonne jusqu'à sa hauteur, un
 * en-tête de section reste avec la ligne qui le suit, les sauts explicites
 * sont respectés.
 */
export function paginate(units: Unit[], heights: number[], columnHeight: number, columns: number): Layout {
  const pages: Layout = [];
  let page: number[][] = [];
  let col: number[] = [];
  let used = 0;

  const flushCol = () => {
    page.push(col);
    col = [];
    used = 0;
  };
  const flushPage = () => {
    if (col.length > 0 || page.length === 0) flushCol();
    while (page.length < columns) page.push([]);
    pages.push(page);
    page = [];
  };
  const nextColumn = () => {
    flushCol();
    if (page.length >= columns) {
      pages.push(page);
      page = [];
    }
  };

  for (let i = 0; i < units.length; i++) {
    const unit = units[i];
    if (unit.kind === 'break') {
      if (unit.which === 'new_page') {
        if (col.length > 0 || page.length > 0) flushPage();
      } else if (col.length > 0) {
        nextColumn();
      }
      continue;
    }
    let h = heights[i] ?? 0;
    // Un en-tête ne reste jamais seul en bas de colonne.
    if (unit.kind === 'header' && i + 1 < units.length) h += heights[i + 1] ?? 0;
    if (used > 0 && used + h > columnHeight) nextColumn();
    col.push(i);
    used += heights[i] ?? 0;
  }
  if (col.length > 0 || page.length > 0) flushPage();
  if (pages.length === 0) pages.push(Array.from({ length: columns }, () => []));
  return pages;
}
