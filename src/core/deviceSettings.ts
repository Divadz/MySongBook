/**
 * Réglages propres à un appareil (format de page, zoom du texte), dans
 * `.mysongbook/device-<nom>.json` : la bibliothèque est partagée entre la
 * tablette et le PC, mais chacun garde son zoom. Une copie dans le stockage du
 * navigateur sert tant qu'aucune bibliothèque n'est ouverte.
 */
import { basename, type LibraryFS } from './library';
import { isNative, storageStatus } from './nativeLibrary';
import { defaultDeviceSettings, type DeviceSettings } from './settings';

const LOCAL_KEY = 'mysongbook.device';

/** Limites du zoom du texte (facteur d'échelle des polices). */
export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 3;
export const clampFontScale = (n: number) =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(n * 20) / 20));

/**
 * Zoom propre à un morceau : multiplicateur de la taille de l'appareil (comme
 * le zoom par morceau de SongbookPro). Changer la taille de l'appareil fait
 * donc suivre tous les morceaux, zoomés ou non.
 */
export const ZOOM_FACTOR_MIN = 0.2;
export const ZOOM_FACTOR_MAX = 6;
export const clampZoomFactor = (n: number) => Math.min(ZOOM_FACTOR_MAX, Math.max(ZOOM_FACTOR_MIN, Math.round(n * 1000) / 1000));

/** Taille du texte d'un morceau : taille de l'appareil × zoom du morceau. */
export const songFontScale = (device: DeviceSettings, key: string) =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, device.fontScale * (device.songZoom[key] ?? 1)));

/** Zoom à enregistrer pour obtenir une taille donnée ; null : celle de l'appareil (pas d'entrée). */
export function zoomFactorFor(device: DeviceSettings, fontScale: number): number | null {
  const factor = clampZoomFactor(clampFontScale(fontScale) / device.fontScale);
  return Math.abs(factor - 1) < 0.005 ? null : factor;
}

const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\.[^.]*$/, '')
    .replace(/[^a-z0-9]+/g, '');

/**
 * Morceau renommé ou déplacé hors de l'appli (explorateur, Drive) : son zoom,
 * enregistré sous l'ancien chemin, est rattaché au nouveau quand un seul
 * morceau sans zoom correspond : même nom de fichier dans un autre dossier,
 * sinon titre égal à l'ancien nom de fichier. Les entrées sans correspondance
 * sûre sont gardées telles quelles (le fichier peut revenir, synchro en cours).
 * Rend null si rien ne change.
 */
export function relinkSongZoom(
  songZoom: Record<string, number>,
  entries: { path: string; title: string }[],
): Record<string, number> | null {
  if (entries.length === 0) return null;
  const paths = new Set(entries.map((e) => e.path));
  const next = { ...songZoom };
  let changed = false;
  for (const [key, factor] of Object.entries(songZoom)) {
    if (paths.has(key) || /^\w+:/.test(key)) continue; // présent, ou échantillon (« sample:… »)
    const free = entries.filter((e) => !(e.path in next));
    const name = basename(key);
    let match = free.filter((e) => basename(e.path) === name);
    if (match.length !== 1) {
      const wanted = normalizeName(name);
      match = wanted ? free.filter((e) => normalizeName(e.title) === wanted) : [];
    }
    if (match.length !== 1) continue;
    delete next[key];
    next[match[0].path] = factor;
    changed = true;
  }
  return changed ? next : null;
}

/** Nom de fichier de l'appareil : modèle Android (« MaxLumi2 ») ou « pc ». */
export async function deviceName(): Promise<string> {
  let name = 'pc';
  if (isNative) {
    try {
      name = (await storageStatus()).model || 'android';
    } catch {
      name = 'android';
    }
  }
  return name.replace(/[^\w-]+/g, '-').toLowerCase();
}

export const deviceSettingsPath = (name: string) => `.mysongbook/device-${name}.json`;

export function mergeDeviceSettings(saved: Partial<DeviceSettings> | null | undefined): DeviceSettings {
  const d = { ...defaultDeviceSettings, ...(saved && typeof saved === 'object' ? saved : {}) };
  const num = (n: unknown, fallback: number) => (typeof n === 'number' && Number.isFinite(n) ? n : fallback);
  d.pageWidth = num(d.pageWidth, defaultDeviceSettings.pageWidth);
  d.pageHeight = num(d.pageHeight, defaultDeviceSettings.pageHeight);
  d.margin = num(d.margin, defaultDeviceSettings.margin);
  d.fontScale = clampFontScale(num(d.fontScale, 1));
  const zoom: Record<string, number> = {};
  if (d.songZoom && typeof d.songZoom === 'object') {
    for (const [path, v] of Object.entries(d.songZoom)) if (typeof v === 'number' && Number.isFinite(v) && v > 0) zoom[path] = clampZoomFactor(v);
  }
  d.songZoom = zoom;
  return d;
}

export function loadLocalDeviceSettings(): DeviceSettings {
  try {
    return mergeDeviceSettings(JSON.parse(localStorage.getItem(LOCAL_KEY) ?? 'null'));
  } catch {
    return defaultDeviceSettings;
  }
}

export async function loadDeviceSettings(lib: LibraryFS, name: string): Promise<DeviceSettings | null> {
  const path = deviceSettingsPath(name);
  try {
    return (await lib.exists(path)) ? mergeDeviceSettings(JSON.parse(await lib.readText(path))) : null;
  } catch {
    return null;
  }
}

export async function saveDeviceSettings(lib: LibraryFS | null, name: string, s: DeviceSettings): Promise<void> {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
  } catch {
    /* copie locale facultative */
  }
  if (lib) await lib.writeText(deviceSettingsPath(name), `${JSON.stringify(s, null, 2)}\n`);
}
