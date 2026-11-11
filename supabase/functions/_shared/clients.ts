// Module partagé : clients Supabase des fonctions Edge.
//
// Dépendance épinglée à une version EXACTE, par spécificateur npm: écrit en
// clair ici, et nulle part ailleurs. Le déploiement (supabase functions deploy)
// ne lit ni supabase/functions/deno.json ni deno.lock : il résout chaque import
// tel qu'il est écrit dans le code (CLI, SIDE_EFFECTS « Files Read »). Un
// spécificateur complet garantit donc la même version en CI, en local et en
// production, sans dépendre d'une carte d'imports.
// Version alignée sur celle du navigateur (public/index.html).

// deno-lint-ignore no-import-prefix -- voulu : voir ci-dessus (le déploiement ignore deno.json).
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.118.0';
import { clePubliable, cleSecrete, urlSupabase } from './cles.ts';

export type { SupabaseClient, User };

// Contexte serveur : aucune session à conserver, rafraîchir ni lire dans l'URL.
const OPTIONS_AUTH = {
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
} as const;

/**
 * Client privilégié (clé secrète → rôle service_role) : contourne la RLS.
 * À n'utiliser qu'APRÈS avoir établi l'identité et les droits du demandeur,
 * ou pour un traitement sans utilisateur (cron).
 */
export function clientAdmin(): SupabaseClient {
  return createClient(urlSupabase(), cleSecrete(), { auth: OPTIONS_AUTH });
}

/**
 * Client public (clé publiable, sans jeton) : connexion par mot de passe et
 * validation d'un jeton utilisateur (auth.getUser). Aucune fonction n'agit sur
 * la base au nom d'un utilisateur : les écritures passent par clientAdmin,
 * après les contrôles de _shared/autorisation.ts.
 */
export function clientPublic(): SupabaseClient {
  return createClient(urlSupabase(), clePubliable(), { auth: OPTIONS_AUTH });
}
