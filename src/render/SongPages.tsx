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
}

/**
 * Rend un morceau en pages. Première passe : toutes les unités sont rendues
 * dans un conteneur caché à la largeur d'une colonne pour être mesurées ;
 * deuxième passe : les unités sont réparties en pages et colonnes.
 */
export function SongPages({ song, settings, device, page, onPageCount }: Props) {
  const columns = settings.columns;
  const innerW = device.pageWidth - 2 * device.margin;
  const innerH = device.pageHeight - 2 * device.margin;
  const columnWidthMm = (innerW - settings.columnGap * (columns - 1)) / columns;

  const units = useMemo(
    () => buildUnits(song.meta, song.blocks, (type) => showSectionLabel(settings, type)),
    [song, settings],
  );

  const measureRef = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<Layout>([]);
  const [tick, setTick] = useState(0);

  useLayoutEffect(() => {
    const root = measureRef.current;
    if (!root) return;
    const heights: number[] = [];
    const children = Array.from(root.children) as HTMLElement[];
    for (let i = 0; i < units.length; i++) {
      heights[i] = children[i] ? children[i].offsetHeight : 0;
    }
    const l = paginate(units, heights, innerH * MM_TO_PX, columns);
    setLayout(l);
    onPageCount(l.length);
  }, [units, settings, device, columns, innerH, tick, onPageCount]);

  const bump = () => setTick((t) => t + 1);
  const common = { settings, device, columnWidthMm, transpose: song.totalTranspose };

  const current = layout[Math.min(page, Math.max(0, layout.length - 1))] ?? [];

  return (
    <>
      <div className="measure" ref={measureRef} style={{ width: `${columnWidthMm}mm` }} aria-hidden>
        {units.map((u) => (
          <div key={u.id} className="unit">
            <UnitView unit={u} {...common} onContentChange={bump} />
          </div>
        ))}
      </div>
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
                  <UnitView unit={u} {...common} />
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
