# Générateur de programme · Quinzaine du numérique en bibliothèque

À partir de l'export du formulaire d'inscription (Framaforms : TSV, CSV ou Excel), génère :

- le **programme PDF A5** : couverture, pages d'introduction colorées, carte des communes participantes, une fiche par animation (2 par page), images intercalaires, tableau récapitulatif, pages de complément pour un livret ;
- facultativement l'**export Kirby** (un dossier par commune, un par animation), zippé, à déposer dans `content/` du site.

Deux façons de l'utiliser : **sur GitHub**, sans rien installer, ou **en local** avec un formulaire web.

---

## Sur GitHub (GitHub Actions)

> ⚠️ **Dépôt public : ne déposez jamais l'export brut du formulaire.** Il contient les noms, adresses e-mail et adresses IP des personnes qui ont saisi les animations. Déposez uniquement l'**export anonymisé** (voir ci-dessous) : il ne garde que les informations publiées dans le programme. Le workflow refuse de tourner s'il détecte un export brut.

### Préparer l'export anonymisé

Au choix :

- **avec le formulaire local** : choisissez l'export, puis cliquez sur **Export anonymisé pour GitHub** ;
- **en ligne de commande** : `node anonymiser.js export-brut.tsv entree/export.tsv`.

Colonnes supprimées : responsable, e-mail, adresse IP, identifiants de compte, logos et heure de saisie. Le PDF obtenu est strictement identique.

### Générer le programme

1. Dans le dossier `entree/` du dépôt, déposez (bouton **Add file → Upload files**) :
   - l'export **anonymisé**, nommé **`export.tsv`** ;
   - **`couverture.jpg`**, `.png` ou `.pdf` ;
   - facultatif : **`quatrieme.jpg`** / `.pdf` (4e de couverture) ;
   - facultatif : des photos dans **`entree/intercalaires/`** ;
   - facultatif : **`reglages.json`** (couleurs, textes…, voir plus bas).
2. Validez (**Commit changes**) sur la branche `main` : le workflow démarre tout seul.
3. Après environ une minute, le PDF et le zip Kirby sont disponibles :
   - dans la **release « programme »** (colonne de droite de la page du dépôt), à une adresse fixe que vous pouvez partager ;
   - et dans l'onglet **Actions**, sur l'exécution, rubrique *Artifacts* (conservés 30 jours).

Le résumé de l'exécution indique le nombre d'animations, la période retenue, les animations sans date et les communes introuvables sur la carte.

### Si un export brut a été poussé par erreur

Le supprimer dans un nouveau commit ne suffit pas : il reste lisible dans l'historique.

- **Dépôt récent, sans enjeu d'historique :** le plus sûr est de supprimer le dépôt sur GitHub (*Settings → Delete this repository*), puis de le recréer et d'y pousser une copie propre.
- **Sinon :** réécrivez l'historique avec [git filter-repo](https://github.com/newren/git-filter-repo) (`git filter-repo --invert-paths --path entree/NOM_DU_FICHIER`), puis faites un `git push --force`.
- **Dans tous les cas :** demandez au support GitHub de purger les vues en cache.

### Relancer avec d'autres options

Onglet **Actions → Générer le programme → Run workflow**. Champs disponibles :

- période de début et de fin ;
- numéros de saisie à exclure ;
- ordre des fiches ;
- export Kirby oui / non.

### Modifier couleurs, textes et mise en page

Éditez `entree/reglages.json` directement sur GitHub (icône crayon), ou plus simplement :

1. lancez le formulaire en local (voir plus bas) ;
2. réglez et vérifiez l'aperçu ;
3. cliquez **Télécharger reglages.json** ;
4. déposez le fichier dans `entree/`.

---

## En local (formulaire web)

```bash
npm install
npm start                # http://localhost:8100
```

Node 18 ou plus récent.

1. Choisir l'export : l'application affiche aussitôt le nombre d'animations retenues, la période détectée, les animations sans date et les communes absentes de la carte.
2. Ajouter couverture (JPG, PNG ou PDF), 4e de couverture et images intercalaires si besoin.
3. Ajuster couleurs, tailles, textes d'introduction, carte, tableau.
4. **Générer le programme** : aperçu dans la page et téléchargement.

**Enregistrer les réglages** les garde sur la machine (`config/reglages.json`). **Télécharger reglages.json** produit le fichier à déposer sur GitHub.

### Ligne de commande

```bash
node cli.js --dossier entree --sortie sortie/programme.pdf --kirby sortie/agenda-kirby.zip
node cli.js export.tsv --couverture couv.pdf --intercalaire photo.jpg --reglages reglages.json
```

---

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

## Fichiers

| Chemin | Rôle |
|---|---|
| `entree/` | fichiers d'entrée utilisés par GitHub Actions |
| `.github/workflows/programme.yml` | workflow de génération |
| `cli.js` | génération en ligne de commande |
| `anonymiser.js`, `lib/anonymiser.js` | export réduit aux colonnes publiques |
| `server.js`, `public/index.html` | formulaire web local |
| `lib/data.js` | lecture et nettoyage de l'export |
| `lib/pdf.js` | mise en page du programme |
| `lib/carte.js` | carte vectorielle des communes |
| `lib/kirby.js` | export Kirby (zip) |
| `lib/reglages.js` | réglages par défaut (charte 2026) |
| `fonts/` | Darker Grotesque (licence SIL OFL, voir `fonts/OFL.txt`) |
| `data/communes-gironde.geojson` | contours des communes ([france-geojson](https://github.com/gregoiredavid/france-geojson), données IGN/Etalab) |
| `working-files/page-qdnb-programmation.txt` | facultatif : copié tel quel dans l'export Kirby |
