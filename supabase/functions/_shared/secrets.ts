// Module partagé : lecture des secrets applicatifs dans le Vault Supabase.
//
// Source UNIQUE : la RPC get_app_secret (SECURITY DEFINER, exécutable par
// service_role seulement, liste blanche de noms), appelée avec le client
// admin. Il n'y a AUCUN repli sur Deno.env : deux magasins rendaient la
// rotation incertaine (on ne savait pas quelle valeur servait) et une panne de
// la RPC basculait en silence sur une valeur peut-être révoquée.
//
// Échec FERMÉ : une erreur de la RPC lève ErreurSecret (journalisée avec le
// nom et le code d'erreur, jamais la valeur). Un secret simplement absent du
// Vault renvoie null : à l'appelant de décider (503, message à l'admin…).

import type { SupabaseClient } from './clients.ts';

/** Noms admis — doit rester aligné sur _allowed_secret_names() (schema.sql). */
export type NomSecret = 'RESEND_API_KEY' | 'SMTP_PASS' | 'NOTIFY_TRIGGER_SECRET';

/** Lecture du Vault impossible (RPC en erreur) : ne pas continuer. */
export class ErreurSecret extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurSecret';
  }
}

/**
 * Lit un secret dans le Vault ; null s'il n'est pas défini.
 * Le client admin est fourni par l'appelant (celui de la requête en cours) :
 * un seul client par requête, et un client factice possible en test.
 */
export async function loadSecret(admin: SupabaseClient, nom: NomSecret): Promise<string | null> {
  const { data, error } = await admin.rpc('get_app_secret', { p_name: nom });
  if (error) {
    console.error(`[secrets] lecture de ${nom} impossible :`, error.code ?? '', error.message ?? '');
    throw new ErreurSecret(`Lecture du secret ${nom} impossible.`);
  }
  return typeof data === 'string' && data.length > 0 ? data : null;
}

/** Fonction de lecture des secrets. */
export type LecteurSecrets = (nom: NomSecret) => Promise<string | null>;

/**
 * Lecteur avec cache PAR REQUÊTE : à créer dans le gestionnaire de requête,
 * jamais au niveau du module (un isolat sert plusieurs requêtes, et un cache
 * de module servirait une valeur périmée après une rotation). Évite un
 * déchiffrement par destinataire lors d'un envoi groupé.
 */
export function creerLecteurSecrets(admin: SupabaseClient): LecteurSecrets {
  const cache = new Map<NomSecret, Promise<string | null>>();
  return (nom: NomSecret) => {
    let lecture = cache.get(nom);
    if (!lecture) {
      lecture = loadSecret(admin, nom);
      // Une erreur n'est pas mise en cache : la tentative suivante relira.
      lecture.catch(() => cache.delete(nom));
      cache.set(nom, lecture);
    }
    return lecture;
  };
}
