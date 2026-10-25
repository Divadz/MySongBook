/**
 * Traits au stylet, en SVG par-dessus la partition. Chaque trait est doublé
 * d'un tracé invisible plus large (classe ink-hit) qui sert à la gomme.
 */
import { strokePath, type Stroke } from '../core/ink';

interface Props {
  strokes: Stroke[];
  /** Point du trait → pixels dans le repère du SVG. */
  map: (p: [number, number]) => [number, number];
  /** Épaisseur du trait → pixels. */
  width: (s: Stroke) => number;
  style?: React.CSSProperties;
}

/** Tolérance de la gomme autour d'un trait, en pixels de page. */
const HIT = 10;

export function InkStrokes({ strokes, map, width, style }: Props) {
  if (strokes.length === 0) return null;
  return (
    <svg className="ink" style={style} aria-hidden>
      {strokes.map((s) => {
        const d = strokePath(s.points, map);
        const w = width(s);
        return (
          <g key={s.id}>
            <path className={`ink-${s.tool}`} d={d} strokeWidth={w} />
            <path className="ink-hit" data-ink-id={s.id} d={d} strokeWidth={Math.max(w, HIT)} />
          </g>
        );
      })}
    </svg>
  );
}
