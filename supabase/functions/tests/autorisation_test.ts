// Tests des deux portes d'entrée des fonctions Edge, contre le simulacre en
// mémoire (globalThis.fetch remplacé : aucun accès réseau) :
//   · exigerDemandeur (_shared/autorisation.ts), commune à manage-user et
//     test-notification : un compte désactivé, sans profil ou devant changer
//     son mot de passe n'a aucun pouvoir (EDGE-1 / AUTH-1) ;
//   · refuserSiNonAutorise (send-notifications/porte.ts) : secret partagé lu
//     dans le Vault, échec fermé, aucune lecture du Vault sans en-tête valable.
// Lancement : deno test --frozen --allow-env --config supabase/functions/deno.json supabase/functions/tests/

import { exigerDemandeur, type OptionsAcces } from '../_shared/autorisation.ts';
import { clientAdmin } from '../_shared/clients.ts';
import { ErreurHttp, reponseErreur } from '../_shared/http.ts';
import { ROLES_GESTIONNAIRES } from '../manage-user/regles.ts';
import { egaliteTempsConstant, refuserSiNonAutorise } from '../send-notifications/porte.ts';
import { creerSimulacre, PUBLIABLE, SECRETE } from './outils/simulacre.ts';

// Chaque fichier de test a son propre isolat, mais l'environnement du
// processus est partagé : tout ce qui est lu est posé ici.
Deno.env.set('SUPABASE_URL', 'http://simulacre.invalid');
Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: SECRETE }));
Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: PUBLIABLE }));
Deno.env.delete('EDGE_SECRET_KEY_NAME');
Deno.env.delete('EDGE_PUBLISHABLE_KEY_NAME');

const sim = creerSimulacre();
globalThis.fetch = ((entree: RequestInfo | URL, init?: RequestInit) =>
  sim.gerer(new Request(entree, init))) as typeof fetch;

function verifier(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Échec : ${message}`);
}

const requete = (jeton?: string, entetes: Record<string, string> = {}) =>
  new Request('http://fonction.invalid/', {
    method: 'POST',
    headers: { ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes },
  });

/** Statut et code de l'ErreurHttp levée ; 'ok' si l'accès est accordé. */
async function issue(jeton: string | undefined, options?: OptionsAcces): Promise<string> {
  try {
    await exigerDemandeur(requete(jeton), clientAdmin(), options);
    return 'ok';
  } catch (e) {
    if (e instanceof ErreurHttp) return e.code ? `${e.statut} ${e.code}` : String(e.statut);
    throw e;
  }
}

const GESTION: OptionsAcces = { roles: ROLES_GESTIONNAIRES };
const CHANGEMENT: OptionsAcces = { changementMotDePasse: 'requis' };

Deno.test('exigerDemandeur : jeton absent, invalide, révoqué ou banni → 401 ; Auth en panne → 503', async () => {
  verifier(await issue(undefined) === '401', 'sans en-tête Authorization');
  verifier(await issue('jeton-inconnu') === '401', 'jeton inconnu');

  const banni = sim.ajouter('U-BANNI', 'admin');
  const jBanni = sim.ouvrirSession(banni.id);
  banni.banned = true; // jeton émis AVANT le bannissement
  verifier(await issue(jBanni, GESTION) === '401', 'compte banni');

  const revoque = sim.ajouter('U-REVOQUE', 'admin');
  const jRevoque = sim.ouvrirSession(revoque.id);
  revoque.sessions.clear();
  verifier(await issue(jRevoque, GESTION) === '401', 'session révoquée');

  const ok = sim.ajouter('U-PANNE', 'admin');
  sim.pannes.authIndisponible = true;
  try {
    verifier(await issue(sim.ouvrirSession(ok.id)) === '503', 'Auth indisponible → 503, pas 401');
  } finally {
    sim.pannes.authIndisponible = false;
  }
});

Deno.test('exigerDemandeur : compte sans profil ou désactivé → 403, même admin, pour toute action', async () => {
  const inactif = sim.ajouter('U-ADM-OFF', 'admin', { active: false });
  const jInactif = sim.ouvrirSession(inactif.id);
  verifier(await issue(jInactif) === '403', 'admin inactif, sans exigence de rôle');
  verifier(await issue(jInactif, GESTION) === '403', 'admin inactif, action de gestion');
  verifier(await issue(jInactif, { roles: ['admin'] }) === '403', 'admin inactif, action réservée aux admins');

  const inactifMcp = sim.ajouter('U-OFF-MCP', 'technicien', { active: false, mcp: true });
  verifier(await issue(sim.ouvrirSession(inactifMcp.id), CHANGEMENT) === '403', 'inactif : pas de changement de mot de passe');

  const orphelin = sim.ajouter('U-ORPHELIN', 'admin', { profil: false });
  verifier(await issue(sim.ouvrirSession(orphelin.id)) === '403', 'compte Auth sans profil');

  // active NULL : traité comme inactif (seul true ouvre l'accès).
  const indetermine = sim.ajouter('U-NULL', 'admin');
  sim.profilDe(indetermine.id).active = null;
  verifier(await issue(sim.ouvrirSession(indetermine.id), GESTION) === '403', 'active NULL');
});

Deno.test('exigerDemandeur : must_change_password bloque tout sauf l\'action dédiée', async () => {
  const mcp = sim.ajouter('U-MCP', 'admin', { mcp: true });
  const jMcp = sim.ouvrirSession(mcp.id);
  verifier(await issue(jMcp) === '403 password_change_required', 'défaut « interdit »');
  verifier(await issue(jMcp, GESTION) === '403 password_change_required', 'gestion refusée');
  verifier(await issue(jMcp, CHANGEMENT) === 'ok', 'action dédiée autorisée');

  const normal = sim.ajouter('U-NORMAL', 'technicien');
  verifier(await issue(sim.ouvrirSession(normal.id), CHANGEMENT) === '409', 'action dédiée sans drapeau → 409');
});

Deno.test('exigerDemandeur : rôle exigé ; identité vérifiée avec la clé publiable, profil lu avec la clé secrète', async () => {
  const tech = sim.ajouter('U-TECH', 'technicien');
  verifier(await issue(sim.ouvrirSession(tech.id), GESTION) === '403', 'technicien sur une action de gestion');
  const sup = sim.ajouter('U-SUPG', 'superviseur_grappe');
  verifier(await issue(sim.ouvrirSession(sup.id), { roles: ['admin'] }) === '403', 'superviseur sur une action admin');

  const admin = sim.ajouter('U-ADM', 'admin');
  const jAdmin = sim.ouvrirSession(admin.id);
  const avant = sim.requetes.length;
  const d = await exigerDemandeur(requete(jAdmin), clientAdmin(), GESTION);
  verifier(d.user.id === admin.id && d.profil.role === 'admin' && d.jeton === jAdmin, 'demandeur renvoyé');
  const faites = sim.requetes.slice(avant);
  const getUser = faites.find((q) => q.chemin === '/auth/v1/user');
  const profil = faites.find((q) => q.chemin === '/rest/v1/profiles');
  verifier(getUser?.apikey === PUBLIABLE && getUser?.bearer === jAdmin, 'getUser : clé publiable + jeton du demandeur');
  verifier(profil?.apikey === SECRETE && profil?.bearer !== jAdmin, 'profil : clé secrète, sans le jeton utilisateur');
});

Deno.test('exigerDemandeur : profil illisible → erreur interne générique, jamais un accès', async () => {
  const admin = sim.ajouter('U-ADM-PANNE', 'admin');
  const jAdmin = sim.ouvrirSession(admin.id);
  sim.pannes.lectureProfils = true;
  let erreur: unknown = null;
  try {
    await exigerDemandeur(requete(jAdmin), clientAdmin(), GESTION);
  } catch (e) {
    erreur = e;
  } finally {
    sim.pannes.lectureProfils = false;
  }
  verifier(erreur instanceof Error && !(erreur instanceof ErreurHttp), 'erreur interne attendue');
  const r = reponseErreur('test', erreur);
  const corps = await r.json();
  verifier(r.status === 500 && typeof corps.ref === 'string', 'réponse 500 générique avec référence');
  verifier(!JSON.stringify(corps).includes('panne simulée'), 'aucun détail interne renvoyé');
});

// ── send-notifications ───────────────────────────────────────────────────────

const lecturesVault = () => sim.rpcAppels.filter((a) => a.nom === 'get_app_secret').length;

async function porte(entete: string | null): Promise<number> {
  const r = await refuserSiNonAutorise(
    requete(undefined, entete === null ? {} : { 'x-trigger-secret': entete }),
    clientAdmin(),
  );
  if (!r) return 0;
  await r.body?.cancel();
  return r.status;
}

Deno.test('send-notifications : en-tête absent ou mal formé → 403 sans lecture du Vault', async () => {
  sim.vault.set('NOTIFY_TRIGGER_SECRET', 'f'.repeat(64));
  const avant = lecturesVault();
  for (const entete of [null, '', 'abc', 'F'.repeat(64), 'f'.repeat(63), 'f'.repeat(65), 'g'.repeat(64), ' ' + 'f'.repeat(63), 'a'.repeat(600)]) {
    verifier(await porte(entete) === 403, `en-tête ${JSON.stringify(entete?.slice(0, 12))}… refusé`);
  }
  verifier(lecturesVault() === avant, 'aucune lecture du Vault');
});

Deno.test('send-notifications : échec fermé (503), mauvais secret 403, bon secret accepté', async () => {
  const BON = 'a1'.repeat(32);
  sim.vault.delete('NOTIFY_TRIGGER_SECRET');
  verifier(await porte(BON) === 503, 'secret absent du Vault → 503');

  sim.vault.set('NOTIFY_TRIGGER_SECRET', BON);
  sim.pannes.getAppSecret = true;
  try {
    verifier(await porte(BON) === 503, 'Vault illisible → 503');
  } finally {
    sim.pannes.getAppSecret = false;
  }

  verifier(await porte('b2'.repeat(32)) === 403, 'mauvais secret → 403');
  const avant = sim.rpcAppels.length;
  verifier(await porte(BON) === 0, 'bon secret → autorisé');
  const lecture = sim.rpcAppels.slice(avant).find((a) => a.nom === 'get_app_secret');
  verifier(lecture?.apikey === SECRETE && lecture.args.p_name === 'NOTIFY_TRIGGER_SECRET', 'lecture par la clé secrète');

  verifier(await egaliteTempsConstant('x', 'x'), 'égalité');
  verifier(!(await egaliteTempsConstant('x', 'y')), 'différence');
  verifier(!(await egaliteTempsConstant(BON, BON + '0')), 'longueurs différentes');
});
