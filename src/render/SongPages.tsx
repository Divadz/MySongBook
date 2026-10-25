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
 * Colonnes automatiques : deux colonnes quand tout tient dans une demi-page
 * sans changer d'allure (aucune ligne renvoyée, grilles à pleine taille,
 * portées non réduites). Réduire le zoom fait donc passer à deux colonnes,
 * et dézoomer davantage ne revient jamais à une seule.
 */
/**
 * Une unité garde la même allure à demi-largeur : même hauteur (pas de ligne
 * renvoyée, portée ou image non réduite), rien de coupé, cases de grille de
 * même largeur.
 */
function sameShape(full: HTMLElement | undefined, half: HTMLElement | undefined): boolean {
  if (!full || !half) return true;
  if (Math.abs(full.offsetHeight - half.offsetHeight) > 1) return false;
  if (Array.from(half.querySelectorAll<HTMLElement>('*')).some((el) => el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0)) return false;
  const cells = (root: HTMLElement) => Array.from(root.querySelectorAll<HTMLElement>('.grid-cell')).map((c) => c.offsetWidth);
  const a = cells(full);
  const b = cells(half);
  return a.every((w, i) => (b[i] ?? 0) >= w - 1);
}

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
    const n: 1 | 2 = forced ?? (units.every((_, i) => sameShape(fullUnits[i], halfUnits[i])) ? 2 : 1);
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
