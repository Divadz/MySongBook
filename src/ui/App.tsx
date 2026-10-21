import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseSong, type SongModel } from '../core/song';
import { applyTextsize, defaultDeviceSettings, loadRenderSettings, saveRenderSettings, type RenderSettings } from '../core/settings';
import { DisplaySettings } from './DisplaySettings';
import { SongPages } from '../render/SongPages';
import { CheatSheet } from './CheatSheet';
import type { DirectiveHelp } from './directives';
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
  const [settings, setSettings] = useState<RenderSettings>(loadRenderSettings);
  const [showSettings, setShowSettings] = useState(false);
  useEffect(() => saveRenderSettings(settings), [settings]);
  const [device] = useState(defaultDeviceSettings);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [dirty, setDirty] = useState(false);
  const [editorWidth, setEditorWidth] = useState(50); // en % de la zone de travail
  const lastGood = useRef<SongModel | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  /** Position du curseur à rétablir après une insertion. */
  const pendingCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const ta = editorRef.current;
    if (pendingCaret.current === null || !ta) return;
    const caret = pendingCaret.current;
    pendingCaret.current = null;
    ta.focus();
    ta.setSelectionRange(caret, caret);
  }, [source]);

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
        setDirty(false);
        setExtraTranspose(0);
        setPage(0);
      });
  }, [file]);

  // Le rendu suit la frappe sans la ralentir.
  const deferredSource = useDeferredValue(source);
  const parsed = useMemo<{ song: SongModel | null; error: string | null }>(() => {
    if (!deferredSource) return { song: null, error: null };
    try {
      const song = parseSong(deferredSource, extraTranspose);
      lastGood.current = song;
      return { song, error: null };
    } catch (e) {
      // Pendant la frappe le texte peut être momentanément invalide : on garde le dernier rendu correct.
      return { song: lastGood.current, error: (e as Error).message };
    }
  }, [deferredSource, extraTranspose]);
  const song = parsed.song;

  // Le fichier peut imposer sa taille de police et ses colonnes.
  const effectiveSettings = useMemo<RenderSettings>(() => {
    if (!song) return settings;
    const s = applyTextsize(settings, song.meta.textsize);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        downloadRef.current();
        return;
      }
      if (e.key === 'F1') {
        e.preventDefault();
        setShowHelp((h) => !h);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target && /^(TEXTAREA|INPUT|SELECT)$/.test(target.tagName)) return;
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

  // Pas encore d'accès aux fichiers : la sauvegarde télécharge le .cho modifié.
  const download = () => {
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = file ?? 'morceau.cho';
    a.click();
    URL.revokeObjectURL(a.href);
    setDirty(false);
  };
  const downloadRef = useRef(download);
  downloadRef.current = download;

  /** Insère une directive au curseur ; la sélection éventuelle prend la place de « § ». */
  const insertDirective = (d: DirectiveHelp) => {
    const ta = editorRef.current;
    const start = ta ? ta.selectionStart : source.length;
    const end = ta ? ta.selectionEnd : source.length;
    const selected = source.slice(start, end);
    let text = d.snippet;
    const marker = text.indexOf('§');
    text = text.replace('§', selected);
    let prefix = '';
    let suffix = '';
    if (d.ownLine) {
      if (start > 0 && source[start - 1] !== '\n') prefix = '\n';
      if (end < source.length && source[end] !== '\n') suffix = '\n';
    }
    const next = source.slice(0, start) + prefix + text + suffix + source.slice(end);
    setSource(next);
    setDirty(true);
    pendingCaret.current = start + prefix.length + (marker >= 0 ? marker + selected.length : text.length);
  };

  const startDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    const ws = workspaceRef.current;
    if (!ws) return;
    const rect = ws.getBoundingClientRect();
    const move = (ev: MouseEvent) => {
      const pct = ((ev.clientX - rect.left) / rect.width) * 100;
      setEditorWidth(Math.min(80, Math.max(20, pct)));
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'col-resize';
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

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


  return (
    <div className="app">
      {showSettings && (
        <aside className="sidebar wide">
          <DisplaySettings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
        </aside>
      )}
      <aside className="sidebar" hidden={mode === 'edit' || showSettings}>
        <h1>MySongBook</h1>
        <div className="sidebar-title">Échantillons</div>
        <ul className="songlist">
          {samples.map((s) => (
            <li key={s.file} className={s.file === file ? 'active' : ''} onClick={() => setFile(s.file)}>
              {s.title}
            </li>
          ))}
        </ul>
        <button className="sidebar-button" onClick={() => setShowSettings(true)}>
          Réglages d’affichage…
        </button>
      </aside>

      <main className="main">
        <div className="toolbar">
          <span className="song-title">
            {song?.meta.title ?? '…'}
            {dirty && <span className="dirty" title="Modifications non enregistrées"> ●</span>}
          </span>
          <button className={mode === 'edit' ? 'toggle on' : 'toggle'} onClick={() => setMode((m) => (m === 'edit' ? 'read' : 'edit'))}>
            {mode === 'edit' ? 'Fermer l’éditeur' : 'Éditer'}
          </button>
          {mode === 'edit' && (
            <button className="toggle" onClick={download} title="Télécharger le fichier (Ctrl+S)">
              Enregistrer
            </button>
          )}
          {mode === 'edit' && (
            <button className={showHelp ? 'toggle on' : 'toggle'} onClick={() => setShowHelp((h) => !h)} title="Pense-bête des directives (F1)">
              Directives
            </button>
          )}
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
        <div className="workspace" ref={workspaceRef}>
          {mode === 'edit' && (
            <div className="editor-pane" style={{ width: `${editorWidth}%` }}>
              <div className="editor-row">
              <textarea
                ref={editorRef}
                className="editor"
                value={source}
                spellCheck={false}
                onChange={(e) => {
                  setSource(e.target.value);
                  setDirty(true);
                }}
              />
              {showHelp && <CheatSheet onInsert={insertDirective} onClose={() => setShowHelp(false)} />}
              </div>
              {parsed.error && <div className="editor-error">Syntaxe : {parsed.error}</div>}
            </div>
          )}
          {mode === 'edit' && <div className="splitter" onMouseDown={startDrag} />}
        <div className="viewport" ref={viewportRef} onClick={onViewportClick}>
          {song && (
            <div className="page-scaler" style={{ transform: `scale(${scale})` }}>
              <SongPages song={song} settings={effectiveSettings} device={device} page={page} onPageCount={onPageCount} />
            </div>
          )}
        </div>
        </div>
      </main>
    </div>
  );
}
