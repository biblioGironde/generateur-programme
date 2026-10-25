// Génération du programme PDF (A5) : couverture, pages d'intro, carte,
// fiches animations (2 par page), images intercalaires, tableau récapitulatif.
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLib } = require('pdf-lib');
const { dessinerCarte } = require('./carte');
const { trier, fmtHeure, fmtDuree, capitalize, JOURS, JOURS_COURTS, MOIS, MOIS_COURTS } = require('./data');

const A5 = [419.53, 595.28];
const [W, H] = A5;
const CM = 28.35;
const MARGE = CM;
const LARGEUR = W - 2 * MARGE;

const FONTS_DIR = path.join(__dirname, '..', 'fonts');
const POLICES = {
  medium: 'darker-grotesque-latin-500-normal.woff',
  bold: 'darker-grotesque-latin-700-normal.woff',
  black: 'darker-grotesque-latin-900-normal.woff',
};

// ------------------------------------------------------------------ texte

function creerSanitize(doc) {
  const cache = {};
  return (txt, police) => {
    if (!txt) return '';
    doc.font(police);
    const f = doc._font && doc._font.font;
    txt = String(txt).replace(/[\u2028\u2029]/g, '\n').replace(/[\u00a0\u202f\u2009]/g, ' ')
      .replace(/\ufe0f/g, '');
    if (!f || !f.hasGlyphForCodePoint) return txt;
    let out = '';
    for (const ch of txt) {
      if (ch === '\n' || ch === ' ') { out += ch; continue; }
      const k = police + ch;
      if (!(k in cache)) {
        const cp = ch.codePointAt(0);
        cache[k] = f.hasGlyphForCodePoint(cp) ? ch : (REMPLACEMENTS[ch] !== undefined ? REMPLACEMENTS[ch] : '');
      }
      out += cache[k];
    }
    return out.replace(/ {2,}/g, ' ');
  };
}
const REMPLACEMENTS = { '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '—', '\u2032': "'", '\u2033': '"', '\u2022': '·', '\u2192': '->', '\u00ad': '' };

// Découpe un texte en lignes pour une largeur donnée (gère les retours à la ligne et les mots trop longs)
function couperLignes(doc, txt, police, taille, largeur) {
  doc.font(police).fontSize(taille);
  const lignes = [];
  for (const para of String(txt).split('\n')) {
    if (!para.trim()) { lignes.push(''); continue; }
    let ligne = '';
    for (let mot of para.split(/ +/)) {
      if (!mot) continue;
      // Mot plus long que la colonne (URL…) : on le coupe
      while (doc.widthOfString(mot) > largeur) {
        let n = mot.length;
        while (n > 1 && doc.widthOfString((ligne ? ligne + ' ' : '') + mot.slice(0, n)) > largeur) n--;
        if (n <= 1 && ligne) { lignes.push(ligne); ligne = ''; continue; }
        lignes.push((ligne ? ligne + ' ' : '') + mot.slice(0, n));
        ligne = '';
        mot = mot.slice(n);
      }
      const essai = ligne ? ligne + ' ' + mot : mot;
      if (doc.widthOfString(essai) <= largeur) ligne = essai;
      else { lignes.push(ligne); ligne = mot; }
    }
    if (ligne) lignes.push(ligne);
  }
  while (lignes.length && lignes[lignes.length - 1] === '') lignes.pop();
  return lignes;
}

// Bloc de lignes : mesure (dessiner = false) ou dessin. Renvoie la hauteur.
function bloc(doc, lignes, { x, y, police, taille, couleur, interligne = 1.22, dessiner, lien, souligne }) {
  const lh = taille * interligne;
  if (dessiner) {
    doc.font(police).fontSize(taille).fillColor(couleur);
    lignes.forEach((l, i) => {
      if (l) doc.text(l, x, y + i * lh, { lineBreak: false, link: lien || null, underline: !!souligne });
    });
  }
  return lignes.length * lh;
}

// ------------------------------------------------------------------ dates

function libelleDateTableau(a) {
  if (!a.debut) return 'date à préciser';
  const court = (d) => `${JOURS_COURTS[d.getDay()]} ${d.getDate()} ${MOIS_COURTS[d.getMonth()]}`;
  if (a.fin) {
    const memeMois = a.fin.getMonth() === a.debut.getMonth();
    return `du ${a.debut.getDate()}${memeMois ? '' : ' ' + MOIS_COURTS[a.debut.getMonth()]} au ${a.fin.getDate()} ${MOIS_COURTS[a.fin.getMonth()]}`;
  }
  return court(a.debut);
}

function lignesDate(a) {
  if (!a.debut) return { lignes: ['Date', 'à préciser'], reduit: true };
  const h = a.heure ? fmtHeure(a.heure) : '';
  if (a.fin) {
    const d = a.debut, f = a.fin;
    const l = [`Du ${JOURS[d.getDay()]}`, `${d.getDate()} ${MOIS[d.getMonth()]}`, `au ${JOURS[f.getDay()]}`, `${f.getDate()} ${MOIS[f.getMonth()]}`];
    if (h) l.push(h);
    return { lignes: l, reduit: true };
  }
  const l = [capitalize(JOURS[a.debut.getDay()]), String(a.debut.getDate()), MOIS[a.debut.getMonth()]];
  if (h) l.push(h);
  return { lignes: l, reduit: false };
}

function periodeTexte(d1, d2) {
  if (!d1 || !d2) return '';
  const memeAn = d1.getFullYear() === d2.getFullYear();
  return `du ${d1.getDate()} ${MOIS[d1.getMonth()]}${memeAn ? '' : ' ' + d1.getFullYear()} au ${d2.getDate()} ${MOIS[d2.getMonth()]} ${d2.getFullYear()}`;
}

// ------------------------------------------------------------------ fiche animation

/**
 * Mesure ou dessine une fiche animation à partir de (MARGE, y0).
 * tailleDesc : taille de la description (ajustable pour tenir dans l'espace dispo).
 * hauteurMax : si fournie au dessin, la description est tronquée pour ne pas déborder.
 */
function fiche(doc, a, y0, R, S, tailleDesc, dessiner, hauteurMax) {
  const c = R.couleurs, t = R.tailles;
  const P = doc.__polices;
  const xG = MARGE, lG = 140;
  const xD = MARGE + 152, lD = LARGEUR - 152;

  // --- colonne gauche : date, horaires, public
  let yG = y0;
  const dt = lignesDate(a);
  const tDate = dt.reduit ? t.date * 0.72 : t.date;
  yG += bloc(doc, dt.lignes.map((l) => S(l, P.black)), { x: xG, y: yG, police: P.black, taille: tDate, couleur: c.date, interligne: 1.08, dessiner });
  yG += t.infos * 0.9;
  const infos = [];
  if (a.duree) infos.push('Durée : ' + fmtDuree(a.duree));
  if (a.public) infos.push(a.public.toUpperCase());
  if (a.participation) infos.push(a.participation.toUpperCase());
  for (const inf of infos) {
    const l = couperLignes(doc, S(inf, P.bold), P.bold, t.infos, lG);
    yG += bloc(doc, l, { x: xG, y: yG, police: P.bold, taille: t.infos, couleur: c.infos, interligne: 1.45, dessiner });
  }

  // --- colonne droite : bibliothèque, liens, thématiques
  let yD = y0;
  const tPetit = t.infos;
  const intitule = a.horsLesMurs ? 'Hors les murs, bibliothèque de' : 'À la bibliothèque de';
  yD += bloc(doc, [S(intitule, P.bold)], { x: xD, y: yD, police: P.bold, taille: tPetit, couleur: c.bibliotheque, dessiner });
  yD += tPetit * 0.5;
  const lCommune = couperLignes(doc, S(a.commune, P.black), P.black, t.commune, lD);
  yD += bloc(doc, lCommune, { x: xD, y: yD, police: P.black, taille: t.commune, couleur: c.bibliotheque, interligne: 1.15, dessiner });
  yD += tPetit * 0.4;
  if (a.lieu) {
    const l = couperLignes(doc, S(a.lieu, P.medium), P.medium, tPetit, lD);
    yD += bloc(doc, l, { x: xD, y: yD, police: P.medium, taille: tPetit, couleur: c.bibliotheque, dessiner });
    yD += tPetit * 0.4;
  }
  const liens = [['Site de la bibliothèque', a.liens.site], ['Facebook', a.liens.facebook], ['Instagram', a.liens.instagram], ['TikTok', a.liens.tiktok]].filter((l) => l[1]);
  for (const [lib, url] of liens) {
    yD += bloc(doc, [lib], { x: xD, y: yD, police: P.medium, taille: tPetit, couleur: c.liens, interligne: 1.45, dessiner, lien: url, souligne: true });
  }
  if (a.themes.length) {
    yD += tPetit * 0.9;
    const l = couperLignes(doc, S(a.themes.join(' - '), P.bold), P.bold, tPetit, lD);
    yD += bloc(doc, l, { x: xD, y: yD, police: P.bold, taille: tPetit, couleur: c.themes, interligne: 1.3, dessiner });
  }

  // --- titre
  let y = Math.max(yG, yD) + t.titre * 1.4;
  const lTitre = couperLignes(doc, S(a.titre.toUpperCase(), P.black), P.black, t.titre, LARGEUR);
  y += bloc(doc, lTitre, { x: MARGE, y, police: P.black, taille: t.titre, couleur: c.titre, interligne: 1.15, dessiner });
  y += tailleDesc * 1.3;

  // --- description sur deux colonnes
  const gap = 14, lCol = (LARGEUR - gap) / 2;
  let desc = a.description;
  if (a.prestataire && !desc.toLowerCase().includes(a.prestataire.toLowerCase())) {
    desc += (desc ? '\n\n' : '') + 'Animation proposée par : ' + a.prestataire;
  }
  let lignes = couperLignes(doc, S(desc, P.medium), P.medium, tailleDesc, lCol);
  const lh = tailleDesc * 1.3;
  // Texte court : une seule colonne ; sinon répartition équilibrée sur deux colonnes
  let parCol = lignes.length <= 6 ? lignes.length : Math.ceil(lignes.length / 2);
  // Évite de commencer la 2e colonne par une ligne vide
  if (lignes[parCol] === '') parCol++;
  let col1 = lignes.slice(0, parCol), col2 = lignes.slice(parCol);
  while (col2[0] === '') col2.shift();
  let hDesc = Math.max(col1.length, col2.length) * lh;

  if (dessiner && hauteurMax && y + hDesc > y0 + hauteurMax) {
    // Dernier recours : on tronque proprement
    const nMax = Math.max(1, Math.floor((y0 + hauteurMax - y) / lh));
    col1 = col1.slice(0, nMax); col2 = col2.slice(0, nMax);
    const der = col2.length ? col2 : col1;
    der[der.length - 1] = der[der.length - 1].replace(/\s*\S*$/, '') + ' […]';
    hDesc = nMax * lh;
  }
  if (dessiner) {
    bloc(doc, col1, { x: MARGE, y, police: P.medium, taille: tailleDesc, couleur: c.description, interligne: 1.3, dessiner });
    bloc(doc, col2, { x: MARGE + lCol + gap, y, police: P.medium, taille: tailleDesc, couleur: c.description, interligne: 1.3, dessiner });
  }
  return y + hDesc - y0;
}

// ------------------------------------------------------------------ assemblage

/**
 * fichiers : { couverture, quatrieme, intercalaires: [] } (chemins + type mime)
 * Renvoie { buffer, pages, avertissements }
 */
async function genererPDF(animations, R, fichiers = {}, stats = {}) {
  const avertissements = [];
  const doc = new PDFDocument({ size: A5, margin: 0, autoFirstPage: false, bufferPages: true, info: { Title: 'Programme de la Quinzaine du numérique en bibliothèque', Author: 'biblio.gironde' } });
  const morceaux = [];
  doc.on('data', (b) => morceaux.push(b));
  const fini = new Promise((res) => doc.on('end', res));

  for (const [k, f] of Object.entries(POLICES)) {
    const p = path.join(FONTS_DIR, f);
    if (fs.existsSync(p)) doc.registerFont(k, p);
  }
  doc.__polices = {
    medium: fs.existsSync(path.join(FONTS_DIR, POLICES.medium)) ? 'medium' : 'Helvetica',
    bold: fs.existsSync(path.join(FONTS_DIR, POLICES.bold)) ? 'bold' : 'Helvetica-Bold',
    black: fs.existsSync(path.join(FONTS_DIR, POLICES.black)) ? 'black' : 'Helvetica-Bold',
  };
  const P = doc.__polices;
  const S = creerSanitize(doc);

  const couv = fichiers.couverture;
  const estPdf = (f) => /pdf$/i.test((f && (f.mimetype || f.originalname)) || '');
  // Une couverture PDF est fusionnée à la fin, mais compte déjà comme page 1
  const couvPdf = couv && estPdf(couv) ? couv : null;
  const intercalaires = (fichiers.intercalaires || []).filter(Boolean);
  let iInter = 0;
  const numeroAbsolu = () => doc.bufferedPageRange().count + (couvPdf ? 1 : 0) + 1; // numéro de la prochaine page

  const pageImage = (img) => {
    doc.addPage();
    try {
      doc.image(img.path, 0, 0, { cover: [W, H], align: 'center', valign: 'center' });
    } catch (e) {
      avertissements.push(`Image « ${img.originalname || path.basename(img.path)} » illisible (JPG ou PNG attendu).`);
    }
  };
  // Toute nouvelle page passe par ici, pour placer les images intercalaires au bon endroit
  const nouvellePage = (fond) => {
    const I = R.intercalaires;
    while (intercalaires.length && I.intervalle > 0) {
      const n = numeroAbsolu();
      if (n >= I.premierePage && (n - I.premierePage) % I.intervalle === 0) {
        pageImage(intercalaires[iInter % intercalaires.length]);
        iInter++;
      } else break;
    }
    doc.addPage();
    if (fond) doc.rect(0, 0, W, H).fill(fond);
  };

  // Couverture image : dessinée directement
  if (couv && !couvPdf) {
    doc.addPage();
    try { doc.image(couv.path, 0, 0, { cover: [W, H], align: 'center', valign: 'center' }); }
    catch { avertissements.push('Couverture illisible : utilisez un JPG, un PNG ou un PDF.'); }
  }

  // --- Pages d'introduction et carte
  const variables = {
    nb_bibliotheques: stats.nbBibliotheques,
    nb_communes: stats.nbBibliotheques,
    nb_animations: stats.nbAnimations,
    periode: periodeTexte(stats.dateDebut, stats.dateFin),
  };
  const remplir = (txt) => String(txt || '').replace(/\{(\w+)\}/g, (m, k) => (variables[k] !== undefined ? variables[k] : m));

  const pageCarte = () => {
    nouvellePage(R.couleurs.carteFond);
    let yTop = 30;
    if (R.carte.titre) {
      doc.font(P.black).fontSize(16).fillColor(R.couleurs.carteTitre || '#ffffff');
      doc.text(S(remplir(R.carte.titre), P.black), MARGE, MARGE, { width: LARGEUR });
      yTop = doc.y + 10;
    }
    const manq = dessinerCarte(doc, { x: 14, y: yTop, w: W - 28, h: H - yTop - 30 },
      [...new Set(animations.map((a) => a.commune))],
      { communes: R.couleurs.carteCommunes, contours: R.couleurs.carteContours, marqueur: R.couleurs.carteMarqueur, etiquettes: R.couleurs.carteEtiquettes },
      P, S);
    if (manq.length) avertissements.push('Communes absentes du fond de carte : ' + manq.join(', '));
  };

  const intros = (R.pagesIntro || []).filter((p) => p && p.texte && p.texte.trim());
  const posCarte = Math.min(R.carte.position || 0, intros.length);
  intros.forEach((p, i) => {
    if (R.carte.afficher && i === posCarte) pageCarte();
    nouvellePage(p.fond);
    const txt = S(remplir(p.texte), P.bold);
    const boxW = W - 2 * 24 - 50, boxH = H - 2 * 30;
    let taille = Number(R.tailles.intro) || 20;
    doc.font(P.bold);
    while (taille > 9 && doc.fontSize(taille).heightOfString(txt, { width: boxW, lineGap: taille * 0.55 }) > boxH) taille -= 0.5;
    doc.fontSize(taille).fillColor(p.couleurTexte).text(txt, 24, 30, { width: boxW, lineGap: taille * 0.55 });
    if (p.pageVideApres) nouvellePage(p.fond);
  });
  if (R.carte.afficher && posCarte >= intros.length) pageCarte();

  // --- Fiches animations
  const triees = trier(animations, R.tri);
  const DEMI = (H - 2 * MARGE) / 2 - 8;      // hauteur utile d'une demi-page
  const PLEINE = H - 2 * MARGE;
  const yBas = H / 2 + 8;
  let place = 'aucune'; // 'haut' si la moitié haute de la page courante est occupée
  const tDesc = Number(R.tailles.description) || 7.5;
  const tMini = Math.min(tDesc, Number(R.tailleMiniDemiPage) || 6.5);
  let tronquees = 0;

  for (const a of triees) {
    // Taille de description permettant de tenir sur une demi-page
    let tailleDemi = null;
    if (!R.uneAnimationParPage) {
      for (let s = tDesc; s >= tMini - 0.001; s -= 0.25) {
        if (fiche(doc, a, 0, R, S, s, false) <= DEMI) { tailleDemi = s; break; }
      }
    }
    if (tailleDemi !== null) {
      if (place === 'haut') {
        fiche(doc, a, yBas, R, S, tailleDemi, true, DEMI);
        place = 'aucune';
      } else {
        nouvellePage();
        fiche(doc, a, MARGE, R, S, tailleDemi, true, DEMI);
        place = 'haut';
      }
    } else {
      let s = tDesc;
      while (s > 5.5 && fiche(doc, a, 0, R, S, s, false) > PLEINE) s -= 0.25;
      if (fiche(doc, a, 0, R, S, s, false) > PLEINE) tronquees++;
      nouvellePage();
      fiche(doc, a, MARGE, R, S, s, true, PLEINE);
      place = 'aucune';
    }
  }
  if (tronquees) avertissements.push(`${tronquees} description(s) trop longue(s) ont été coupées.`);

  // --- Tableau récapitulatif
  if (R.tableau.afficher && triees.length) {
    const c = R.couleurs, ts = Number(R.tailles.tableau) || 7;
    const cols = [{ t: 'Commune', w: 108 }, { t: 'Date', w: 66 }, { t: 'Animation', w: LARGEUR - 174 }];
    const pad = 5, lh = ts * 1.25, hEntete = ts + 2 * pad + 2;
    const yHaut = 56, yMax = H - 40;
    const lignesTab = trier(animations, R.tableau.tri === 'date' ? 'date' : 'commune');
    let y, iLigne = 0;
    const entete = (premiere) => {
      nouvellePage();
      y = yHaut;
      if (premiere && R.tableau.titre) {
        doc.font(P.black).fontSize(13).fillColor(c.tableEnteteFond).text(S(remplir(R.tableau.titre), P.black), MARGE, 30, { width: LARGEUR });
        y = Math.max(yHaut, doc.y + 10);
      }
      doc.rect(MARGE, y, LARGEUR, hEntete).fill(c.tableEnteteFond);
      let x = MARGE;
      doc.font(P.medium).fontSize(ts).fillColor(c.tableEnteteTexte);
      for (const col of cols) { doc.text(col.t, x + pad, y + pad + 1, { lineBreak: false }); x += col.w; }
      y += hEntete;
    };
    entete(true);
    for (const a of lignesTab) {
      const cells = [a.commune, libelleDateTableau(a), a.titre].map((v, i) => couperLignes(doc, S(v, P.medium), P.medium, ts, cols[i].w - 2 * pad));
      const hRow = Math.max(...cells.map((l) => l.length)) * lh + 2 * pad + 2;
      if (y + hRow > yMax) { entete(false); iLigne = 0; }
      const fond = iLigne % 2 === 0 ? c.tableLigneFond : c.tableLigneAltFond;
      if (fond && fond.toLowerCase() !== '#ffffff') doc.rect(MARGE, y, LARGEUR, hRow).fill(fond);
      let x = MARGE;
      cells.forEach((l, i) => {
        bloc(doc, l, { x: x + pad, y: y + pad + 1, police: P.medium, taille: ts, couleur: c.tableTexte, interligne: 1.25, dessiner: true });
        x += cols[i].w;
      });
      y += hRow;
      iLigne++;
    }
  }

  // --- Pages de complément pour un livret (total multiple de 4)
  const quatrieme = fichiers.quatrieme;
  if (R.completerMultipleDe4) {
    const total = () => doc.bufferedPageRange().count + (couvPdf ? 1 : 0) + (quatrieme ? 1 : 0);
    while (total() % 4 !== 0) { doc.addPage(); doc.rect(0, 0, W, H).fill(R.couleurs.pagesComplement); }
  }

  let quatriemePdf = null;
  if (quatrieme) {
    if (estPdf(quatrieme)) quatriemePdf = quatrieme;
    else pageImage(quatrieme);
  }

  doc.end();
  await fini;
  let buffer = Buffer.concat(morceaux);

  // --- Fusion des couvertures fournies en PDF
  if (couvPdf || quatriemePdf) {
    const final = await PDFLib.load(buffer);
    const insererPdf = async (f, index) => {
      try {
        const src = await PDFLib.load(fs.readFileSync(f.path), { ignoreEncryption: true });
        const [emb] = await final.embedPdf(src, [0]);
        const page = index === 0 ? final.insertPage(0, A5) : final.addPage(A5);
        const k = Math.max(W / emb.width, H / emb.height);
        page.drawPage(emb, { x: (W - emb.width * k) / 2, y: (H - emb.height * k) / 2, width: emb.width * k, height: emb.height * k });
      } catch (e) {
        avertissements.push(`Le PDF « ${f.originalname || path.basename(f.path)} » n'a pas pu être intégré (${e.message}).`);
      }
    };
    if (couvPdf) await insererPdf(couvPdf, 0);
    if (quatriemePdf) await insererPdf(quatriemePdf, -1);
    buffer = Buffer.from(await final.save());
  }

  const pages = (await PDFLib.load(buffer)).getPageCount();
  return { buffer, pages, avertissements };
}

module.exports = { genererPDF, libelleDateTableau };
