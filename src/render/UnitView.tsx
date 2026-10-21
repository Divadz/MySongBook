import { useLayoutEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { Unit } from './units';
import type { DeviceSettings, RenderSettings } from '../core/settings';
import { css, sectionStyleKey } from '../core/settings';
import type { SongMeta } from '../core/song';

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

/** Lignes de métadonnées à afficher sous le titre, selon les champs choisis. */
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
      const st = S[sectionStyleKey(unit.type)];
      return (
        <div className="u-header" style={{ ...css(st, scale), fontWeight: 700, fontStyle: 'normal' }}>
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
      if (line.kind === 'literal') {
        // Grilles et tablatures : chasse fixe, sans gras ni italique.
        return (
          <pre className="u-literal" style={{ ...css(st, scale), fontWeight: 400, fontStyle: 'normal', ...spacing }}>
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
              <span className="lyrics">{it.lyrics}</span>
            </span>
          ))}
        </div>
      );
    }
    case 'abc':
      return (
        <AbcView
          abc={unit.abc}
          label={unit.label}
          widthPx={columnWidthMm * MM_TO_PX}
          transpose={transpose}
          scale={scale}
          labelSize={S.verse.size * scale}
        />
      );
    case 'image': {
      const width = unit.width ?? '100%';
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
  labelSize: number;
}

function AbcView({ abc, label, widthPx, transpose, scale, labelSize }: AbcProps) {
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
        <div className="u-header" style={{ fontSize: `${labelSize}pt` }}>
          {label}
        </div>
      )}
      <div ref={ref} />
    </div>
  );
}
