import { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LibraryFS } from '../core/library';
import { InkStrokes } from './InkStrokes';
import type { Stroke } from '../core/ink';
import type { DeviceSettings } from '../core/settings';
import { FULL_PAGE, normalizeCrop, type Crop } from '../core/pdfMeta';
import './render.css';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

const MM_TO_PX = 96 / 25.4;

export type CropScope = 'page' | 'all';

interface Props {
  library: LibraryFS;
  path: string;
  /** Recadrage de la page affichée (fichier .pdf.json). */
  crop: Crop | undefined;
  device: DeviceSettings;
  /** Échelle d'affichage de la page, pour rendre le PDF à la bonne résolution. */
  scale: number;
  /** Page affichée (index 0). */
  page: number;
  onPageCount: (n: number) => void;
  /** Mode recadrage : page entière affichée, cadre déplaçable. */
  cropping: boolean;
  /** Fin du recadrage : nouveau cadre et sa portée, ou null pour annuler. */
  onCropDone: (crop: Crop | null, scope: CropScope) => void;
  /** Annotations de la page affichée (points en fractions de la page entière). */
  ink?: Stroke[];
}

/** Rend une zone de page PDF dans un canevas hors écran (pas de page à moitié dessinée sur l'e-ink). */
async function renderRegion(page: PDFPageProxy, crop: Crop, pxPerUnit: number) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: pxPerUnit });
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(base.width * crop.width * pxPerUnit));
  canvas.height = Math.max(1, Math.round(base.height * crop.height * pxPerUnit));
  const task = page.render({
    canvas,
    viewport,
    transform: [1, 0, 0, 1, -crop.left * viewport.width, -crop.top * viewport.height],
  });
  return { canvas, task };
}

/** Recadrage automatique : rectangle qui contient tout ce qui n'est pas blanc sur les pages données (1 = première). */
async function autoCrop(doc: PDFDocumentProxy, pages: number[]): Promise<Crop> {
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0;
  for (const n of pages) {
    const page = await doc.getPage(n);
    const { canvas, task } = await renderRegion(page, FULL_PAGE, 0.6);
    await task.promise;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;
    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        // Pixel « encré » : sombre et opaque (le fond transparent compte comme blanc).
        if (data[i + 3] > 128 && Math.min(data[i], data[i + 1], data[i + 2]) < 200) {
          if (x / width < x0) x0 = x / width;
          if (x / width > x1) x1 = x / width;
          if (y / height < y0) y0 = y / height;
          if (y / height > y1) y1 = y / height;
        }
      }
    }
  }
  if (x1 <= x0 || y1 <= y0) return FULL_PAGE;
  const m = 0.01;
  return normalizeCrop({ left: x0 - m, top: y0 - m, width: x1 - x0 + 2 * m, height: y1 - y0 + 2 * m });
}

type Drag = { mode: 'move' | 'nw' | 'ne' | 'sw' | 'se'; x: number; y: number; start: Crop };

export function PdfView({ library, path, crop, device, scale, page, onPageCount, cropping, onCropDone, ink = [] }: Props) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [draft, setDraft] = useState<Crop>(FULL_PAGE);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<CropScope>('page');
  const drag = useRef<Drag | null>(null);

  // Chargement du document
  useEffect(() => {
    let alive = true;
    let loading: ReturnType<typeof pdfjs.getDocument> | null = null;
    setDoc(null);
    setError(null);
    setSize(null);
    library
      .readBlob(path)
      .then((b) => b.arrayBuffer())
      .then((buf) => {
        if (!alive) return null;
        loading = pdfjs.getDocument({ data: new Uint8Array(buf) });
        return loading.promise;
      })
      .then((d) => {
        if (!alive || !d) return;
        setDoc(d);
        onPageCount(d.numPages);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
      void loading?.destroy();
    };
  }, [library, path, onPageCount]);

  useEffect(() => {
    if (cropping) setDraft(normalizeCrop(crop));
  }, [cropping, crop]);

  // Rendu de la page : la zone recadrée occupe au mieux la page de l'appareil.
  const shown = cropping ? FULL_PAGE : normalizeCrop(crop);
  const boxW = device.pageWidth * MM_TO_PX;
  const boxH = device.pageHeight * MM_TO_PX;
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    let task: { cancel: () => void } | null = null;
    (async () => {
      const p = await doc.getPage(Math.min(page + 1, doc.numPages));
      const base = p.getViewport({ scale: 1 });
      const k = Math.min(boxW / (base.width * shown.width), boxH / (base.height * shown.height));
      const r = await renderRegion(p, shown, k * scale * (window.devicePixelRatio || 1));
      task = r.task;
      await r.task.promise;
      const visible = canvasRef.current;
      if (!alive || !visible) return;
      visible.width = r.canvas.width;
      visible.height = r.canvas.height;
      visible.getContext('2d')?.drawImage(r.canvas, 0, 0);
      setSize({ w: base.width * shown.width * k, h: base.height * shown.height * k });
    })().catch((e: Error) => {
      if (alive && e?.name !== 'RenderingCancelledException') setError(e.message);
    });
    return () => {
      alive = false;
      task?.cancel();
    };
  }, [doc, page, scale, boxW, boxH, shown.top, shown.left, shown.width, shown.height]);

  // Déplacement et redimensionnement du cadre
  const startDrag = (mode: Drag['mode']) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { mode, x: e.clientX, y: e.clientY, start: draft };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const moveDrag = (e: React.PointerEvent) => {
    const d = drag.current;
    const frame = frameRef.current?.getBoundingClientRect();
    if (!d || !frame) return;
    const dx = (e.clientX - d.x) / frame.width;
    const dy = (e.clientY - d.y) / frame.height;
    const s = d.start;
    let { left, top } = s;
    let right = s.left + s.width;
    let bottom = s.top + s.height;
    if (d.mode === 'move') {
      left = Math.min(Math.max(0, s.left + dx), 1 - s.width);
      top = Math.min(Math.max(0, s.top + dy), 1 - s.height);
      right = left + s.width;
      bottom = top + s.height;
    } else {
      const min = 0.05;
      if (d.mode === 'nw' || d.mode === 'sw') left = Math.min(Math.max(0, s.left + dx), right - min);
      if (d.mode === 'ne' || d.mode === 'se') right = Math.max(Math.min(1, right + dx), left + min);
      if (d.mode === 'nw' || d.mode === 'ne') top = Math.min(Math.max(0, s.top + dy), bottom - min);
      if (d.mode === 'sw' || d.mode === 'se') bottom = Math.max(Math.min(1, bottom + dy), top + min);
    }
    setDraft({ left, top, width: right - left, height: bottom - top });
  };
  const endDrag = () => {
    drag.current = null;
  };

  const runAutoCrop = async () => {
    if (!doc) return;
    setBusy(true);
    try {
      const pages = scope === 'page' ? [Math.min(page + 1, doc.numPages)] : Array.from({ length: Math.min(doc.numPages, 8) }, (_, i) => i + 1);
      setDraft(await autoCrop(doc, pages));
    } finally {
      setBusy(false);
    }
  };

  const pct = (n: number) => `${n * 100}%`;

  return (
    <div className="page pdf-page" style={{ width: `${device.pageWidth}mm`, height: `${device.pageHeight}mm` }}>
      {error && <div className="pdf-message">PDF illisible : {error}</div>}
      {!error && !size && <div className="pdf-message">Chargement…</div>}
      <div
        className="pdf-frame"
        ref={frameRef}
        style={size ? { width: size.w, height: size.h } : { visibility: 'hidden' }}
        onPointerMove={cropping ? moveDrag : undefined}
        onPointerUp={cropping ? endDrag : undefined}
        onPointerCancel={cropping ? endDrag : undefined}
      >
        <canvas ref={canvasRef} className="pdf-canvas" />
        {size && !cropping && (
          // Page entière → zone recadrée affichée, en pixels du cadre.
          <InkStrokes
            strokes={ink}
            map={([x, y]) => [((x - shown.left) / shown.width) * size.w, ((y - shown.top) / shown.height) * size.h]}
            width={(s) => (s.width / shown.width) * size.w}
          />
        )}
        {cropping && size && (
          <div
            className="crop-box"
            style={{ left: pct(draft.left), top: pct(draft.top), width: pct(draft.width), height: pct(draft.height) }}
            onPointerDown={startDrag('move')}
            onClick={(e) => e.stopPropagation()}
          >
            {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
              <span key={h} className={`crop-handle ${h}`} onPointerDown={startDrag(h)} />
            ))}
          </div>
        )}
      </div>
      {cropping && (
        // Barre à taille d'écran constante, malgré la mise à l'échelle de la page.
        <div
          className="crop-bar"
          style={{
            transform: `translateX(-50%) scale(${1 / scale})`,
            transformOrigin: 'top center',
            maxWidth: `${device.pageWidth * scale - 8}mm`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="crop-scope">
            <button className={scope === 'page' ? 'on' : ''} onClick={() => setScope('page')}>
              Cette page
            </button>
            <button className={scope === 'all' ? 'on' : ''} onClick={() => setScope('all')} title="Remplace aussi les recadrages propres à certaines pages">
              Toutes les pages
            </button>
          </span>
          <button onClick={runAutoCrop} disabled={busy || !doc}>
            {busy ? 'Analyse…' : 'Automatique'}
          </button>
          <button onClick={() => setDraft(FULL_PAGE)}>Page entière</button>
          <button className="primary" onClick={() => onCropDone(draft, scope)}>
            Enregistrer
          </button>
          <button onClick={() => onCropDone(null, scope)}>Annuler</button>
        </div>
      )}
    </div>
  );
}
