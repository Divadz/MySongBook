import { useMemo, useState } from 'react';
import { normalizeText, type SongEntry } from '../core/library';

interface Props {
  name: string;
  entries: SongEntry[];
  selected: string | null;
  onSelect: (path: string) => void;
  onCreate: (folder: string, title: string) => void;
  onRefresh: () => void;
  onClose: () => void;
}

type SortKey = 'title' | 'artist';

/** Liste des morceaux de la bibliothèque, par dossier, avec recherche. */
export function LibraryPanel({ name, entries, selected, onSelect, onCreate, onRefresh, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('title');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newFolder, setNewFolder] = useState('');

  const folders = useMemo(() => [...new Set(entries.map((e) => e.folder))].sort((a, b) => a.localeCompare(b, 'fr')), [entries]);

  const groups = useMemo(() => {
    const words = normalizeText(query).split(/\s+/).filter(Boolean);
    const match = (e: SongEntry) => words.every((w) => e.searchText.includes(w));
    const cmp = (a: SongEntry, b: SongEntry) =>
      sort === 'artist'
        ? (a.artist ?? '~').localeCompare(b.artist ?? '~', 'fr') || a.title.localeCompare(b.title, 'fr')
        : a.title.localeCompare(b.title, 'fr');
    const byFolder = new Map<string, SongEntry[]>();
    for (const e of entries.filter(match)) {
      const list = byFolder.get(e.folder) ?? [];
      list.push(e);
      byFolder.set(e.folder, list);
    }
    return [...byFolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'fr'))
      .map(([folder, list]) => ({ folder, list: list.sort(cmp) }));
  }, [entries, query, sort]);

  const searching = query.trim() !== '';
  const count = groups.reduce((n, g) => n + g.list.length, 0);

  const toggle = (folder: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });

  const submitNew = () => {
    const title = newTitle.trim();
    if (!title) return;
    onCreate(newFolder, title);
    setCreating(false);
    setNewTitle('');
  };

  return (
    <div className="library">
      <div className="lib-head">
        <span className="lib-name" title={name}>
          {name}
        </span>
        <button className="lib-icon" onClick={onRefresh} title="Relire le dossier (modifications faites ailleurs)">
          ⟳
        </button>
        <button className="lib-icon" onClick={() => setCreating((c) => !c)} title="Nouveau morceau">
          +
        </button>
        <button className="lib-icon" onClick={onClose} title="Fermer la bibliothèque">
          ×
        </button>
      </div>

      {creating && (
        <div className="lib-new">
          <input
            autoFocus
            placeholder="Titre du morceau"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitNew();
              if (e.key === 'Escape') setCreating(false);
            }}
          />
          <select value={newFolder} onChange={(e) => setNewFolder(e.target.value)}>
            <option value="">(racine de songs/)</option>
            {folders.filter(Boolean).map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <button onClick={submitNew} disabled={!newTitle.trim()}>
            Créer
          </button>
        </div>
      )}

      <input
        className="lib-search"
        type="search"
        placeholder="Rechercher : titre, artiste, tag, paroles…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="lib-tools">
        <span>
          {count} morceau{count > 1 ? 'x' : ''}
        </span>
        <span className="spacer" />
        <label>
          Tri
          <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="title">titre</option>
            <option value="artist">artiste</option>
          </select>
        </label>
      </div>

      <div className="lib-list">
        {groups.map(({ folder, list }) => {
          const closed = !searching && collapsed.has(folder);
          return (
            <div key={folder || '/'} className="lib-folder">
              <button className="lib-folder-head" onClick={() => toggle(folder)}>
                <span className="caret">{closed ? '▸' : '▾'}</span>
                {folder || 'Sans dossier'}
                <span className="lib-count">{list.length}</span>
              </button>
              {!closed && (
                <ul>
                  {list.map((e) => (
                    <li key={e.path} className={e.path === selected ? 'active' : ''} onClick={() => onSelect(e.path)}>
                      <span className="lib-title">
                        {e.title}
                        {e.kind === 'pdf' && <span className="lib-badge">PDF</span>}
                      </span>
                      <span className="lib-sub">{[e.artist, e.key].filter(Boolean).join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        {count === 0 && <div className="lib-empty">{entries.length === 0 ? 'Aucun morceau dans songs/.' : 'Aucun résultat.'}</div>}
      </div>
    </div>
  );
}
