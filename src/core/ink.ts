/**
 * Annotations au stylet d'un morceau, dans un fichier voisin :
 * « Titre.cho » → « Titre.ink.json », « Titre.pdf » → « Titre.pdf.ink.json ».
 *
 * Morceau ChordPro : chaque trait est rattaché à la ligne du fichier où il
 * commence (anchor.line, 0 pour le titre) ; ses points sont en millimètres
 * depuis le coin supérieur gauche de cette ligne rendue, à 100 % de zoom. Le
 * trait suit donc sa ligne quand la mise en page change (zoom, colonnes).
 *
 * PDF : chaque trait est rattaché à une page (anchor.page, 1 = première) ;
 * ses points sont en fractions de la page entière, indépendants du recadrage.
 */

export type InkTool = 'pen' | 'highlighter';

export interface InkAnchor {
  line?: number;
  page?: number;
}

export interface Stroke {
  /** Identifiant de session (non enregistré), pour la gomme et l'annulation. */
  id: string;
  anchor: InkAnchor;
  points: [number, number][];
  /** Épaisseur : millimètres (ChordPro) ou fraction de la largeur de page (PDF). */
  width: number;
  tool: InkTool;
}

export interface InkDoc {
  strokes: Stroke[];
}

export const EMPTY_INK: InkDoc = { strokes: [] };

/** Épaisseurs par défaut. */
export const INK_WIDTH = {
  chordpro: { pen: 0.5, highlighter: 4 },
  pdf: { pen: 0.0025, highlighter: 0.02 },
} as const;

export function inkPath(songPath: string): string {
  return /\.pdf$/i.test(songPath) ? `${songPath}.ink.json` : `${songPath.replace(/\.[^./]+$/, '')}.ink.json`;
}

let counter = 0;
export const newStrokeId = () => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

export function parseInk(text: string | null | undefined): InkDoc {
  if (!text) return EMPTY_INK;
  try {
    const raw = JSON.parse(text) as { strokes?: unknown };
    if (!Array.isArray(raw.strokes)) return EMPTY_INK;
    const strokes: Stroke[] = [];
    for (const s of raw.strokes as Partial<Stroke>[]) {
      if (!s || !Array.isArray(s.points) || !s.anchor) continue;
      const points = s.points
        .filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map((p) => [p[0], p[1]] as [number, number]);
      if (points.length === 0) continue;
      strokes.push({
        id: newStrokeId(),
        anchor: { line: typeof s.anchor.line === 'number' ? s.anchor.line : undefined, page: typeof s.anchor.page === 'number' ? s.anchor.page : undefined },
        points,
        width: typeof s.width === 'number' && s.width > 0 ? s.width : 0.5,
        tool: s.tool === 'highlighter' ? 'highlighter' : 'pen',
      });
    }
    return { strokes };
  } catch {
    return EMPTY_INK;
  }
}

/** Texte du fichier ; chaîne vide s'il n'y a plus de trait (le fichier est alors supprimé). */
export function serializeInk(doc: InkDoc): string {
  if (doc.strokes.length === 0) return '';
  const pdf = doc.strokes.some((s) => s.anchor.page !== undefined);
  const k = pdf ? 10000 : 100;
  const r = (n: number) => Math.round(n * k) / k;
  const strokes = doc.strokes.map((s) => ({
    anchor: s.anchor.page !== undefined ? { page: s.anchor.page } : { line: s.anchor.line ?? 0 },
    points: s.points.map(([x, y]) => [r(x), r(y)]),
    width: s.width,
    tool: s.tool,
  }));
  return `${JSON.stringify({ version: 1, strokes })}\n`;
}

/** Points trop proches éliminés : fichiers plus légers, tracé identique. */
export function simplify(points: [number, number][], minStep: number): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) >= minStep) out.push(p);
  }
  const end = points[points.length - 1];
  if (end && out[out.length - 1] !== end) out.push(end);
  return out;
}

/** Chemin SVG d'une suite de points ; un point seul devient un petit trait. */
export function strokePath(points: [number, number][], map: (p: [number, number]) => [number, number] = (p) => p): string {
  const pts = points.map(map);
  if (pts.length === 1) pts.push([pts[0][0] + 0.01, pts[0][1]]);
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${+x.toFixed(2)} ${+y.toFixed(2)}`).join('');
}
