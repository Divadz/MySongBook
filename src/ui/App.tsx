import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parseSong } from '../core/song';
import { defaultDeviceSettings, defaultRenderSettings, type RenderSettings } from '../core/settings';
import { SongPages } from '../render/SongPages';
import './app.css';

interface SampleEntry {
  file: string;
  title: string;
}

const MM_TO_PX = 96 / 25.4;

export function App() {
  const [samples, setSamples] = useState<SampleEntry[]>([]);
  const [file, setFile] = useState<string | null>(null);
  const [source, setSource] = useState<string>('');
  const [extraTranspose, setExtraTranspose] = useState(0);
  const [settings, setSettings] = useState<RenderSettings>(defaultRenderSettings);
  const [device] = useState(defaultDeviceSettings);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/samples/index.json')
      .then((r) => r.json())
      .then((list: SampleEntry[]) => {
        setSamples(list);
        if (list.length > 0) setFile(list[0].file);
      });
  }, []);

  useEffect(() => {
    if (!file) return;
    fetch(`/samples/${file}`)
      .then((r) => r.text())
      .then((t) => {
        setSource(t);
        setExtraTranspose(0);
        setPage(0);
      });
  }, [file]);

  const song = useMemo(() => (source ? parseSong(source, extraTranspose) : null), [source, extraTranspose]);

  // Le fichier peut imposer sa taille de police et ses colonnes.
  const effectiveSettings = useMemo<RenderSettings>(() => {
    if (!song) return settings;
    const s = { ...settings };
    if (song.meta.textsize) {
      s.lyricsSize = song.meta.textsize;
      s.chordSize = song.meta.textsize;
    }
    if (song.meta.columns === 1 || song.meta.columns === 2) s.columns = song.meta.columns;
    return s;
  }, [song, settings]);

  // Échelle d'affichage : la page A4 tient dans la zone visible.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const compute = () => {
      const pw = device.pageWidth * MM_TO_PX;
      const ph = device.pageHeight * MM_TO_PX;
      const s = Math.min((el.clientWidth - 24) / pw, (el.clientHeight - 24) / ph);
      setScale(Math.max(0.2, s));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device]);

  const next = useCallback(() => setPage((p) => Math.min(p + 1, pageCount - 1)), [pageCount]);
  const prev = useCallback(() => setPage((p) => Math.max(p - 1, 0)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev]);

  const onPageCount = useCallback((n: number) => {
    setPageCount(n);
    setPage((p) => Math.min(p, Math.max(0, n - 1)));
  }, []);

  const onViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.33) prev();
    else if (x > 0.67) next();
  };

  const update = (patch: Partial<RenderSettings>) => setSettings((s) => ({ ...s, ...patch }));

  return (
    <div className="app">
      <aside className="sidebar">
        <h1>MySongBook</h1>
        <div className="sidebar-title">Échantillons</div>
        <ul className="songlist">
          {samples.map((s) => (
            <li key={s.file} className={s.file === file ? 'active' : ''} onClick={() => setFile(s.file)}>
              {s.title}
            </li>
          ))}
        </ul>
        <div className="sidebar-title">Rendu</div>
        <label>
          Paroles {effectiveSettings.lyricsSize} pt
          <input
            type="range"
            min={8}
            max={20}
            value={settings.lyricsSize}
            onChange={(e) => update({ lyricsSize: Number(e.target.value), chordSize: Number(e.target.value) })}
          />
        </label>
        <label>
          Interligne {settings.lineHeight.toFixed(2)}
          <input
            type="range"
            min={1}
            max={1.8}
            step={0.05}
            value={settings.lineHeight}
            onChange={(e) => update({ lineHeight: Number(e.target.value) })}
          />
        </label>
        <label>
          Colonnes
          <select value={settings.columns} onChange={(e) => update({ columns: Number(e.target.value) as 1 | 2 })}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </label>
        <label>
          <input type="checkbox" checked={settings.showChords} onChange={(e) => update({ showChords: e.target.checked })} />
          Afficher les accords
        </label>
      </aside>

      <main className="main">
        <div className="toolbar">
          <span className="song-title">{song?.meta.title ?? '…'}</span>
          <span className="spacer" />
          <span>Tonalité {song?.meta.key ?? '?'}</span>
          <button onClick={() => setExtraTranspose((t) => t - 1)} title="Transposer d'un demi-ton vers le bas">
            ♭
          </button>
          <button onClick={() => setExtraTranspose(0)} title="Revenir au fichier">
            {song ? (song.totalTranspose > 0 ? `+${song.totalTranspose}` : song.totalTranspose) : 0}
          </button>
          <button onClick={() => setExtraTranspose((t) => t + 1)} title="Transposer d'un demi-ton vers le haut">
            ♯
          </button>
          <span className="spacer" />
          <button onClick={prev} disabled={page === 0}>
            ◀
          </button>
          <span>
            Page {Math.min(page + 1, pageCount)} / {pageCount}
          </span>
          <button onClick={next} disabled={page >= pageCount - 1}>
            ▶
          </button>
        </div>
        <div className="viewport" ref={viewportRef} onClick={onViewportClick}>
          {song && (
            <div className="page-scaler" style={{ transform: `scale(${scale})` }}>
              <SongPages song={song} settings={effectiveSettings} device={device} page={page} onPageCount={onPageCount} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
