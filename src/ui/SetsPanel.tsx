import { useMemo, useRef, useState } from 'react';
import { SONGS_DIR, normalizeText, type SongEntry } from '../core/library';
import type { SetItem, Setlist } from '../core/setlist';

interface Props {
  sets: Setlist[];
  entries: SongEntry[];
  /** Set affiché dans le panneau. */
  openFile: string | null;
  onOpen: (file: string | null) => void;
  /** Élément en cours de jeu (set + index), pour le surligner. */
  playing: { file: string; index: number } | null;
  onCreate: (title: string, date?: string) => void;
  onChange: (set: Setlist) => void;
  onDuplicate: (set: Setlist) => void;
  onDelete: (set: Setlist) => void;
  onPlay: (set: Setlist, index: number) => void;
}

function formatDate(d?: string): string {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : d;
}

export function SetsPanel(props: Props) {
  const { sets, openFile } = props;
  const open = sets.find((s) => s.file === openFile);
  return open ? <SetView {...props} set={open} /> : <SetList {...props} />;
}

// --- Liste des sets ----------------------------------------------------------

function SetList({ sets, onOpen, onCreate, onChange }: Props) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const submit = () => {
    if (!title.trim()) return;
    onCreate(title.trim(), date || undefined);
    setCreating(false);
    setTitle('');
    setDate('');
  };
  return (
    <div className="sets">
      <div className="sets-tools">
        <span>
          {sets.length} set{sets.length > 1 ? 's' : ''}
        </span>
        <span className="spacer" />
        <button className="lib-icon" onClick={() => setCreating((c) => !c)} title="Nouveau set">
          +
        </button>
      </div>
      {creating && (
        <div className="lib-new">
          <input
            autoFocus
            placeholder="Nom du set"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <button onClick={submit} disabled={!title.trim()}>
            Créer
          </button>
        </div>
      )}
      <ul className="set-list">
        {sets.map((s) => (
          <li key={s.file} onClick={() => onOpen(s.file)}>
            <span className="set-main">
              <span className="lib-title">{s.title}</span>
              <span className="lib-sub">
                {[formatDate(s.date), `${s.items.filter((i) => i.kind === 'song').length} morceaux`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <button
              className={s.pinned ? 'pin on' : 'pin'}
              title={s.pinned ? 'Désépingler' : 'Épingler en tête de liste'}
              onClick={(e) => {
                e.stopPropagation();
                onChange({ ...s, pinned: !s.pinned });
              }}
            >
              📌
            </button>
          </li>
        ))}
        {sets.length === 0 && <li className="lib-empty">Aucun set. Le bouton + en crée un.</li>}
      </ul>
    </div>
  );
}

// --- Un set ------------------------------------------------------------------

function SetView({ set, entries, onOpen, onChange, onDuplicate, onDelete, onPlay, playing }: Props & { set: Setlist }) {
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [editingHead, setEditingHead] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ index: number; text: string } | null>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);

  const byPath = useMemo(() => new Map(entries.map((e) => [e.path.slice(SONGS_DIR.length), e])), [entries]);

  const update = (items: SetItem[]) => onChange({ ...set, items });

  const candidates = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    return entries
      .filter((e) => words.every((w) => e.searchText.includes(w)))
      .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
      .slice(0, 50);
  }, [entries, query]);

  const addSong = (e: SongEntry) => update([...set.items, { kind: 'song', path: e.path.slice(SONGS_DIR.length) }]);

  const saveNote = () => {
    if (!noteDraft) return;
    const text = noteDraft.text.replace(/\s+$/, '');
    const items = [...set.items];
    if (noteDraft.index < 0) {
      if (text) items.push({ kind: 'note', text });
    } else if (text) items[noteDraft.index] = { kind: 'note', text };
    else items.splice(noteDraft.index, 1);
    update(items);
    setNoteDraft(null);
  };

  // Réordonnancement par la poignée, souris et tactile.
  const startDrag = (index: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDrag({ from: index, to: index });
  };
  const moveDrag = (e: React.PointerEvent) => {
    if (!drag || !listRef.current) return;
    const rows = Array.from(listRef.current.querySelectorAll<HTMLElement>('li.set-item'));
    let to = rows.length - 1;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i].getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        to = i;
        break;
      }
    }
    if (to !== drag.to) setDrag({ ...drag, to });
  };
  const endDrag = () => {
    if (drag && drag.from !== drag.to) {
      const items = [...set.items];
      const [moved] = items.splice(drag.from, 1);
      items.splice(drag.to, 0, moved);
      update(items);
    }
    setDrag(null);
  };

  // Ordre affiché pendant le glissement.
  const order = set.items.map((_, i) => i);
  if (drag && drag.from !== drag.to) {
    const [m] = order.splice(drag.from, 1);
    order.splice(drag.to, 0, m);
  }
  let songNumber = 0;

  return (
    <div className="sets">
      <div className="set-head">
        <button className="lib-icon" onClick={() => onOpen(null)} title="Retour à la liste des sets">
          ‹
        </button>
        {editingHead ? (
          <div className="set-edit-head">
            <input
              autoFocus
              defaultValue={set.title}
              onBlur={(e) => e.target.value.trim() && onChange({ ...set, title: e.target.value.trim() })}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <input type="date" defaultValue={set.date ?? ''} onChange={(e) => onChange({ ...set, date: e.target.value || undefined })} />
            <button onClick={() => setEditingHead(false)}>OK</button>
          </div>
        ) : (
          <button className="set-title" onClick={() => setEditingHead(true)} title="Modifier le nom et la date">
            <span className="lib-title">{set.title}</span>
            {set.date && <span className="lib-sub">{formatDate(set.date)}</span>}
          </button>
        )}
        <button
          className={set.pinned ? 'lib-icon pinned' : 'lib-icon'}
          title={set.pinned ? 'Désépingler' : 'Épingler en tête de liste'}
          onClick={() => onChange({ ...set, pinned: !set.pinned })}
        >
          📌
        </button>
        <button className="lib-icon" title="Dupliquer le set" onClick={() => onDuplicate(set)}>
          ⧉
        </button>
        <button className="lib-icon" title="Supprimer le set" onClick={() => setConfirmDelete(true)}>
          🗑
        </button>
      </div>

      <div className="set-actions">
        <button className="primary" onClick={() => onPlay(set, 0)} disabled={set.items.length === 0}>
          ▶ Jouer
        </button>
        <button onClick={() => setAdding((a) => !a)} className={adding ? 'on' : ''}>
          + Morceaux
        </button>
        <button onClick={() => setNoteDraft({ index: -1, text: '' })}>+ Note</button>
      </div>

      {confirmDelete && (
        <div className="set-confirm">
          Supprimer « {set.title} » ? Les morceaux restent dans la bibliothèque.
          <span>
            <button className="danger" onClick={() => onDelete(set)}>
              Supprimer
            </button>
            <button onClick={() => setConfirmDelete(false)}>Annuler</button>
          </span>
        </div>
      )}

      {noteDraft && (
        <div className="set-note-edit">
          <textarea
            autoFocus
            rows={3}
            placeholder="Texte de la note (la première ligne sert de titre)"
            value={noteDraft.text}
            onChange={(e) => setNoteDraft({ ...noteDraft, text: e.target.value })}
          />
          <span>
            <button onClick={saveNote}>{noteDraft.index < 0 ? 'Ajouter' : 'Enregistrer'}</button>
            <button onClick={() => setNoteDraft(null)}>Annuler</button>
          </span>
        </div>
      )}

      {adding && (
        <div className="set-add">
          <input autoFocus type="search" placeholder="Chercher un morceau à ajouter…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <ul>
            {candidates.map((e) => (
              <li key={e.path} onClick={() => addSong(e)} title="Ajouter à la fin du set">
                <span className="lib-title">+ {e.title}</span>
                <span className="lib-sub">{[e.folder, e.artist, e.key].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul className="set-items" ref={listRef} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}>
        {order.map((i) => {
          const item = set.items[i];
          const isPlaying = playing?.file === set.file && playing.index === i;
          const dragging = drag?.from === i;
          const entry = item.kind === 'song' ? byPath.get(item.path) : undefined;
          if (item.kind === 'song') songNumber++;
          return (
            <li key={i} className={`set-item ${item.kind} ${isPlaying ? 'active' : ''} ${dragging ? 'dragging' : ''}`}>
              <span className="handle" onPointerDown={startDrag(i)} title="Glisser pour déplacer">
                ⠿
              </span>
              <span className="set-item-main" onClick={() => onPlay(set, i)}>
                {item.kind === 'song' ? (
                  <>
                    <span className="lib-title">
                      <span className="num">{songNumber}.</span> {entry?.title ?? `⚠ ${item.path}`}
                    </span>
                    <span className="lib-sub">{entry ? [entry.artist, entry.key].filter(Boolean).join(' · ') : 'Morceau introuvable'}</span>
                  </>
                ) : (
                  <span className="note-text">✎ {item.text.split('\n')[0]}</span>
                )}
              </span>
              {item.kind === 'note' && (
                <button className="item-btn" title="Modifier la note" onClick={() => setNoteDraft({ index: i, text: item.text })}>
                  ✎
                </button>
              )}
              <button className="item-btn" title="Retirer du set" onClick={() => update(set.items.filter((_, k) => k !== i))}>
                ×
              </button>
            </li>
          );
        })}
        {set.items.length === 0 && <li className="lib-empty">Set vide : « + Morceaux » pour en ajouter.</li>}
      </ul>
    </div>
  );
}
