// Module partagé : CORS — liste blanche commune à toutes les fonctions appelées
// depuis le navigateur (auth-gate, manage-user, test-notification).
//
// Une seule liste, au lieu d'une copie par fonction qui finit par diverger.
// Le CORS n'est pas une barrière d'authentification ici (le jeton voyage dans
// l'en-tête Authorization, jamais dans un cookie, donc pas de CSRF) : il évite
// seulement qu'une page tierce lise les réponses dans un navigateur.
// Une origine inconnue reçoit l'origine de production : le navigateur bloque
// alors la lecture de la réponse.

const ORIGINE_PAR_DEFAUT = 'https://optilab-envois.pages.dev';

const ORIGINES_AUTORISEES = new Set([
  ORIGINE_PAR_DEFAUT,
  'https://tests-deploiement.optilab-envois.pages.dev',
  'https://optilab-envois.onrender.com',
  'https://dev-optilab-envois.onrender.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
]);

/** En-têtes CORS pour l'origine de la requête. */
export function entetesCors(origine: string | null): Record<string, string> {
  const autorisee = origine && ORIGINES_AUTORISEES.has(origine) ? origine : ORIGINE_PAR_DEFAUT;
  return {
    'Access-Control-Allow-Origin': autorisee,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

/** Réponse à la requête préliminaire (OPTIONS). */
export function reponsePreliminaire(origine: string | null): Response {
  return new Response('ok', { headers: entetesCors(origine) });
}
