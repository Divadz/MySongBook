/**
 * Annotations au stylet de SongbookPro (champ drawingPathsBackup) : base64
 * d'un message protobuf, un trait par champ 1 :
 *
 *   1 : X des points (float32 groupés)    2 : Y des points
 *   3 : couleur ARGB                       4 : épaisseur (double)
 *   5 : page (0 = première)
 *
 * Pour un PDF, les coordonnées sont celles de la page mise à 1024 de large,
 * hauteur dans la même proportion que la page : calé sur une grille A4 (Set
 * BDN), dont les accords manuscrits tombent au centre des rangées sur toute
 * la hauteur. Pour un morceau ChordPro, elles dépendent de la mise en page
 * de SongbookPro et ne sont pas convertibles.
 */
import { newStrokeId, serializeInk, simplify, type Stroke } from './ink';

/** Largeur de page dans le repère des dessins SongbookPro. */
const SBP_PAGE_WIDTH = 1024;

interface Field {
  field: number;
  /** Valeur entière (varint) ou flottante (fixed64), ou octets (length-delimited). */
  value: number | Uint8Array;
}

function readVarint(b: Uint8Array, at: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = at;
  for (;;) {
    const c = b[i++];
    result += (c & 0x7f) * 2 ** shift;
    shift += 7;
    if (c < 0x80) return [result, i];
  }
}

function readFields(b: Uint8Array): Field[] {
  const out: Field[] = [];
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let i = 0;
  while (i < b.length) {
    const [key, next] = readVarint(b, i);
    i = next;
    const field = Math.floor(key / 8);
    switch (key & 7) {
      case 0: {
        const [v, n] = readVarint(b, i);
        out.push({ field, value: v });
        i = n;
        break;
      }
      case 1:
        out.push({ field, value: view.getFloat64(i, true) });
        i += 8;
        break;
      case 5:
        out.push({ field, value: view.getFloat32(i, true) });
        i += 4;
        break;
      case 2: {
        const [len, n] = readVarint(b, i);
        out.push({ field, value: b.subarray(n, n + len) });
        i = n + len;
        break;
      }
      default:
        throw new Error('Format de dessin SongbookPro inconnu');
    }
  }
  return out;
}

function floats(b: Uint8Array): number[] {
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return Array.from({ length: Math.floor(b.length / 4) }, (_, k) => view.getFloat32(k * 4, true));
}

const base64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

/**
 * Annotations .ink.json d'un PDF à partir de ses dessins SongbookPro (celui du
 * morceau et ceux de ses passages dans les sets : un trait présent plusieurs
 * fois n'est gardé qu'une fois). Chaîne vide si rien n'est lisible.
 */
export function sbpDrawingsToPdfInk(drawings: string[], pageRatio = 842 / 595): string {
  const seen = new Set<string>();
  const strokes: Stroke[] = [];
  const height = SBP_PAGE_WIDTH * pageRatio;
  for (const data of drawings) {
    let fields: Field[];
    try {
      fields = readFields(base64(data));
    } catch {
      continue;
    }
    for (const f of fields) {
      if (f.field !== 1 || !(f.value instanceof Uint8Array)) continue;
      const key = Array.from(f.value.subarray(0, 64)).join(',') + `:${f.value.length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const parts = readFields(f.value);
      const get = (n: number) => parts.find((p) => p.field === n)?.value;
      const xs = get(1);
      const ys = get(2);
      if (!(xs instanceof Uint8Array) || !(ys instanceof Uint8Array)) continue;
      const x = floats(xs);
      const y = floats(ys);
      const points = x.slice(0, y.length).map((px, k): [number, number] => [px / SBP_PAGE_WIDTH, y[k] / height]);
      if (points.length === 0) continue;
      const width = typeof get(4) === 'number' ? (get(4) as number) : 3;
      const page = typeof get(5) === 'number' ? (get(5) as number) : 0;
      strokes.push({
        id: newStrokeId(),
        anchor: { page: page + 1 },
        points: simplify(points, 0.0008),
        width: Math.round((width / SBP_PAGE_WIDTH) * 10000) / 10000,
        tool: 'pen',
      });
    }
  }
  return serializeInk({ strokes });
}
