// Application navigateur : tout le calcul se fait ici, aucun fichier n'est envoyé.
// Même code que la ligne de commande (dossier lib/), assemblé par esbuild (npm run build).
const { animationsDepuisLignes, parseDate } = require('../lib/data');
const { genererPDF } = require('../lib/pdf');
const { zipKirby } = require('../lib/kirby');
const { trouverCommune } = require('../lib/carte');
const anonymisation = require('../lib/anonymiser');
const reglages = require('../lib/reglages');

// Polices incluses dans le code (chargeur « binary » d'esbuild)
const POLICES = {
  medium: require('../fonts/darker-grotesque-latin-500-normal.woff'),
  bold: require('../fonts/darker-grotesque-latin-700-normal.woff'),
  black: require('../fonts/darker-grotesque-latin-900-normal.woff'),
};

const CLE_STOCKAGE = 'qdnb-reglages';
const $ = (s, el = document) => el.querySelector(s);
const etat = $('#etat');
let R = null;
let lignes = null;       // lignes de l'export chargé
let urls = [];           // URL blob à libérer

// ------------------------------------------------------------------ utilitaires

const scriptsCharges = {};
function chargerScript(src) {
  if (!scriptsCharges[src]) {
    scriptsCharges[src] = new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => ko(new Error('Impossible de charger ' + src));
      document.head.appendChild(s);
    });
  }
  return scriptsCharges[src];
}

const lire = (obj, chemin) => chemin.split('.').reduce((o, k) => (o ? o[k] : undefined), obj);
const ecrire = (obj, chemin, v) => {
  const ks = chemin.split('.'); const der = ks.pop();
  ks.reduce((o, k) => (o[k] = o[k] || {}), obj)[der] = v;
};
const echapper = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = (d) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '?');
const pause = () => new Promise((r) => setTimeout(r, 30));

function telecharger(donnees, nom, type) {
  const url = URL.createObjectURL(new Blob([donnees], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = nom;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function lienBlob(donnees, type) {
  const url = URL.createObjectURL(new Blob([donnees], { type }));
  urls.push(url);
  return url;
}

// ------------------------------------------------------------------ lecture des fichiers

async function lireExport(fichier) {
  if (/\.(xlsx|xls)$/i.test(fichier.name)) {
    await chargerScript('vendor/xlsx.full.min.js');
    const wb = window.XLSX.read(await fichier.arrayBuffer(), { type: 'array', raw: true });
    return window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' });
  }
  return anonymisation.lireTexte(await fichier.text(), /\.(tsv|txt)$/i.test(fichier.name) ? '\t' : null);
}

const pourPdf = async (f) => (f ? { nom: f.name, data: await f.arrayBuffer() } : null);

// ------------------------------------------------------------------ réglages

function chargerReglages() {
  let enregistres = {};
  try { enregistres = JSON.parse(localStorage.getItem(CLE_STOCKAGE) || '{}'); } catch (e) { /* stockage indisponible */ }
  R = reglages.avec(enregistres);
}
function memoriser() {
  R = collecter();
  try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(R)); } catch (e) { /* navigation privée */ }
}

document.querySelectorAll('[data-couleurs]').forEach((box) => {
  box.dataset.couleurs.split('|').forEach((def) => {
    const [cle, lib] = def.split(':');
    const l = document.createElement('label');
    l.className = 'couleur';
    l.innerHTML = `<input type="color" data-r="couleurs.${cle}"><input type="text" data-hex="couleurs.${cle}" maxlength="7"><span>${lib}</span>`;
    box.appendChild(l);
  });
});

function remplir() {
  document.querySelectorAll('[data-r]').forEach((el) => {
    const v = lire(R, el.dataset.r);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v === undefined || v === null ? '' : v;
    if (el.type === 'color') { const h = $(`[data-hex="${el.dataset.r}"]`); if (h) h.value = el.value; }
  });
  dessinerIntros();
}

function collecter() {
  const out = JSON.parse(JSON.stringify(R));
  document.querySelectorAll('[data-r]').forEach((el) => {
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (el.type === 'number') {
      if (el.value === '' || isNaN(Number(el.value))) return; // champ vide : valeur par défaut
      v = Number(el.value);
    }
    ecrire(out, el.dataset.r, v);
  });
  out.pagesIntro = [...document.querySelectorAll('.intro')].map((b) => ({
    texte: $('textarea', b).value,
    fond: $('[name=fond]', b).value,
    couleurTexte: $('[name=couleurTexte]', b).value,
    pageVideApres: $('[name=pageVideApres]', b).checked,
  }));
  return out;
}

function dessinerIntros() {
  $('#intros').innerHTML = '';
  (R.pagesIntro || []).forEach(ajouterIntro);
  majApercusIntro();
}
function ajouterIntro(p) {
  const b = document.createElement('div');
  b.className = 'intro';
  b.innerHTML = `
    <label>Texte de la page <span class="num"></span><textarea></textarea></label>
    <div class="cote">
      <label class="couleur"><input type="color" name="fond"><span>Fond</span></label>
      <label class="couleur"><input type="color" name="couleurTexte"><span>Texte</span></label>
      <label class="case"><input type="checkbox" name="pageVideApres"> Page de couleur vide après</label>
      <div class="apercu"></div>
      <button type="button" class="btn second petit suppr">Supprimer</button>
    </div>`;
  $('textarea', b).value = p.texte || '';
  $('[name=fond]', b).value = p.fond || '#47b654';
  $('[name=couleurTexte]', b).value = p.couleurTexte || '#ffffff';
  $('[name=pageVideApres]', b).checked = !!p.pageVideApres;
  $('.suppr', b).onclick = () => { b.remove(); majApercusIntro(); memoriser(); };
  $('#intros').appendChild(b);
}
function majApercusIntro() {
  document.querySelectorAll('.intro').forEach((b, i) => {
    $('.num', b).textContent = 'n° ' + (i + 1);
    const a = $('.apercu', b);
    a.style.background = $('[name=fond]', b).value;
    a.style.color = $('[name=couleurTexte]', b).value;
    a.textContent = $('textarea', b).value.slice(0, 120) + '…';
  });
}
$('#ajoutIntro').onclick = () => {
  ajouterIntro({ texte: '', fond: '#ffde1e', couleurTexte: '#47b654' });
  majApercusIntro();
  memoriser();
};

// Saisie : couleurs synchronisées, aperçus, mémorisation automatique
let minuterie = null;
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.type === 'color' && t.dataset.r) { const h = $(`[data-hex="${t.dataset.r}"]`); if (h) h.value = t.value; }
  if (t.dataset.hex && /^#[0-9a-f]{6}$/i.test(t.value)) $(`[data-r="${t.dataset.hex}"]`).value = t.value;
  if (t.closest('.intro')) majApercusIntro();
  if (t.type !== 'file') { clearTimeout(minuterie); minuterie = setTimeout(memoriser, 400); }
});

$('#exporterReglages').onclick = () => {
  memoriser();
  telecharger(JSON.stringify(R, null, 2) + '\n', 'reglages.json', 'application/json');
  etat.textContent = 'reglages.json exporté.';
};
$('#importerReglages').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    R = reglages.avec(JSON.parse(await f.text()));
    remplir(); memoriser(); analyser();
    etat.textContent = 'Réglages importés.';
  } catch (err) {
    etat.textContent = 'Fichier de réglages illisible : ' + err.message;
  }
  e.target.value = '';
};
$('#defauts').onclick = () => {
  if (!confirm('Revenir aux réglages par défaut (charte 2026) ? Les réglages actuels seront remplacés.')) return;
  R = reglages.avec({});
  remplir(); memoriser(); analyser();
  etat.textContent = 'Réglages par défaut rétablis.';
};

// ------------------------------------------------------------------ analyse de l'export

function selection() {
  R = collecter();
  const res = animationsDepuisLignes(lignes, {
    dateDebut: parseDate(R.periodeDebut), dateFin: parseDate(R.periodeFin),
    inclureSansDate: R.inclureSansDate, idsExclus: R.idsExclus,
  });
  const communes = [...new Set(res.animations.map((a) => a.commune))];
  return {
    ...res,
    stats: { nbAnimations: res.animations.length, nbBibliotheques: communes.length, dateDebut: res.dateDebut, dateFin: res.dateFin },
    horsCarte: communes.filter((c) => !trouverCommune(c)),
    sansDate: res.animations.filter((a) => !a.debut).map((a) => `${a.commune} : ${a.titre} (n° ${a.id})`),
  };
}

function analyser() {
  const box = $('#analyse');
  if (!lignes) { box.innerHTML = ''; return; }
  try {
    const s = selection();
    box.className = 'analyse';
    let h = `<strong>${s.stats.nbAnimations} animations</strong> dans <strong>${s.stats.nbBibliotheques} bibliothèques</strong>, du ${fmt(s.stats.dateDebut)} au ${fmt(s.stats.dateFin)} <span class="aide">(${s.total} lignes dans le fichier)</span>`;
    if (s.sansDate.length) h += `<ul><li>Sans date : ${s.sansDate.map(echapper).join(' ; ')}</li></ul>`;
    if (s.horsCarte.length) h += `<ul><li class="avert">Absentes du fond de carte : ${s.horsCarte.map(echapper).join(', ')}</li></ul>`;
    box.innerHTML = h;
  } catch (e) {
    box.className = 'analyse erreur';
    box.textContent = e.message;
  }
}

$('[name=export]').addEventListener('change', async (e) => {
  const f = e.target.files[0];
  lignes = null;
  $('#anonymiser').disabled = true;
  if (!f) { analyser(); return; }
  $('#analyse').className = 'analyse';
  $('#analyse').textContent = 'Lecture du fichier…';
  try {
    lignes = await lireExport(f);
    $('#anonymiser').disabled = false;
    analyser();
  } catch (err) {
    $('#analyse').className = 'analyse erreur';
    $('#analyse').textContent = err.message;
  }
});
['periodeDebut', 'periodeFin', 'inclureSansDate', 'idsExclus'].forEach((k) =>
  $(`[data-r="${k}"]`).addEventListener('change', analyser));

// ------------------------------------------------------------------ export anonymisé (dépôt GitHub)

$('#anonymiser').onclick = () => {
  if (!lignes) return;
  try {
    const r = anonymisation.anonymiser(lignes);
    telecharger(r.tsv, 'export.tsv', 'text/tab-separated-values;charset=utf-8');
    etat.textContent = `export.tsv anonymisé (${r.lignes} lignes) : à déposer dans entree/ sur GitHub.`;
  } catch (e) {
    etat.textContent = 'Erreur : ' + e.message;
  }
};

// Lien vers le dossier entree/ du dépôt quand la page est servie par GitHub Pages
(() => {
  const m = location.hostname.match(/^([^.]+)\.github\.io$/);
  const depot = location.pathname.split('/').filter(Boolean)[0];
  if (m && depot) {
    $('#lienDepot').innerHTML = `<a class="btn second petit" href="https://github.com/${m[1]}/${depot}/upload/main/entree" target="_blank" rel="noopener">Ouvrir le dossier entree/ sur GitHub</a>`;
  }
})();

// ------------------------------------------------------------------ génération

$('#form').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!lignes) { etat.textContent = "Choisissez d'abord l'export du formulaire."; return; }
  const btn = $('#generer');
  btn.disabled = true;
  etat.textContent = 'Génération en cours…';
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
  try {
    memoriser();
    await Promise.all([chargerScript('vendor/pdfkit.standalone.js'), chargerScript('vendor/pdf-lib.min.js')]);
    const s = selection();
    if (!s.animations.length) throw new Error('Aucune animation retenue : vérifiez la période.');
    const fichiers = {
      couverture: await pourPdf($('[name=couverture]').files[0]),
      quatrieme: await pourPdf($('[name=quatrieme]').files[0]),
      intercalaires: await Promise.all([...$('[name=intercalaires]').files].map(pourPdf)),
    };
    await pause(); // laisse le navigateur afficher « Génération en cours »
    const res = await genererPDF(s.animations, R, fichiers, s.stats, {
      PDFDocument: window.PDFDocument, PDFLib: window.PDFLib.PDFDocument, polices: POLICES,
    });
    const nom = (R.nomFichier || 'programme-qdnb').replace(/[^\w.-]+/g, '-');
    const urlPdf = lienBlob(res.buffer, 'application/pdf');
    let h = `<p>${s.stats.nbAnimations} animations, ${s.stats.nbBibliotheques} bibliothèques, <strong>${res.pages} pages</strong>.</p>`;
    h += `<div class="actions"><a class="btn principal" href="${urlPdf}" download="${nom}.pdf">Télécharger le PDF</a>`;
    if (R.kirby && R.kirby.generer) {
      const urlZip = lienBlob(zipKirby(s.animations, null), 'application/zip');
      h += `<a class="btn second" href="${urlZip}" download="${nom}-agenda-kirby.zip">Télécharger l'export Kirby</a>`;
    }
    h += '</div>';
    const avert = [...res.avertissements];
    if (s.horsCarte.length) avert.push('Absentes du fond de carte : ' + s.horsCarte.join(', '));
    if (avert.length) h += '<ul>' + avert.map((w) => `<li class="avert">${echapper(w)}</li>`).join('') + '</ul>';
    $('#resume').innerHTML = h;
    $('#apercu').src = urlPdf;
    $('#resultat').hidden = false;
    $('#resultat').scrollIntoView({ behavior: 'smooth' });
    etat.textContent = 'Programme généré.';
  } catch (err) {
    console.error(err);
    etat.textContent = 'Erreur : ' + err.message;
  } finally {
    btn.disabled = false;
  }
});

chargerReglages();
remplir();
