// Réglages par défaut : reprennent la charte du programme 2026 (Info ou intox ?)
// Ils sont complétés par reglages.json (dépôt GitHub) ou par les réglages enregistrés
// dans le navigateur.

const DEFAUTS = {
  nomFichier: 'programme-qdnb',
  tri: 'date',                 // 'date' ou 'commune'
  uneAnimationParPage: false,
  tailleMiniDemiPage: 6.5,     // en dessous, l'animation passe sur une page entière
  periodeDebut: '',            // AAAA-MM-JJ, vide = détection automatique
  periodeFin: '',
  inclureSansDate: true,
  idsExclus: '',               // numéros webform_serial à écarter, séparés par des virgules

  couleurs: {
    date: '#47b654',
    infos: '#47b654',
    bibliotheque: '#ee3063',
    liens: '#ee3063',
    themes: '#ee3063',
    titre: '#963c96',
    description: '#ee3063',
    tableEnteteFond: '#47b654',
    tableEnteteTexte: '#ffffff',
    tableLigneFond: '#ffde1e',
    tableLigneAltFond: '#ffffff',
    tableTexte: '#ee3063',
    carteFond: '#47b654',
    carteCommunes: '#e6e6e6',
    carteContours: '#ffffff',
    carteMarqueur: '#ffde1e',
    carteEtiquettes: '#555555',
    carteTitre: '#ffffff',
    pagesComplement: '#ffde1e',
  },

  tailles: {
    date: 17,
    commune: 13,
    titre: 10,
    description: 7.5,
    infos: 7,
    tableau: 7,
    intro: 20,
  },

  pagesIntro: [
    {
      texte: "La Quinzaine du numérique en bibliothèque, c'est {nb_bibliotheques} bibliothèques girondines proposant {nb_animations} ateliers, des rencontres, des concerts, des conférences… autour et par la création numérique. Ça se passe forcément à côté de chez vous !",
      fond: '#47b654', couleurTexte: '#ffffff', pageVideApres: false,
    },
    {
      texte: "La thématique de la Quinzaine du numérique en bibliothèque est cette année Info ou intox, l'éducation aux médias et à l'image en bibliothèque. C'est l'occasion de découvrir comment muscler son regard vis-à-vis des médias, des réseaux sociaux, de l'intelligence artificielle…",
      fond: '#ffde1e', couleurTexte: '#47b654', pageVideApres: true,
    },
    {
      texte: "La Quinzaine du numérique, c'est pour découvrir, pour soi-même ou en famille, des jeux vidéo, de la robotique, de l'impression 3D, de la musique assistée par ordinateur, de la réalité virtuelle, de l'électronique, de la programmation, des ateliers audiovisuels… et bien plus encore.",
      fond: '#ee3063', couleurTexte: '#ffffff', pageVideApres: true,
    },
  ],

  carte: {
    afficher: true,
    position: 1,               // nombre de pages d'intro avant la carte
    titre: '',
  },

  intercalaires: {
    premierePage: 8,           // numéro de page (couverture = page 1) de la 1re image
    intervalle: 16,            // puis toutes les N pages
  },

  tableau: {
    afficher: true,
    titre: '',
    tri: 'commune',            // 'commune' ou 'date'
  },

  completerMultipleDe4: true,  // ajoute des pages de couleur pour l'impression en livret
};

function fusion(base, ajout) {
  if (Array.isArray(base) || Array.isArray(ajout)) return ajout !== undefined ? ajout : base;
  if (typeof base !== 'object' || base === null) return ajout !== undefined ? ajout : base;
  const out = { ...base };
  for (const k of Object.keys(ajout || {})) out[k] = fusion(base[k], ajout[k]);
  return out;
}

// Réglages complets : défauts + ajouts (copie indépendante)
const avec = (ajout) => fusion(JSON.parse(JSON.stringify(DEFAUTS)), ajout || {});

module.exports = { DEFAUTS, fusion, avec };
