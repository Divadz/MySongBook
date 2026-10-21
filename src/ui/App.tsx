import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseSong, writeTranspose, type SongModel } from '../core/song';
import {
  applyTextsize,
  defaultDeviceSettings,
  loadRenderSettings,
  mergeRenderSettings,
  saveRenderSettings,
  type RenderSettings,
} from '../core/settings';
import {
  SETTINGS_PATH,
  SONGS_DIR,
  dirname,
  fileNameFromTitle,
  newSongTemplate,
  scanLibrary,
  summarizeChordPro,
  type LibraryFS,
  type SongEntry,
} from '../core/library';
import { fsAccessSupported, pickLibrary, rememberedLibrary, reopenLibrary } from '../core/fsAccess';
import { HttpLibrary, devLibraryInfo } from '../core/httpLibrary';
import { DisplaySettings } from './DisplaySettings';
import { LibraryPanel } from './LibraryPanel';
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
  // --- Bibliothèque ---------------------------------------------------------
  const [library, setLibrary] = useState<LibraryFS | null>(null);
  const [entries, setEntries] = useState<SongEntry[]>([]);
  const [remembered, setRemembered] = useState<{ name: string; granted: boolean } | null>(null);
  const [devLib, setDevLib] = useState<{ name: string } | null>(null);
  const [libError, setLibError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleEntry[]>([]);

  /** Morceau ouvert : chemin dans la bibliothèque, ou échantillon. */
  const [current, setCurrent] = useState<{ kind: 'library' | 'sample'; path: string } | null>(null);
  const [source, setSource] = useState<string>('');
  const [savedSource, setSavedSource] = useState<string>('');
  const dirty = source !== savedSource;
  const [notice, setNotice] = useState<string | null>(null);

  // --- Rendu ----------------------------------------------------------------
  const [extraTranspose, setExtraTranspose] = useState(0);
  const [settings, setSettings] = useState<RenderSettings>(loadRenderSettings);
  const settingsFromLibrary = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [device] = useState(defaultDeviceSettings);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // --- Édition --------------------------------------------------------------
  const [mode, setMode] = useState<'read' | 'edit'>('read');
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

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3000);
  };

  // --- Démarrage ------------------------------------------------------------
  useEffect(() => {
    fetch('/samples/index.json')
      .then((r) => r.json())
      .then((list: SampleEntry[]) => {
        setSamples(list);
        setCurrent((c) => c ?? (list.length > 0 ? { kind: 'sample', path: list[0].file } : null));
      });
    devLibraryInfo().then(setDevLib);
    rememberedLibrary().then(async (r) => {
      setRemembered(r);
      if (r?.granted) {
        const lib = await reopenLibrary();
        if (lib) openLibrary(lib);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refresh = useCallback(async (lib: LibraryFS) => {
    try {
      setEntries(await scanLibrary(lib));
      setLibError(null);
    } catch (e) {
      setLibError((e as Error).message);
    }
  }, []);

  const openLibrary = async (lib: LibraryFS) => {
    setLibrary(lib);
    setLibError(null);
    // Réglages de rendu partagés entre appareils.
    try {
      if (await lib.exists(SETTINGS_PATH)) {
        settingsFromLibrary.current = false;
        setSettings(mergeRenderSettings(JSON.parse(await lib.readText(SETTINGS_PATH))));
      }
    } catch {
      flash('Réglages de la bibliothèque illisibles : réglages locaux conservés.');
    }
    settingsFromLibrary.current = true;
    const list = await scanLibrary(lib).catch((e) => {
      setLibError((e as Error).message);
      return [] as SongEntry[];
    });
    setEntries(list);
    const first = [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'))[0];
    if (first) setCurrent({ kind: 'library', path: first.path });
  };

  const choose = async (how: 'pick' | 'reopen' | 'dev') => {
    try {
      const lib = how === 'pick' ? await pickLibrary() : how === 'reopen' ? await reopenLibrary() : new HttpLibrary(devLib?.name ?? 'test');
      if (lib) await openLibrary(lib);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setLibError((e as Error).message);
    }
  };

  const closeLibrary = async () => {
    await saveIfNeeded();
    setLibrary(null);
    setEntries([]);
    settingsFromLibrary.current = false;
    setCurrent(samples.length ? { kind: 'sample', path: samples[0].file } : null);
  };

  // Les réglages sont écrits dans la bibliothèque (et gardés localement en secours).
  useEffect(() => {
    saveRenderSettings(settings);
    if (!library || !settingsFromLibrary.current) return;
    const t = window.setTimeout(() => {
      library.writeText(SETTINGS_PATH, JSON.stringify(settings, null, 2)).catch(() => flash('Écriture des réglages impossible.'));
    }, 600);
    return () => window.clearTimeout(t);
  }, [settings, library]);

  // --- Chargement d'un morceau ----------------------------------------------
  const currentEntry = current?.kind === 'library' ? entries.find((e) => e.path === current.path) : undefined;

  useEffect(() => {
    if (!current) return;
    let cancelled = false;
    const load = async (): Promise<string> => {
      if (current.kind === 'sample') return (await fetch(`/samples/${current.path}`)).text();
      if (!library) return '';
      if (/\.pdf$/i.test(current.path)) return '';
      return library.readText(current.path);
    };
    load()
      .then((t) => {
        if (cancelled) return;
        setSource(t);
        setSavedSource(t);
        setExtraTranspose(0);
        setPage(0);
        lastGood.current = null;
      })
      .catch((e) => !cancelled && setLibError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [current, library]);

  // --- Enregistrement -------------------------------------------------------
  const writeCurrent = async (text: string) => {
    if (!library || current?.kind !== 'library') return false;
    await library.writeText(current.path, text);
    setSavedSource(text);
    setEntries((list) => list.map((e) => (e.path === current.path ? summarizeChordPro(e.path, text) : e)));
    return true;
  };

  const save = async () => {
    try {
      if (await writeCurrent(source)) {
        flash('Enregistré.');
        return;
      }
    } catch (e) {
      flash(`Échec de l'enregistrement : ${(e as Error).message}`);
      return;
    }
    // Échantillon : pas de fichier d'origine, on télécharge une copie.
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = current?.path ?? 'morceau.cho';
    a.click();
    URL.revokeObjectURL(a.href);
    setSavedSource(source);
  };
  const saveRef = useRef(save);
  saveRef.current = save;

  /** En changeant de morceau, les modifications sont enregistrées automatiquement. */
  const saveIfNeeded = async () => {
    if (dirty && library && current?.kind === 'library') {
      try {
        await writeCurrent(source);
      } catch (e) {
        flash(`Échec de l'enregistrement : ${(e as Error).message}`);
      }
    }
  };

  const select = async (target: { kind: 'library' | 'sample'; path: string }) => {
    if (target.path === current?.path) return;
    await saveIfNeeded();
    setCurrent(target);
  };

  /** Écrit la transposition courante dans le fichier ({transpose:}). */
  const keepTranspose = async () => {
    if (!song) return;
    const text = writeTranspose(source, song.totalTranspose);
    setSource(text);
    setExtraTranspose(0);
    try {
      if (await writeCurrent(text)) flash('Transposition enregistrée dans le fichier.');
    } catch (e) {
      flash(`Échec de l'enregistrement : ${(e as Error).message}`);
    }
  };

  const createSong = async (folder: string, title: string) => {
    if (!library) return;
    const dir = `${SONGS_DIR}${folder ? `${folder}/` : ''}`;
    let name = fileNameFromTitle(title);
    for (let i = 2; await library.exists(dir + name); i++) name = fileNameFromTitle(`${title} (${i})`);
    const path = dir + name;
    try {
      await saveIfNeeded();
      await library.writeText(path, newSongTemplate(title));
      await refresh(library);
      setCurrent({ kind: 'library', path });
      setMode('edit');
    } catch (e) {
      flash(`Création impossible : ${(e as Error).message}`);
    }
  };

  // --- Analyse et rendu -----------------------------------------------------
  // Le rendu suit la frappe sans la ralentir.
  const deferredSource = useDeferredValue(source);
  const parsed = useMemo<{ song: SongModel | null; error: string | null }>(() => {
    if (!deferredSource) return { song: null, error: null };
    try {
      const s = parseSong(deferredSource, extraTranspose);
      lastGood.current = s;
      return { song: s, error: null };
    } catch (e) {
      // Pendant la frappe le texte peut être momentanément invalide : on garde le dernier rendu correct.
      return { song: lastGood.current, error: (e as Error).message };
    }
  }, [deferredSource, extraTranspose]);
  const song = parsed.song;

  // Images : chemin relatif au morceau, puis au dossier images/, puis à la racine.
  const imageUrls = useRef(new Map<string, string>());
  const [imageMap, setImageMap] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!song || !library || current?.kind !== 'library') return;
    const srcs = song.blocks.flatMap((b) => (b.kind === 'image' ? [b.src] : []));
    const toResolve = srcs.filter((s) => !/^(\/|https?:|data:|blob:)/.test(s));
    if (toResolve.length === 0) return;
    const songDir = dirname(current.path);
    let cancelled = false;
    (async () => {
      const result: Record<string, string> = {};
      for (const src of toResolve) {
        const candidates = [`${songDir}/${src}`, `images/${src}`, src];
        let url = '';
        for (const c of candidates) {
          const cached = imageUrls.current.get(c);
          if (cached) {
            url = cached;
            break;
          }
          if (await library.exists(c)) {
            url = URL.createObjectURL(await library.readBlob(c));
            imageUrls.current.set(c, url);
            break;
          }
        }
        result[src] = url || `missing:${src}`;
      }
      if (!cancelled) setImageMap((m) => ({ ...m, ...result }));
    })();
    return () => {
      cancelled = true;
    };
  }, [song, library, current]);

  const renderSong = useMemo<SongModel | null>(() => {
    if (!song) return null;
    if (!library || current?.kind !== 'library') return song;
    return {
      ...song,
      blocks: song.blocks.map((b) => (b.kind === 'image' && imageMap[b.src] ? { ...b, src: imageMap[b.src] } : b)),
    };
  }, [song, imageMap, library, current]);

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
        saveRef.current();
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

  // Avertit avant de quitter la page avec des modifications non enregistrées.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
    setSource(source.slice(0, start) + prefix + text + suffix + source.slice(end));
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

  const isPdf = currentEntry?.kind === 'pdf';
  const canKeepTranspose = extraTranspose !== 0 && library !== null && current?.kind === 'library';

  return (
    <div className="app">
      {showSettings && (
        <aside className="sidebar wide">
          <DisplaySettings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
        </aside>
      )}
      <aside className="sidebar" hidden={mode === 'edit' || showSettings}>
        {library ? (
          <LibraryPanel
            name={library.name}
            entries={entries}
            selected={current?.kind === 'library' ? current.path : null}
            onSelect={(path) => select({ kind: 'library', path })}
            onCreate={createSong}
            onRefresh={() => refresh(library)}
            onClose={closeLibrary}
          />
        ) : (
          <>
            <h1>MySongBook</h1>
            <div className="sidebar-title">Bibliothèque</div>
            {fsAccessSupported ? (
              <button className="sidebar-button primary" onClick={() => choose('pick')}>
                Ouvrir un dossier…
              </button>
            ) : (
              <p className="sidebar-note">Ce navigateur ne sait pas ouvrir un dossier : utiliser Chrome ou Edge.</p>
            )}
            {remembered && (
              <button className="sidebar-button" onClick={() => choose('reopen')}>
                Rouvrir « {remembered.name} »
              </button>
            )}
            {devLib && (
              <button className="sidebar-button" onClick={() => choose('dev')}>
                Bibliothèque de test ({devLib.name})
              </button>
            )}
            <div className="sidebar-title">Échantillons</div>
            <ul className="songlist">
              {samples.map((s) => (
                <li
                  key={s.file}
                  className={current?.kind === 'sample' && s.file === current.path ? 'active' : ''}
                  onClick={() => select({ kind: 'sample', path: s.file })}
                >
                  {s.title}
                </li>
              ))}
            </ul>
          </>
        )}
        {libError && <div className="sidebar-error">{libError}</div>}
        <button className="sidebar-button" onClick={() => setShowSettings(true)}>
          Réglages d’affichage…
        </button>
      </aside>

      <main className="main">
        <div className="toolbar">
          <span className="song-title">
            {song?.meta.title ?? currentEntry?.title ?? '…'}
            {dirty && <span className="dirty" title="Modifications non enregistrées"> ●</span>}
          </span>
          {!isPdf && (
            <button className={mode === 'edit' ? 'toggle on' : 'toggle'} onClick={() => setMode((m) => (m === 'edit' ? 'read' : 'edit'))}>
              {mode === 'edit' ? 'Fermer l’éditeur' : 'Éditer'}
            </button>
          )}
          {(mode === 'edit' || dirty) && (
            <button className="toggle" onClick={save} title="Enregistrer (Ctrl+S)" disabled={!dirty && current?.kind === 'library'}>
              {current?.kind === 'library' ? 'Enregistrer' : 'Télécharger'}
            </button>
          )}
          {mode === 'edit' && (
            <button className={showHelp ? 'toggle on' : 'toggle'} onClick={() => setShowHelp((h) => !h)} title="Pense-bête des directives (F1)">
              Directives
            </button>
          )}
          {notice && <span className="notice">{notice}</span>}
          <span className="spacer" />
          <span>Tonalité {song?.meta.key ?? '?'}</span>
          <button onClick={() => setExtraTranspose((t) => t - 1)} title="Transposer d'un demi-ton vers le bas">
            ♭
          </button>
          <button onClick={() => setExtraTranspose(0)} title="Revenir à la transposition du fichier">
            {song ? (song.totalTranspose > 0 ? `+${song.totalTranspose}` : song.totalTranspose) : 0}
          </button>
          <button onClick={() => setExtraTranspose((t) => t + 1)} title="Transposer d'un demi-ton vers le haut">
            ♯
          </button>
          {canKeepTranspose && (
            <button className="toggle" onClick={keepTranspose} title="Écrire {transpose:} dans le fichier">
              Garder
            </button>
          )}
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
                  onChange={(e) => setSource(e.target.value)}
                />
                {showHelp && <CheatSheet onInsert={insertDirective} onClose={() => setShowHelp(false)} />}
              </div>
              {parsed.error && <div className="editor-error">Syntaxe : {parsed.error}</div>}
            </div>
          )}
          {mode === 'edit' && <div className="splitter" onMouseDown={startDrag} />}
          <div className="viewport" ref={viewportRef} onClick={onViewportClick}>
            {isPdf ? (
              <div className="placeholder">Les morceaux PDF seront affichés dans une prochaine étape.</div>
            ) : (
              renderSong && (
                <div className="page-scaler" style={{ transform: `scale(${scale})` }}>
                  <SongPages song={renderSong} settings={effectiveSettings} device={device} page={page} onPageCount={onPageCount} />
                </div>
              )
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
