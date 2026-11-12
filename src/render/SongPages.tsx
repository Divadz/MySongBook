import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SongModel } from '../core/song';
import type { DeviceSettings, RenderSettings } from '../core/settings';
import { showSectionLabel } from '../core/settings';
import { buildUnits, fillColumns, packColumns, type Layout, type Unit } from './units';
import { UnitView } from './UnitView';
import { InkStrokes } from './InkStrokes';
import type { Stroke } from '../core/ink';
import './render.css';

const MM_TO_PX = 96 / 25.4;

interface Props {
  song: SongModel;
  settings: RenderSettings;
  device: DeviceSettings;
  /** Page affichée (index 0). */
  page: number;
  /** Nombre de pages, avec la taille du texte (fontScale) pour laquelle il a été mesuré. */
  onPageCount: (n: number, fontScale?: number) => void;
  /** Nombre de colonnes imposé par le fichier ({columns:}) ; sinon choix automatique. */
  columns?: 1 | 2;
  /** Annotations au stylet, rattachées aux lignes du fichier. */
  ink?: Stroke[];
}

/**
 * Rend un morceau en pages. Première passe : toutes les unités sont rendues
 * dans un conteneur caché à pleine largeur pour être mesurées (hauteur et
 * largeur de la plus longue ligne) ; deuxième passe : les unités sont
 * réparties en colonnes, puis les colonnes en pages.
 *
 * Colonnes automatiques : chaque colonne est remplie jusqu'en bas de la page
 * et prend la largeur de sa plus longue ligne (au moins un quart de la page) ;
 * les colonnes se placent côte à côte tant qu'elles tiennent dans la largeur.
 * Une page peut donc porter une, deux, trois colonnes ou plus, de largeurs
 * différentes, selon le zoom et la longueur des lignes. Une ligne plus large
 * que la page passe à la ligne (ou est réduite, selon le réglage).
 *
 * Quelques lignes longues élargiraient toute leur colonne : on essaie donc
 * aussi deux colonnes égales, où ces lignes passent à la ligne (si la plus
 * longue ne dépasse pas 75 % de la page et que tablatures et grilles tiennent
 * dans la demi-page), et on garde la disposition qui fait le moins de pages
 * (à égalité, celle à largeurs variables, sans coupure de ligne).
 *
 * {columns: N} dans le fichier impose N colonnes égales.
 */
/** Largeur minimale d'une colonne automatique, en part de la largeur utile. */
const MIN_COLUMN = 0.25;
/** Marge ajoutée à la largeur mesurée d'une colonne (arrondis de rendu), en mm. */
const COLUMN_SLACK = 1;
/** Deux colonnes égales possibles si la plus longue ligne ne dépasse pas cette part de la largeur utile. */
const TWO_COLUMNS_MAX_LINE = 0.75;
/** Tablatures et grilles ne passent pas à la ligne : elles doivent tenir dans la colonne. */
const RIGID = '.u-literal, .grid-row';

/**
 * Largeur occupée par la plus longue ligne d'une unité mesurée à pleine
 * largeur, en px : bord droit du texte (paroles, accords, grilles) et des
 * cases de grille, depuis le bord gauche de l'unité. Une portée ou une image
 * compte pour sa largeur.
 */
function lineExtent(unit: HTMLElement | undefined, within?: string): number {
  if (!unit) return 0;
  const left = unit.getBoundingClientRect().left;
  let right = left;
  const range = document.createRange();
  const roots = within ? Array.from(unit.querySelectorAll<HTMLElement>(within)) : [unit];
  for (const root of roots) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent?.trim()) continue;
      range.selectNodeContents(node);
      right = Math.max(right, range.getBoundingClientRect().right);
    }
    for (const el of root.querySelectorAll('.grid-cell, svg, img')) right = Math.max(right, el.getBoundingClientRect().right);
  }
  return right - left;
}

export function SongPages({ song, settings, device, page, onPageCount, columns: forced, ink = [] }: Props) {
  const innerW = device.pageWidth - 2 * device.margin;
  const innerH = device.pageHeight - 2 * device.margin;
  const widthFor = (n: number) => (innerW - settings.columnGap * (n - 1)) / n;

  const units = useMemo(
    () => buildUnits(song.meta, song.blocks, (type) => showSectionLabel(settings, type)),
    [song, settings],
  );

  const fullRef = useRef<HTMLDivElement>(null);
  const halfRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>([]);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const full = fullRef.current;
    if (!full) return;
    const columnHeight = innerH * MM_TO_PX;
    let l: Layout;
    if (forced) {
      const list = Array.from((forced === 1 ? full : halfRef.current ?? full).children) as HTMLElement[];
      const cols = fillColumns(units, units.map((_, i) => list[i]?.offsetHeight ?? 0), columnHeight);
      l = packColumns(cols, () => widthFor(forced), innerW, settings.columnGap, forced);
    } else {
      const list = Array.from(full.children) as HTMLElement[];
      // Les mesures sont dans la page mise à l'échelle : largeurs rapportées à celle du conteneur.
      const fullPx = full.getBoundingClientRect().width;
      const extent = units.map((_, i) => (fullPx > 0 ? (lineExtent(list[i]) / fullPx) * innerW : innerW));
      const cols = fillColumns(units, units.map((_, i) => list[i]?.offsetHeight ?? 0), columnHeight);
      const widthOf = (c: { units: number[] }) =>
        Math.min(innerW, Math.max(MIN_COLUMN * innerW, ...c.units.map((i) => extent[i] + COLUMN_SLACK)));
      l = packColumns(cols, widthOf, innerW, settings.columnGap);
      // Variante : deux colonnes égales, les lignes longues passant à la ligne.
      const half = halfRef.current;
      const rigid = Math.max(0, ...units.map((_, i) => (lineExtent(list[i], RIGID) / fullPx) * innerW));
      if (half && fullPx > 0 && Math.max(0, ...extent) <= TWO_COLUMNS_MAX_LINE * innerW && rigid <= widthFor(2)) {
        const halfList = Array.from(half.children) as HTMLElement[];
        const halfCols = fillColumns(units, units.map((_, i) => halfList[i]?.offsetHeight ?? 0), columnHeight);
        const two = packColumns(halfCols, () => widthFor(2), innerW, settings.columnGap, 2);
        if (two.length < l.length) l = two;
      }
    }
    setLayout(l);
    onPageCount(l.length, device.fontScale);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, settings, device, forced, innerH, innerW, tick, onPageCount]);

  const bump = () => setTick((t) => t + 1);
  useLayoutEffect(() => {
    if (!document.fonts) return;
    let alive = true;
    document.fonts.ready.then(() => alive && setTick((t) => t + 1));
    const onDone = () => alive && setTick((t) => t + 1);
    document.fonts.addEventListener('loadingdone', onDone);
    return () => {
      alive = false;
      document.fonts.removeEventListener('loadingdone', onDone);
    };
  }, []);
  const common = { settings, device, transpose: song.totalTranspose };

  const current = layout[Math.min(page, Math.max(0, layout.length - 1))] ?? [];

  // Traits par ligne du fichier ; ceux dont la ligne n'existe plus (morceau réécrit)
  // vont sur la dernière unité, pour rester visibles et pouvoir être effacés.
  const inkByLine = useMemo(() => {
    const lines = new Set(units.map((u) => u.source).filter((n): n is number => n !== undefined));
    const lastLine = units.reduce((m, u) => (u.source !== undefined ? u.source : m), 0);
    const map = new Map<number, Stroke[]>();
    for (const s of ink) {
      const line = s.anchor.line !== undefined && lines.has(s.anchor.line) ? s.anchor.line : lastLine;
      map.set(line, [...(map.get(line) ?? []), s]);
    }
    return map;
  }, [ink, units]);
  const mmToPx = device.fontScale * MM_TO_PX;
  const inkMap = (p: [number, number]): [number, number] => [p[0] * mmToPx, p[1] * mmToPx];
  const inkWidth = (s: Stroke) => s.width * mmToPx;
  // Une ligne répétée ({chorus}) ne porte ses traits qu'une fois : à sa première occurrence.
  const firstUnit = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of units) if (u.source !== undefined && !m.has(u.source)) m.set(u.source, u.id);
    return m;
  }, [units]);

  return (
    <>
      {[1, 2].map((n) => (
        <div key={n} className="measure" ref={n === 1 ? fullRef : halfRef} style={{ width: `${widthFor(n)}mm` }} aria-hidden>
          {units.map((u) => (
            <div key={u.id} className="unit">
              <UnitView unit={u} {...common} columnWidthMm={widthFor(n)} onContentChange={bump} />
            </div>
          ))}
        </div>
      ))}
      <div
        className="page"
        style={{
          width: `${device.pageWidth}mm`,
          height: `${device.pageHeight}mm`,
          padding: `${device.margin}mm`,
          columnGap: `${settings.columnGap}mm`,
        }}
      >
        {current.map((col, ci) => (
          <div key={ci} className="column" style={{ width: `${col.width}mm` }}>
            {col.units.map((i) => {
              const u: Unit | undefined = units[i];
              if (!u) return null; // mise en page d'un morceau précédent, en attente de re-mesure
              const strokes = u.source !== undefined && firstUnit.get(u.source) === u.id ? inkByLine.get(u.source) : undefined;
              return (
                <div key={u.id} className="unit" data-source={u.source}>
                  <UnitView unit={u} {...common} columnWidthMm={col.width} />
                  {strokes && <InkStrokes strokes={strokes} map={inkMap} width={inkWidth} />}
                </div>
              );
            })}
          </div>
        ))}
        <div className="page-number">
          {Math.min(page + 1, layout.length)} / {layout.length}
        </div>
      </div>
    </>
  );
}
