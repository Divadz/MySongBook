/**
 * Lignes de grille ChordPro ({start_of_grid}) découpées en mesures, pour un
 * rendu en cases :
 *
 *   Intro || Am . . . | D . C . |: G~D | % :| x2
 *
 * Une case par mesure. Une mesure à plusieurs accords est découpée en quatre
 * triangles qui suivent les temps : gauche = 1er temps, haut = 2e, bas = 3e,
 * droite = 4e. Un accord tenu sur plusieurs temps couvre plusieurs triangles ;
 * un trait sépare deux triangles voisins seulement si l'accord change.
 *
 *   C G7/B . Am   croix : C à gauche, G7/B en haut et en bas, Am à droite
 *   C . G7/B Am   diagonale et demi-diagonale : C en haut à gauche, G7/B en bas, Am à droite
 *   C G7/B . .    triangle gauche seul : C, puis G7/B dans le reste
 *   C . . G7/B    triangle droit seul : C, puis G7/B à droite
 *   C . G .       diagonale : C en haut à gauche, G en bas à droite
 *
 * Une mesure à 2 ou 3 temps, ou des accords collés par « ~ », se répartissent
 * de la même façon sur les quatre triangles.
 * La transposition est faite en amont, sur le texte (voir mapGridChords).
 */
export interface GridCell {
  /** Accords de la mesure, dans l'ordre ; vide pour une mesure vide. */
  chords: string[];
  /** Accord de chaque triangle : gauche, haut, bas, droite (temps 1 à 4). */
  quarters?: [string, string, string, string];
  /** Répétition de la mesure précédente (« % ») ou des deux précédentes (« %% »). */
  repeat?: '%' | '%%';
}

export interface GridRow {
  /** Texte en marge gauche, avant la première barre. */
  label?: string;
  cells: GridCell[];
  /** Barre avant chaque case, puis barre finale : cells.length + 1 éléments. */
  bars: string[];
  /** Texte après la dernière barre (« x2 »). */
  comment?: string;
}

const BAR_RE = /^(?:\|\||\|\.|\|:|:\|:|:\|\|?|\|)$/;
/** Temps sans nouvel accord. */
const BEAT_RE = /^(?:\.|\/|-)$/;

/**
 * Applique une transformation aux accords d'une ligne de grille (entre la
 * première et la dernière barre), sans toucher à la marge ni à la mise en forme.
 */
export function mapGridChords(text: string, fn: (chord: string) => string): string {
  const parts = text.split(/(\s+)/);
  const first = parts.findIndex((t) => BAR_RE.test(t));
  if (first < 0) return text;
  let last = parts.length - 1;
  while (last > first && !BAR_RE.test(parts[last])) last--;
  return parts
    .map((t, i) => (i > first && i < last && t.trim() && !BAR_RE.test(t) && !BEAT_RE.test(t) ? fn(t) : t))
    .join('');
}

/** Accord en cours à chaque quart de mesure (gauche, haut, bas, droite). */
function quarters(beats: (string | null)[]): [string, string, string, string] {
  const active: string[] = [];
  let chord = '';
  for (const b of beats) active.push((chord = b ?? chord));
  const at = (q: number) => active[Math.floor((q * beats.length) / 4)] || active.find(Boolean) || '';
  return [at(0), at(1), at(2), at(3)];
}

/** Triangles : 0 gauche, 1 haut, 2 bas, 3 droite. Voisins dans la case, avec le trait qui les sépare (repère 0–100). */
const NEIGHBOURS: [number, number, string][] = [
  [0, 1, 'M50 50L0 0'],
  [1, 3, 'M50 50L100 0'],
  [3, 2, 'M50 50L100 100'],
  [2, 0, 'M50 50L0 100'],
];

/** Emplacement du nom d'accord selon les triangles qu'il couvre. */
const PLACES: Record<string, string> = {
  '0': 'l',
  '1': 't',
  '2': 'b',
  '3': 'r',
  '01': 'tl',
  '23': 'br',
  '012': 'rest-l',
  '123': 'rest-r',
  '0123': 'full',
};

export interface CellDrawing {
  /** Traits intérieurs (chemins SVG, repère 0–100). */
  lines: string[];
  /** Noms d'accords et leur emplacement. */
  labels: { chord: string; place: string }[];
}

/** Dessin d'une case à plusieurs accords : traits et emplacement des noms. */
export function drawCell(q: [string, string, string, string]): CellDrawing {
  const lines = NEIGHBOURS.filter(([a, b]) => q[a] !== q[b]).map(([, , d]) => d);
  // Zones : triangles voisins portant le même accord.
  const zone = [0, 1, 2, 3];
  const find = (i: number): number => (zone[i] === i ? i : (zone[i] = find(zone[i])));
  for (const [a, b] of NEIGHBOURS) if (q[a] === q[b]) zone[find(a)] = find(b);
  const groups = new Map<number, number[]>();
  for (let i = 0; i < 4; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
  const labels = [...groups.values()]
    .sort((x, y) => Math.min(...x) - Math.min(...y))
    .map((g) => ({ chord: q[g[0]], place: PLACES[g.sort().join('')] ?? 'full' }));
  return { lines, labels };
}

/** Découpe une ligne de grille ; null si elle n'a pas de barre (texte libre dans la grille). */
export function parseGridLine(text: string): GridRow | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const first = tokens.findIndex((t) => BAR_RE.test(t));
  if (first < 0) return null;
  let last = tokens.length - 1;
  while (last > first && !BAR_RE.test(tokens[last])) last--;

  const row: GridRow = { cells: [], bars: [] };
  if (first > 0) row.label = tokens.slice(0, first).join(' ');
  if (last < tokens.length - 1) row.comment = tokens.slice(last + 1).join(' ');

  let current: string[] | null = null;
  const close = () => {
    if (current === null) return;
    const repeat = current.find((t) => t === '%' || t === '%%') as GridCell['repeat'];
    if (repeat) {
      row.cells.push({ chords: [], repeat });
      return;
    }
    // Un temps par élément ; « C~G » compte pour deux temps.
    const beats = current.flatMap((t) => (BEAT_RE.test(t) ? [null] : t.split('~').filter(Boolean)));
    const chords = beats.filter((b): b is string => b !== null);
    row.cells.push(chords.length > 1 ? { chords, quarters: quarters(beats) } : { chords });
  };
  for (let i = first; i <= last; i++) {
    const t = tokens[i];
    if (BAR_RE.test(t)) {
      close();
      row.bars.push(t);
      current = [];
    } else {
      current?.push(t);
    }
  }
  // La dernière barre ferme la ligne : pas de case après elle.
  return row.cells.length ? row : null;
}
