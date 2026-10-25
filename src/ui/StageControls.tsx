/**
 * Commandes du mode scène, affichées par un tap au centre de la page.
 * Pensées pour l'e-ink : grands boutons, noir sur blanc, aucune animation.
 * Un tap hors du panneau le referme.
 */
import type { Setlist } from '../core/setlist';

interface Props {
  title: string;
  page: number;
  pageCount: number;
  set?: Setlist;
  index: number;
  titleOf: (item: Setlist['items'][number]) => string;
  /** Transposition affichée, ou null si le morceau ne se transpose pas (PDF, note). */
  transpose: number | null;
  keyName?: string;
  onTranspose: (delta: number | 'reset') => void;
  /** Zoom (taille du texte ou recadrage d'un PDF), ou null si sans objet (note). */
  zoom: { label: string; onStep: (dir: 1 | -1) => void; onReset?: () => void } | null;
  onPlay: (index: number) => void;
  onClose: () => void;
  onExit: () => void;
}

export function StageControls(p: Props) {
  const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
  return (
    <div className="stage-backdrop" onClick={p.onClose}>
      <div className="stage-panel" onClick={(e) => e.stopPropagation()}>
        <div className="stage-head">
          <div>
            <div className="stage-title">{p.title}</div>
            <div className="stage-sub">
              Page {Math.min(p.page + 1, p.pageCount)} / {p.pageCount}
              {p.set && ` · ${p.set.title} · ${p.index + 1}/${p.set.items.length}`}
            </div>
          </div>
          <button className="stage-button" onClick={p.onClose}>
            Fermer
          </button>
        </div>

        {p.transpose !== null && (
          <div className="stage-row">
            <span className="stage-label">Tonalité {p.keyName ?? '?'}</span>
            <button className="stage-button" onClick={() => p.onTranspose(-1)} aria-label="Un demi-ton plus bas">
              ♭
            </button>
            <button className="stage-button" onClick={() => p.onTranspose('reset')} title="Revenir à la transposition du fichier">
              {signed(p.transpose)}
            </button>
            <button className="stage-button" onClick={() => p.onTranspose(1)} aria-label="Un demi-ton plus haut">
              ♯
            </button>
          </div>
        )}

        {p.zoom && (
          <div className="stage-row">
            <span className="stage-label">{p.zoom.label}</span>
            <button className="stage-button" onClick={() => p.zoom?.onStep(-1)} aria-label="Dézoomer">
              −
            </button>
            {p.zoom.onReset && (
              <button className="stage-button" onClick={p.zoom.onReset} title="Revenir à 100 %">
                100 %
              </button>
            )}
            <button className="stage-button" onClick={() => p.zoom?.onStep(1)} aria-label="Zoomer">
              +
            </button>
          </div>
        )}

        {p.set && (
          <ol className="stage-set">
            {p.set.items.map((item, i) => (
              <li key={i}>
                <button className={i === p.index ? 'stage-item current' : 'stage-item'} onClick={() => p.onPlay(i)}>
                  <span className="stage-num">{i + 1}</span>
                  {p.titleOf(item)}
                </button>
              </li>
            ))}
          </ol>
        )}

        <div className="stage-row end">
          <button className="stage-button primary" onClick={p.onExit}>
            Quitter la scène
          </button>
        </div>
      </div>
    </div>
  );
}
