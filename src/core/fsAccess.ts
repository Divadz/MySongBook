/**
 * Bibliothèque sur le disque du PC via l'API File System Access (Chrome, Edge).
 * Le dossier choisi est mémorisé dans IndexedDB ; au lancement suivant, le
 * navigateur redemande l'autorisation d'accès par un clic.
 */
import type { LibraryFS } from './library';

// Types minimaux, absents de la bibliothèque DOM standard de TypeScript.
type PermissionMode = { mode: 'read' | 'readwrite' };
interface DirHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemDirectoryHandle | FileSystemFileHandle>;
  queryPermission(opts: PermissionMode): Promise<PermissionState>;
  requestPermission(opts: PermissionMode): Promise<PermissionState>;
}
declare global {
  interface Window {
    showDirectoryPicker?: (opts?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<FileSystemDirectoryHandle>;
  }
}

export const fsAccessSupported = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';

class FsAccessLibrary implements LibraryFS {
  constructor(private readonly root: DirHandle) {}

  get name(): string {
    return this.root.name;
  }

  async list(): Promise<string[]> {
    const out: string[] = [];
    const walk = async (dir: DirHandle, prefix: string) => {
      for await (const entry of dir.values()) {
        if (entry.kind === 'directory') await walk(entry as DirHandle, `${prefix}${entry.name}/`);
        else out.push(`${prefix}${entry.name}`);
      }
    };
    await walk(this.root, '');
    return out;
  }

  private async dir(parts: string[], create: boolean): Promise<FileSystemDirectoryHandle> {
    let dir: FileSystemDirectoryHandle = this.root;
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
    return dir;
  }

  private async file(path: string, create: boolean): Promise<FileSystemFileHandle> {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`Chemin invalide : ${path}`);
    const dir = await this.dir(parts, create);
    return dir.getFileHandle(name, { create });
  }

  async readText(path: string): Promise<string> {
    return (await (await this.file(path, false)).getFile()).text();
  }

  async readBlob(path: string): Promise<Blob> {
    return (await this.file(path, false)).getFile();
  }

  async writeText(path: string, text: string): Promise<void> {
    const handle = await this.file(path, true);
    const w = await handle.createWritable();
    await w.write(text);
    await w.close();
  }

  async remove(path: string): Promise<void> {
    const parts = path.split('/').filter(Boolean);
    const name = parts.pop();
    if (!name) throw new Error(`Chemin invalide : ${path}`);
    await (await this.dir(parts, false)).removeEntry(name);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.file(path, false);
      return true;
    } catch {
      return false;
    }
  }
}

// --- Mémorisation du dossier dans IndexedDB ---------------------------------

const DB = 'mysongbook';
const STORE = 'handles';
const KEY = 'library';

function idb<T>(fn: (store: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}

/** Ouvre le sélecteur de dossier (nécessite un clic). */
export async function pickLibrary(): Promise<LibraryFS> {
  if (!window.showDirectoryPicker) throw new Error('Ce navigateur ne permet pas d’ouvrir un dossier (utiliser Chrome ou Edge).');
  const handle = (await window.showDirectoryPicker({ mode: 'readwrite', id: 'mysongbook' })) as DirHandle;
  await idb((s) => s.put(handle, KEY), 'readwrite');
  return new FsAccessLibrary(handle);
}

/** Dossier mémorisé lors d'une session précédente, et état de l'autorisation. */
export async function rememberedLibrary(): Promise<{ name: string; granted: boolean } | null> {
  if (!fsAccessSupported) return null;
  try {
    const handle = (await idb((s) => s.get(KEY), 'readonly')) as DirHandle | undefined;
    if (!handle) return null;
    const state = await handle.queryPermission({ mode: 'readwrite' });
    return { name: handle.name, granted: state === 'granted' };
  } catch {
    return null;
  }
}

/** Rouvre le dossier mémorisé ; demande l'autorisation si besoin (nécessite un clic). */
export async function reopenLibrary(): Promise<LibraryFS | null> {
  const handle = (await idb((s) => s.get(KEY), 'readonly')) as DirHandle | undefined;
  if (!handle) return null;
  let state = await handle.queryPermission({ mode: 'readwrite' });
  if (state !== 'granted') state = await handle.requestPermission({ mode: 'readwrite' });
  return state === 'granted' ? new FsAccessLibrary(handle) : null;
}
