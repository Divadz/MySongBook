/**
 * Mode scène : plein écran, et sur la tablette touches de volume et bouton
 * retour pris par l'appli (plugin natif Stage). Sur PC, plein écran du
 * navigateur ; les flèches et Échap passent par le clavier habituel.
 */
import { registerPlugin } from '@capacitor/core';
import { isNative } from './nativeLibrary';

export type StageKey = 'volumeDown' | 'volumeUp' | 'back';

interface StagePlugin {
  setActive(opts: { active: boolean }): Promise<void>;
  addListener(event: 'key', fn: (e: { key: StageKey }) => void): Promise<{ remove: () => Promise<void> }>;
}
const Stage = registerPlugin<StagePlugin>('Stage');

export async function setStageActive(active: boolean): Promise<void> {
  if (isNative) return Stage.setActive({ active });
  try {
    if (active && !document.fullscreenElement) await document.documentElement.requestFullscreen();
    if (!active && document.fullscreenElement) await document.exitFullscreen();
  } catch {
    /* plein écran refusé (pas de geste utilisateur) : le mode scène marche quand même */
  }
}

/** Touches de la tablette en mode scène ; renvoie la fonction de désabonnement. */
export function onStageKey(fn: (key: StageKey) => void): () => void {
  if (!isNative) return () => {};
  const handle = Stage.addListener('key', (e) => fn(e.key));
  return () => {
    handle.then((h) => h.remove());
  };
}
