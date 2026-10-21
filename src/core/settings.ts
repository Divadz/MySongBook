/** Réglages de rendu (communs à tous les morceaux) et réglages d'appareil. */

import type { CSSProperties } from 'react';

/** Style d'un type de bloc. */
export interface TextStyle {
  /** Taille en points. */
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  /** Décalage à droite, en em (largeur d'environ un caractère à la taille du bloc). */
  indent: number;
}

/** Types de blocs stylables. */
export type StyleKey =
  | 'title'
  | 'meta'
  | 'label'
  | 'verse'
  | 'chorus'
  | 'bridge'
  | 'grid'
  | 'tab'
  | 'chords'
  | 'comment';

/** Ordre d'affichage dans les réglages. */
export const STYLE_ORDER: StyleKey[] = ['title', 'meta', 'label', 'verse', 'chorus', 'bridge', 'grid', 'tab', 'chords', 'comment'];

export const STYLE_LABELS: Record<StyleKey, string> = {
  title: 'Titre',
  meta: 'Métadonnées',
  label: 'Libellés de section',
  verse: 'Couplet',
  chorus: 'Refrain',
  bridge: 'Pont',
  grid: 'Grilles',
  tab: 'Tablatures',
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
  label: true,
  grid: true,
  tab: true,
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
export type LabelledSection = 'verse' | 'chorus' | 'bridge' | 'grid' | 'tab' | 'abc';

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
  /** Taille des portées ABC (1 = taille normale). */
  abcScale: number;
  /** Version du format : 3 = décalages en em. */
  version: number;
}

export interface DeviceSettings {
  /** Page en millimètres. */
  pageWidth: number;
  pageHeight: number;
  margin: number;
  /** Facteur d'échelle global des polices propre à l'appareil. */
  fontScale: number;
}

const style = (size: number, bold = false, italic = false, indent = 0, underline = false): TextStyle => ({
  size,
  bold,
  italic,
  underline,
  indent,
});

export const defaultRenderSettings: RenderSettings = {
  styles: {
    title: style(20, true),
    meta: style(10),
    label: style(12, true, false, 0, true),
    verse: style(12),
    chorus: style(12, true, false, 2),
    bridge: style(12, false, true, 2),
    grid: style(11),
    tab: style(11),
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
  sectionLabels: { verse: true, chorus: true, bridge: true, grid: true, tab: true, abc: true },
  lineHeight: 1.25,
  columns: 1,
  columnGap: 8,
  showChords: true,
  abcScale: 1,
  version: 3,
};

/** Boox Max Lumi 2 : écran 13,3" au format A4. */
export const defaultDeviceSettings: DeviceSettings = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 12,
  fontScale: 1,
};

/** Style d'une section ; lignes hors section et sections personnalisées suivent le couplet. */
export function sectionStyleKey(type: string): StyleKey {
  if (type === 'chorus' || type === 'bridge' || type === 'grid' || type === 'tab') return type;
  return 'verse';
}

export function showSectionLabel(settings: RenderSettings, type: string): boolean {
  if (type in settings.sectionLabels) return settings.sectionLabels[type as LabelledSection];
  return type !== 'none';
}

/** Propriétés CSS d'un style, avec le facteur d'échelle de l'appareil. */
export function css(st: TextStyle, scale: number, withIndent = true): CSSProperties {
  return {
    fontSize: `${st.size * scale}pt`,
    fontWeight: st.bold ? 700 : 400,
    fontStyle: st.italic ? 'italic' : 'normal',
    textDecoration: st.underline ? 'underline' : 'none',
    marginLeft: withIndent ? `${st.indent}em` : undefined,
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
  for (const k of ['label', 'verse', 'chorus', 'bridge', 'grid', 'tab', 'chords', 'comment'] as StyleKey[]) {
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
  for (const k of Object.keys(d.styles) as StyleKey[]) {
    const st = { ...d.styles[k], ...(saved.styles?.[k] ?? {}) };
    // Avant la version 3, les décalages étaient en millimètres : conversion en em.
    if ((saved.version ?? 0) < 3 && saved.styles?.[k]) {
      const mmPerEm = st.size * 0.3528;
      st.indent = Math.round((st.indent / mmPerEm) * 2) / 2;
    }
    styles[k] = st;
  }
  return {
    ...d,
    ...saved,
    version: 3,
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
