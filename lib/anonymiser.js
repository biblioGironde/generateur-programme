// Côté Node : lecture du fichier, puis le même code que dans le navigateur (docs/anonymiser.js)
const { lireTableau } = require('./data');
const coeur = require('../docs/anonymiser');

const anonymiser = (filePath, originalName) => coeur.anonymiser(lireTableau(filePath, originalName));
const colonnesSensibles = (filePath, originalName) => coeur.colonnesSensibles(lireTableau(filePath, originalName));

module.exports = { anonymiser, colonnesSensibles };
