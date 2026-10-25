---
title: "Synchronisation avec Autosync for Google Drive"
subtitle: "MySongBook : bibliothèque partagée entre le PC et la tablette"
author: "MySongBook"
date: "2026-10-25"
---

# Principe

La bibliothèque est un dossier Google Drive, `Mon Drive/MySongBook`. Sur le PC, Google Drive pour ordinateur le présente comme un dossier local (`G:\Mon Drive\MySongBook`), ouvert dans MySongBook par « Ouvrir un dossier… ». Sur la tablette, Autosync for Google Drive (MetaCtrl) en garde une copie dans `/storage/emulated/0/MySongBook`, le dossier que lit l'application.

MySongBook ne parle pas à Google Drive : il lit et écrit des fichiers. À chaque retour au premier plan, il relit la liste des morceaux et des sets, les réglages partagés et le morceau affiché.

# Contenu du dossier

| Chemin | Contenu | Partagé |
|:-------|:--------|:-------:|
| `songs/` | Morceaux ChordPro (`.cho`), PDF et leur recadrage (`.pdf.json`) | oui |
| `sets/` | Setlists (`.set`) | oui |
| `.mysongbook/settings.json` | Réglages d'affichage communs | oui |
| `.mysongbook/device-<modèle>.json` | Zoom propre à un appareil (par morceau) | un fichier par appareil |
| `.mysongbook/import/` | Rapport de migration SongbookPro | oui |

# Réglage sur la tablette

1. Installer « Autosync for Google Drive » (MetaCtrl) depuis le Play Store.

2. Ouvrir Autosync et se connecter au compte Google qui contient `Mon Drive/MySongBook`.

3. Créer une paire de dossiers :

    - dossier distant : `MySongBook` ;
    - dossier local : `/storage/emulated/0/MySongBook` ;
    - méthode : synchronisation dans les deux sens (« Two way »).

4. Dans les options de la paire, vérifier que les fichiers et dossiers cachés (dont le nom commence par un point) sont synchronisés : les réglages sont dans `.mysongbook`.

5. Régler la synchronisation automatique (intervalle, et envoi immédiat des fichiers modifiés si l'option est proposée).

6. Dans la gestion des applications de la Boox, autoriser Autosync à fonctionner en arrière-plan (ne pas le geler) et retirer l'optimisation de batterie. Sans cela, la synchronisation s'arrête quand l'écran se met en veille.

7. Lancer une première synchronisation. Si la tablette contient déjà une copie de la bibliothèque, les fichiers identiques ne sont pas recopiés ; en cas de doublons, vider `/storage/emulated/0/MySongBook` et relancer la synchronisation.

# Limites de la version gratuite

- Une seule paire de dossiers : suffisant, toute la bibliothèque est dans un dossier.
- Fichiers de 10 Mo au plus : un PDF plus gros n'est pas envoyé. Le plus gros PDF de la bibliothèque fait moins de 8 Mo au 2026-10-25.
- Publicités dans Autosync (pas dans MySongBook).

# Conflits

Si un même fichier est modifié sur deux appareils avant d'avoir été synchronisé, Autosync garde les deux versions : l'une sous le nom d'origine, l'autre sous un nom de la forme `Titre (conflict 2026-10-25-10-15-23).cho`.

MySongBook signale ces copies : mention CONFLIT dans la liste des morceaux et des sets, et un avertissement en tête de la bibliothèque. Il faut ouvrir les deux versions, garder la bonne (en reportant au besoin les corrections de l'autre) et supprimer la copie.

Pour limiter les conflits :

- le zoom est enregistré dans un fichier propre à chaque appareil ;
- éviter de modifier le même morceau sur le PC et sur la tablette sans synchroniser entre les deux.

# Sur scène

Tout est lu dans le dossier local de la tablette : MySongBook fonctionne sans réseau. Synchroniser avant de partir, et vérifier dans Autosync que la dernière synchronisation s'est bien terminée.
