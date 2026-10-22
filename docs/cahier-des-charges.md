---
title: "MySongBook — cahier des charges"
subtitle: "Application personnelle de partitions ChordPro et de setlists, pour tablette e-ink et PC"
author: "David, avec Claude"
date: "2026-10-21"
---

# Vision

MySongBook remplace SongbookPro pour un usage personnel : jouer aux claviers, sur scène et en répétition, à partir d'une tablette e-ink A4 (Boox Max Lumi 2), et préparer les partitions et les setlists sur PC, y compris sans la tablette. Les partitions sont des fichiers ChordPro standard dans un dossier synchronisé par Google Drive ; aucune base de données propriétaire, aucun compte, aucun serveur. En concert, l'application fonctionne entièrement hors ligne.

Trois principes :

1. **Les fichiers sont la vérité.** Un morceau est un fichier `.cho` (ou un PDF), un set est un fichier texte, les réglages sont des fichiers. Tout reste lisible et modifiable avec n'importe quel éditeur.
2. **Un seul moteur de rendu.** Le même code affiche les partitions sur le PC et sur la tablette ; ce qu'on voit en préparation est ce qu'on voit sur scène.
3. **Conçu pour l'e-ink.** Pages fixes, contraste fort, pas d'animation ni de couleur, peu de rafraîchissements, commandes larges.

# Décisions prises (2026-10-20 et 21)

| Sujet | Décision |
|:------|:---------|
| Utilisateur | David seul ; pas de multi-utilisateurs, pas de bibliothèque partagée, pas de lien avec Kenata |
| Appareils | Scène et répétition : Boox Max Lumi 2 (13,3", e-ink, Android, Play Store, stylet). Préparation : PC Windows. Un second appareil Android occasionnel, simple lecteur du même dossier |
| Instrument | Claviers : pas de capo, pas de diagrammes d'accords, notation en lettres (C, Dm, G7) |
| Format des morceaux | ChordPro standard, implémenté le plus complètement possible, dont `image` et `start_of_abc` / `end_of_abc` (riffs de piano), grilles, `define`, `chorus`, `columns`, `new_page`, `transpose` |
| Morceaux non texte | PDF pris en charge en affichage pleine page, avec recadrage et zoom mémorisés |
| Stockage | Dossier de fichiers synchronisé via Google Drive. Phase 1 : une appli tierce miroite le dossier Drive sur la tablette, MySongBook lit le dossier local. Phase 3 : MySongBook parle elle-même à l'API Google Drive |
| Setlist | Liste ordonnée de morceaux avec notes intercalées, nom, date facultative, épinglage, duplication. Pas de durée totale, pas de minuteur. Préparée sur PC et sur tablette |
| Tonalité, annotations | Appartiennent au morceau, jamais à son occurrence dans un set. Transposition par directive `{transpose: n}`, accords d'origine conservés |
| Édition sur tablette | Oui : correction d'accords et de paroles dans un éditeur texte simple, annotations au stylet, notes texte, convertisseur « accords sur paroles → ChordPro » |
| Annotations au stylet | Fichier annexe par morceau, traits rattachés à la ligne de partition ; affichées et effaçables sur PC, dessinées sur tablette seulement |
| Scène | Mode pages (A4), tourne-page par tap sur les bords, touches de volume, pédale plus tard. Notes texte sous le titre. Pas de métronome, d'accordeur, de pistes audio, de diagrammes. Défilement automatique remis à plus tard |
| Import | Export des bibliothèques SongbookPro existantes (environ 100 morceaux, deux appareils) vers ChordPro pour amorcer. Convertisseur par copier-coller, sur PC et tablette. Pas de recherche en ligne intégrée |
| Impression | Depuis le PC : une chanson, un set complet, ou la liste simple des morceaux d'un set |
| Rendu | Entièrement paramétrable dans l'application, sur la tablette (taille de police, styles de sections, colonnes, position des accords, marges) |
| Technique | TypeScript, une base de code ; PWA sur PC (accès au dossier par l'API File System Access de Chrome/Edge) ; Capacitor pour l'APK Android |
| Projet | `C:\Dev\_PERSO\MySongBook`, dépôt `https://github.com/Divadz/MySongBook.git` |
| Outil de synchro (phase 1) | Autosync for Google Drive (gratuit) ; pas d'outil payant. Test reporté à la disponibilité des tablettes |
| Sauvegarde | Google Drive (historique de versions, corbeille) suffit ; rien dans l'application |
| Notes texte d'un morceau | Le premier `{comment:}` du fichier, affiché comme n'importe quel commentaire ; aucun traitement spécial |
| Second appareil Android | Même APK, même dossier, mêmes droits ; les fichiers « conflit » créés par la synchro sont signalés |
| Taille de police par morceau | Directive standard `{textsize:}` dans le fichier, multipliée par un facteur d'échelle propre à chaque appareil ; la pagination est recalculée pour le format d'écran de chaque appareil |

# Architecture

## Vue d'ensemble

```
PC (Chrome/Edge)                       Boox Max Lumi 2 (Android)
┌──────────────────────┐               ┌──────────────────────────┐
│ MySongBook PWA       │               │ MySongBook APK (Capacitor)│
│  - rendu ChordPro    │               │  - même code web          │
│  - éditeur, sets     │               │  - stylet, pédale, écran  │
│  - impression        │               │  - fichiers Android       │
└───────────┬──────────┘               └───────────┬──────────────┘
            │ File System Access API                │ Filesystem plugin
            ▼                                       ▼
   Dossier local Google Drive  <── Drive ──>  Dossier local (FolderSync, puis API Drive)
```

## Couches du code commun (TypeScript)

- **Noyau ChordPro** : parseur conforme à la spécification chordpro.org (directives, accords, sections, grilles, `abc`, `image`, `define`, métadonnées), modèle de document, transposition, sérialisation (réécriture d'un fichier sans perdre ce que l'application ne comprend pas).
- **Moteur de rendu** : produit des pages A4 à partir du document et des réglages de rendu ; rendu HTML/CSS paginé, `abc` via abcjs, PDF via pdf.js. Sortie identique à l'écran et à l'impression.
- **Bibliothèque** : abstraction « système de fichiers » (lecture, écriture, liste, surveillance), implémentée par File System Access sur PC et par le plugin Filesystem de Capacitor sur Android ; index de recherche (titre, artiste, tags, paroles) construit à l'ouverture et mis en cache.
- **Interface** : écrans lecteur, bibliothèque, sets, éditeur, convertisseur, réglages. Deux profils d'interface : « scène » (e-ink, grands contrôles, pas d'animation) et « bureau » (PC, panneaux côte à côte).
- **Ponts natifs** (Capacitor) : fichiers, maintien de l'écran allumé, touches de volume, stylet (événements pointer avec pression), Bluetooth clavier pour la pédale (phase ultérieure), « Ouvrir avec » pour les `.cho` et PDF.

## Choix techniques à confirmer au démarrage du développement

- Framework d'interface : Svelte ou Vue (léger, adapté à une PWA et à Capacitor) ; à choisir.
- Parseur ChordPro : écrire le nôtre ou s'appuyer sur ChordSheetJS en le complétant ; décision après un essai sur le corpus exporté.
- Pagination : rendu HTML mesuré puis découpé en pages, ou mise en page calculée directement (plus de maîtrise, plus de travail).
- Rendu `abc` : abcjs (SVG, noir et blanc, bien adapté à l'e-ink).
- Rendu PDF : pdf.js, pages rasterisées en cache pour la fluidité sur e-ink.

# Organisation du dossier de bibliothèque

```
MySongBook/                      (dossier Google Drive)
├── songs/
│   ├── Kenata/
│   │   ├── Still Standing.cho
│   │   ├── Still Standing.ink.json      annotations au stylet
│   │   ├── Still Standing.intro.abc     facultatif, inclus par {abc} ou inline
│   │   └── Sweet Home Alabama.pdf
│   │       Sweet Home Alabama.pdf.json  recadrage, zoom, tonalité, tags
│   └── Autres/
│       └── ...
├── sets/
│   ├── 2027-06-21 Fête de la musique.set
│   └── Répétition courante.set
├── images/                              images référencées par {image:}
└── .mysongbook/
    ├── settings.json                    réglages de rendu partagés
    ├── index.json                       cache de recherche (régénérable)
    └── device-<nom>.json                réglages propres à un appareil
```

Règles :

- Les sous-dossiers de `songs/` sont les « dossiers » de la bibliothèque ; profondeur libre.
- Le titre vient de `{title:}`, à défaut du nom de fichier. Artiste, tonalité, tempo, tags viennent des directives (`{artist:}`, `{key:}`, `{tempo:}`, `{meta: tags rock, lent}` ou `{tags:}`).
- Un PDF est un morceau à part entière ; ses métadonnées vivent dans un fichier `.pdf.json` voisin.
- Les fichiers annexes (`.ink.json`, `.pdf.json`) sont facultatifs et peuvent être supprimés sans casser le morceau.
- Tout fichier inconnu est ignoré et jamais supprimé par l'application.

## Format d'une setlist (`.set`)

Fichier texte UTF-8, une entrée par ligne :

```
{title: Fête de la musique 2027}
{date: 2027-06-21}
{pinned: true}

Kenata/Still Standing.cho
Kenata/Sweet Home Alabama.pdf
# Pause : changement de clavier, 5 min
Autres/Hallelujah.cho
```

- Les lignes commençant par `#` sont des notes intercalées, affichées comme une page de note pendant le set.
- Les chemins sont relatifs à `songs/`. Un morceau peut apparaître plusieurs fois.
- Un morceau introuvable est signalé mais n'empêche pas de jouer le set.

## Métadonnées d'un PDF (`.pdf.json`)

```json
{
  "title": "Bohemian Rhapsody",
  "artist": "Queen",
  "key": "F",
  "tags": ["ballade"],
  "crop": { "top": 0.04, "left": 0.075, "width": 0.79, "height": 0.76 },
  "zoom": 1.2
}
```

- Tous les champs sont facultatifs ; sans fichier, le titre est le nom du PDF.
- `crop` : zone affichée, en fraction de la page, commune à toutes les pages (repris de SongbookPro).
- `pages` : recadrages propres à certaines pages, par numéro de page (`{"2": {…}}`) ; ils l'emportent sur `crop`. Recadrer « toutes les pages » les efface.

## Migration depuis SongbookPro

`npm run import:sbp -- "<sauvegarde.sbpbackup>" "<dossier>" [--merge "Ancien dossier=Nouveau"]` écrit la bibliothèque dans un dossier, sans jamais écraser un fichier existant, et un rapport dans `.mysongbook/import/rapport-sbpbackup.md`.

- Un morceau rangé dans plusieurs dossiers SongbookPro va dans le premier.
- Tonalité, tempo, mesure, zoom (`{textsize: 120%}`) passent en directives ; la transposition affichée (tonalité choisie moins le capo) devient `{transpose:}`.
- La transposition propre à un set est abandonnée (la tonalité appartient au morceau) ; les écarts sont listés dans le rapport.
- Les notes de set deviennent des lignes `#` ; un morceau supprimé devient une note « Morceau manquant ».

## Format des annotations (`.ink.json`)

```json
{
  "version": 1,
  "strokes": [
    {
      "anchor": { "line": 12 },
      "points": [[12.5, 3.2, 0.6], [13.1, 3.4, 0.7]],
      "width": 1.5,
      "tool": "pen"
    }
  ]
}
```

- `anchor.line` : numéro de ligne du fichier `.cho` sur laquelle le trait commence ; les coordonnées sont en millimètres relatives au coin supérieur gauche de cette ligne rendue.
- Si la ligne n'existe plus (morceau réécrit), les traits orphelins sont affichés en fin de page et signalés, pour être effacés ou conservés.
- Outils : stylo, surligneur (gris), gomme par trait, annuler, tout effacer.

# Exigences fonctionnelles

Priorités : **P1** = indispensable au premier usage sur scène, **P2** = nécessaire pour remplacer SongbookPro complètement, **P3** = plus tard.

## Bibliothèque

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| BIB-01 | P1 | Ouvrir un dossier de bibliothèque (PC : choix du dossier Drive local ; tablette : dossier local synchronisé) et le mémoriser |
| BIB-02 | P1 | Lister les morceaux par dossier, triés par titre ou par artiste ; afficher titre, artiste, tonalité |
| BIB-03 | P1 | Recherche instantanée dans le titre, l'artiste, les tags et les paroles, insensible aux accents |
| BIB-04 | P2 | Filtrer par tag ; afficher les tags d'un morceau ; éditer les tags |
| BIB-05 | P2 | Créer, renommer, supprimer des dossiers ; déplacer un morceau entre dossiers |
| BIB-06 | P2 | Créer un morceau vide, dupliquer, renommer, supprimer (avec confirmation) |
| BIB-07 | P2 | Détecter les modifications du dossier faites hors de l'application (synchro) et rafraîchir la liste |
| BIB-08 | P3 | Statistiques simples : nombre de morceaux, derniers modifiés |

## Lecture sur scène

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| LEC-01 | P1 | Afficher un morceau en pages A4, découpage automatique, numéro de page sur total |
| LEC-02 | P1 | Tourner les pages par tap sur le tiers droit / gauche de l'écran et par les touches de volume |
| LEC-03 | P1 | Passer au morceau suivant / précédent du set à la fin / au début du morceau, avec indication du prochain titre |
| LEC-04 | P1 | Maintenir l'écran allumé pendant la lecture |
| LEC-05 | P1 | Transposer par demi-tons (bouton + / −, choix direct de la tonalité) ; enregistrer dans le fichier via `{transpose:}` ; retour à l'original |
| LEC-06 | P1 | Afficher sous le titre : artiste, tonalité, tempo ; les notes texte sont les `{comment:}` du fichier, rendus à leur place |
| LEC-07 | P1 | Mode plein écran sans barre ; tap au centre pour afficher les commandes |
| LEC-08 | P2 | Taille de police ajustable pour le morceau courant, mémorisée dans le fichier par `{textsize:}` ; facteur d'échelle global par appareil dans les réglages |
| LEC-09 | P2 | Mode paroles seules (accords masqués) |
| LEC-10 | P2 | Lecture d’un PDF : pages, zoom, recadrage mémorisé, rotation. Fait le 2026-10-22 : pages, recadrage manuel ou automatique enregistré dans le `.pdf.json`, commun à toutes les pages ou propre à une page ; rotation à faire |
| LEC-11 | P2 | Annotations au stylet : dessiner, surligner, gommer, annuler, tout effacer ; enregistrement automatique |
| LEC-12 | P2 | Barre d'information discrète : titre, tonalité, heure, position dans le set |
| LEC-13 | P3 | Pédale Bluetooth (touches clavier) : page suivante / précédente, morceau suivant / précédent ; configuration par capture de touche |
| LEC-14 | P3 | Défilement automatique optionnel avec durée par morceau |
| LEC-15 | P3 | Rafraîchissement e-ink : limiter les redessins, option de rafraîchissement complet à chaque page |

## Rendu ChordPro

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| REN-01 | P1 | Accords au-dessus des paroles, alignés sur la syllabe ; accords seuls sur une ligne sans parole |
| REN-02 | P1 | Sections : `verse`, `chorus`, `bridge`, `tab`, `grid`, sections nommées, `{c:}` comme titre de section ; `{chorus}` rappelle le dernier refrain |
| REN-02b | P1 | Grilles dessinées en cases, une par mesure : plusieurs accords dans une mesure (temps « . » ou « ~ ») partagent la case — 2 en diagonale (haut gauche, bas droite), 3 en diagonale et demi-diagonale (haut gauche, bas, droite), 4 en croix (gauche, haut, bas, droite) ; `%` ; barres `||`, `|.`, `|:`, `:|` ; texte en marge avant la première barre et après la dernière. Fait le 2026-10-22 |
| REN-03 | P1 | Métadonnées : `title`, `subtitle`, `artist`, `composer`, `lyricist`, `key`, `tempo`, `time`, `capo` (affiché seulement), `duration`, `copyright`, `tags` |
| REN-04 | P1 | Transposition `{transpose:}` et `{key:}` ; choix de l'enharmonie selon la tonalité. Fait : bémols dans les tonalités à bémols (et leurs relatives), dièses ailleurs ; grilles transposées entre les barres seulement |
| REN-05 | P1 | `{new_page}`, `{column_break}`, `{columns: n}` |
| REN-06 | P1 | `{image: fichier}` avec taille optionnelle, image relative au dossier du morceau ou à `images/` |
| REN-07 | P1 | `{start_of_abc}` / `{end_of_abc}` rendus en portée via abcjs, transposés avec le morceau |
| REN-08 | P2 | `{define:}` et `{chord:}` reconnus et ignorés à l'affichage (pas de diagrammes) ; conservés dans le fichier |
| REN-09 | P2 | Commentaires `{comment:}`, `{comment_italic:}`, `{comment_box:}` ; `{highlight:}` |
| REN-10 | P2 | Directives de police et de taille (`textfont`, `textsize`, `chordfont`, `chordsize`…) prises en compte dans la limite du noir et blanc |
| REN-11 | P2 | Tolérance : un fichier invalide s'affiche quand même, avec les lignes en erreur marquées |
| REN-12 | P3 | Directives conditionnelles (`{directive-xx:}` par instrument) et `{meta:}` libres |

## Réglages de rendu (dans l'application, sur la tablette et le PC)

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| REG-01 | P1 | Taille de police des paroles et des accords, interligne, marges de page |
| REG-02 | P1 | Style par type de bloc (titre, métadonnées, libellés de section, couplet, refrain, pont, grilles, tablatures, accords, notes de texte) : taille, gras, italique, décalage à droite en em (sauf accords) ; taille des portées ABC ; choix des métadonnées affichées ; libellés affichés ou non par type de section. Fait le 2026-10-21 |
| REG-03 | P1 | Nombre de colonnes (1 ou 2), coupure des lignes longues (couper ou réduire) |
| REG-04 | P2 | Position des accords (au-dessus, en ligne entre crochets), police monospace pour tablatures |
| REG-05 | P2 | Réglages partagés dans `.mysongbook/settings.json` (même rendu PC et tablette) ; par appareil (`device-<nom>.json`) : format de page, facteur d'échelle des polices, touches de volume, rafraîchissement e-ink |
| REG-06 | P2 | Aperçu en direct sur un morceau d'exemple |

## Setlists

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| SET-01 | P1 | Lister les sets, épinglés en tête puis par date décroissante. Fait le 2026-10-21 |
| SET-02 | P1 | Créer un set (nom, date facultative), ajouter des morceaux par recherche, réordonner par glisser-déposer, retirer. Fait le 2026-10-21 |
| SET-03 | P1 | Jouer un set : enchaînement des morceaux, pages de notes intercalées. Fait le 2026-10-21 |
| SET-04 | P2 | Notes intercalées éditables ; épingler / désépingler ; dupliquer ; supprimer. Fait le 2026-10-21 |
| SET-05 | P2 | Ajouter le morceau affiché au set courant ou à un nouveau set |
| SET-06 | P3 | Signaler les morceaux manquants dans un set. Fait le 2026-10-21 |

## Édition

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| EDI-01 | P1 | Éditeur texte du `.cho` sur PC, avec aperçu en direct, sauvegarde explicite et Ctrl-S |
| EDI-02 | P1 | Même éditeur simplifié sur tablette (plein écran, police lisible, clavier virtuel) |
| EDI-03 | P1 | Convertisseur « accords sur paroles → ChordPro » : coller un texte, obtenir un `.cho` propre (détection des lignes d'accords, des titres de section, des métadonnées en tête), sur PC et tablette. Fait le 2026-10-21 |
| EDI-04 | P2 | Aide à la saisie : insertion d'accord, de directive, de section ; coloration syntaxique légère |
| EDI-05 | P2 | Édition des métadonnées par formulaire (titre, artiste, tonalité, tempo, tags) écrite dans les directives |
| EDI-06 | P2 | Note texte du morceau (premier `{comment:}` du fichier) éditable depuis la vue lecture sans ouvrir l'éditeur complet |
| EDI-07 | P3 | Conversion d'un `.cho` vers « accords sur paroles » pour copier ailleurs |

## Import et migration

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| IMP-01 | P1 | Script de migration : sauvegarde SongbookPro (`.sbpbackup`) des deux appareils → arborescence `songs/` et `sets/`, dédoublonnage par titre et contenu, rapport des morceaux à vérifier (`npm run import:sbp`). Fait le 2026-10-21 pour un appareil ; les annotations au stylet sont gardées brutes en attendant le format `.ink.json` |
| IMP-02 | P2 | Import de fichiers `.cho`, `.txt`, PDF par « Ouvrir avec » et par glisser-déposer (PC) |
| IMP-03 | P3 | Import d'images (photo de partition) comme morceau PDF |

## Impression et export (PC)

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| PRN-01 | P2 | Imprimer ou exporter en PDF un morceau avec le rendu de l'application |
| PRN-02 | P2 | Imprimer un set complet (tous les morceaux dans l'ordre, pages de notes incluses ou non) |
| PRN-03 | P2 | Imprimer la liste simple des morceaux d'un set (ordre de passage avec tonalités) |

## Synchronisation

| Id | Priorité | Exigence |
|:---|:--------:|:---------|
| SYN-01 | P1 | Phase 1 : aucune synchro dans l'application ; documentation de la configuration d'Autosync for Google Drive (gratuit) entre Google Drive et le dossier local de la tablette, dans les deux sens |
| SYN-02 | P2 | Détection des conflits de fichiers laissés par l'outil de synchro (copies « conflit ») et affichage dans la bibliothèque |
| SYN-03 | P3 | Phase 3 : connexion Google Drive intégrée, choix du dossier, synchro à la demande et au lancement, dernière synchro affichée, hors ligne complet |

# Contraintes e-ink

- Aucune animation, aucune transition ; changements d'écran instantanés.
- Noir et blanc : les styles reposent sur la graisse, l'italique, la taille, l'indentation et les filets ; le surligneur est un gris clair.
- Contrôles tactiles larges (zones d'au moins 12 mm) et peu nombreux à l'écran de lecture.
- Le rendu d'une page est figé : pas de reflow pendant le jeu.
- Le lecteur PDF rasterise les pages en avance pour éviter les délais.
- L'interface « bureau » peut être plus riche ; l'interface « scène » reste minimale.

# Écrans

1. **Bibliothèque** : liste des dossiers et morceaux, recherche en tête, accès aux sets et aux réglages. Sur PC : panneau gauche permanent.
2. **Lecture** : page du morceau plein écran ; barre d'information en haut (masquable) ; zones de tap gauche / droite ; menu d'actions : transposer, taille, paroles seules, annoter, note, éditer, ajouter à un set.
3. **Set** : liste ordonnée avec poignées, bouton « jouer », notes intercalées.
4. **Éditeur** : texte à gauche, aperçu à droite (PC) ; plein écran avec bouton aperçu (tablette).
5. **Convertisseur** : zone de collage, résultat ChordPro, bouton « créer le morceau ».
6. **Réglages** : rendu (avec aperçu), bibliothèque (dossier), appareil (touches de volume, rafraîchissement e-ink), synchro (phase 3).

# Feuille de route

| Phase | Contenu | Résultat |
|:------|:--------|:---------|
| 0. Amorçage | Sans les tablettes : choix framework et parseur, noyau ChordPro, essai de rendu sur PC avec des morceaux représentatifs (dont un avec `abc` et un avec `image`), script de migration prêt. Avec les tablettes : export des deux bibliothèques SongbookPro, arborescence sur Google Drive, Autosync, validation du rendu sur la Boox | Noyau et rendu validés sur PC ; dossier `songs/` complet dès que les exports sont disponibles |
| 1. Lecteur | Noyau ChordPro, rendu paginé, bibliothèque, recherche, transposition, réglages de rendu, APK Capacitor, PWA PC, FolderSync documenté | Jouer un concert avec la Boox sans SongbookPro |
| 2. Édition et sets | Éditeur PC et tablette, convertisseur, sets complets, notes, annotations au stylet, PDF avec recadrage, impression | Remplacement complet de SongbookPro |
| 3. Synchro intégrée | API Google Drive dans l'application, gestion des conflits | Plus d'outil tiers |
| 4. Confort | Pédale Bluetooth, défilement automatique, import d'images, directives avancées | Fonctions secondaires |

# Hors périmètre

- Multi-utilisateurs, bibliothèque partagée, comptes, serveur.
- Recherche et import depuis des sites web (UltimateGuitar et autres).
- Métronome, accordeur, pistes d'accompagnement, MIDI.
- Diagrammes d'accords, capo, notations latine, allemande ou Nashville.
- Couleurs de rendu et thème sombre.
- Lien avec l'application Kenata.

# Questions ouvertes

Toutes les questions du 2026-10-21 sont tranchées (voir le tableau des décisions). Restent à valider au contact des tablettes, en phase 0 :

- Le comportement réel d'Autosync for Google Drive sur la Boox (délai, fiabilité de la synchro montante).
- Le rendu e-ink du moteur de pages et des portées `abc` (contraste, rafraîchissement).
- Le format d'écran du second appareil Android, pour calibrer le facteur d'échelle par appareil.
