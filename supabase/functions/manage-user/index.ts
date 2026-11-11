// Supabase Edge Function — manage-user
// Gestion des comptes par les superviseurs et admins (create, reset_password,
// toggle_active), et changement imposé de son propre mot de passe
// (change_own_password). Les écritures passent par le client admin (clé
// secrète, côté serveur uniquement, jamais exposée au client).
//
// Contrôles communs, AVANT toute écriture (cf. _shared/autorisation.ts) :
//   · jeton utilisateur validé par Supabase Auth (un compte banni ou une
//     session révoquée est refusé même avec un jeton non expiré) ;
//   · profil du demandeur ACTIF — un compte désactivé ne garde aucun pouvoir,
//     ni pour se réactiver lui-même, ni pour créer ou réinitialiser des comptes ;
//   · must_change_password = false, sauf pour change_own_password qui l'exige ;
//   · rôle gestionnaire pour les actions de gestion.
//
// Réponses : { success: true, … } ou { error, [code], [ref] }. Les messages
// d'erreur sont génériques ; le détail technique part dans le journal avec la
// même référence.

import {
  chargerProfil,
  exigerDemandeur,
  type Demandeur,
} from '../_shared/autorisation.ts';
import { clePubliable, urlSupabase } from '../_shared/cles.ts';
import { clientAdmin, type SupabaseClient } from '../_shared/clients.ts';
import { entetesCors, reponsePreliminaire } from '../_shared/cors.ts';
import { ErreurHttp, reponseErreur, reponseJson } from '../_shared/http.ts';
import { courrielInterne } from '../_shared/identifiants.ts';
import {
  exigerMotDePasseValide,
  exigerObjet,
  exigerUuid,
  lireDemandeCreation,
  lireMotDePasseActuel,
  ROLES_GESTIONNAIRES,
  verifierDroitCreation,
  verifierDroitGestion,
} from './regles.ts';

// Désactivation sans échéance (~100 ans) ; 'none' lève le bannissement.
const DUREE_BANNISSEMENT = '876000h';

const ACTIONS = new Set(['create', 'reset_password', 'toggle_active', 'change_own_password']);

type Resultat = Record<string, unknown>;

/** Trace d'audit dans les journaux de la plateforme (jamais de mot de passe). */
function journaliser(action: string, acteur: string, cible: string, detail = ''): void {
  console.info(JSON.stringify({ fn: 'manage-user', action, acteur, cible, detail }));
}

/**
 * Traduit une erreur de Supabase Auth en erreur pour le client : quelques cas
 * actionnables reçoivent un message précis, tout le reste devient une erreur
 * interne (message générique côté client, détail dans le journal).
 */
function erreurAuth(err: { code?: string; status?: number; message?: string }, contexte: string): Error {
  switch (err.code ?? '') {
    case 'weak_password':
      return new ErreurHttp(400, 'Mot de passe refusé par la politique de sécurité (trop court ou trop simple).', 'weak_password');
    case 'same_password':
      return new ErreurHttp(400, "Le nouveau mot de passe doit être différent de l'actuel.", 'same_password');
    // Réglage Auth « Require current password when changing password » activé
    // (API utilisateur seulement : change_own_password). Le code de GoTrue pour
    // un mot de passe actuel faux est current_password_invalid ; l'autre
    // orthographe est acceptée par prudence.
    case 'current_password_required':
      return new ErreurHttp(400, 'Saisissez votre mot de passe actuel (le mot de passe temporaire).', 'current_password_required');
    case 'current_password_invalid':
    case 'current_password_mismatch':
      return new ErreurHttp(400, 'Mot de passe actuel incorrect.', 'current_password_invalid');
    // MFA exigée pour changer de mot de passe (si elle est activée un jour).
    case 'insufficient_aal':
      return new ErreurHttp(403, 'Validation en deux étapes requise : reconnectez-vous avec votre second facteur, puis réessayez.', 'insufficient_aal');
    case 'email_exists':
    case 'user_already_exists':
      return new ErreurHttp(409, 'Ce N° employé est déjà utilisé.');
    case 'user_not_found':
      return new ErreurHttp(404, 'Utilisateur introuvable.');
    case 'reauthentication_needed':
    case 'session_not_found':
      return new ErreurHttp(401, 'Session invalide ou expirée. Reconnectez-vous puis réessayez.');
  }
  if (err.status === 401 || err.status === 403) {
    return new ErreurHttp(401, 'Session invalide ou expirée. Reconnectez-vous puis réessayez.');
  }
  return new Error(`${contexte} : HTTP ${err.status ?? '?'} ${err.code ?? ''} ${err.message ?? ''}`);
}

// ── ACTION : créer un utilisateur ────────────────────────────────────────────
async function creer(admin: SupabaseClient, demandeur: Demandeur, payload: unknown): Promise<Resultat> {
  const demande = lireDemandeCreation(payload);
  verifierDroitCreation(demandeur.profil, demande);

  const { data: cree, error: errCreation } = await admin.auth.admin.createUser({
    email: courrielInterne(demande.employee_id),
    password: demande.password,
    email_confirm: true,
  });
  // Adresse refusée par Auth malgré le motif (règles plus strictes côté Auth) :
  // c'est le N° employé qui est en cause, pas une erreur interne.
  if (errCreation && ['email_address_invalid', 'validation_failed'].includes(errCreation.code ?? '')) {
    throw new ErreurHttp(400, 'N° employé invalide.', 'invalid_employee_id');
  }
  if (errCreation || !cree?.user) throw erreurAuth(errCreation ?? {}, 'création du compte Auth');

  // Profil applicatif (labo_ids inclus dès la création). Le changement de mot
  // de passe est imposé : le gestionnaire connaît ce mot de passe temporaire.
  const { error: errProfil } = await admin.from('profiles').insert({
    id: cree.user.id,
    employee_id: demande.employee_id,
    nom: demande.nom,
    labo_id: demande.labo_id,
    labo_ids: demande.labo_ids,
    role: demande.role,
    must_change_password: true,
    active: true,
  });
  if (errProfil) {
    // Annulation : supprimer l'utilisateur Auth pour ne pas laisser d'orphelin.
    const { error: errSuppression } = await admin.auth.admin.deleteUser(cree.user.id);
    if (errSuppression) {
      console.error(`[manage-user] compte Auth orphelin ${cree.user.id} :`, errSuppression.message);
    }
    if (errProfil.code === '23505') throw new ErreurHttp(409, 'Ce N° employé est déjà utilisé.');
    throw new Error(`création du profil (${errProfil.code ?? '?'}) : ${errProfil.message}`);
  }

  journaliser('create', demandeur.user.id, cree.user.id, demande.role);
  return { success: true, employee_id: demande.employee_id };
}

// ── ACTION : réinitialiser le mot de passe d'un compte ───────────────────────
async function reinitialiser(admin: SupabaseClient, demandeur: Demandeur, payload: unknown): Promise<Resultat> {
  const p = exigerObjet(payload);
  const id = exigerUuid(p.profile_id, 'profile_id');
  const motDePasse = exigerMotDePasseValide(p.new_password);

  const cible = await chargerProfil(admin, id);
  if (!cible) throw new ErreurHttp(404, 'Utilisateur introuvable.');
  verifierDroitGestion(demandeur.profil, cible);

  // Un mot de passe fixé pour AUTRUI est connu du gestionnaire : le changement
  // est imposé à la prochaine connexion. Le drapeau est posé AVANT le mot de
  // passe, pour qu'il n'existe jamais d'instant où ce mot de passe est actif
  // sans lui ; il est rétabli si le changement de mot de passe échoue.
  // Sur son propre compte, personne d'autre ne connaît le mot de passe.
  const poserDrapeau = id !== demandeur.user.id && cible.must_change_password !== true;
  if (poserDrapeau) {
    const { error } = await admin.from('profiles').update({ must_change_password: true }).eq('id', id);
    if (error) throw new Error(`pose de must_change_password (${error.code ?? '?'}) : ${error.message}`);
  }

  // L'API admin révoque aussi toutes les sessions de la cible.
  const { error: errMdp } = await admin.auth.admin.updateUserById(id, { password: motDePasse });
  if (errMdp) {
    if (poserDrapeau) {
      const { error } = await admin.from('profiles').update({ must_change_password: false }).eq('id', id);
      if (error) console.error(`[manage-user] rétablissement du drapeau impossible pour ${id} :`, error.message);
    }
    throw erreurAuth(errMdp, 'réinitialisation du mot de passe');
  }

  journaliser('reset_password', demandeur.user.id, id);
  return { success: true };
}

// ── ACTION : désactiver / réactiver un compte ────────────────────────────────
async function basculerActivation(admin: SupabaseClient, demandeur: Demandeur, payload: unknown): Promise<Resultat> {
  const p = exigerObjet(payload);
  const id = exigerUuid(p.profile_id, 'profile_id');
  if (typeof p.active !== 'boolean') throw new ErreurHttp(400, 'Paramètre active invalide.');
  const actif = p.active;

  // Ni auto-réactivation, ni verrouillage de soi-même par erreur.
  if (id === demandeur.user.id) {
    throw new ErreurHttp(400, 'Vous ne pouvez pas désactiver ou réactiver votre propre compte.');
  }

  const cible = await chargerProfil(admin, id);
  if (!cible) throw new ErreurHttp(404, 'Utilisateur introuvable.');
  verifierDroitGestion(demandeur.profil, cible);

  // La désactivation est portée par Supabase Auth (bannissement), pas
  // seulement par profiles.active : un compte banni ne peut plus se connecter
  // (ni par auth-gate ni directement), ni rafraîchir son jeton, et Auth refuse
  // ses jetons encore valides. Chaque étape est vérifiée ; en cas d'échec,
  // l'action peut être relancée telle quelle (toutes les étapes sont idempotentes).
  const { error: errBan } = await admin.auth.admin.updateUserById(id, {
    ban_duration: actif ? 'none' : DUREE_BANNISSEMENT,
  });
  if (errBan) throw erreurAuth(errBan, actif ? 'levée du bannissement' : 'bannissement');

  // Le profil ensuite : la RLS (current_role_name) coupe aussitôt l'accès aux
  // données pour les jetons d'accès encore valides.
  const { error: errProfil } = await admin.from('profiles').update({ active: actif }).eq('id', id);
  if (errProfil) throw new Error(`mise à jour de profiles.active (${errProfil.code ?? '?'}) : ${errProfil.message}`);

  if (!actif) {
    // Enfin, suppression des sessions (les refresh tokens suivent).
    const { error: errSessions } = await admin.rpc('revoke_user_sessions', { p_user_id: id });
    if (errSessions) throw new Error(`révocation des sessions (${errSessions.code ?? '?'}) : ${errSessions.message}`);
  }

  journaliser('toggle_active', demandeur.user.id, id, actif ? 'reactive' : 'desactive');
  return { success: true };
}

// ── ACTION : changer son propre mot de passe (changement imposé) ─────────────
// Réservée à un compte actif dont must_change_password = true. Le mot de passe
// est changé par l'API UTILISATEUR de Supabase Auth (PUT /auth/v1/user, avec le
// jeton du demandeur) et non par l'API admin, pour deux raisons vérifiées dans
// le code de Supabase Auth (internal/api/user.go, admin.go, models/user.go) :
//   · elle refuse un mot de passe identique à l'actuel (same_password) : sans
//     cela, l'employé pourrait « changer » pour le mot de passe temporaire que
//     son gestionnaire connaît, et le drapeau perdrait tout son sens ;
//   · elle ne révoque que les AUTRES sessions (LogoutAllExceptMe), alors que
//     l'API admin les révoque toutes, y compris celle en cours.
// Contrepartie : ce chemin suit les réglages Auth du projet. Si « Require
// current password when changing password » est activé, Auth exige le mot de
// passe actuel (ici le mot de passe temporaire) : le client l'envoie dans
// current_password, transmis tel quel ; sans ce réglage, Auth l'ignore.
// Le drapeau est ensuite remis à false avec le client admin (seul un contexte
// de confiance peut le modifier).
async function changerSonMotDePasse(admin: SupabaseClient, demandeur: Demandeur, payload: unknown): Promise<Resultat> {
  const p = exigerObjet(payload);
  const motDePasse = exigerMotDePasseValide(p.new_password);
  const motDePasseActuel = lireMotDePasseActuel(p.current_password);

  const res = await fetch(`${urlSupabase()}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'apikey': clePubliable(),
      'Authorization': `Bearer ${demandeur.jeton}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(
      motDePasseActuel === undefined
        ? { password: motDePasse }
        : { password: motDePasse, current_password: motDePasseActuel },
    ),
  });
  if (!res.ok) {
    let corps: Record<string, unknown> = {};
    try { corps = await res.json(); } catch (_) { /* corps non JSON */ }
    const code = typeof corps.error_code === 'string' ? corps.error_code
      : typeof corps.code === 'string' ? corps.code : '';
    const message = typeof corps.msg === 'string' ? corps.msg
      : typeof corps.message === 'string' ? corps.message : '';
    throw erreurAuth({ code, status: res.status, message }, 'changement du mot de passe');
  }
  await res.body?.cancel();

  // Le mot de passe est DÉJÀ changé : une erreur ici ne doit pas laisser croire
  // à l'utilisateur que rien n'a été fait (il réessaierait avec le même mot de
  // passe et recevrait same_password). Une seconde tentative, puis un code
  // dédié et une trace pour correction par un administrateur.
  const remettreDrapeau = () => admin.from('profiles')
    .update({ must_change_password: false })
    .eq('id', demandeur.user.id);
  let { error } = await remettreDrapeau();
  if (error) ({ error } = await remettreDrapeau());
  if (error) {
    console.error(
      `[manage-user] mot de passe changé mais must_change_password reste à true pour ${demandeur.user.id}`
        + ` (${error.code ?? '?'}) : ${error.message}`,
    );
    journaliser('change_own_password', demandeur.user.id, demandeur.user.id, 'drapeau_en_attente');
    throw new ErreurHttp(
      500,
      'Mot de passe changé, mais la finalisation a échoué : reconnectez-vous avec le nouveau mot de passe ou contactez un administrateur.',
      'flag_pending',
    );
  }

  journaliser('change_own_password', demandeur.user.id, demandeur.user.id);
  return { success: true };
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get('Origin');
  const cors = entetesCors(origine);

  if (req.method === 'OPTIONS') return reponsePreliminaire(origine);
  if (req.method !== 'POST') return reponseJson({ error: 'Méthode non autorisée.' }, 405, cors);

  try {
    let corps: unknown;
    try {
      corps = await req.json();
    } catch (_) {
      throw new ErreurHttp(400, 'Requête invalide.');
    }
    const { action, payload } = exigerObjet(corps);
    if (typeof action !== 'string' || !ACTIONS.has(action)) {
      throw new ErreurHttp(400, 'Action inconnue.');
    }

    const admin = clientAdmin();
    const demandeur = await exigerDemandeur(
      req,
      admin,
      action === 'change_own_password'
        ? { changementMotDePasse: 'requis' }
        : { roles: ROLES_GESTIONNAIRES },
    );

    let resultat: Resultat;
    switch (action) {
      case 'create':         resultat = await creer(admin, demandeur, payload); break;
      case 'reset_password': resultat = await reinitialiser(admin, demandeur, payload); break;
      case 'toggle_active':  resultat = await basculerActivation(admin, demandeur, payload); break;
      default:               resultat = await changerSonMotDePasse(admin, demandeur, payload); break;
    }
    return reponseJson(resultat, 200, cors);
  } catch (err) {
    return reponseErreur('manage-user', err, cors);
  }
});
