import {
  META_FIELDS,
  STYLE_ORDER,
  STYLE_HAS_INDENT,
  STYLE_LABELS,
  defaultRenderSettings,
  type LabelledSection,
  type MetaField,
  type RenderSettings,
  type StyleKey,
  type TextStyle,
} from '../core/settings';

interface Props {
  settings: RenderSettings;
  onChange: (s: RenderSettings) => void;
  onClose: () => void;
}

const LABELLED: { key: LabelledSection; label: string }[] = [
  { key: 'verse', label: 'Couplets' },
  { key: 'chorus', label: 'Refrains' },
  { key: 'bridge', label: 'Ponts' },
  { key: 'grid', label: 'Grilles' },
  { key: 'tab', label: 'Tablatures' },
  { key: 'abc', label: 'Portées ABC' },
];

/** Réglages d'affichage communs à tous les morceaux, avec effet immédiat sur l'aperçu. */
export function DisplaySettings({ settings, onChange, onClose }: Props) {
  const setStyle = (key: StyleKey, patch: Partial<TextStyle>) =>
    onChange({ ...settings, styles: { ...settings.styles, [key]: { ...settings.styles[key], ...patch } } });
  const setMeta = (key: MetaField, value: boolean) =>
    onChange({ ...settings, metaFields: { ...settings.metaFields, [key]: value } });
  const setLabel = (key: LabelledSection, value: boolean) =>
    onChange({ ...settings, sectionLabels: { ...settings.sectionLabels, [key]: value } });

  return (
    <div className="display-settings">
      <div className="ds-head">
        <span className="ds-title">Affichage des morceaux</span>
        <button className="cs-close" onClick={onClose} title="Fermer">
          ×
        </button>
      </div>

      <h3>Styles</h3>
      <table className="ds-styles">
        <thead>
          <tr>
            <th />
            <th>Taille</th>
            <th title="Gras">G</th>
            <th title="Italique">I</th>
            <th title="Souligné">S</th>
            <th title="Décalage à droite, en em : environ un caractère à la taille du bloc">Décalage</th>
          </tr>
        </thead>
        <tbody>
          {STYLE_ORDER.map((key) => {
            const st = settings.styles[key];
            return (
              <tr key={key}>
                <td className="ds-name">{STYLE_LABELS[key]}</td>
                <td>
                  <input
                    type="number"
                    min={6}
                    max={40}
                    step={0.5}
                    value={st.size}
                    onChange={(e) => setStyle(key, { size: Number(e.target.value) || st.size })}
                  />
                  <span className="ds-unit">pt</span>
                </td>
                <td>
                  <button className={st.bold ? 'ds-toggle on bold' : 'ds-toggle bold'} onClick={() => setStyle(key, { bold: !st.bold })}>
                    G
                  </button>
                </td>
                <td>
                  <button
                    className={st.italic ? 'ds-toggle on italic' : 'ds-toggle italic'}
                    onClick={() => setStyle(key, { italic: !st.italic })}
                  >
                    I
                  </button>
                </td>
                <td>
                  <button
                    className={st.underline ? 'ds-toggle on underline' : 'ds-toggle underline'}
                    onClick={() => setStyle(key, { underline: !st.underline })}
                    title="Souligné"
                  >
                    S
                  </button>
                </td>
                <td>
                  {STYLE_HAS_INDENT[key] ? (
                    <>
                      <input
                        type="number"
                        min={0}
                        max={20}
                        step={0.5}
                        value={st.indent}
                        onChange={(e) => setStyle(key, { indent: Math.max(0, Number(e.target.value) || 0) })}
                      />
                      <span className="ds-unit">em</span>
                    </>
                  ) : (
                    <span className="ds-na" title="Les accords suivent la position des paroles">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3>Métadonnées affichées</h3>
      <div className="ds-checks">
        {META_FIELDS.map((f) => (
          <label key={f.key}>
            <input type="checkbox" checked={settings.metaFields[f.key]} onChange={(e) => setMeta(f.key, e.target.checked)} />
            {f.label}
          </label>
        ))}
      </div>

      <h3>Libellés de section</h3>
      <div className="ds-checks">
        {LABELLED.map((l) => (
          <label key={l.key}>
            <input type="checkbox" checked={settings.sectionLabels[l.key]} onChange={(e) => setLabel(l.key, e.target.checked)} />
            {l.label}
          </label>
        ))}
      </div>

      <h3>Page</h3>
      <div className="ds-rows">
        <label>
          Interligne
          <input
            type="number"
            min={1}
            max={2}
            step={0.05}
            value={settings.lineHeight}
            onChange={(e) => onChange({ ...settings, lineHeight: Number(e.target.value) || settings.lineHeight })}
          />
        </label>
        <label>
          Portées ABC
          <span>
            <input
              type="number"
              min={50}
              max={200}
              step={5}
              value={Math.round(settings.abcScale * 100)}
              onChange={(e) => onChange({ ...settings, abcScale: (Number(e.target.value) || 100) / 100 })}
            />
            <span className="ds-unit">%</span>
          </span>
        </label>
        <label className="ds-inline">
          <input type="checkbox" checked={settings.showChords} onChange={(e) => onChange({ ...settings, showChords: e.target.checked })} />
          Afficher les accords
        </label>
      </div>

      <p className="ds-note">
        Le décalage est en em : 1 em vaut à peu près la largeur d'un caractère à la taille du bloc. Les libellés de
        section suivent le décalage de leur section, plus le leur. Un morceau peut imposer sa taille par la directive {'{textsize}'} (taille du couplet ; libellés, refrains, ponts,
        grilles, tablatures, accords et notes gardent leur proportion) et son nombre de colonnes par {'{columns}'} ; sinon, le morceau passe en deux colonnes quand tout tient dans une demi-page sans retour à la ligne (en dézoomant, par exemple).
      </p>

      <button className="ds-reset" onClick={() => onChange(defaultRenderSettings)}>
        Revenir aux réglages par défaut
      </button>
    </div>
  );
}
