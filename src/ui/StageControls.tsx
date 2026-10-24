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
  /** Zoom du texte de cet appareil, ou null si sans objet (PDF, note). */
  fontScale: number | null;
  onFontScale: (delta: number | 'reset') => void;
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

        {p.fontScale !== null && (
          <div className="stage-row">
            <span className="stage-label">Taille du texte</span>
            <button className="stage-button" onClick={() => p.onFontScale(-0.1)} aria-label="Texte plus petit">
              −
            </button>
            <button className="stage-button" onClick={() => p.onFontScale('reset')} title="Revenir à 100 %">
              {Math.round(p.fontScale * 100)} %
            </button>
            <button className="stage-button" onClick={() => p.onFontScale(0.1)} aria-label="Texte plus grand">
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
