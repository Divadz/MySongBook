/**
 * Bibliothèque dans un dossier de la tablette Android (APK Capacitor). L'outil
 * de synchro (Autosync for Google Drive) miroite le dossier Drive dans le
 * stockage partagé ; l'appli le lit et l'écrit directement, avec l'autorisation
 * « accès à tous les fichiers » (plugin natif StorageAccess).
 *
 * Les lectures passent par le serveur local de la WebView (convertFileSrc) :
 * plus rapide que le base64 du plugin Filesystem, surtout pour les PDF.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { LibraryFS } from './library';

interface StorageAccessPlugin {
  status(): Promise<{ granted: boolean; root: string }>;
  request(): Promise<void>;
}
const StorageAccess = registerPlugin<StorageAccessPlugin>('StorageAccess');

export const isNative = Capacitor.isNativePlatform();

/** Dossier proposé par défaut, relatif à la racine du stockage partagé. */
export const DEFAULT_FOLDER = 'MySongBook';
const KEY = 'mysongbook.nativeFolder';

export const storageStatus = () => StorageAccess.status();
export const requestStorage = () => StorageAccess.request();

export function rememberedFolder(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT_FOLDER;
  } catch {
    return DEFAULT_FOLDER;
  }
}

const clean = (p: string) => p.split('/').filter(Boolean).join('/');

const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

class NativeLibrary implements LibraryFS {
  readonly name: string;

  /** @param folder dossier relatif à la racine du stockage partagé (« MySongBook », « Drive/Musique »). */
  constructor(private readonly folder: string) {
    this.name = folder.split('/').pop() || folder;
  }

  private opts(path: string) {
    return { directory: Directory.ExternalStorage, path: clean(`${this.folder}/${path}`) };
  }

  private async url(path: string): Promise<string> {
    const { uri } = await Filesystem.getUri(this.opts(path));
    // Les noms de fichiers ont des espaces, des accents, des apostrophes. getUri rend une URI
    // déjà encodée ou non selon les caractères : on décode puis on réencode chaque segment.
    const encoded = uri
      .replace(/^file:\/\//, '')
      .split('/')
      .map((part) => encodeURIComponent(safeDecode(part)))
      .join('/');
    return `${Capacitor.convertFileSrc(`file://${encoded}`)}?t=${Date.now()}`;
  }

  /** Échoue si le dossier n'existe pas. */
  async check(): Promise<void> {
    await Filesystem.readdir(this.opts(''));
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (rel: string) => {
      const { files } = await Filesystem.readdir(this.opts(rel));
      for (const f of files) {
        const path = rel ? `${rel}/${f.name}` : f.name;
        if (f.type === 'directory') await walk(path);
        else out.push(path);
      }
    };
    await walk('');
    return out;
  }

  async readText(path: string): Promise<string> {
    const r = await fetch(await this.url(path));
    if (!r.ok) throw new Error(`Lecture impossible : ${path}`);
    return r.text();
  }

  async readBlob(path: string): Promise<Blob> {
    const r = await fetch(await this.url(path));
    if (!r.ok) throw new Error(`Lecture impossible : ${path}`);
    return r.blob();
  }

  async writeText(path: string, text: string): Promise<void> {
    await Filesystem.writeFile({ ...this.opts(path), data: text, encoding: Encoding.UTF8, recursive: true });
  }

  async remove(path: string): Promise<void> {
    await Filesystem.deleteFile(this.opts(path));
  }

  async exists(path: string): Promise<boolean> {
    try {
      await Filesystem.stat(this.opts(path));
      return true;
    } catch {
      return false;
    }
  }
}

/** Ouvre le dossier s'il existe et que l'accès est accordé ; mémorise le choix. */
export async function openNativeLibrary(folder: string): Promise<LibraryFS> {
  const { granted } = await storageStatus();
  if (!granted) throw new Error('Accès aux fichiers non accordé.');
  const f = clean(folder);
  const lib = new NativeLibrary(f);
  try {
    await lib.check();
  } catch {
    throw new Error(`Dossier introuvable : ${f}`);
  }
  try {
    localStorage.setItem(KEY, f);
  } catch {
    /* mémorisation facultative */
  }
  return lib;
}
