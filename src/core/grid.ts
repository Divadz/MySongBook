/**
 * Lignes de grille ChordPro ({start_of_grid}) découpées en mesures, pour un
 * rendu en cases :
 *
 *   Intro || Am . . . | D . C . |: G~D | % :| x2
 *
 * Une case par mesure ; plusieurs accords dans une mesure (temps séparés par
 * des « . », ou accords collés par « ~ ») partagent la case en diagonale.
 * La transposition est déjà faite par ChordSheetJS sur le texte de la grille.
 */
export interface GridCell {
  /** Accords de la mesure, dans l'ordre ; vide pour une mesure vide. */
  chords: string[];
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
    const chords = repeat
      ? []
      : current
          .filter((t) => !BEAT_RE.test(t))
          .flatMap((t) => t.split('~'))
          .filter(Boolean);
    row.cells.push(repeat ? { chords, repeat } : { chords });
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
