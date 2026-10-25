// Réduit l'export du formulaire aux seules colonnes utiles au programme,
// pour pouvoir le déposer sans risque dans un dépôt public.
// Supprimé : nom du responsable, e-mail, adresse IP, identifiants de compte, logos.
const { lireTableau } = require('./data');

// Colonnes conservées (informations publiées dans le programme de toute façon)
const COLONNES = [
  'webform_serial', 'webform_time', 'webform_draft',
  'commune', 'cdc_reseau', 'url', 'instagram', 'facebook', 'tiktok',
  'animation_titre', 'animation_descriptif', 'animation_prestataire',
  'anim_lieu', 'anim_exterieur', 'animation_duree_jour',
  'animation_date_debut', 'animation_date_f', 'animation_date_fin',
  'animation_duree_heure', 'animation_heure',
  'animation_public', 'anim_public_autre', 'animation_participation',
];

// Colonnes dont la présence (remplie) signale un export brut
const SENSIBLES = ['mail', 'responsable', 'webform_ip_address'];

function trouverEntete(rows) {
  const i = rows.findIndex((r) => r.some((c) => String(c).trim() === 'animation_titre'));
  if (i < 0) throw new Error("Colonne « animation_titre » introuvable : est-ce bien l'export du formulaire ?");
  return i;
}

/** Renvoie la liste des colonnes sensibles remplies dans le fichier (vide si anonymisé). */
function colonnesSensibles(filePath, originalName) {
  const rows = lireTableau(filePath, originalName);
  const h = trouverEntete(rows);
  const entete = rows[h].map((c) => String(c).trim());
  return SENSIBLES.filter((nom) => {
    const i = entete.indexOf(nom);
    return i >= 0 && rows.slice(h + 1).some((r) => String(r[i] || '').trim());
  });
}

/** Produit le contenu TSV anonymisé. */
function anonymiser(filePath, originalName) {
  const rows = lireTableau(filePath, originalName);
  const h = trouverEntete(rows);
  const entete = rows[h].map((c) => String(c).trim());
  const index = (nom) => entete.indexOf(nom);

  const garder = COLONNES.map(index).filter((i) => i >= 0);
  // Cases à cocher des thématiques : entre animation_participation et animation_visuel
  const iDeb = index('animation_participation');
  const iFin = index('animation_visuel') >= 0 ? index('animation_visuel') : entete.length;
  for (let i = iDeb + 1; i < iFin; i++) if (entete[i]) garder.push(i);
  if (index('animation_visuel') >= 0) garder.push(index('animation_visuel'));

  const iTime = index('webform_time');
  const cellule = (v) => '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
  const lignes = [garder.map((i) => cellule(entete[i])).join('\t')];
  let n = 0;
  for (const r of rows.slice(h + 1)) {
    if (!r || !r.some((c) => String(c).trim())) continue;
    lignes.push(garder.map((i) => {
      let v = r[i];
      // Date de saisie seule, sans l'heure
      if (i === iTime && typeof v === 'string') v = v.replace(/\s*-\s*\d{1,2}:\d{2}.*$/, '');
      return cellule(v);
    }).join('\t'));
    n++;
  }
  return { tsv: lignes.join('\n') + '\n', lignes: n, colonnes: garder.length, supprimees: entete.filter((c, i) => c && !garder.includes(i)) };
}

module.exports = { anonymiser, colonnesSensibles };
