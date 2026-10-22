/**
 * Métadonnées d'un morceau PDF, dans le fichier voisin « morceau.pdf.json ».
 * Tous les champs sont facultatifs ; un champ inconnu est conservé tel quel.
 */

/** Zone affichée, en fraction de la page : 0 à 1 depuis le coin supérieur gauche. */
export interface Crop {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface PdfMeta {
  title?: string;
  artist?: string;
  key?: string;
  tags?: string[];
  crop?: Crop;
  [other: string]: unknown;
}

export const FULL_PAGE: Crop = { top: 0, left: 0, width: 1, height: 1 };

export const pdfMetaPath = (pdfPath: string) => `${pdfPath}.json`;

export function parsePdfMeta(text: string | undefined): PdfMeta {
  if (!text) return {};
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PdfMeta) : {};
  } catch {
    return {};
  }
}

const clamp = (n: number) => Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));

/** Recadrage utilisable : dans la page, et assez grand pour rester lisible. */
export function normalizeCrop(c: Crop | undefined): Crop {
  if (!c) return FULL_PAGE;
  const left = clamp(c.left);
  const top = clamp(c.top);
  const width = Math.min(clamp(c.width), 1 - left);
  const height = Math.min(clamp(c.height), 1 - top);
  return width < 0.05 || height < 0.05 ? FULL_PAGE : { top, left, width, height };
}

export const isFullPage = (c: Crop) => c.top <= 0.001 && c.left <= 0.001 && c.width >= 0.999 && c.height >= 0.999;

export function serializePdfMeta(meta: PdfMeta): string {
  const out: PdfMeta = { ...meta };
  if (!out.crop || isFullPage(out.crop)) delete out.crop;
  else {
    const r = (n: number) => Math.round(n * 10000) / 10000;
    out.crop = { top: r(out.crop.top), left: r(out.crop.left), width: r(out.crop.width), height: r(out.crop.height) };
  }
  return `${JSON.stringify(out, null, 2)}\n`;
}
