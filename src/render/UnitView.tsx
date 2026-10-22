import { useLayoutEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { GridLayout, Unit } from './units';
import type { DeviceSettings, RenderSettings } from '../core/settings';
import { css, sectionStyleKey } from '../core/settings';
import type { SongMeta } from '../core/song';
import { parseGridLine, type GridCell, type GridRow } from '../core/grid';

interface Props {
  unit: Unit;
  settings: RenderSettings;
  device: DeviceSettings;
  /** Largeur de colonne en mm (pour abcjs). */
  columnWidthMm: number;
  transpose: number;
  onContentChange?: () => void;
}

const MM_TO_PX = 96 / 25.4;

/** Largeur de portée : « 70% » de la colonne, « 120mm », sinon toute la colonne. */
function abcWidthPx(width: string | undefined, columnWidthMm: number): number {
  const full = columnWidthMm * MM_TO_PX;
  if (!width) return full;
  const pct = /^(\d+(?:\.\d+)?)\s*%$/.exec(width);
  if (pct) return Math.min(full, (full * parseFloat(pct[1])) / 100);
  const mm = /^(\d+(?:\.\d+)?)\s*mm$/.exec(width);
  if (mm) return Math.min(full, parseFloat(mm[1]) * MM_TO_PX);
  return full;
}

/** Lignes de métadonnées à afficher sous le titre, selon les champs choisis. */
/**
 * Plusieurs espaces juste avant un accord servent à le placer (texte venu
 * d'un « accords sur paroles » en police à chasse fixe) : chacune prend la
 * largeur d'un caractère, pas celle, étroite, d'une espace proportionnelle.
 * Les espaces suivies de paroles gardent leur largeur normale.
 */
function spacedLyrics(lyrics: string, beforeChord: boolean): React.ReactNode {
  const m = beforeChord ? / {2,}$/.exec(lyrics) : null;
  if (!m) return lyrics;
  return (
    <>
      {lyrics.slice(0, m.index)}
      <span className="gap" style={{ width: `${m[0].length * 0.55}em` }} />
    </>
  );
}

const barClass = (bar: string | undefined) =>
  ({ '||': 'double', '|.': 'end', '|:': 'rep-start', ':|': 'rep-end', ':||': 'rep-end', ':|:': 'rep-both' })[bar ?? '|'] ?? 'single';

/**
 * Contenu d'une case de grille. Plusieurs accords se partagent la case :
 * 2 → diagonale (haut gauche, bas droite) ; 3 → diagonale et demi-diagonale
 * (haut gauche, bas, droite) ; 4 → croix (gauche, haut, bas, droite).
 */
function GridCellContent({ cell }: { cell: GridCell }) {
  if (cell.repeat) return <span className="gc-one gc-repeat">{cell.repeat}</span>;
  const c = cell.chords;
  if (c.length === 0) return null;
  if (c.length === 1) return <span className="gc-one">{c[0]}</span>;
  const lines =
    c.length === 2 ? ['M0 100L100 0'] : c.length === 3 ? ['M0 100L100 0', 'M50 50L100 100'] : ['M0 100L100 0', 'M0 0L100 100'];
  const places = c.length === 2 ? ['tl', 'br'] : c.length === 3 ? ['tl', 'b', 'r'] : ['l', 't', 'b', 'r'];
  return (
    <>
      <svg className="gc-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
        {lines.map((d) => (
          <path key={d} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      {c.slice(0, 4).map((chord, i) => (
        <span key={i} className={`gc-part ${places[i]}`}>
          {chord}
        </span>
      ))}
    </>
  );
}

/**
 * Une ligne de grille. Toutes les lignes d'une grille ont les mêmes colonnes
 * (marge, autant de cases que la ligne la plus longue, texte à droite) : les
 * cases s'alignent d'une ligne à l'autre et le texte de droite (« x2 ») reste
 * après la fin de la grille.
 */
function GridRowView({ row, layout, style }: { row: GridRow; layout: GridLayout; style: React.CSSProperties }) {
  const columns = [
    layout.label ? `${Math.max(2.5, layout.label * 0.62 + 0.6)}em` : '',
    `repeat(${layout.cells}, minmax(0, 5.6em))`,
    layout.comment ? `${layout.comment * 0.62 + 0.6}em` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const firstCell = layout.label ? 2 : 1;
  return (
    <div className="grid-row" style={{ ...style, gridTemplateColumns: columns }}>
      {row.label && (
        <span className="grid-label" style={{ gridColumn: 1 }}>
          {row.label}
        </span>
      )}
      {row.cells.map((cell, i) => (
        <div
          key={i}
          style={{ gridColumn: firstCell + i }}
          className={`grid-cell left-${barClass(row.bars[i])} ${i === row.cells.length - 1 ? `right-${barClass(row.bars[i + 1])}` : ''}`}
        >
          <GridCellContent cell={cell} />
        </div>
      ))}
      {row.comment && (
        <span className="grid-comment" style={{ gridColumn: -2 }}>
          {row.comment}
        </span>
      )}
    </div>
  );
}

function metaLines(m: SongMeta, show: RenderSettings['metaFields']): string[] {
  const lines: string[] = [];
  if (show.subtitle && m.subtitle) lines.push(m.subtitle);
  const main = [
    show.artist && m.artist,
    show.key && m.key && `Tonalité : ${m.key}`,
    show.tempo && m.tempo && `${m.tempo} bpm`,
    show.time && m.time,
    show.duration && m.duration && `Durée : ${m.duration}`,
  ].filter(Boolean) as string[];
  if (main.length) lines.push(main.join('  ·  '));
  const credits = [
    show.composer && m.composer && `Musique : ${m.composer}`,
    show.lyricist && m.lyricist && `Paroles : ${m.lyricist}`,
  ].filter(Boolean) as string[];
  if (credits.length) lines.push(credits.join('  ·  '));
  if (show.copyright && m.copyright) lines.push(`© ${m.copyright}`);
  if (show.tags && m.tags.length) lines.push(`Tags : ${m.tags.join(', ')}`);
  return lines;
}

export function UnitView({ unit, settings, device, columnWidthMm, transpose, onContentChange }: Props) {
  const scale = device.fontScale;
  const S = settings.styles;
  switch (unit.kind) {
    case 'title': {
      const lines = metaLines(unit.meta, settings.metaFields);
      return (
        <div className="u-title">
          <div className="title" style={css(S.title, scale)}>
            {unit.meta.title}
          </div>
          {lines.length > 0 && (
            <div className="meta" style={css(S.meta, scale)}>
              {lines.map((l, i) => (
                <div key={i}>{l}</div>
              ))}
            </div>
          )}
        </div>
      );
    }
    case 'header': {
      // Le libellé s'aligne sur sa section, plus son propre décalage.
      const sec = S[sectionStyleKey(unit.type)];
      return (
        <div
          className="u-header"
          style={{ ...css(S.label, scale), marginLeft: `calc(${sec.indent * sec.size * scale}pt + ${S.label.indent}em)` }}
        >
          {unit.label}
        </div>
      );
    }
    case 'line': {
      const st = S[sectionStyleKey(unit.type)];
      const line = unit.line;
      const spacing: React.CSSProperties = {
        lineHeight: settings.lineHeight,
        paddingBottom: unit.last ? `${st.size * 0.6 * scale}pt` : 0,
      };
      if (line.kind === 'literal' && unit.type === 'grid') {
        const row = parseGridLine(line.text);
        if (row && unit.grid) return <GridRowView row={row} layout={unit.grid} style={{ ...css(st, scale), ...spacing }} />;
      }
      if (line.kind === 'literal') {
        // Grilles et tablatures : chasse fixe.
        return (
          <pre className="u-literal" style={{ ...css(st, scale), ...spacing }}>
            {line.text}
          </pre>
        );
      }
      if (line.kind === 'comment') {
        return (
          <div className={`u-comment ${line.style}`} style={{ ...css(S.comment, scale), ...spacing }}>
            {line.text}
          </div>
        );
      }
      if (!settings.showChords && line.chordsOnly) return <div style={{ height: 0 }} />;
      return (
        <div className={`u-line ${line.chordsOnly ? 'chords-only' : ''}`} style={{ ...css(st, scale), ...spacing }}>
          {line.items.map((it, i) => (
            <span className="pair" key={i}>
              {settings.showChords && (
                <span className="chord" style={css(S.chords, scale, false)}>
                  {it.chords || ' '}
                </span>
              )}
              <span className="lyrics">{spacedLyrics(it.lyrics, settings.showChords && !!line.items[i + 1]?.chords)}</span>
            </span>
          ))}
        </div>
      );
    }
    case 'abc':
      return (
        <AbcView
          abc={unit.abc}
          label={settings.sectionLabels.abc ? unit.label : undefined}
          widthPx={abcWidthPx(unit.width, columnWidthMm)}
          transpose={transpose}
          scale={scale * settings.abcScale * (unit.scale ?? 1)}
          labelStyle={css(S.label, scale)}
        />
      );
    case 'image': {
      const width = unit.width ?? '100%';
      if (unit.src.startsWith('missing:')) {
        return <div className="u-image missing">Image introuvable : {unit.src.slice('missing:'.length)}</div>;
      }
      return (
        <div className="u-image">
          <img src={unit.src} style={{ width }} onLoad={onContentChange} alt="" />
        </div>
      );
    }
    case 'comment':
      return (
        <div className={`u-comment block ${unit.style}`} style={css(S.comment, scale)}>
          {unit.text}
        </div>
      );
    case 'break':
      return null;
  }
}

interface AbcProps {
  abc: string;
  label?: string;
  widthPx: number;
  transpose: number;
  scale: number;
  labelStyle: React.CSSProperties;
}

function AbcView({ abc, label, widthPx, transpose, scale, labelStyle }: AbcProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    try {
      abcjs.renderAbc(ref.current, abc, {
        staffwidth: widthPx - 4,
        scale: 0.95 * scale,
        visualTranspose: transpose,
        add_classes: true,
        paddingtop: 0,
        paddingbottom: 0,
        paddingleft: 0,
        paddingright: 0,
      });
    } catch (e) {
      ref.current.textContent = `Erreur abc : ${(e as Error).message}`;
    }
  }, [abc, widthPx, transpose, scale]);
  return (
    <div className="u-abc">
      {label && (
        <div className="u-header" style={labelStyle}>
          {label}
        </div>
      )}
      <div ref={ref} />
    </div>
  );
}
