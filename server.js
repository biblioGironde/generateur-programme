// Générateur du programme de la Quinzaine du numérique en bibliothèque
const express = require('express');
const multer = require('multer');
const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { chargerAnimations, parseDate } = require('./lib/data');
const { genererPDF } = require('./lib/pdf');
const { trouverCommune } = require('./lib/carte');
const { exporterKirby, zipper } = require('./lib/kirby');
const { anonymiser } = require('./lib/anonymiser');
const reglages = require('./lib/reglages');

const app = express();
const SORTIES = path.join(__dirname, 'public', 'sorties');
fs.ensureDirSync(SORTIES);

const upload = multer({ dest: path.join(os.tmpdir(), 'qdnb-uploads'), limits: { fileSize: 60 * 1024 * 1024 } });
const champs = upload.fields([
  { name: 'export', maxCount: 1 },
  { name: 'couverture', maxCount: 1 },
  { name: 'quatrieme', maxCount: 1 },
  { name: 'intercalaires', maxCount: 12 },
]);

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/reglages', (req, res) => res.json(reglages.charger()));
app.get('/api/reglages/defauts', (req, res) => res.json(reglages.DEFAUTS));
app.post('/api/reglages', (req, res) => {
  reglages.enregistrer(req.body || {});
  res.json({ ok: true });
});

function lireReglages(req) {
  let R = reglages.charger();
  if (req.body && req.body.reglages) {
    try { R = reglages.fusion(R, JSON.parse(req.body.reglages)); } catch { /* réglages invalides : défauts */ }
  }
  return R;
}

function analyser(fichier, R) {
  const res = chargerAnimations(fichier.path, fichier.originalname, {
    dateDebut: parseDate(R.periodeDebut),
    dateFin: parseDate(R.periodeFin),
    inclureSansDate: R.inclureSansDate,
    idsExclus: R.idsExclus,
  });
  const communes = [...new Set(res.animations.map((a) => a.commune))];
  return {
    ...res,
    stats: {
      nbAnimations: res.animations.length,
      nbBibliotheques: communes.length,
      dateDebut: res.dateDebut,
      dateFin: res.dateFin,
    },
    horsCarte: communes.filter((c) => !trouverCommune(c)),
    sansDate: res.animations.filter((a) => !a.debut).map((a) => `${a.commune} : ${a.titre} (n° ${a.id})`),
  };
}

const nettoyer = (req) => {
  for (const liste of Object.values(req.files || {})) for (const f of liste) fs.remove(f.path).catch(() => {});
};

// Export réduit aux colonnes utiles, sans données personnelles (pour le dépôt GitHub public)
app.post('/api/anonymiser', champs, (req, res) => {
  try {
    const f = req.files && req.files.export && req.files.export[0];
    if (!f) return res.status(400).json({ erreur: "Aucun fichier d'export reçu." });
    const { tsv } = anonymiser(f.path, f.originalname);
    res.set('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="export.tsv"');
    res.send(tsv);
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  } finally {
    nettoyer(req);
  }
});

// Aperçu des données avant génération
app.post('/api/analyser', champs, (req, res) => {
  try {
    const f = req.files && req.files.export && req.files.export[0];
    if (!f) return res.status(400).json({ erreur: "Aucun fichier d'export reçu." });
    const a = analyser(f, lireReglages(req));
    res.json({ stats: a.stats, horsCarte: a.horsCarte, sansDate: a.sansDate, total: a.total });
  } catch (e) {
    res.status(400).json({ erreur: e.message });
  } finally {
    nettoyer(req);
  }
});

app.post('/api/generer', champs, async (req, res) => {
  try {
    const R = lireReglages(req);
    const f = req.files && req.files.export && req.files.export[0];
    if (!f) return res.status(400).json({ erreur: "Aucun fichier d'export reçu." });
    const a = analyser(f, R);
    if (!a.animations.length) return res.status(400).json({ erreur: 'Aucune animation retenue : vérifiez la période.' });

    const fichiers = {
      couverture: req.files.couverture && req.files.couverture[0],
      quatrieme: req.files.quatrieme && req.files.quatrieme[0],
      intercalaires: req.files.intercalaires || [],
    };
    const { buffer, pages, avertissements } = await genererPDF(a.animations, R, fichiers, a.stats);
    const nom = (R.nomFichier || 'programme-qdnb').replace(/[^\w.-]+/g, '-');
    await fs.writeFile(path.join(SORTIES, `${nom}.pdf`), buffer);
    const resultat = { pdf: `sorties/${nom}.pdf?v=${Date.now()}`, pages, stats: a.stats, avertissements, horsCarte: a.horsCarte };

    if (R.kirby && R.kirby.generer) {
      const dossier = path.join(__dirname, 'output');
      await exporterKirby(a.animations, dossier, path.join(__dirname, 'working-files', 'page-qdnb-programmation.txt'));
      const zip = path.join(SORTIES, `${nom}-agenda.zip`);
      await zipper(dossier, zip);
      resultat.zip = `sorties/${nom}-agenda.zip?v=${Date.now()}`;
    }
    res.json(resultat);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erreur: e.message });
  } finally {
    nettoyer(req);
  }
});

const PORT = process.env.PORT || 8100;
app.listen(PORT, process.env.IP, () => console.log(`Générateur QDNB : http://localhost:${PORT}`));
