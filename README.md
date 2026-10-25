# Générateur de programme

À partir de l'export du formulaire d'inscription (Framaforms : TSV, CSV ou Excel), produit :

- le **programme PDF A5** : couverture, pages d'introduction colorées, carte des communes participantes, une fiche par animation (2 par page), images intercalaires, tableau récapitulatif, pages de complément pour un livret ;
- facultativement l'**export Kirby** (un dossier par commune, un par animation), zippé, à déposer dans `content/` du site.

## L'application en ligne (GitHub Pages)

**`https://VOTRE-COMPTE.github.io/NOM-DU-DEPOT/`**

Tout se passe **dans le navigateur** : aucun serveur, rien à installer, et **aucun fichier ne quitte l'ordinateur**. La page interdit d'ailleurs toute connexion réseau. On peut donc y charger l'**export brut** du formulaire, avec ses noms, e-mails et adresses IP, sans risque.

1. Choisir l'export : l'application affiche aussitôt le nombre d'animations retenues, la période détectée, les animations sans date et les communes absentes de la carte.
2. Ajouter la couverture (JPG, PNG ou PDF), une 4e de couverture et des images intercalaires si besoin.
3. Ajuster couleurs, tailles, textes d'introduction, carte, tableau.
4. **Générer le programme** : aperçu dans la page, puis téléchargement du PDF (et du zip Kirby).

Les réglages sont mémorisés dans le navigateur. **Exporter / Importer reglages.json** permet de les partager ou de les retrouver sur un autre poste.

### Mise en place (une seule fois)

Sur GitHub, ouvrez *Settings → Pages → Build and deployment*, puis choisissez *Source : **GitHub Actions***.

Le workflow « Publier l'application » construit et publie la page à chaque modification du code. L'adresse s'affiche dans l'onglet Actions et dans *Settings → Pages*.

## Génération automatique dans le dépôt (facultatif)

Pour obtenir le programme dans une release GitHub sans ouvrir l'application :

> ⚠️ **Dépôt public : ne déposez jamais l'export brut.** Utilisez le bouton **Télécharger l'export anonymisé** de l'application. Il retire le responsable, l'e-mail, l'adresse IP, les identifiants de compte, les logos et l'heure de saisie ; le programme reste identique. Le workflow refuse de tourner s'il détecte un export brut.

1. Déposez dans `entree/` : `export.tsv` (anonymisé), `couverture.jpg|png|pdf`, et facultativement `quatrieme.*`, des photos dans `entree/intercalaires/` et `reglages.json` (exporté depuis l'application).
2. Validez sur `main` : le workflow « Générer le programme » produit le PDF et le zip Kirby.
3. Ils sont publiés dans la **release « programme »**, toujours à la même adresse, et joints à l'exécution dans l'onglet Actions pendant 30 jours.

**Actions → Générer le programme → Run workflow** permet de relancer en changeant la période, les numéros exclus, l'ordre des fiches et l'export Kirby.

### Si un export brut a été poussé par erreur

Le supprimer dans un nouveau commit ne suffit pas : il reste lisible dans l'historique.

- **Dépôt récent :** le plus sûr est de supprimer le dépôt (*Settings → Delete this repository*), puis de le recréer et d'y pousser une copie propre.
- **Sinon :** réécrivez l'historique avec [git filter-repo](https://github.com/newren/git-filter-repo) (`git filter-repo --invert-paths --path entree/NOM_DU_FICHIER`), puis faites un `git push --force`. Demandez ensuite au support GitHub de purger les vues en cache.

## En local

```bash
npm install
npm run local            # http://localhost:8100 (même application, servie depuis votre poste)
node cli.js --dossier entree --sortie sortie/programme.pdf --kirby sortie/agenda-kirby.zip
node anonymiser.js export-brut.tsv entree/export.tsv
```

Node 18 ou plus récent.

## Règles appliquées aux données

- **Période :** l'édition la plus récente est détectée automatiquement. Une date isolée mal saisie (type « 2027 ») est ignorée. On peut aussi imposer une période.
- **Dates :** pour une animation « un jour », la date est dans `animation_date_f`. Pour « plusieurs jours », c'est `animation_date_debut` → `animation_date_fin`.
- **Animations sans date :** conservées avec la mention « date à préciser », si elles ont été saisies pendant la préparation de l'édition et qu'aucune version datée n'existe déjà.
- **Doublons** (même commune, titre, date et heure) : la saisie la plus récente est gardée.
- **Lignes de test** (« titre anim… ») : écartées. D'autres numéros de saisie peuvent être exclus à la main.
- **Public « autres » :** le texte libre saisi est utilisé.
- **Thématique « Autre » :** la précision saisie la remplace.
- **Caractères absents de la police** (emojis…) : retirés.

## Mise en page

- **Fiches :** une fiche tient sur une demi-page. Si la description est longue, sa taille diminue jusqu'au minimum réglé ; au-delà, la fiche prend une page entière.
- **Pages d'introduction :** variables utilisables dans les textes : `{nb_bibliotheques}`, `{nb_animations}`, `{periode}`.
- **Images intercalaires :** la couverture compte comme page 1. Par défaut, les images sont placées en pages 8, 24, 40…
- **Carte :** les noms saisis sont associés aux communes même sans article (« La Teste-de-Buch ») ou avec une petite faute de frappe.

## Organisation du code

Le même code (`lib/`) sert au navigateur et à Node : le PDF est identique dans les deux cas.

| Chemin | Rôle |
|---|---|
| `web/` | application navigateur (page, styles, interface) |
| `scripts/build.js` | assemble l'application dans `_site/` (esbuild) |
| `scripts/serve.js` | serveur statique pour l'essai en local |
| `lib/data.js` | lecture et nettoyage des animations |
| `lib/pdf.js` | mise en page du programme |
| `lib/carte.js` | carte vectorielle des communes |
| `lib/kirby.js` | export Kirby (zip) |
| `lib/anonymiser.js` | export réduit aux colonnes publiques |
| `lib/reglages.js` | réglages par défaut (charte 2026) |
| `lib/node.js` | lecture des fichiers sur disque (ligne de commande) |
| `cli.js`, `anonymiser.js` | ligne de commande, utilisée par GitHub Actions |
| `entree/` | fichiers de la génération automatique |
| `.github/workflows/pages.yml` | publication de l'application sur GitHub Pages |
| `.github/workflows/programme.yml` | génération automatique du PDF |
| `fonts/` | Darker Grotesque (licence SIL OFL, voir `fonts/OFL.txt`) |
| `data/communes-gironde.json` | contours des communes ([france-geojson](https://github.com/gregoiredavid/france-geojson), données IGN/Etalab) |

Bibliothèques : [pdfkit](https://pdfkit.org), [pdf-lib](https://pdf-lib.js.org), [SheetJS](https://sheetjs.com), [fflate](https://github.com/101arrowz/fflate). Leurs licences sont copiées dans `_site/vendor/` à la construction.
