// Module partagé : erreurs HTTP et réponses JSON communes aux fonctions Edge.
//
// Règle : le client ne reçoit QUE des messages prévus pour lui (ErreurHttp).
// Toute autre erreur (base, Auth, réseau, bogue) est journalisée côté serveur
// avec une référence courte, et le client reçoit un message générique portant
// cette même référence — jamais le message brut, qui peut révéler la topologie
// ou l'état interne.

import { ErreurConfiguration } from './cles.ts';
import { ErreurSecret } from './secrets.ts';

/** Erreur dont le message est destiné tel quel au client. */
export class ErreurHttp extends Error {
  readonly statut: number;
  /** Code court stable, lisible par le client (facultatif). */
  readonly code?: string;

  constructor(statut: number, message: string, code?: string) {
    super(message);
    this.name = 'ErreurHttp';
    this.statut = statut;
    this.code = code;
  }
}

/** Référence courte pour relier une réponse générique à la ligne de journal. */
export function referenceErreur(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** Réponse JSON, avec les en-têtes supplémentaires fournis (CORS, etc.). */
export function reponseJson(
  donnees: unknown,
  statut = 200,
  entetes: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(donnees), {
    status: statut,
    headers: { ...entetes, 'Content-Type': 'application/json' },
  });
}

/**
 * Convertit une erreur quelconque en réponse : message prévu si ErreurHttp,
 * sinon message générique + référence (le détail part dans le journal, sans
 * aucune valeur de secret : seuls des messages d'erreur y sont écrits).
 */
export function reponseErreur(
  fonction: string,
  err: unknown,
  entetes: Record<string, string> = {},
): Response {
  if (err instanceof ErreurHttp) {
    const corps: Record<string, string> = { error: err.message };
    if (err.code) corps.code = err.code;
    return reponseJson(corps, err.statut, entetes);
  }
  const ref = referenceErreur();
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[${fonction}] erreur interne ref=${ref} :`, message);
  if (err instanceof ErreurConfiguration || err instanceof ErreurSecret) {
    // Configuration de plateforme ou Vault inaccessible : échec fermé.
    return reponseJson({ error: 'Service momentanément indisponible.', ref }, 503, entetes);
  }
  return reponseJson(
    { error: 'Erreur interne. Réessayez ou contactez un administrateur.', ref },
    500,
    entetes,
  );
}
