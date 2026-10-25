// Construit l'application navigateur dans _site/ (publiée sur GitHub Pages)
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const racine = path.join(__dirname, '..');
const site = path.join(racine, '_site');
const nm = (p) => path.join(racine, 'node_modules', p);

fs.rmSync(site, { recursive: true, force: true });
fs.mkdirSync(path.join(site, 'vendor'), { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(racine, 'web', 'app.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  loader: { '.woff': 'binary' },
  outfile: path.join(site, 'app.js'),
  legalComments: 'none',
});

for (const f of ['index.html', 'app.css']) fs.copyFileSync(path.join(racine, 'web', f), path.join(site, f));
fs.writeFileSync(path.join(site, '.nojekyll'), '');

// Bibliothèques navigateur, servies par le même site (aucun appel externe)
const vendor = {
  'pdfkit.standalone.js': nm('pdfkit/js/pdfkit.standalone.js'),
  'pdf-lib.min.js': nm('pdf-lib/dist/pdf-lib.min.js'),
  'xlsx.full.min.js': nm('xlsx/dist/xlsx.full.min.js'),
  'LICENSE-pdfkit.txt': nm('pdfkit/LICENSE'),
  'LICENSE-pdf-lib.txt': nm('pdf-lib/LICENSE.md'),
  'LICENSE-sheetjs.txt': nm('xlsx/LICENSE'),
};
for (const [nom, src] of Object.entries(vendor)) {
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(site, 'vendor', nom));
  else if (!/^LICENSE/.test(nom)) throw new Error('Fichier manquant : ' + src);
}

const taille = (f) => (fs.statSync(path.join(site, f)).size / 1024).toFixed(0) + ' Ko';
console.log(`_site/ prêt : app.js ${taille('app.js')}, pdfkit ${taille('vendor/pdfkit.standalone.js')}, pdf-lib ${taille('vendor/pdf-lib.min.js')}`);
