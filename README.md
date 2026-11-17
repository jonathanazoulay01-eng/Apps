# apps

Petites applications web personnelles, une par dossier, publiées sur GitHub Pages.

| Dossier | App | Lien |
| --- | --- | --- |
| `kolbo/` | Kol Bo : app perso tout-en-un, d'abord les bénédictions et prières (nossah séfarade) | https://jonathanazoulay01-eng.github.io/Apps/kolbo/ |
| `bedikot/` | Rappels des bedikot (7 jours propres), à ajouter sur l'écran d'accueil de l'iPhone | https://jonathanazoulay01-eng.github.io/Apps/bedikot/ |
| `taches/` | Pour Jonathan : sa femme ajoute des choses à faire, qui arrivent dans la liste « À faire » de l'intranet Optical Santé | https://jonathanazoulay01-eng.github.io/Apps/taches/ |
| `mitsvot/` | Mitsvot en jeu : apprentissage ludique des mitsvot (fiches, cartes, quiz, défi, trophées) | https://jonathanazoulay01-eng.github.io/Apps/mitsvot/ |

## Bedikot

- Page web : `bedikot/index.html`, `bedikot/sw.js` (notifications), `bedikot/manifest.webmanifest`.
- Serveur : fonction Supabase `bedikot` (code dans `bedikot/serveur/`), projet `intranet-optical-sante-test`, appelée chaque minute par la tâche pg_cron `bedikot-rappels`. Tables `bedikot_subs` et `bedikot_config`.
- Horaires selon Roger Stioui (comme Torah-Box) : chkia = coucher du soleil au niveau de la mer, alot hachahar = soleil à 16,1° sous l'horizon.

## Kol Bo

- Page web : `kolbo/index.html` (textes intégrés), `kolbo/sw.js` (hors ligne), `kolbo/manifest.webmanifest`.
- Textes : Siddur Edot HaMizrach, édition CC0 publiée par Sefaria.

## Mitsvot en jeu

- Page unique : `mitsvot/index.html`. Pour ajouter un chapitre, ajouter un objet au tableau `CHAPITRES` (fiches, cartes, questions).
- Accueil par prénom, programme 5787 (Examens 1, 2, 3 et final) avec évaluations notées sur 20, progression synchronisée en ligne (Supabase, clé publique uniquement) et espace parent protégé par code.
- Sections au programme : « La Mitsva » et « Quelques précisions » (« Le message de la Mitsva » n’est plus au programme). Chapitres en ligne : 102 Cha’atnez, 105 Tsedaka, 112 Bikourim.
- Progression enregistrée dans le navigateur (localStorage).

## Pour Jonathan (tâches)

- Page unique : `taches/index.html` (+ `sw.js`, `manifest.webmanifest`).
- Base : Supabase de l'intranet (`nfhnkkohtudtlintiihu`), table `admin_todos` (colonne `ajoute_par = 'famille'`).
- Aucun accès direct aux tables : 3 fonctions `famille_taches`, `famille_ajouter`, `famille_supprimer`, protégées par un code d'accès (stocké haché dans `famille_acces`).
