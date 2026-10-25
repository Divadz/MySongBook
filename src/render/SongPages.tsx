import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { SongModel } from '../core/song';
import type { DeviceSettings, RenderSettings } from '../core/settings';
import { showSectionLabel } from '../core/settings';
import { buildUnits, paginate, type Layout, type Unit } from './units';
import { UnitView } from './UnitView';
import './render.css';

const MM_TO_PX = 96 / 25.4;

interface Props {
  song: SongModel;
  settings: RenderSettings;
  device: DeviceSettings;
  /** Page affichée (index 0). */
  page: number;
  onPageCount: (n: number) => void;
  /** Nombre de colonnes imposé par le fichier ({columns:}) ; sinon choix automatique. */
  columns?: 1 | 2;
}

/**
 * Rend un morceau en pages. Première passe : toutes les unités sont rendues
 * dans deux conteneurs cachés, à pleine largeur et à demi-largeur, pour être
 * mesurées ; deuxième passe : les unités sont réparties en pages et colonnes.
 *
 * Colonnes automatiques : deux colonnes quand la plus longue ligne ne dépasse
 * pas 75 % de la largeur utile de la page ; les lignes plus longues qu'une
 * demi-page passent alors à la ligne (accords et paroles ensemble) ; les
 * tablatures et grilles, qui ne peuvent pas passer à la ligne, doivent tenir
 * dans la demi-page. Réduire
 * le zoom fait donc passer à deux colonnes, et dézoomer davantage ne revient
 * jamais à une seule.
 */
/** Deux colonnes si la plus longue ligne ne dépasse pas cette part de la largeur utile de la page. */
const TWO_COLUMNS_MAX_LINE = 0.75;

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
  const roots = within ? Array.from(unit.querySelectorAll<HTMLElement>(within)) : [unit];
  const range = document.createRange();
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

/** Tablatures et grilles ne passent pas à la ligne : elles doivent tenir dans la colonne. */
const RIGID = '.u-literal, .grid-row';

export function SongPages({ song, settings, device, page, onPageCount, columns: forced }: Props) {
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
  const [columns, setColumns] = useState<1 | 2>(1);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const full = fullRef.current;
    const half = halfRef.current;
    if (!full || !half) return;
    const fullUnits = Array.from(full.children) as HTMLElement[];
    const halfUnits = Array.from(half.children) as HTMLElement[];
    const heights = (list: HTMLElement[]) => units.map((_, i) => list[i]?.offsetHeight ?? 0);
    const columnHeight = innerH * MM_TO_PX;
    const longest = Math.max(0, ...units.map((_, i) => lineExtent(fullUnits[i])));
    const rigid = Math.max(0, ...units.map((_, i) => lineExtent(fullUnits[i], RIGID)));
    // Les mesures sont dans la page mise à l'échelle : on compare aux largeurs affichées.
    const fullWidth = full.getBoundingClientRect().width;
    const halfWidth = half.getBoundingClientRect().width;
    const fits = fullWidth > 0 && longest <= TWO_COLUMNS_MAX_LINE * fullWidth && rigid <= halfWidth;
    const n: 1 | 2 = forced ?? (fits ? 2 : 1);
    const l = paginate(units, heights(n === 1 ? fullUnits : halfUnits), columnHeight, n);
    setColumns(n);
    setLayout(l);
    onPageCount(l.length);
  }, [units, settings, device, forced, innerH, tick, onPageCount]);

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
  const columnWidthMm = widthFor(columns);
  const common = { settings, device, transpose: song.totalTranspose };

  const current = layout[Math.min(page, Math.max(0, layout.length - 1))] ?? [];

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
          <div key={ci} className="column" style={{ width: `${columnWidthMm}mm` }}>
            {col.map((i) => {
              const u: Unit | undefined = units[i];
              if (!u) return null; // mise en page d'un morceau précédent, en attente de re-mesure
              return (
                <div key={u.id} className="unit">
                  <UnitView unit={u} {...common} columnWidthMm={columnWidthMm} />
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
