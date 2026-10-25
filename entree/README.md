# Fichiers d'entrée du programme

Déposez ici les fichiers suivants, puis validez sur `main` : le programme est régénéré automatiquement.

> ⚠️ **Dépôt public : jamais l'export brut du formulaire** (noms, e-mails, adresses IP). Produisez `export.tsv` avec le bouton « Export anonymisé pour GitHub » du formulaire local, ou avec `node anonymiser.js export-brut.tsv entree/export.tsv`. Le workflow échoue s'il détecte un export brut.

| Fichier | Obligatoire | Contenu |
|---|---|---|
| `export.tsv` | oui | export du formulaire **anonymisé** (voir ci-dessous) |
| `couverture.jpg` / `.png` / `.pdf` | non | 1re de couverture |
| `quatrieme.jpg` / `.png` / `.pdf` | non | 4e de couverture |
| `intercalaires/*.jpg` / `*.png` | non | photos insérées entre les fiches |
| `reglages.json` | non | couleurs, textes, options (sinon charte 2026) |

S'il n'y a qu'un seul export dans le dossier, son nom importe peu. S'il y en a plusieurs, celui nommé `export.*` est utilisé.
