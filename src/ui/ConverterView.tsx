import { useMemo, useState } from 'react';
import { convertChordsOverLyrics } from '../core/convert';

interface Props {
  /** Dossiers de songs/ ; vide si aucune bibliothèque n'est ouverte. */
  folders: string[];
  libraryOpen: boolean;
  /** Crée le morceau (bibliothèque) ou l'ouvre dans l'éditeur (sans bibliothèque). */
  onCreate: (folder: string, title: string, chordpro: string) => void;
  onClose: () => void;
}

/** Collage d'un texte « accords au-dessus des paroles » et conversion en ChordPro. */
export function ConverterView({ folders, libraryOpen, onCreate, onClose }: Props) {
  const [input, setInput] = useState('');
  const [title, setTitle] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const [folder, setFolder] = useState('');
  /** Texte de sortie retouché à la main : il n'est plus régénéré automatiquement. */
  const [edited, setEdited] = useState<string | null>(null);

  const guessed = useMemo(() => convertChordsOverLyrics(input).guessed, [input]);
  const effective = {
    title: title ?? guessed.title ?? '',
    artist: artist ?? guessed.artist ?? '',
    key: key ?? guessed.key ?? '',
  };
  const result = useMemo(
    () =>
      convertChordsOverLyrics(input, {
        title: effective.title || undefined,
        artist: effective.artist || undefined,
        key: effective.key || undefined,
      }),
    [input, effective.title, effective.artist, effective.key],
  );
  const output = edited ?? (input.trim() ? result.chordpro : '');
  const finalTitle = effective.title.trim() || 'Sans titre';

  return (
    <div className="converter">
      <div className="cv-head">
        <span className="cv-title">Convertir un texte « accords sur paroles »</span>
        <label>
          Titre
          <input value={effective.title} onChange={(e) => setTitle(e.target.value)} placeholder="Titre" />
        </label>
        <label>
          Artiste
          <input value={effective.artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artiste" />
        </label>
        <label className="cv-key">
          Tonalité
          <input value={effective.key} onChange={(e) => setKey(e.target.value)} placeholder="C" />
        </label>
        {libraryOpen && (
          <label>
            Dossier
            <select value={folder} onChange={(e) => setFolder(e.target.value)}>
              <option value="">(racine de songs/)</option>
              {folders.filter(Boolean).map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
        )}
        <span className="spacer" />
        <button className="primary" disabled={!output.trim()} onClick={() => onCreate(folder, finalTitle, output)}>
          {libraryOpen ? 'Créer le morceau' : 'Ouvrir dans l’éditeur'}
        </button>
        <button onClick={onClose}>Annuler</button>
      </div>
      <div className="cv-body">
        <div className="cv-pane">
          <div className="cv-label">Texte collé</div>
          <textarea
            autoFocus
            spellCheck={false}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={'Coller ici un morceau avec les accords au-dessus des paroles, par exemple :\n\n[Couplet]\n        Am            F\nLe matin se lève sur la ville'}
          />
        </div>
        <div className="cv-pane">
          <div className="cv-label">
            ChordPro obtenu
            {input.trim() && <span className="cv-stat"> · {result.mergedLines} ligne(s) d’accords placée(s) dans les paroles</span>}
            {edited !== null && (
              <button className="cv-regen" onClick={() => setEdited(null)} title="Abandonner les retouches et reconvertir">
                Reconvertir
              </button>
            )}
          </div>
          <textarea spellCheck={false} value={output} onChange={(e) => setEdited(e.target.value)} placeholder="Le résultat apparaît ici ; il reste modifiable." />
        </div>
      </div>
      <div className="cv-foot">
        Les accords sont placés à la colonne où ils se trouvent au-dessus des paroles. Vérifiez les placements après création : le
        morceau s’ouvre dans l’éditeur avec l’aperçu.
      </div>
    </div>
  );
}
