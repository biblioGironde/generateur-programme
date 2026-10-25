// Carte des communes participantes, dessinée en vectoriel dans le PDF
const fs = require('fs');
const path = require('path');

const GEOJSON = path.join(__dirname, '..', 'data', 'communes-gironde.geojson');
let communesCache = null;

// "La Teste-de-Buch" -> "teste de buch" (le fond de carte omet parfois l'article)
function normaliser(nom) {
  return nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/œ/g, 'oe').replace(/^(la|le|les|l)[\s'’-]+/, '')
    .replace(/\bst\b/g, 'saint').replace(/\bste\b/g, 'sainte')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function chargerCommunes() {
  if (communesCache) return communesCache;
  const g = JSON.parse(fs.readFileSync(GEOJSON, 'utf8'));
  communesCache = g.features.map((f) => {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    // Point d'ancrage : barycentre de l'anneau extérieur du plus grand polygone
    let best = null, bestA = -1;
    for (const p of polys) {
      const ring = p[0];
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x1, y1] = ring[i], [x2, y2] = ring[i + 1];
        const k = x1 * y2 - x2 * y1;
        a += k; cx += (x1 + x2) * k; cy += (y1 + y2) * k;
      }
      if (Math.abs(a) > bestA) { bestA = Math.abs(a); best = [cx / (3 * a), cy / (3 * a)]; }
    }
    return { nom: f.properties.nom, cle: normaliser(f.properties.nom), polys, centre: best };
  });
  return communesCache;
}

function trouverCommune(nom) {
  const communes = chargerCommunes();
  const cle = normaliser(nom);
  let c = communes.find((x) => x.cle === cle);
  // Nom tronqué (« Saint-Yzan-de-Soudia ») ou petite faute de frappe
  if (!c && cle.length >= 6) c = communes.find((x) => x.cle.startsWith(cle));
  if (!c && cle.length >= 6) c = communes.find((x) => distance(x.cle, cle) <= 2);
  return c || null;
}

function distance(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 99;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

function bornes(communes) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of communes) for (const p of c.polys) for (const [x, y] of p[0]) {
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Dessine la carte dans le rectangle (x, y, w, h).
 * nomsParticipants : liste des communes à signaler (noms tels que saisis).
 * Renvoie la liste des communes non trouvées dans le fond de carte.
 */
function dessinerCarte(doc, { x, y, w, h }, nomsParticipants, style, polices, sanitize) {
  const communes = chargerCommunes();
  const b = bornes(communes);
  const lat0 = ((b.minY + b.maxY) / 2) * Math.PI / 180;
  const kx = Math.cos(lat0);
  const gw = (b.maxX - b.minX) * kx, gh = b.maxY - b.minY;
  const s = Math.min(w / gw, h / gh);
  const ox = x + (w - gw * s) / 2, oy = y + (h - gh * s) / 2;
  const proj = ([lx, ly]) => [ox + (lx - b.minX) * kx * s, oy + (b.maxY - ly) * s];

  // Fond des communes
  doc.save();
  doc.lineWidth(style.epaisseurContours || 0.35).lineJoin('round');
  for (const c of communes) {
    for (const p of c.polys) {
      for (const ring of p) {
        ring.forEach((pt, i) => { const [px, py] = proj(pt); i ? doc.lineTo(px, py) : doc.moveTo(px, py); });
        doc.closePath();
      }
      doc.fillAndStroke(style.communes, style.contours);
    }
  }
  doc.restore();

  // Marqueurs (une bulle par commune, même si plusieurs animations)
  const vus = new Set();
  const points = [];
  const manquantes = [];
  for (const nom of nomsParticipants) {
    const c = trouverCommune(nom);
    if (!c) { manquantes.push(nom); continue; }
    if (vus.has(c.cle)) continue;
    vus.add(c.cle);
    const [px, py] = proj(c.centre);
    points.push({ nom, px, py });
  }

  const r = style.tailleMarqueur || 4.2;
  for (const p of points) bulle(doc, p.px, p.py, r, style.marqueur, style.marqueurContour);

  // Étiquettes : on essaie à droite, à gauche, au-dessus, en dessous pour limiter les chevauchements
  const fs = style.tailleEtiquette || 4.6;
  doc.font(polices.medium).fontSize(fs).fillColor(style.etiquettes);
  const occupes = points.map((p) => ({ x: p.px - r, y: p.py - r * 1.4, w: r * 2, h: r * 2.2 }));
  const chevauche = (a) => occupes.some((o) => a.x < o.x + o.w && a.x + a.w > o.x && a.y < o.y + o.h && a.y + a.h > o.y);
  // Les points les plus isolés d'abord n'ont pas d'importance : on part du nord vers le sud
  for (const p of [...points].sort((a, b) => a.py - b.py)) {
    const txt = sanitize(p.nom, polices.medium);
    const tw = doc.widthOfString(txt), th = fs * 1.1;
    const essais = [
      { x: p.px + r + 1.5, y: p.py - th / 2 },
      { x: p.px - r - 1.5 - tw, y: p.py - th / 2 },
      { x: p.px - tw / 2, y: p.py - r * 1.6 - th },
      { x: p.px - tw / 2, y: p.py + r + 1 },
      { x: p.px + r + 1.5, y: p.py - th },
      { x: p.px + r + 1.5, y: p.py },
      { x: p.px - r - 1.5 - tw, y: p.py - th },
      { x: p.px - r - 1.5 - tw, y: p.py },
    ];
    let pos = essais.find((e) => !chevauche({ ...e, w: tw, h: th }) && e.x >= x && e.x + tw <= x + w) || essais[0];
    occupes.push({ ...pos, w: tw, h: th });
    doc.text(txt, pos.x, pos.y, { lineBreak: false });
  }
  return manquantes;
}

// Petite bulle de dialogue (rappel de l'identité visuelle « bulles »)
function bulle(doc, cx, cy, r, couleur, contour) {
  doc.save();
  const w = r * 2, h = r * 1.5;
  const x0 = cx - r, y0 = cy - h / 2 - r * 0.35;
  doc.roundedRect(x0, y0, w, h, r * 0.35);
  doc.moveTo(cx - r * 0.35, y0 + h).lineTo(cx, cy + r * 0.75).lineTo(cx + r * 0.35, y0 + h).closePath();
  if (contour) doc.lineWidth(0.3).fillAndStroke(couleur, contour); else doc.fill(couleur);
  doc.restore();
}

module.exports = { dessinerCarte, trouverCommune, normaliser };
