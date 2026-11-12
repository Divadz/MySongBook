import { useState } from 'react';

interface Props {
  folders: string[];
  /** null : nouveau dossier en cours de saisie, nom vide ou invalide (création à bloquer). */
  value: string | null;
  onChange: (folder: string | null) => void;
  className?: string;
}

const NEW = '\u0000nouveau';

/** Caractères interdits dans un nom de dossier (Windows, Android, Drive). */
const INVALID = /[\\/:*?"<>|]/;

/** Nom de dossier utilisable, ou message d'erreur. */
export function checkFolderName(name: string): string | null {
  const n = name.trim();
  if (!n) return 'Nom vide';
  if (INVALID.test(n)) return 'Caractères interdits : \\ / : * ? " < > |';
  if (n.startsWith('.')) return 'Le nom ne peut pas commencer par un point';
  return null;
}

/**
 * Choix du dossier d'un nouveau morceau, dans songs/ : un dossier existant ou
 * un nouveau, saisi ici. Le dossier est créé avec son premier morceau (un
 * dossier n'apparaît dans la bibliothèque que s'il contient un morceau).
 */
export function FolderSelect({ folders, value, onChange, className }: Props) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');
  const known = folders.filter(Boolean);
  const error = typing && name ? checkFolderName(name) : null;

  if (typing) {
    return (
      <span className={`folder-new ${className ?? ''}`}>
        <input
          autoFocus
          placeholder="Nom du nouveau dossier"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            onChange(checkFolderName(e.target.value) ? null : e.target.value.trim());
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setTyping(false);
              setName('');
              onChange('');
            }
          }}
          aria-invalid={error ? true : undefined}
          title={error ?? 'Créé avec le morceau'}
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false);
            setName('');
            onChange('');
          }}
          title="Choisir un dossier existant"
        >
          ×
        </button>
        {error && <span className="folder-error">{error}</span>}
      </span>
    );
  }
  return (
    <select
      className={className}
      value={value ?? ''}
      onChange={(e) => {
        if (e.target.value === NEW) {
          setTyping(true);
          onChange(null);
        } else onChange(e.target.value);
      }}
    >
      <option value="">(racine de songs/)</option>
      {known.map((f) => (
        <option key={f} value={f}>
          {f}
        </option>
      ))}
      {value && !known.includes(value) && <option value={value}>{value}</option>}
      <option value={NEW}>Nouveau dossier…</option>
    </select>
  );
}
