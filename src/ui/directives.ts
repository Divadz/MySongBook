/**
 * Pense-bête des directives ChordPro prises en charge par MySongBook.
 *
 * Dans `snippet`, « § » marque la place du curseur après insertion ; si du
 * texte est sélectionné dans l'éditeur, il remplace « § » (utile pour
 * entourer des lignes d'un bloc).
 */

export interface DirectiveHelp {
  /** Forme longue, telle qu'affichée. */
  syntax: string;
  /** Formes courtes acceptées. */
  short?: string;
  description: string;
  /** Texte inséré. */
  snippet: string;
  /** La directive doit être seule sur sa ligne. */
  ownLine?: boolean;
  /** Exemple affiché sous la description. */
  example?: string;
}

export interface DirectiveGroup {
  title: string;
  items: DirectiveHelp[];
}

export const DIRECTIVE_GROUPS: DirectiveGroup[] = [
  {
    title: 'Accords',
    items: [
      {
        syntax: '[C]',
        description: "Accord placé au-dessus de la syllabe qui le suit. Notation en lettres : C, Dm, G7, F#m7b5, Bb/D.",
        snippet: '[§]',
        example: 'Ama[G]zing grace, how [C]sweet',
      },
      {
        syntax: '[*texte]',
        description: "Annotation sur la ligne d'accords (indication de jeu), sans être un accord. Non transposée.",
        snippet: '[*§]',
        example: 'Je [*rit.]ralentis ici',
      },
      {
        syntax: '[Dm7 (x2)]',
        description: "Accord suivi d'une remarque entre parenthèses, dans les mêmes crochets.",
        snippet: '[§ (x2)]',
      },
    ],
  },
  {
    title: 'Métadonnées',
    items: [
      { syntax: '{title: …}', short: 't', description: 'Titre du morceau (sinon : nom du fichier).', snippet: '{title: §}', ownLine: true },
      { syntax: '{subtitle: …}', short: 'st', description: 'Sous-titre, en italique sous le titre.', snippet: '{subtitle: §}', ownLine: true },
      { syntax: '{artist: …}', description: 'Artiste ou groupe.', snippet: '{artist: §}', ownLine: true },
      { syntax: '{composer: …}', description: 'Compositeur, affiché « Musique : … ».', snippet: '{composer: §}', ownLine: true },
      { syntax: '{lyricist: …}', description: 'Parolier, affiché « Paroles : … ».', snippet: '{lyricist: §}', ownLine: true },
      { syntax: '{key: …}', description: "Tonalité d'origine (Am, F#, Bb…). Suit la transposition.", snippet: '{key: §}', ownLine: true },
      { syntax: '{tempo: …}', description: 'Tempo en BPM.', snippet: '{tempo: §}', ownLine: true },
      { syntax: '{time: …}', description: 'Signature rythmique (4/4, 6/8…).', snippet: '{time: §}', ownLine: true },
      { syntax: '{duration: …}', description: 'Durée (3:20). Lue, pas encore affichée.', snippet: '{duration: §}', ownLine: true },
      { syntax: '{copyright: …}', description: 'Mention de droits, en petit sous le titre.', snippet: '{copyright: §}', ownLine: true },
      {
        syntax: '{tags: a, b}',
        short: 'meta: tags',
        description: 'Étiquettes pour filtrer la bibliothèque, séparées par des virgules.',
        snippet: '{tags: §}',
        ownLine: true,
      },
    ],
  },
  {
    title: 'Sections',
    items: [
      {
        syntax: '{start_of_verse: Couplet 1} … {end_of_verse}',
        short: 'sov / eov',
        description: 'Couplet. Le libellé est facultatif.',
        snippet: '{start_of_verse: Couplet}\n§\n{end_of_verse}',
        ownLine: true,
      },
      {
        syntax: '{start_of_chorus} … {end_of_chorus}',
        short: 'soc / eoc',
        description: 'Refrain (gras et indenté par défaut).',
        snippet: '{start_of_chorus}\n§\n{end_of_chorus}',
        ownLine: true,
      },
      {
        syntax: '{chorus}',
        description: 'Rappelle le dernier refrain en entier. Un libellé facultatif le remplace : {chorus: Refrain x2}.',
        snippet: '{chorus}§',
        ownLine: true,
      },
      {
        syntax: '{start_of_bridge: Pont} … {end_of_bridge}',
        short: 'sob / eob',
        description: 'Pont (italique et indenté par défaut).',
        snippet: '{start_of_bridge: Pont}\n§\n{end_of_bridge}',
        ownLine: true,
      },
      {
        syntax: '{start_of_grid: Grille} … {end_of_grid}',
        short: 'sog / eog',
        description: 'Grille d’accords en police à chasse fixe. Les accords de la grille sont transposés.',
        snippet: '{start_of_grid: Grille}\n| § . . . |  . . . |  . . . |  . . . |\n{end_of_grid}',
        ownLine: true,
        example: '| Am . . . | F . . . | G . . . | E . . . |',
      },
      {
        syntax: '{start_of_tab} … {end_of_tab}',
        short: 'sot / eot',
        description: 'Tablature, recopiée telle quelle en police à chasse fixe. Non transposée.',
        snippet: '{start_of_tab}\n§\n{end_of_tab}',
        ownLine: true,
      },
      {
        syntax: '{start_of_abc: Riff} … {end_of_abc}',
        description:
          'Portée en notation ABC (riffs, intros). Transposée avec le morceau. Il faut au minimum X:1 et K: (tonalité).',
        snippet: '{start_of_abc: Riff}\nX:1\nM:4/4\nL:1/8\nK:C\n§\n{end_of_abc}',
        ownLine: true,
        example: 'X:1 / M:4/4 / L:1/8 / K:Am / A2 c2 e2 a2 |',
      },
    ],
  },
  {
    title: 'Commentaires',
    items: [
      {
        syntax: '{comment: …}',
        short: 'c',
        description: 'Commentaire simple. Le premier du fichier sert de note de tête du morceau.',
        snippet: '{comment: §}',
        ownLine: true,
      },
      { syntax: '{comment_italic: …}', short: 'ci', description: 'Commentaire en italique.', snippet: '{comment_italic: §}', ownLine: true },
      { syntax: '{comment_box: …}', short: 'cb', description: 'Commentaire encadré.', snippet: '{comment_box: §}', ownLine: true },
      { syntax: '{highlight: …}', description: 'Commentaire surligné en gris.', snippet: '{highlight: §}', ownLine: true },
      {
        syntax: '# texte',
        description: "Ligne de remarque dans le fichier, jamais affichée.",
        snippet: '# §',
        ownLine: true,
      },
    ],
  },
  {
    title: 'Mise en page',
    items: [
      { syntax: '{new_page}', short: 'np', description: 'Force un saut de page.', snippet: '{new_page}§', ownLine: true },
      { syntax: '{column_break}', short: 'colb', description: 'Passe à la colonne suivante.', snippet: '{column_break}§', ownLine: true },
      {
        syntax: '{columns: 2}',
        short: 'col',
        description: 'Nombre de colonnes pour ce morceau (1 ou 2), prioritaire sur les réglages.',
        snippet: '{columns: §2}',
        ownLine: true,
      },
      {
        syntax: '{textsize: 12}',
        description: "Taille des paroles et accords en points pour ce morceau ; chaque appareil applique en plus son facteur d'échelle.",
        snippet: '{textsize: §12}',
        ownLine: true,
      },
      {
        syntax: '{transpose: 2}',
        description: "Transposition en demi-tons (négatif vers le bas). Les accords écrits restent ceux d'origine.",
        snippet: '{transpose: §}',
        ownLine: true,
      },
    ],
  },
  {
    title: 'Images',
    items: [
      {
        syntax: '{image: fichier.png width=70%}',
        description:
          "Insère une image (partition scannée, schéma). Chemin relatif au morceau ou au dossier images/. Largeur facultative en % ou en mm.",
        snippet: '{image: § width=100%}',
        ownLine: true,
      },
    ],
  },
];
