/** Réglages de rendu (communs à tous les morceaux) et réglages d'appareil. */

import type { CSSProperties } from 'react';

/** Style d'un type de bloc. */
export interface TextStyle {
  /** Taille en points. */
  size: number;
  bold: boolean;
  italic: boolean;
  /** Décalage à droite, en mm. */
  indent: number;
}

/** Types de blocs stylables. */
export type StyleKey = 'title' | 'meta' | 'verse' | 'chorus' | 'bridge' | 'chords' | 'comment';

export const STYLE_LABELS: Record<StyleKey, string> = {
  title: 'Titre',
  meta: 'Métadonnées',
  verse: 'Couplet',
  chorus: 'Refrain',
  bridge: 'Pont',
  chords: 'Accords',
  comment: 'Notes de texte',
};

/** Les accords suivent la position des paroles : pas de décalage propre. */
export const STYLE_HAS_INDENT: Record<StyleKey, boolean> = {
  title: true,
  meta: true,
  verse: true,
  chorus: true,
  bridge: true,
  chords: false,
  comment: true,
};

/** Métadonnées affichables sous le titre, dans l'ordre d'affichage. */
export type MetaField =
  | 'subtitle'
  | 'artist'
  | 'key'
  | 'tempo'
  | 'time'
  | 'duration'
  | 'composer'
  | 'lyricist'
  | 'copyright'
  | 'tags';

export const META_FIELDS: { key: MetaField; label: string }[] = [
  { key: 'subtitle', label: 'Sous-titre' },
  { key: 'artist', label: 'Artiste' },
  { key: 'key', label: 'Tonalité' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'time', label: 'Signature rythmique' },
  { key: 'duration', label: 'Durée' },
  { key: 'composer', label: 'Compositeur' },
  { key: 'lyricist', label: 'Parolier' },
  { key: 'copyright', label: 'Copyright' },
  { key: 'tags', label: 'Tags' },
];

/** Sections dont le libellé (« Couplet 1 », « Refrain ») peut être masqué. */
export type LabelledSection = 'verse' | 'chorus' | 'bridge';

export interface RenderSettings {
  styles: Record<StyleKey, TextStyle>;
  metaFields: Record<MetaField, boolean>;
  /** Afficher le libellé de section. */
  sectionLabels: Record<LabelledSection, boolean>;
  /** Interligne (multiplicateur). */
  lineHeight: number;
  /** Nombre de colonnes par page (1 ou 2). */
  columns: 1 | 2;
  /** Espace entre colonnes, en mm. */
  columnGap: number;
  /** Afficher les accords (false = mode paroles seules). */
  showChords: boolean;
}

export interface DeviceSettings {
  /** Page en millimètres. */
  pageWidth: number;
  pageHeight: number;
  margin: number;
  /** Facteur d'échelle global des polices propre à l'appareil. */
  fontScale: number;
}

const style = (size: number, bold = false, italic = false, indent = 0): TextStyle => ({ size, bold, italic, indent });

export const defaultRenderSettings: RenderSettings = {
  styles: {
    title: style(20, true),
    meta: style(10),
    verse: style(12),
    chorus: style(12, true, false, 4),
    bridge: style(12, false, true, 4),
    chords: style(12, true),
    comment: style(11, false, true),
  },
  metaFields: {
    subtitle: true,
    artist: true,
    key: true,
    tempo: true,
    time: true,
    duration: false,
    composer: true,
    lyricist: true,
    copyright: true,
    tags: false,
  },
  sectionLabels: { verse: true, chorus: true, bridge: true },
  lineHeight: 1.25,
  columns: 1,
  columnGap: 8,
  showChords: true,
};

/** Boox Max Lumi 2 : écran 13,3" au format A4. */
export const defaultDeviceSettings: DeviceSettings = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 12,
  fontScale: 1,
};

/** Style des paroles d'une section ; grilles, tablatures et lignes hors section suivent le couplet. */
export function sectionStyleKey(type: string): StyleKey {
  if (type === 'chorus' || type === 'bridge') return type;
  return 'verse';
}

export function showSectionLabel(settings: RenderSettings, type: string): boolean {
  if (type === 'chorus' || type === 'bridge' || type === 'verse') return settings.sectionLabels[type];
  return type !== 'none';
}

/** Propriétés CSS d'un style, avec le facteur d'échelle de l'appareil. */
export function css(st: TextStyle, scale: number, withIndent = true): CSSProperties {
  return {
    fontSize: `${st.size * scale}pt`,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    marginLeft: withIndent ? `${st.indent}mm` : undefined,
  };
}

/**
 * La directive {textsize:} d'un morceau fixe la taille du couplet ; les
 * autres blocs de texte gardent leur proportion par rapport au couplet.
 */
export function applyTextsize(settings: RenderSettings, textsize: number | undefined): RenderSettings {
  if (!textsize || textsize <= 0) return settings;
  const factor = textsize / settings.styles.verse.size;
  const styles = { ...settings.styles };
  for (const k of ['verse', 'chorus', 'bridge', 'chords', 'comment'] as StyleKey[]) {
    styles[k] = { ...styles[k], size: Math.round(styles[k].size * factor * 2) / 2 };
  }
  return { ...settings, styles };
}

const STORAGE_KEY = 'mysongbook.render.v2';

/** Lecture des réglages (provisoire : stockage du navigateur, en attendant .mysongbook/settings.json). */
export function loadRenderSettings(): RenderSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? mergeRenderSettings(JSON.parse(raw)) : defaultRenderSettings;
  } catch {
    return defaultRenderSettings;
  }
}

/** Complète des réglages lus (fichier ou stockage) avec les valeurs par défaut. */
export function mergeRenderSettings(saved: Partial<RenderSettings> | null | undefined): RenderSettings {
  const d = defaultRenderSettings;
  if (!saved || typeof saved !== 'object') return d;
  const styles = { ...d.styles };
  for (const k of Object.keys(d.styles) as StyleKey[]) styles[k] = { ...d.styles[k], ...(saved.styles?.[k] ?? {}) };
  return {
    ...d,
    ...saved,
    styles,
    metaFields: { ...d.metaFields, ...(saved.metaFields ?? {}) },
    sectionLabels: { ...d.sectionLabels, ...(saved.sectionLabels ?? {}) },
  };
}

export function saveRenderSettings(settings: RenderSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // stockage indisponible : les réglages restent en mémoire
  }
}
