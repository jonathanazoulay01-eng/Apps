# apps

Petites applications web personnelles, une par dossier, publiées sur GitHub Pages.

| Dossier | App | Lien |
| --- | --- | --- |
| `kolbo/` | Kol Bo : app perso tout-en-un, d'abord les bénédictions et prières (nossah séfarade) | https://jonathanazoulay01-eng.github.io/Apps/kolbo/ |
| `bedikot/` | Rappels des bedikot (7 jours propres), à ajouter sur l'écran d'accueil de l'iPhone | https://jonathanazoulay01-eng.github.io/Apps/bedikot/ |
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
- Progression enregistrée dans le navigateur (localStorage).
