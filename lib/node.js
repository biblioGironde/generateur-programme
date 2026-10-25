// Fonctions propres à Node (ligne de commande, GitHub Actions) : lecture des fichiers sur disque.
// Tout le reste est le même code que celui exécuté dans le navigateur.
const fs = require('fs');
const path = require('path');
const { lireTexte, anonymiser, colonnesSensibles } = require('./anonymiser');
const { animationsDepuisLignes } = require('./data');
const { POLICES } = require('./pdf');

function lireTableau(fichier) {
  const ext = path.extname(fichier).toLowerCase();
  if (ext === '.tsv' || ext === '.txt') return lireTexte(fs.readFileSync(fichier, 'utf8'), '\t');
  if (ext === '.csv') return lireTexte(fs.readFileSync(fichier, 'utf8'), null);
  const xlsx = require('xlsx');
  const wb = xlsx.readFile(fichier, { cellDates: false, raw: true });
  return xlsx.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
}

const chargerAnimations = (fichier, options) => animationsDepuisLignes(lireTableau(fichier), options);
const anonymiserFichier = (fichier) => anonymiser(lireTableau(fichier));
const colonnesSensiblesFichier = (fichier) => colonnesSensibles(lireTableau(fichier));

// Fichier pour le PDF (couverture, intercalaire…) : { nom, data }
const lireFichier = (p) => (p ? { nom: path.basename(p), data: fs.readFileSync(p) } : null);

// Dépendances du générateur PDF
function envPdf() {
  const dossier = path.join(__dirname, '..', 'fonts');
  const polices = {};
  for (const [k, f] of Object.entries(POLICES)) {
    const p = path.join(dossier, f);
    if (fs.existsSync(p)) polices[k] = fs.readFileSync(p);
  }
  return { PDFDocument: require('pdfkit'), PDFLib: require('pdf-lib').PDFDocument, polices };
}

module.exports = { lireTableau, chargerAnimations, anonymiserFichier, colonnesSensiblesFichier, lireFichier, envPdf };
