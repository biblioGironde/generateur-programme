#!/usr/bin/env node
// Génération en ligne de commande, utilisée aussi par GitHub Actions.
//
// Mode dossier (recommandé) :
//   node cli.js --dossier entree [--sortie sortie/programme.pdf] [--kirby sortie/agenda-kirby.zip]
//   Le dossier contient : l'export (export.tsv / .csv / .xlsx), reglages.json (facultatif),
//   couverture.jpg|png|pdf, quatrieme.jpg|png|pdf, intercalaires/*.jpg|png (facultatifs).
//
// Mode fichiers :
//   node cli.js export.tsv [--couverture f] [--quatrieme f] [--intercalaire f]... [--reglages f.json]
//
// Variables d'environnement prioritaires sur reglages.json (champs du workflow GitHub) :
//   QDNB_PERIODE_DEBUT, QDNB_PERIODE_FIN (AAAA-MM-JJ), QDNB_IDS_EXCLUS, QDNB_TRI (date|commune)
const fs = require('fs');
const path = require('path');
const { parseDate } = require('./lib/data');
const { genererPDF } = require('./lib/pdf');
const { zipKirby } = require('./lib/kirby');
const { trouverCommune } = require('./lib/carte');
const { chargerAnimations, colonnesSensiblesFichier, lireFichier, envPdf } = require('./lib/node');
const reglages = require('./lib/reglages');

const EXT_EXPORT = /\.(tsv|csv|txt|xlsx|xls)$/i;
const EXT_IMAGE = /\.(jpe?g|png)$/i;
const EXT_COUV = /\.(jpe?g|png|pdf)$/i;

function args() {
  const a = process.argv.slice(2);
  const o = { intercalaires: [], positionnels: [] };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--dossier') o.dossier = a[++i];
    else if (k === '--couverture') o.couverture = a[++i];
    else if (k === '--quatrieme') o.quatrieme = a[++i];
    else if (k === '--intercalaire') o.intercalaires.push(a[++i]);
    else if (k === '--reglages') o.reglages = a[++i];
    else if (k === '--sortie') o.sortie = a[++i];
    else if (k === '--kirby') o.kirby = a[++i];
    else if (k === '--verifier-anonyme') o.verifierAnonyme = true;
    else o.positionnels.push(k);
  }
  return o;
}

// Repère les fichiers d'entrée dans le dossier
function lireDossier(o) {
  const d = o.dossier;
  if (!fs.existsSync(d)) throw new Error(`Dossier « ${d} » introuvable.`);
  const noms = fs.readdirSync(d).filter((n) => !n.startsWith('.'));
  const trouver = (base, re) => {
    const n = noms.find((x) => path.parse(x).name.toLowerCase() === base && re.test(x));
    return n ? path.join(d, n) : null;
  };
  const exports = noms.filter((n) => EXT_EXPORT.test(n) && !/^readme/i.test(n));
  let exp = trouver('export', EXT_EXPORT);
  if (!exp) {
    if (exports.length === 1) exp = path.join(d, exports[0]);
    else if (exports.length > 1) throw new Error(`Plusieurs exports dans « ${d} » (${exports.join(', ')}) : nommez celui à utiliser « export.tsv » (ou .xlsx, .csv).`);
    else throw new Error(`Aucun export (TSV, CSV ou Excel) dans « ${d} ».`);
  }
  o.positionnels = [exp];
  o.couverture = o.couverture || trouver('couverture', EXT_COUV);
  o.quatrieme = o.quatrieme || trouver('quatrieme', EXT_COUV);
  const dInter = path.join(d, 'intercalaires');
  if (!o.intercalaires.length && fs.existsSync(dInter)) {
    o.intercalaires = fs.readdirSync(dInter).filter((n) => EXT_IMAGE.test(n)).sort().map((n) => path.join(dInter, n));
  }
  const rj = path.join(d, 'reglages.json');
  if (!o.reglages && fs.existsSync(rj)) o.reglages = rj;
}

function chargerReglages(o) {
  const R = reglages.avec(o.reglages ? JSON.parse(fs.readFileSync(o.reglages, 'utf8')) : {});
  const env = process.env;
  if (env.QDNB_PERIODE_DEBUT) R.periodeDebut = env.QDNB_PERIODE_DEBUT.trim();
  if (env.QDNB_PERIODE_FIN) R.periodeFin = env.QDNB_PERIODE_FIN.trim();
  if (env.QDNB_IDS_EXCLUS) R.idsExclus = [R.idsExclus, env.QDNB_IDS_EXCLUS].filter(Boolean).join(',');
  if (env.QDNB_TRI === 'date' || env.QDNB_TRI === 'commune') R.tri = env.QDNB_TRI;
  return R;
}

const fmt = (d) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '?');

async function main() {
  const o = args();
  if (o.dossier) lireDossier(o);
  if (!o.positionnels[0]) {
    console.log('Usage : node cli.js --dossier entree [--sortie programme.pdf] [--kirby agenda.zip]');
    console.log('    ou : node cli.js export.tsv [--couverture f] [--quatrieme f] [--intercalaire f] [--reglages f.json] [--sortie f.pdf]');
    process.exit(1);
  }
  const R = chargerReglages(o);
  const exp = o.positionnels[0];

  // Dépôt public : on refuse un export qui contient encore des données personnelles
  if (process.env.GITHUB_ACTIONS === 'true' || o.verifierAnonyme) {
    const sensibles = colonnesSensiblesFichier(exp);
    if (sensibles.length) {
      throw new Error(`L'export « ${path.basename(exp)} » contient des données personnelles (${sensibles.join(', ')}). ` +
        "Supprimez-le du dépôt ET de son historique, puis déposez la version produite par « node anonymiser.js » " +
        "ou par le bouton « Télécharger l’export anonymisé » de l’application.");
    }
  }
  const { animations, dateDebut, dateFin, total } = chargerAnimations(exp, {
    dateDebut: parseDate(R.periodeDebut), dateFin: parseDate(R.periodeFin),
    inclureSansDate: R.inclureSansDate, idsExclus: R.idsExclus,
  });
  if (!animations.length) throw new Error('Aucune animation retenue : vérifiez la période.');
  const communes = [...new Set(animations.map((a) => a.commune))];
  const stats = { nbAnimations: animations.length, nbBibliotheques: communes.length, dateDebut, dateFin };

  const res = await genererPDF(animations, R, {
    couverture: lireFichier(o.couverture), quatrieme: lireFichier(o.quatrieme),
    intercalaires: o.intercalaires.map(lireFichier),
  }, stats, envPdf());
  const sortie = o.sortie || `${R.nomFichier || 'programme-qdnb'}.pdf`;
  fs.mkdirSync(path.dirname(path.resolve(sortie)), { recursive: true });
  fs.writeFileSync(sortie, res.buffer);

  let zip = null;
  if (o.kirby) {
    const gabarit = path.join(__dirname, 'working-files', 'page-qdnb-programmation.txt');
    fs.mkdirSync(path.dirname(path.resolve(o.kirby)), { recursive: true });
    fs.writeFileSync(o.kirby, zipKirby(animations, fs.existsSync(gabarit) ? fs.readFileSync(gabarit, 'utf8') : null));
    zip = o.kirby;
  }

  const sansDate = animations.filter((a) => !a.debut).map((a) => `${a.commune} : ${a.titre} (n° ${a.id})`);
  const horsCarte = communes.filter((c) => !trouverCommune(c));
  const lignes = [
    `Export : ${path.basename(exp)} (${total} lignes)`,
    `${stats.nbAnimations} animations, ${stats.nbBibliotheques} bibliothèques, du ${fmt(dateDebut)} au ${fmt(dateFin)}`,
    `PDF : ${sortie} (${res.pages} pages)`,
  ];
  if (zip) lignes.push(`Export Kirby : ${zip}`);
  console.log(lignes.join('\n'));
  const avert = [...res.avertissements];
  if (sansDate.length) avert.push('Sans date : ' + sansDate.join(' ; '));
  if (horsCarte.length) avert.push('Absentes du fond de carte : ' + horsCarte.join(', '));
  avert.forEach((w) => console.log('⚠ ' + w));

  // Résumé affiché sur la page du workflow GitHub Actions
  if (process.env.GITHUB_STEP_SUMMARY) {
    let md = `## Programme de la Quinzaine du numérique\n\n| | |\n|---|---|\n`;
    md += `| Animations | **${stats.nbAnimations}** |\n| Bibliothèques | **${stats.nbBibliotheques}** |\n`;
    md += `| Période | du ${fmt(dateDebut)} au ${fmt(dateFin)} |\n| Pages | ${res.pages} |\n| Export lu | \`${path.basename(exp)}\` (${total} lignes) |\n`;
    if (avert.length) md += `\n### À vérifier\n\n${avert.map((w) => `- ${w}`).join('\n')}\n`;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }
}

main().catch((e) => {
  console.error('Erreur : ' + e.message);
  if (process.env.GITHUB_ACTIONS) console.log(`::error::${e.message}`);
  process.exit(1);
});
