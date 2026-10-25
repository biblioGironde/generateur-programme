// Export des animations au format Kirby : un dossier par commune, un sous-dossier par animation,
// le tout zippé en mémoire (navigateur comme Node), à déposer dans le dossier content/ du site.
const { zipSync, strToU8 } = require('fflate');
const { isoDate } = require('./data');

function slug(chaine) {
  return String(chaine).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sans-titre';
}

const hhmm = (t) => (t ? `${String(t.h).padStart(2, '0')}:${String(t.m).padStart(2, '0')}` : '');

/** Renvoie { 'commune/animation/page-qdnb-evenement.txt': texte, … } */
function fichiersKirby(animations, gabaritProgrammation) {
  const fichiers = {};
  const pris = new Set();
  for (const a of animations) {
    const dCommune = slug(a.commune);
    fichiers[`${dCommune}/page-qdnb-commune.txt`] = `Title: ${a.commune}\n\n----\n\nReseau: ${a.reseau}\n`;

    // Même titre dans la même commune à plusieurs dates : suffixe avec la date
    let nom = slug(a.titre);
    if (pris.has(dCommune + '/' + nom)) nom += '-' + (a.debut ? isoDate(a.debut) : a.id);
    pris.add(dCommune + '/' + nom);

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
    fichiers[`${dCommune}/${nom}/page-qdnb-evenement.txt`] =
      Object.entries(champs).map(([k, v]) => `${k}: ${v || ''}`).join('\n\n----\n\n') + '\n';
  }
  if (gabaritProgrammation) fichiers['page-qdnb-programmation.txt'] = gabaritProgrammation;
  return fichiers;
}

/** Zip de l'export Kirby (Uint8Array) */
function zipKirby(animations, gabaritProgrammation) {
  const arbre = {};
  for (const [chemin, texte] of Object.entries(fichiersKirby(animations, gabaritProgrammation))) {
    arbre[chemin] = [strToU8(texte), { level: 9 }];
  }
  return zipSync(arbre);
}

module.exports = { fichiersKirby, zipKirby, slug };
