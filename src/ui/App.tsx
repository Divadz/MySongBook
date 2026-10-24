import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { parseSong, writeTranspose, type SongModel } from '../core/song';
import {
  applyTextsize,
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
import { isNative, openNativeLibrary, rememberedFolder, requestStorage, storageStatus } from '../core/nativeLibrary';
import { newSetFile, noteAsChordPro, scanSets, serializeSet, sortSets, type Setlist } from '../core/setlist';
import { DisplaySettings } from './DisplaySettings';
import { SetsPanel } from './SetsPanel';
import { ConverterView } from './ConverterView';
import { PdfView } from '../render/PdfView';
import { cropForPage, parsePdfMeta, pdfMetaPath, serializePdfMeta, withCrop, type Crop, type PdfMeta } from '../core/pdfMeta';
import type { CropScope } from '../render/PdfView';
import { LibraryPanel } from './LibraryPanel';
import { SongPages } from '../render/SongPages';
import { CheatSheet } from './CheatSheet';
import { StageControls } from './StageControls';
import { onStageKey, setStageActive } from '../core/stage';
import { clampFontScale, deviceName, loadDeviceSettings, loadLocalDeviceSettings, saveDeviceSettings } from '../core/deviceSettings';
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
  /** Tablette : accès aux fichiers accordé, et dossier de la bibliothèque. */
  const [nativeAccess, setNativeAccess] = useState<{ granted: boolean; root: string } | null>(null);
  const [nativeFolder, setNativeFolder] = useState(rememberedFolder);
  const [libError, setLibError] = useState<string | null>(null);
  const [samples, setSamples] = useState<SampleEntry[]>([]);

  /** Élément affiché : morceau de la bibliothèque, échantillon, ou note de set. */
  type Current =
    | { kind: 'library' | 'sample'; path: string }
    | { kind: 'note' | 'scratch'; path: string; text: string };
  const [current, setCurrent] = useState<Current | null>(null);

  // --- Sets -----------------------------------------------------------------
  const [sets, setSets] = useState<Setlist[]>([]);
  const [showConverter, setShowConverter] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'songs' | 'sets'>('songs');
  const [openSet, setOpenSet] = useState<string | null>(null);
  /** Set en cours de jeu et position dans le set. */
  const [playing, setPlaying] = useState<{ file: string; index: number } | null>(null);
  /** En reculant d'un morceau, on arrive sur sa dernière page. */
  const wantLastPage = useRef(false);
  const [source, setSource] = useState<string>('');
  const [savedSource, setSavedSource] = useState<string>('');
  const dirty = source !== savedSource;
  const [notice, setNotice] = useState<string | null>(null);

  // --- Rendu ----------------------------------------------------------------
  const [extraTranspose, setExtraTranspose] = useState(0);
  const [settings, setSettings] = useState<RenderSettings>(loadRenderSettings);
  const settingsFromLibrary = useRef(false);
  const [showSettings, setShowSettings] = useState(false);
  const [device, setDevice] = useState(loadLocalDeviceSettings);
  /** Nom de l'appareil pour .mysongbook/device-<nom>.json. */
  const deviceNameRef = useRef(deviceName());
  /** Zoom en cours de pincement (aperçu) ou tout juste appliqué, affiché en mode scène. */
  const [zoomBadge, setZoomBadge] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [scale, setScale] = useState(1);
  /** Métadonnées du PDF affiché (.pdf.json) et mode recadrage. */
  const [pdfMeta, setPdfMeta] = useState<PdfMeta>({});
  const [cropping, setCropping] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);

  // --- Édition --------------------------------------------------------------
  const [mode, setMode] = useState<'read' | 'edit'>('read');
  const [editorWidth, setEditorWidth] = useState(50); // en % de la zone de travail
  const lastGood = useRef<SongModel | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [showHelp, setShowHelp] = useState(false);
  /** Mode scène : page seule en plein écran ; commandes affichées par un tap au centre. */
  const [stage, setStage] = useState(false);
  const [stageControls, setStageControls] = useState(false);
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
    if (isNative) checkNative(true);
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
      setSets(await scanSets(lib));
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
    // Réglages propres à cet appareil (zoom du texte).
    const own = await loadDeviceSettings(lib, await deviceNameRef.current);
    if (own) setDevice(own);
    const list = await scanLibrary(lib).catch((e) => {
      setLibError((e as Error).message);
      return [] as SongEntry[];
    });
    setEntries(list);
    setSets(await scanSets(lib).catch(() => [] as Setlist[]));
    const first = [...list].sort((a, b) => a.title.localeCompare(b.title, 'fr'))[0];
    if (first) setCurrent({ kind: 'library', path: first.path });
  };

  // --- Tablette : dossier local ------------------------------------------------
  const openNative = async (folder: string) => {
    try {
      await openLibrary(await openNativeLibrary(folder));
    } catch (e) {
      setLibError((e as Error).message);
    }
  };

  /** Relit l'autorisation d'accès aux fichiers ; au démarrage, ouvre le dernier dossier. */
  const checkNative = async (open: boolean) => {
    const status = await storageStatus();
    setNativeAccess(status);
    if (status.granted && open) await openNative(rememberedFolder());
  };

  // Retour des réglages système après avoir accordé l'accès.
  useEffect(() => {
    if (!isNative) return;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !library) checkNative(nativeAccess?.granted === false);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  });

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
    setSets([]);
    setPlaying(null);
    setOpenSet(null);
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
      if (current.kind === 'note') return noteAsChordPro(current.text);
      if (current.kind === 'scratch') return current.text;
      if (current.kind === 'sample') return (await fetch(`/samples/${current.path}`)).text();
      if (!library) return '';
      if (/\.pdf$/i.test(current.path)) {
        const metaPath = pdfMetaPath(current.path);
        const meta = (await library.exists(metaPath)) ? parsePdfMeta(await library.readText(metaPath)) : {};
        if (!cancelled) setPdfMeta(meta);
        return '';
      }
      return library.readText(current.path);
    };
    setCropping(false);
    load()
      .then((t) => {
        if (cancelled) return;
        setSource(t);
        setSavedSource(t);
        setExtraTranspose(0);
        setPage(0);
        lastGood.current = null;
        setMode((m) => (current.kind === 'note' ? 'read' : m));
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
    setPlaying(null);
    if (target.path === current?.path && current.kind === target.kind) return;
    await saveIfNeeded();
    wantLastPage.current = false;
    setCurrent(target);
  };

  /** Fin du recadrage d'un PDF : le cadre est écrit dans le .pdf.json voisin. */
  const finishCrop = async (crop: Crop | null, scope: CropScope) => {
    setCropping(false);
    if (!crop || !library || current?.kind !== 'library') return;
    const meta = withCrop(pdfMeta, crop, scope === 'all' ? 'all' : page);
    try {
      await library.writeText(pdfMetaPath(current.path), serializePdfMeta(meta));
      setPdfMeta(meta);
      flash('Recadrage enregistré.');
    } catch (e) {
      flash(`Échec de l'enregistrement : ${(e as Error).message}`);
    }
  };

  /** Résultat du convertisseur : nouveau fichier, ou brouillon à télécharger sans bibliothèque. */
  const createFromConverter = async (folder: string, title: string, chordpro: string) => {
    setShowConverter(false);
    setPlaying(null);
    if (library) {
      await createSong(folder, title, chordpro);
    } else {
      await saveIfNeeded();
      setCurrent({ kind: 'scratch', path: fileNameFromTitle(title), text: chordpro });
      setMode('edit');
    }
  };

  // --- Sets : fichiers ------------------------------------------------------
  const saveSet = async (set: Setlist) => {
    if (!library) return;
    setSets((list) => sortSets(list.map((s) => (s.file === set.file ? set : s))));
    try {
      await library.writeText(set.file, serializeSet(set));
    } catch (e) {
      flash(`Enregistrement du set impossible : ${(e as Error).message}`);
    }
  };

  const createSet = async (title: string, date?: string, items: Setlist['items'] = []) => {
    if (!library) return;
    const set: Setlist = { file: await newSetFile(library, title, date), title, date, pinned: false, items };
    try {
      await library.writeText(set.file, serializeSet(set));
      setSets((list) => sortSets([...list, set]));
      setOpenSet(set.file);
    } catch (e) {
      flash(`Création du set impossible : ${(e as Error).message}`);
    }
  };

  const deleteSet = async (set: Setlist) => {
    if (!library) return;
    try {
      await library.remove(set.file);
      setSets((list) => list.filter((s) => s.file !== set.file));
      setOpenSet(null);
      if (playing?.file === set.file) setPlaying(null);
    } catch (e) {
      flash(`Suppression impossible : ${(e as Error).message}`);
    }
  };

  // --- Sets : lecture -------------------------------------------------------
  const playItem = async (set: Setlist, index: number, edge: 'first' | 'last' = 'first') => {
    const item = set.items[index];
    if (!item) return;
    await saveIfNeeded();
    setPlaying({ file: set.file, index });
    wantLastPage.current = edge === 'last';
    if (item.kind === 'note') {
      setCurrent({ kind: 'note', path: `${set.file}#${index}`, text: item.text });
    } else {
      const path = SONGS_DIR + item.path;
      if (entries.some((e) => e.path === path)) setCurrent({ kind: 'library', path });
      else setCurrent({ kind: 'note', path: `${set.file}#${index}`, text: `Morceau introuvable\n${item.path}` });
    }
  };

  const playingSet = playing ? sets.find((s) => s.file === playing.file) : undefined;
  const titleOf = (item: Setlist['items'][number] | undefined): string => {
    if (!item) return '';
    if (item.kind === 'note') return item.text.split('\n')[0];
    return entries.find((e) => e.path === SONGS_DIR + item.path)?.title ?? item.path;
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

  const createSong = async (folder: string, title: string, content?: string) => {
    if (!library) return;
    const dir = `${SONGS_DIR}${folder ? `${folder}/` : ''}`;
    let name = fileNameFromTitle(title);
    for (let i = 2; await library.exists(dir + name); i++) name = fileNameFromTitle(`${title} (${i})`);
    const path = dir + name;
    try {
      await saveIfNeeded();
      await library.writeText(path, content ?? newSongTemplate(title));
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
    const s = { ...applyTextsize(settings, song.meta.textsize, song.meta.textscale) };
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
      const margin = stage ? 0 : 24;
      const s = Math.min((el.clientWidth - margin) / pw, (el.clientHeight - margin) / ph);
      setScale(Math.max(0.2, s));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [device, stage]);

  const pageRef = useRef(page);
  pageRef.current = page;
  const setNavRef = useRef<{ set?: Setlist; index: number }>({ index: 0 });
  setNavRef.current = { set: playingSet, index: playing?.index ?? 0 };
  const playItemRef = useRef(playItem);
  playItemRef.current = playItem;

  const next = useCallback(() => {
    wantLastPage.current = false;
    if (pageRef.current < pageCount - 1) return setPage(pageRef.current + 1);
    const { set, index } = setNavRef.current;
    if (set && index < set.items.length - 1) playItemRef.current(set, index + 1, 'first');
  }, [pageCount]);
  const prev = useCallback(() => {
    wantLastPage.current = false;
    if (pageRef.current > 0) return setPage(pageRef.current - 1);
    const { set, index } = setNavRef.current;
    if (set && index > 0) playItemRef.current(set, index - 1, 'last');
  }, []);

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
      if (e.key === 'Escape' && stageRef.current) {
        e.preventDefault();
        leaveStage();
        return;
      }
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
    setPage((p) => (wantLastPage.current ? Math.max(0, n - 1) : Math.min(p, Math.max(0, n - 1))));
  }, []);

  const onViewportClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (cropping || Date.now() < pinch.current.quietUntil) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.33) prev();
    else if (x > 0.67) next();
    else if (stage) setStageControls((c) => !c);
  };

  // --- Mode scène -------------------------------------------------------------
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const enterStage = () => {
    setMode('read');
    setCropping(false);
    setStageControls(false);
    setStage(true);
    setStageActive(true);
  };
  const leaveStage = () => {
    setStage(false);
    setStageControls(false);
    setStageActive(false);
  };
  // Tablette : volume bas = page suivante, volume haut = page précédente, retour = commandes puis sortie.
  const stageKeyRef = useRef<(key: string) => void>(() => {});
  stageKeyRef.current = (key) => {
    if (key === 'volumeDown') next();
    else if (key === 'volumeUp') prev();
    else if (key === 'back') {
      if (stageControls) setStageControls(false);
      else leaveStage();
    }
  };
  useEffect(() => onStageKey((key) => stageKeyRef.current(key)), []);
  // Sur PC, sortir du plein écran (Échap géré par le navigateur) quitte aussi la scène.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && stageRef.current) {
        setStage(false);
        setStageControls(false);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  // --- Zoom du texte, propre à l'appareil (pincement en mode scène) -------------
  const saveDeviceTimer = useRef<number>();
  const setFontScale = (value: number) => {
    const fontScale = clampFontScale(value);
    const next = { ...device, fontScale };
    setDevice(next);
    window.clearTimeout(saveDeviceTimer.current);
    saveDeviceTimer.current = window.setTimeout(async () => {
      try {
        await saveDeviceSettings(library, await deviceNameRef.current, next);
      } catch {
        flash('Zoom non enregistré dans la bibliothèque.');
      }
    }, 800);
  };
  const badgeTimer = useRef<number>();
  const showZoom = (value: number | null, hideAfter?: number) => {
    setZoomBadge(value);
    window.clearTimeout(badgeTimer.current);
    if (hideAfter) badgeTimer.current = window.setTimeout(() => setZoomBadge(null), hideAfter);
  };
  // Pincement à deux doigts : aperçu du zoom pendant le geste, mise en page au lâcher
  // (repaginer à chaque mouvement serait trop lent sur l'e-ink).
  const pinch = useRef({ points: new Map<number, { x: number; y: number }>(), start: 0, base: 1, value: 0, quietUntil: 0 });
  const pinchDistance = () => {
    const [a, b] = [...pinch.current.points.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (!canZoom || e.pointerType !== 'touch') return;
    const p = pinch.current;
    p.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.points.size === 2) {
      p.start = pinchDistance();
      p.base = device.fontScale;
      p.value = device.fontScale;
      showZoom(device.fontScale);
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (!p.points.has(e.pointerId)) return;
    p.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (p.points.size === 2 && p.start > 0) {
      const value = clampFontScale((p.base * pinchDistance()) / p.start);
      if (value !== p.value) {
        p.value = value;
        showZoom(value);
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const p = pinch.current;
    if (!p.points.delete(e.pointerId)) return;
    if (p.start > 0) {
      // Fin du geste : le tap qui suit le lâcher ne doit pas tourner la page.
      p.start = 0;
      p.quietUntil = Date.now() + 500;
      if (p.value !== device.fontScale) setFontScale(p.value);
      showZoom(p.value, 1200);
    }
  };
  // PC : Ctrl + molette (ou pincement du pavé tactile) en mode scène.
  const onWheel = (e: React.WheelEvent) => {
    if (!canZoom || !e.ctrlKey) return;
    const value = clampFontScale(device.fontScale + (e.deltaY < 0 ? 0.05 : -0.05));
    setFontScale(value);
    showZoom(value, 1200);
  };

  // Une page tournée referme les commandes.
  useEffect(() => setStageControls(false), [page, current]);

  const isPdf = currentEntry?.kind === 'pdf';
  /** Zoom du texte : en mode scène, sur les morceaux ChordPro (un PDF garde sa mise en page). */
  const canZoom = stage && !isPdf && current?.kind !== 'note';
  const scalerStyle = { transform: `scale(${scale})`, '--hair': `${Math.max(1, 1 / scale)}px` } as React.CSSProperties;
  const pageCrop = useMemo(() => cropForPage(pdfMeta, page), [pdfMeta, page]);
  const canKeepTranspose = extraTranspose !== 0 && library !== null && current?.kind === 'library';

  return (
    <div className={stage ? 'app stage' : 'app'}>
      {showSettings && (
        <aside className="sidebar wide">
          <DisplaySettings settings={settings} onChange={setSettings} onClose={() => setShowSettings(false)} />
        </aside>
      )}
      <aside className="sidebar" hidden={mode === 'edit' || showSettings}>
        {library ? (
          <>
            <div className="sidebar-tabs">
              <button className={sidebarTab === 'songs' ? 'on' : ''} onClick={() => setSidebarTab('songs')}>
                Morceaux
              </button>
              <button className={sidebarTab === 'sets' ? 'on' : ''} onClick={() => setSidebarTab('sets')}>
                Sets
              </button>
            </div>
            {sidebarTab === 'songs' ? (
              <LibraryPanel
                name={library.name}
                entries={entries}
                selected={current?.kind === 'library' && !playing ? current.path : null}
                onSelect={(path) => select({ kind: 'library', path })}
                onCreate={createSong}
                onRefresh={() => refresh(library)}
                onClose={closeLibrary}
              />
            ) : (
              <SetsPanel
                sets={sets}
                entries={entries}
                openFile={openSet}
                onOpen={setOpenSet}
                playing={playing}
                onCreate={(title, date) => createSet(title, date)}
                onChange={saveSet}
                onDuplicate={(s) => createSet(`${s.title} (copie)`, s.date, s.items)}
                onDelete={deleteSet}
                onPlay={(s, i) => playItem(s, i, 'first')}
              />
            )}
          </>
        ) : (
          <>
            <h1>MySongBook</h1>
            <div className="sidebar-title">Bibliothèque</div>
            {isNative ? (
              nativeAccess?.granted ? (
                <form
                  className="native-folder"
                  onSubmit={(e) => {
                    e.preventDefault();
                    openNative(nativeFolder);
                  }}
                >
                  <label>
                    Dossier ({nativeAccess.root}/…)
                    <input value={nativeFolder} onChange={(e) => setNativeFolder(e.target.value)} />
                  </label>
                  <button className="sidebar-button primary" type="submit">
                    Ouvrir
                  </button>
                </form>
              ) : (
                <>
                  <p className="sidebar-note">MySongBook doit pouvoir lire le dossier synchronisé avec Google Drive.</p>
                  <button className="sidebar-button primary" onClick={() => requestStorage()}>
                    Autoriser l’accès aux fichiers…
                  </button>
                </>
              )
            ) : fsAccessSupported ? (
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
        <button className="sidebar-button" onClick={() => setShowConverter(true)} title="Coller un texte avec les accords au-dessus des paroles">
          Convertir un texte…
        </button>
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
          {playingSet && playing && (
            <span className="set-position" title={playingSet.title}>
              {playingSet.title} · {playing.index + 1}/{playingSet.items.length}
              {playing.index < playingSet.items.length - 1 && <> · ensuite : {titleOf(playingSet.items[playing.index + 1])}</>}
              <button className="set-exit" onClick={() => setPlaying(null)} title="Quitter le set">
                ×
              </button>
            </span>
          )}
          {!isPdf && current?.kind !== 'note' && (
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
          {isPdf && (
            <>
              {currentEntry?.key && <span>Tonalité {currentEntry.key}</span>}
              <button className={cropping ? 'toggle on' : 'toggle'} onClick={() => setCropping((c) => !c)} title="Choisir la zone de la page à afficher">
                Recadrer
              </button>
            </>
          )}
          {current?.kind !== 'note' && !isPdf && (
          <>
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
          </>
          )}
          <span className="spacer" />
          <button className="toggle" onClick={enterStage} title="Plein écran, page seule ; tap au centre pour les commandes">
            Scène
          </button>
          <button onClick={prev} disabled={page === 0 && !(playingSet && playing && playing.index > 0)}>
            ◀
          </button>
          <span>
            Page {Math.min(page + 1, pageCount)} / {pageCount}
          </span>
          <button onClick={next} disabled={page >= pageCount - 1 && !(playingSet && playing && playing.index < playingSet.items.length - 1)}>
            ▶
          </button>
        </div>
        {showConverter && (
          <ConverterView
            folders={[...new Set(entries.map((e) => e.folder))].sort((a, b) => a.localeCompare(b, 'fr'))}
            libraryOpen={library !== null}
            onCreate={createFromConverter}
            onClose={() => setShowConverter(false)}
          />
        )}
        <div className="workspace" ref={workspaceRef} hidden={showConverter}>
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
          <div
            className="viewport"
            ref={viewportRef}
            onClick={onViewportClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            {isPdf ? (
              library &&
              current?.kind === 'library' && (
                <div className="page-scaler" style={scalerStyle}>
                  <PdfView
                    library={library}
                    path={current.path}
                    crop={pageCrop}
                    device={device}
                    scale={scale}
                    page={page}
                    onPageCount={onPageCount}
                    cropping={cropping}
                    onCropDone={finishCrop}
                  />
                </div>
              )
            ) : (
              renderSong && (
                <div className="page-scaler" style={scalerStyle}>
                  <SongPages song={renderSong} settings={effectiveSettings} device={device} page={page} onPageCount={onPageCount} />
                </div>
              )
            )}
            {stage && playingSet && playing && page >= pageCount - 1 && playing.index < playingSet.items.length - 1 && (
              <div className="stage-next">Ensuite : {titleOf(playingSet.items[playing.index + 1])}</div>
            )}
            {stage && zoomBadge !== null && <div className="stage-zoom">Texte {Math.round(zoomBadge * 100)} %</div>}
          </div>
          {stage && stageControls && (
            <StageControls
              title={song?.meta.title ?? currentEntry?.title ?? (current?.kind === 'note' ? 'Note' : '')}
              page={page}
              pageCount={pageCount}
              set={playingSet}
              index={playing?.index ?? 0}
              titleOf={titleOf}
              transpose={current?.kind !== 'note' && !isPdf && song ? song.totalTranspose : null}
              keyName={song?.meta.key}
              fontScale={canZoom ? device.fontScale : null}
              onFontScale={(d) => setFontScale(d === 'reset' ? 1 : device.fontScale + d)}
              onTranspose={(d) => setExtraTranspose((t) => (d === 'reset' ? 0 : t + d))}
              onPlay={(i) => playingSet && playItem(playingSet, i, 'first')}
              onClose={() => setStageControls(false)}
              onExit={leaveStage}
            />
          )}
        </div>
      </main>
    </div>
  );
}
