#!/usr/bin/env node
// Prépare l'export du formulaire pour le dépôt public :
//   node anonymiser.js export-brut.tsv entree/export.tsv
const fs = require('fs');
const path = require('path');
const { anonymiser } = require('./lib/anonymiser');

const [src, dest = path.join('entree', 'export.tsv')] = process.argv.slice(2);
if (!src) {
  console.log('Usage : node anonymiser.js export-brut.tsv [entree/export.tsv]');
  process.exit(1);
}
try {
  const r = anonymiser(src, src);
  fs.mkdirSync(path.dirname(path.resolve(dest)), { recursive: true });
  fs.writeFileSync(dest, r.tsv);
  console.log(`${r.lignes} lignes, ${r.colonnes} colonnes conservées -> ${dest}`);
  console.log('Colonnes supprimées : ' + [...new Set(r.supprimees)].join(', '));
} catch (e) {
  console.error('Erreur : ' + e.message);
  process.exit(1);
}
