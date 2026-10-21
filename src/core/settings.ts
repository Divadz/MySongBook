/** Réglages de rendu (partagés) et réglages d'appareil (locaux). */

export interface SectionStyle {
  bold: boolean;
  italic: boolean;
  /** Indentation en mm. */
  indent: number;
  /** Afficher le libellé de section (« Refrain », « Verse 1 »…). */
  showLabel: boolean;
}

export interface RenderSettings {
  /** Taille de base des paroles, en points. */
  lyricsSize: number;
  /** Taille des accords, en points. */
  chordSize: number;
  /** Interligne (multiplicateur). */
  lineHeight: number;
  /** Nombre de colonnes par page (1 ou 2). */
  columns: 1 | 2;
  /** Espace entre colonnes, en mm. */
  columnGap: number;
  /** Styles par type de section. */
  sections: Record<string, SectionStyle>;
  /** Taille du titre et des métadonnées, en points. */
  titleSize: number;
  metaSize: number;
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

export const defaultSectionStyle: SectionStyle = {
  bold: false,
  italic: false,
  indent: 0,
  showLabel: true,
};

export const defaultRenderSettings: RenderSettings = {
  lyricsSize: 12,
  chordSize: 12,
  lineHeight: 1.25,
  columns: 1,
  columnGap: 8,
  titleSize: 20,
  metaSize: 10,
  showChords: true,
  sections: {
    verse: { ...defaultSectionStyle },
    chorus: { ...defaultSectionStyle, bold: true, indent: 4 },
    bridge: { ...defaultSectionStyle, italic: true, indent: 4 },
    grid: { ...defaultSectionStyle },
    tab: { ...defaultSectionStyle },
    none: { ...defaultSectionStyle, showLabel: false },
  },
};

/** Boox Max Lumi 2 : écran 13,3" au format A4. */
export const defaultDeviceSettings: DeviceSettings = {
  pageWidth: 210,
  pageHeight: 297,
  margin: 12,
  fontScale: 1,
};

export function sectionStyle(settings: RenderSettings, type: string): SectionStyle {
  return settings.sections[type] ?? defaultSectionStyle;
}
