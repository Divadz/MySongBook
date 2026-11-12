import { useMemo } from 'react';
import { isChord } from '../core/transpose';

interface Props {
  source: string;
  editor: React.RefObject<HTMLTextAreaElement>;
}

/** Accords du morceau, dans l'ordre de première apparition (au plus 24). */
function songChords(source: string): string[] {
  const seen = new Set<string>();
  for (const m of source.matchAll(/\[([^\]*][^\]]*)\]/g)) {
    const c = m[1].trim();
    if (c && isChord(c)) seen.add(c);
    if (seen.size >= 24) break;
  }
  return [...seen];
}

/**
 * Tablette : barre d'insertion au-dessus de l'éditeur, pour ce que le clavier
 * virtuel rend pénible (crochets, accolades, accords déjà utilisés) et pour
 * annuler. Les boutons ne prennent pas le focus : le clavier reste ouvert et
 * le curseur en place. L'insertion passe par la pile d'annulation du champ.
 */
export function EditBar({ source, editor }: Props) {
  const chords = useMemo(() => songChords(source), [source]);

  const insert = (before: string, after = '') => {
    const ta = editor.current;
    if (!ta) return;
    ta.focus();
    const selected = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    const text = before + selected + after;
    const caret = ta.selectionStart + before.length + selected.length;
    // execCommand garde l'annulation native (et déclenche onChange) ; repli sans elle.
    if (!document.execCommand('insertText', false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (!selected && after) ta.setSelectionRange(caret, caret);
  };
  const command = (name: 'undo' | 'redo') => {
    editor.current?.focus();
    document.execCommand(name);
  };
  const keep = (e: React.PointerEvent) => e.preventDefault();

  return (
    <div className="edit-bar" onPointerDown={keep}>
      <button onClick={() => command('undo')} title="Annuler">
        ↶
      </button>
      <button onClick={() => command('redo')} title="Rétablir">
        ↷
      </button>
      <span className="edit-bar-sep" />
      <button onClick={() => insert('[', ']')} title="Accord : [ ]">
        [ ]
      </button>
      <button onClick={() => insert('{', '}')} title="Directive : { }">
        {'{ }'}
      </button>
      <button onClick={() => insert('{c: ', '}')} title="Note ou titre de section">
        {'{c:}'}
      </button>
      {chords.length > 0 && <span className="edit-bar-sep" />}
      {chords.map((c) => (
        <button key={c} className="edit-bar-chord" onClick={() => insert(`[${c}]`)}>
          {c}
        </button>
      ))}
    </div>
  );
}
