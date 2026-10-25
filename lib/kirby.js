// Export des animations au format Kirby (un dossier par commune, un sous-dossier par animation)
// puis zip, à déposer dans le dossier content/ du site.
const fs = require('fs-extra');
const path = require('path');
const archiver = require('archiver');
const { isoDate } = require('./data');

function slug(chaine) {
  return String(chaine).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sans-titre';
}

const hhmm = (t) => (t ? `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` : '');

async function exporterKirby(animations, dossierSortie, gabaritProgrammation) {
  await fs.remove(dossierSortie);
  await fs.ensureDir(dossierSortie);
  const pris = new Set();
  for (const a of animations) {
    const dCommune = path.join(dossierSortie, slug(a.commune));
    await fs.ensureDir(dCommune);
    await fs.writeFile(path.join(dCommune, 'page-qdnb-commune.txt'), `Title: ${a.commune}\n\n----\n\nReseau: ${a.reseau}\n`);

    // Même titre dans la même commune à plusieurs dates : suffixe avec la date
    let nom = slug(a.titre);
    if (pris.has(a.commune + '/' + nom)) nom += '-' + (a.debut ? isoDate(a.debut) : a.id);
    pris.add(a.commune + '/' + nom);
    const dEvt = path.join(dCommune, nom);
    await fs.ensureDir(dEvt);

    const champs = {
      Title: a.titre,
      Tags: a.themes.join(', '),
      Startdate: a.debut ? isoDate(a.debut) : '',
      Enddate: a.fin ? isoDate(a.fin) : (a.debut ? isoDate(a.debut) : ''),
      Heure: hhmm(a.heure),
      Duree: hhmm(a.duree),
      Description: a.description,
      Link: a.liens.site,
      Facebook: a.liens.facebook,
      Tiktok: a.liens.tiktok,
      Instagram: a.liens.instagram,
      Prestataire: a.prestataire,
      Public: a.public,
      Participation: a.participation,
      Lieu: a.lieu,
      Visuel: a.visuel,
      Commune: a.commune,
    };
    const txt = Object.entries(champs).map(([k, v]) => `${k}: ${v || ''}`).join('\n\n----\n\n');
    await fs.writeFile(path.join(dEvt, 'page-qdnb-evenement.txt'), txt + '\n');
  }
  if (gabaritProgrammation && (await fs.pathExists(gabaritProgrammation))) {
    await fs.copy(gabaritProgrammation, path.join(dossierSortie, 'page-qdnb-programmation.txt'));
  }
}

function zipper(source, cible) {
  return new Promise((resolve, reject) => {
    const out = fs.createWriteStream(cible);
    const archive = archiver('zip', { zlib: { level: 9 } });
    out.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(out);
    archive.directory(source, false);
    archive.finalize();
  });
}

module.exports = { exporterKirby, zipper };
