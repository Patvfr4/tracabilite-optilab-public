// Porte d'entrée de send-notifications : secret partagé x-trigger-secret.
// Séparée du gestionnaire pour être testée isolément
// (supabase/functions/tests/autorisation_test.ts).
//
// Secret partagé OBLIGATOIRE (C2). `verify_jwt = false` sur cette fonction
// (appelée par le cron pg_net, sans jeton) : le secret est la seule protection.
// Source UNIQUE : l'entrée NOTIFY_TRIGGER_SECRET du Vault, celle-là même que le
// cron lit au moment de l'appel. Une rotation (rotate_notify_trigger_secret)
// prend donc effet des deux côtés à la fois, sans secret de fonction à
// recopier. On échoue FERMÉ : secret absent ou Vault illisible → 503.

import type { SupabaseClient } from '../_shared/clients.ts';
import { reponseJson } from '../_shared/http.ts';
import { loadSecret } from '../_shared/secrets.ts';

// Le secret est TOUJOURS généré côté serveur par _hex_aleatoire_32()
// (schema.sql : SHA-256 en hexadécimal minuscule, 64 caractères) et ne peut pas
// être saisi par un humain (set_app_secret le refuse). Tout autre format est
// donc refusé sans interroger la base : une requête quelconque venue
// d'Internet ne déclenche aucune lecture du Vault.
export const FORMAT_SECRET = /^[0-9a-f]{64}$/;

// Comparaison à temps constant (évite de révéler le secret par le timing).
// On compare les empreintes SHA-256 : longueur fixe, donc la longueur du
// secret ne fuit pas non plus.
export async function egaliteTempsConstant(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ]);
  const va = new Uint8Array(ha), vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/** null si l'appel est autorisé, sinon la réponse de refus (403 ou 503). */
export async function refuserSiNonAutorise(req: Request, sb: SupabaseClient): Promise<Response | null> {
  const provided = req.headers.get('x-trigger-secret') ?? '';
  if (!FORMAT_SECRET.test(provided)) {
    console.warn('[send-notifications] appel sans en-tête x-trigger-secret valable — refusé.');
    return reponseJson({ error: 'Forbidden' }, 403);
  }

  let expectedSecret: string | null;
  try {
    expectedSecret = await loadSecret(sb, 'NOTIFY_TRIGGER_SECRET');
  } catch (_) {
    // Détail (code d'erreur, jamais de valeur) déjà journalisé par loadSecret.
    return reponseJson({ error: 'Service non configuré' }, 503);
  }
  if (!expectedSecret) {
    console.error('[send-notifications] NOTIFY_TRIGGER_SECRET absent du Vault — appel refusé (fail-closed).');
    return reponseJson({ error: 'Service non configuré' }, 503);
  }
  if (!(await egaliteTempsConstant(provided, expectedSecret))) {
    console.warn('[send-notifications] x-trigger-secret incorrect — refusé.');
    return reponseJson({ error: 'Forbidden' }, 403);
  }
  return null;
}
