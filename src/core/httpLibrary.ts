/**
 * Bibliothèque servie par le serveur de développement (plugin Vite
 * « devLibrary »). Sert aux tests sans boîte de dialogue de sélection de
 * dossier ; absente des versions de production.
 */
import type { LibraryFS } from './library';

const BASE = '/__library';

export class HttpLibrary implements LibraryFS {
  constructor(readonly name: string) {}

  async list(): Promise<string[]> {
    const r = await fetch(`${BASE}/list`);
    if (!r.ok) throw new Error(`Liste impossible (${r.status})`);
    return r.json();
  }

  private url(path: string): string {
    return `${BASE}/file?path=${encodeURIComponent(path)}`;
  }

  async readText(path: string): Promise<string> {
    const r = await fetch(this.url(path));
    if (!r.ok) throw new Error(`Lecture impossible : ${path}`);
    return r.text();
  }

  async readBlob(path: string): Promise<Blob> {
    const r = await fetch(this.url(path));
    if (!r.ok) throw new Error(`Lecture impossible : ${path}`);
    return r.blob();
  }

  async writeText(path: string, text: string): Promise<void> {
    const r = await fetch(this.url(path), { method: 'PUT', body: text });
    if (!r.ok) throw new Error(`Écriture impossible : ${path}`);
  }

  async exists(path: string): Promise<boolean> {
    const r = await fetch(this.url(path), { method: 'HEAD' });
    return r.ok;
  }
}

/** Disponible seulement en développement, si le serveur expose une bibliothèque. */
export async function devLibraryInfo(): Promise<{ name: string } | null> {
  if (!import.meta.env.DEV) return null;
  try {
    const r = await fetch(`${BASE}/info`);
    return r.ok ? r.json() : null;
  } catch {
    return null;
  }
}
