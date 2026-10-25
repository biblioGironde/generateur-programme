/*
 * Anonymisation de l'export du formulaire QDNB.
 * Code unique, utilisé :
 *  - dans le navigateur (page GitHub Pages et formulaire local) : le fichier ne quitte jamais l'ordinateur ;
 *  - par Node (anonymiser.js en ligne de commande, garde-fou du workflow GitHub).
 * Ne garde que les colonnes publiées dans le programme.
 */
(function (racine, fabrique) {
  if (typeof module === 'object' && module.exports) module.exports = fabrique();
  else racine.QDNBAnonymiser = fabrique();
})(typeof self !== 'undefined' ? self : this, function () {
  // Colonnes conservées (informations imprimées dans le programme de toute façon)
  var COLONNES = [
    'webform_serial', 'webform_time', 'webform_draft',
    'commune', 'cdc_reseau', 'url', 'instagram', 'facebook', 'tiktok',
    'animation_titre', 'animation_descriptif', 'animation_prestataire',
    'anim_lieu', 'anim_exterieur', 'animation_duree_jour',
    'animation_date_debut', 'animation_date_f', 'animation_date_fin',
    'animation_duree_heure', 'animation_heure',
    'animation_public', 'anim_public_autre', 'animation_participation'
  ];
  // Colonnes dont la présence (remplie) signale un export brut
  var SENSIBLES = ['mail', 'responsable', 'webform_ip_address'];
  var BOM = String.fromCharCode(0xfeff);

  // Lecture CSV/TSV qui respecte les guillemets et les retours à la ligne dans les cellules
  function lireTexte(txt, sep) {
    if (txt.charAt(0) === BOM) txt = txt.slice(1);
    if (!sep) {
      var premiere = txt.split('\n')[0];
      var nb = function (c) { return premiere.split(c).length - 1; };
      sep = nb('\t') > 0 ? '\t' : (nb(';') > nb(',') ? ';' : ',');
    }
    var rows = [], row = [], cell = '', inQ = false;
    for (var i = 0; i < txt.length; i++) {
      var c = txt[i];
      if (inQ) {
        if (c === '"') { if (txt[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
        else cell += c;
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

  function trouverEntete(rows) {
    for (var i = 0; i < rows.length; i++) {
      for (var j = 0; j < rows[i].length; j++) if (String(rows[i][j]).trim() === 'animation_titre') return i;
    }
    throw new Error("Colonne « animation_titre » introuvable : est-ce bien l'export du formulaire ?");
  }

  /** Colonnes sensibles remplies (liste vide = export déjà anonymisé). */
  function colonnesSensibles(rows) {
    var h = trouverEntete(rows);
    var entete = rows[h].map(function (c) { return String(c).trim(); });
    return SENSIBLES.filter(function (nom) {
      var i = entete.indexOf(nom);
      if (i < 0) return false;
      for (var k = h + 1; k < rows.length; k++) if (rows[k] && String(rows[k][i] || '').trim()) return true;
      return false;
    });
  }

  /** rows : tableau de lignes (tableaux de cellules). Renvoie le TSV anonymisé et un bilan. */
  function anonymiser(rows) {
    var h = trouverEntete(rows);
    var entete = rows[h].map(function (c) { return String(c).trim(); });
    var index = function (nom) { return entete.indexOf(nom); };

    var garder = COLONNES.map(index).filter(function (i) { return i >= 0; });
    // Cases à cocher des thématiques : entre animation_participation et animation_visuel
    var iDeb = index('animation_participation');
    var iVis = index('animation_visuel');
    var iFin = iVis >= 0 ? iVis : entete.length;
    for (var i = iDeb + 1; i < iFin; i++) if (entete[i]) garder.push(i);
    if (iVis >= 0) garder.push(iVis);

    var iTime = index('webform_time');
    var cellule = function (v) {
      return '"' + String(v === undefined || v === null ? '' : v).replace(/"/g, '""') + '"';
    };
    var lignes = [garder.map(function (i) { return cellule(entete[i]); }).join('\t')];
    var n = 0;
    for (var k = h + 1; k < rows.length; k++) {
      var r = rows[k];
      if (!r || !r.some(function (c) { return String(c).trim(); })) continue;
      lignes.push(garder.map(function (i) {
        var v = r[i];
        // Date de saisie seule, sans l'heure
        if (i === iTime && typeof v === 'string') v = v.replace(/\s*-\s*\d{1,2}:\d{2}.*$/, '');
        return cellule(v);
      }).join('\t'));
      n++;
    }
    var supprimees = [];
    entete.forEach(function (c, i) {
      if (c && garder.indexOf(i) < 0 && supprimees.indexOf(c) < 0) supprimees.push(c);
    });
    return { tsv: lignes.join('\n') + '\n', lignes: n, colonnes: garder.length, supprimees: supprimees };
  }

  return { lireTexte: lireTexte, anonymiser: anonymiser, colonnesSensibles: colonnesSensibles, COLONNES: COLONNES, SENSIBLES: SENSIBLES };
});
