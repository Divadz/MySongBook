/**
 * Réglages propres à un appareil (format de page, zoom du texte), dans
 * `.mysongbook/device-<nom>.json` : la bibliothèque est partagée entre la
 * tablette et le PC, mais chacun garde son zoom. Une copie dans le stockage du
 * navigateur sert tant qu'aucune bibliothèque n'est ouverte.
 */
import type { LibraryFS } from './library';
import { isNative, storageStatus } from './nativeLibrary';
import { defaultDeviceSettings, type DeviceSettings } from './settings';

const LOCAL_KEY = 'mysongbook.device';

/** Limites du zoom du texte (facteur d'échelle des polices). */
export const FONT_SCALE_MIN = 0.5;
export const FONT_SCALE_MAX = 3;
export const clampFontScale = (n: number) =>
  Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, Math.round(n * 20) / 20));

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
  for (const k of Object.keys(defaultDeviceSettings) as (keyof DeviceSettings)[]) {
    if (typeof d[k] !== 'number' || !Number.isFinite(d[k])) d[k] = defaultDeviceSettings[k];
  }
  d.fontScale = clampFontScale(d.fontScale);
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
