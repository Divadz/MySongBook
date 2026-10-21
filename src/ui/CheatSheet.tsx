import { useMemo, useState } from 'react';
import { DIRECTIVE_GROUPS, type DirectiveHelp } from './directives';

interface Props {
  onInsert: (d: DirectiveHelp) => void;
  onClose: () => void;
}

function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/** Pense-bête des directives ChordPro, avec recherche et insertion au clic. */
export function CheatSheet({ onInsert, onClose }: Props) {
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return DIRECTIVE_GROUPS;
    return DIRECTIVE_GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((d) => normalize(`${d.syntax} ${d.short ?? ''} ${d.description} ${g.title}`).includes(q)),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  return (
    <div className="cheatsheet">
      <div className="cs-head">
        <span className="cs-title">Directives ChordPro</span>
        <button className="cs-close" onClick={onClose} title="Fermer (F1)">
          ×
        </button>
      </div>
      <input
        className="cs-search"
        placeholder="Rechercher (refrain, image, page…)"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <div className="cs-hint">Cliquer sur une directive l'insère au curseur ; une sélection est placée à l'intérieur des blocs.</div>
      <div className="cs-body">
        {groups.map((g) => (
          <section key={g.title}>
            <h3>{g.title}</h3>
            {g.items.map((d) => (
              <button
                key={d.syntax}
                className="cs-item"
                // Le bouton ne prend pas le focus : le curseur reste dans l'éditeur.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onInsert(d)}
                title="Insérer dans l'éditeur"
              >
                <code className="cs-syntax">{d.syntax}</code>
                {d.short && <span className="cs-short">court : {d.short}</span>}
                <span className="cs-desc">{d.description}</span>
                {d.example && <code className="cs-example">{d.example}</code>}
              </button>
            ))}
          </section>
        ))}
        {groups.length === 0 && <div className="cs-empty">Aucune directive ne correspond.</div>}
      </div>
    </div>
  );
}
