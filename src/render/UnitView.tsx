import { useLayoutEffect, useRef } from 'react';
import abcjs from 'abcjs';
import type { Unit } from './units';
import type { DeviceSettings, RenderSettings } from '../core/settings';
import { sectionStyle } from '../core/settings';

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

export function UnitView({ unit, settings, device, columnWidthMm, transpose, onContentChange }: Props) {
  const scale = device.fontScale;
  switch (unit.kind) {
    case 'title': {
      const m = unit.meta;
      const metaParts = [m.artist, m.key && `Tonalité : ${m.key}`, m.tempo && `${m.tempo} bpm`, m.time].filter(Boolean);
      const credits = [m.composer && `Musique : ${m.composer}`, m.lyricist && `Paroles : ${m.lyricist}`].filter(Boolean);
      return (
        <div className="u-title">
          <div className="title" style={{ fontSize: `${settings.titleSize * scale}pt` }}>
            {m.title}
          </div>
          {m.subtitle && (
            <div className="subtitle" style={{ fontSize: `${settings.metaSize * scale}pt` }}>
              {m.subtitle}
            </div>
          )}
          {metaParts.length > 0 && (
            <div className="meta" style={{ fontSize: `${settings.metaSize * scale}pt` }}>
              {metaParts.join('  ·  ')}
            </div>
          )}
          {credits.length > 0 && (
            <div className="meta" style={{ fontSize: `${settings.metaSize * scale}pt` }}>
              {credits.join('  ·  ')}
            </div>
          )}
          {m.copyright && (
            <div className="copyright" style={{ fontSize: `${settings.metaSize * 0.85 * scale}pt` }}>
              © {m.copyright}
            </div>
          )}
        </div>
      );
    }
    case 'header': {
      const st = sectionStyle(settings, unit.type);
      return (
        <div
          className="u-header"
          style={{ fontSize: `${settings.lyricsSize * scale}pt`, marginLeft: `${st.indent}mm` }}
        >
          {unit.label}
        </div>
      );
    }
    case 'line': {
      const st = sectionStyle(settings, unit.type);
      const lineStyle: React.CSSProperties = {
        fontSize: `${settings.lyricsSize * scale}pt`,
        lineHeight: settings.lineHeight,
        marginLeft: `${st.indent}mm`,
        fontWeight: st.bold ? 700 : 400,
        fontStyle: st.italic ? 'italic' : 'normal',
        paddingBottom: unit.last ? `${settings.lyricsSize * 0.6 * scale}pt` : 0,
      };
      const line = unit.line;
      if (line.kind === 'literal') {
        return (
          <pre className="u-literal" style={lineStyle}>
            {line.text}
          </pre>
        );
      }
      if (line.kind === 'comment') {
        return (
          <div className={`u-comment ${line.style}`} style={lineStyle}>
            {line.text}
          </div>
        );
      }
      if (!settings.showChords && line.chordsOnly) return <div style={{ height: 0 }} />;
      return (
        <div className={`u-line ${line.chordsOnly ? 'chords-only' : ''}`} style={lineStyle}>
          {line.items.map((it, i) => (
            <span className="pair" key={i}>
              {settings.showChords && (
                <span className="chord" style={{ fontSize: `${settings.chordSize * scale}pt` }}>
                  {it.chords || ' '}
                </span>
              )}
              <span className="lyrics">{it.lyrics || (settings.showChords ? '' : '')}</span>
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
          labelSize={settings.lyricsSize * scale}
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
        <div className={`u-comment block ${unit.style}`} style={{ fontSize: `${settings.lyricsSize * scale}pt` }}>
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
