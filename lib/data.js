// Lecture de l'export du formulaire (TSV, CSV, XLSX, XLS) et normalisation des animations
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

// Colonnes « thématiques » du formulaire : on les détecte automatiquement
// (toutes les colonnes entre animation_participation et animation_visuel)
const COLONNE_AUTRE_PRECISION = /^new_\d+$/;

function lireTableau(filePath, originalName) {
  const ext = path.extname(originalName || filePath).toLowerCase();
  let workbook;
  if (ext === '.tsv' || ext === '.txt') {
    // Lecture manuelle : SheetJS gère mal les TSV avec retours à la ligne entre guillemets
    return parseDelimited(fs.readFileSync(filePath, 'utf8'), '\t');
  } else if (ext === '.csv') {
    const txt = fs.readFileSync(filePath, 'utf8');
    const sep = (txt.split('\n')[0].match(/;/g) || []).length > (txt.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
    return parseDelimited(txt, sep);
  }
  workbook = xlsx.readFile(filePath, { cellDates: false, raw: true });
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  return xlsx.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
}

// Parseur CSV/TSV qui respecte les guillemets et les retours à la ligne dans les cellules
function parseDelimited(txt, sep) {
  txt = txt.replace(/^﻿/, '');
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < txt.length; i++) {
    const c = txt[i];
    if (inQ) {
      if (c === '"') {
        if (txt[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += c;
    } else if (c === '"') inQ = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && txt[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// Date : "15/11/2025", "2025-11-15", nombre de série Excel, ou objet Date
function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  if (typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v).trim())) {
    const n = Number(v);
    if (n > 20000 && n < 80000) {
      const d = xlsx.SSF.parse_date_code(n);
      return new Date(d.y, d.m - 1, d.d);
    }
    return null;
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    return new Date(y, Number(m[2]) - 1, Number(m[1]));
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return null;
}

// Heure ou durée : "14:30", "14h30", "1h", fraction Excel (0.604)
function parseHeure(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number' || /^0?\.\d+$/.test(String(v).trim())) {
    const n = Number(v);
    if (n >= 0 && n < 1) {
      const tot = Math.round(n * 24 * 60);
      return { h: Math.floor(tot / 60), m: tot % 60 };
    }
    return null;
  }
  const m = String(v).trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{0,2})/);
  if (m) return { h: Number(m[1]), m: Number(m[2] || 0) };
  return null;
}

const fmtHeure = (t) => (t ? `${t.h}h${t.m ? String(t.m).padStart(2, '0') : ''}` : '');
const fmtDuree = (t) => (t ? (t.h ? `${t.h}h${t.m ? String(t.m).padStart(2, '0') : ''}` : `${t.m} min`) : '');
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

function nettoyer(v) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function urlValide(u) {
  u = nettoyer(u);
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) {
    if (/^www\.|\.[a-z]{2,}(\/|$)/i.test(u)) u = 'https://' + u; else return '';
  }
  // URLs génériques laissées par défaut dans le formulaire
  if (/^https?:\/\/(www\.)?(instagram|facebook|tiktok)\.com\/?$/i.test(u)) return '';
  return u;
}

/**
 * Lit l'export et renvoie la liste des animations normalisées.
 * options.dateDebut / options.dateFin (Date) : période de l'édition. Si absentes,
 * on garde l'année la plus récente trouvée dans les données.
 */
function chargerAnimations(filePath, originalName, options = {}) {
  const rows = lireTableau(filePath, originalName);
  const hIdx = rows.findIndex((r) => r.some((c) => String(c).trim() === 'animation_titre'));
  if (hIdx < 0) throw new Error("Colonne « animation_titre » introuvable : est-ce bien l'export du formulaire ?");
  const header = rows[hIdx].map((c) => String(c).trim());
  const col = {};
  header.forEach((h, i) => { if (!(h in col)) col[h] = i; });
  const get = (r, name) => (name in col ? r[col[name]] : '');

  // Colonnes de thématiques (cases à cocher)
  const iDeb = col['animation_participation'];
  const iFin = col['animation_visuel'] !== undefined ? col['animation_visuel'] : header.length;
  const thematiques = [];
  for (let i = iDeb + 1; i < iFin; i++) {
    if (header[i] && !COLONNE_AUTRE_PRECISION.test(header[i])) thematiques.push(i);
  }
  const iAutrePrecision = header.findIndex((h) => COLONNE_AUTRE_PRECISION.test(h));

  const anims = [];
  for (const r of rows.slice(hIdx + 1)) {
    if (!r || r.length < 5) continue;
    const titre = nettoyer(get(r, 'animation_titre'));
    if (!titre) continue;
    if (String(get(r, 'webform_draft')).trim() === '1') continue; // brouillons

    const plusieursJours = /plusieurs/i.test(get(r, 'animation_duree_jour'));
    let debut = plusieursJours ? parseDate(get(r, 'animation_date_debut')) : parseDate(get(r, 'animation_date_f'));
    debut = debut || parseDate(get(r, 'animation_date_f')) || parseDate(get(r, 'animation_date_debut'));
    let fin = plusieursJours ? parseDate(get(r, 'animation_date_fin')) : null;
    if (fin && debut && fin <= debut) fin = null;

    const themes = [];
    for (const i of thematiques) {
      if (String(r[i] || '').trim()) {
        if (/^autre$/i.test(header[i]) && iAutrePrecision >= 0 && nettoyer(r[iAutrePrecision])) {
          themes.push(nettoyer(r[iAutrePrecision]));
        } else themes.push(header[i]);
      }
    }

    let pub = nettoyer(get(r, 'animation_public'));
    if (/^autres?$/i.test(pub)) pub = nettoyer(get(r, 'anim_public_autre')) || '';

    const horsLesMurs = /hors/i.test(get(r, 'anim_lieu'));
    const commune = nettoyer(get(r, 'commune')).replace(/\s+/g, ' ');

    anims.push({
      id: nettoyer(get(r, 'webform_serial')),
      soumission: parseDate(get(r, 'webform_time')),
      commune,
      reseau: nettoyer(get(r, 'cdc_reseau')),
      titre,
      description: nettoyer(get(r, 'animation_descriptif')),
      prestataire: nettoyer(get(r, 'animation_prestataire')),
      lieu: horsLesMurs ? nettoyer(get(r, 'anim_exterieur')) : '',
      horsLesMurs,
      debut, fin,
      heure: parseHeure(get(r, 'animation_heure')),
      duree: parseHeure(get(r, 'animation_duree_heure')),
      public: pub,
      participation: nettoyer(get(r, 'animation_participation')),
      themes,
      liens: {
        site: urlValide(get(r, 'url')),
        facebook: urlValide(get(r, 'facebook')),
        instagram: urlValide(get(r, 'instagram')),
        tiktok: urlValide(get(r, 'tiktok')),
      },
      visuel: urlValide(get(r, 'animation_visuel')),
    });
  }

  // Filtre sur la période de l'édition
  let { dateDebut, dateFin } = options;
  const datees = anims.filter((a) => a.debut);
  if (!dateDebut && !dateFin) {
    // Année la plus récente qui regroupe un nombre significatif d'animations
    // (évite qu'une faute de frappe « 2027 » ne fasse tout disparaître)
    const parAnnee = {};
    datees.forEach((a) => { const y = a.debut.getFullYear(); parAnnee[y] = (parAnnee[y] || 0) + 1; });
    const seuil = Math.max(3, datees.length * 0.05);
    const annees = Object.keys(parAnnee).map(Number).filter((y) => parAnnee[y] >= seuil);
    const annee = annees.length ? Math.max(...annees) : Math.max(...Object.keys(parAnnee).map(Number));
    const ds = datees.filter((a) => a.debut.getFullYear() === annee).map((a) => a.debut).sort((x, y) => x - y);
    dateDebut = ds[0];
    dateFin = ds[ds.length - 1];
  }
  let retenues = datees.filter((a) => (!dateDebut || (a.fin || a.debut) >= dateDebut) && (!dateFin || a.debut <= dateFin));

  // Animations sans date : gardées si saisies pendant la période de préparation de l'édition
  // et si une version datée n'existe pas déjà
  const cleTitre = (a) => (a.commune + '|' + a.titre).toLowerCase();
  const titresDates = new Set(retenues.map(cleTitre));
  const limiteSaisie = dateDebut ? new Date(dateDebut.getTime() - 200 * 86400000) : null;
  const sansDate = anims.filter((a) => !a.debut);
  if (options.inclureSansDate !== false) {
    retenues = retenues.concat(sansDate.filter((a) =>
      !titresDates.has(cleTitre(a)) &&
      (!limiteSaisie || !a.soumission || (a.soumission >= limiteSaisie && (!dateFin || a.soumission <= dateFin)))));
  }

  if (options.exclureTests !== false) {
    retenues = retenues.filter((a) => !/^titre anim|^test\b/i.test(a.titre) && a.titre.length > 2);
  }

  // Doublons (même commune, titre, date et heure) : on garde la saisie la plus récente
  const vus = new Map();
  for (const a of retenues) {
    const k = [cleTitre(a), a.debut ? a.debut.getTime() : '', a.heure ? a.heure.h * 60 + a.heure.m : ''].join('|');
    const prec = vus.get(k);
    if (!prec || Number(a.id) > Number(prec.id)) vus.set(k, a);
  }
  retenues = [...vus.values()];

  // Numéros de saisie écartés à la main (tests, annulations…)
  const exclus = new Set(String(options.idsExclus || '').split(/[\s,;]+/).filter(Boolean));
  if (exclus.size) retenues = retenues.filter((a) => !exclus.has(a.id));

  return { animations: retenues, total: anims.length, dateDebut, dateFin };
}

function trier(anims, mode) {
  // Les animations sans date passent en fin de liste
  const cle = (a) => [a.debut ? a.debut.getTime() : 9e15, a.heure ? a.heure.h * 60 + a.heure.m : 0];
  const coll = new Intl.Collator('fr', { sensitivity: 'base' });
  return [...anims].sort((a, b) => {
    if (mode === 'commune') {
      const c = coll.compare(a.commune, b.commune);
      if (c) return c;
    }
    const [da, ha] = cle(a), [db, hb] = cle(b);
    return da - db || ha - hb || coll.compare(a.commune, b.commune);
  });
}

module.exports = {
  chargerAnimations, lireTableau, trier, parseDate, fmtHeure, fmtDuree, isoDate, capitalize,
  JOURS, JOURS_COURTS, MOIS, MOIS_COURTS,
};
