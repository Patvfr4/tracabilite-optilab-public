// Edge Function : auth-gate
// Point d'entrée du login. Exige un jeton captcha Turnstile et le transmet à
// Supabase Auth, qui le valide (voir plus bas pourquoi ce n'est pas ici).
//
// Workflow :
//   1. Reçoit { employee_id, password, captcha_token }
//   2. EXIGE la présence du jeton captcha (fail-closed) et un N° employé bien
//      formé (sinon refus générique, sans aucune écriture)
//   3. Appelle sb.auth.signInWithPassword({ email, password, captchaToken })
//   4. Refuse un compte sans profil ou désactivé (et ferme ses sessions) ;
//      profil illisible → 503, seule la session tout juste ouverte est fermée
//   5. Enregistre l'attempt via record_login_attempt(), sauf captcha refusé
//   6. Retourne la session (access_token + refresh_token) au client, ou une erreur
//
// Le client appelle ensuite sb.auth.setSession(data) pour activer la session.
//
// ── Pourquoi le captcha remplace le verrouillage, et ne s'y ajoute pas ───────
// L'ancien flux refusait la connexion (429) après 5 échecs comptés sur
// l'employee_id. Le compteur était donc attribué à la VICTIME et non au
// demandeur, débité par une requête non authentifiée avant tout contrôle de
// credential, et jamais remis à zéro par un succès : un tiers pouvait refuser
// la connexion de n'importe quel compte choisi, en passant par cet endpoint.
// Tant qu'un refus dur existe sur un compteur qu'un tiers peut remplir, il y a
// déni de service. Le compteur par IP n'est pas la réponse : derrière un NAT
// d'hôpital, il punirait un laboratoire entier.
// Le captcha, exigé à CHAQUE tentative, fait payer l'attaquant à chaque essai
// tout en laissant toujours passer le détenteur légitime. Le refus dur est donc
// retiré ; le comptage est conservé, mais pour la DÉTECTION seulement (un
// avertissement journalisé au franchissement du seuil), jamais pour bloquer.
//
// ── Qui valide le jeton, et pourquoi ce n'est PAS cette fonction ────────────
// Cette fonction n'est pas le seul chemin vers l'authentification. GoTrue est
// public et la clé publiable est servie dans la page (public/js/config.js), si
// bien que n'importe qui peut poster directement sur
// /auth/v1/token?grant_type=password sans jamais passer ici. Un captcha validé
// dans cette fonction ne couvrirait donc que le chemin applicatif, et laisserait
// le chemin direct entièrement libre.
//
// Le seul contrôle qui couvre LES DEUX chemins est le captcha applique par la
// plateforme elle-même : Authentication > Attack Protection > CAPTCHA. Cette
// fonction EXIGE donc le jeton (fail-closed, dans le dépôt) et le TRANSMET à
// Supabase Auth, qui le valide. Le jeton étant à USAGE UNIQUE, le valider ici
// en plus le consommerait et ferait échouer la validation de GoTrue en
// « timeout-or-duplicate ».
//
// ⚠ DÉPLOIEMENT : le réglage CAPTCHA du projet doit donc être ACTIVÉ. C'est lui
// qui porte la validation, y compris pour un appel direct à GoTrue qui ne passe
// pas par ici. Si on le désactive, le captcha ne protège plus rien.
//
// Limite assumée et à connaître : la validation dépend d'un réglage de console
// que ce dépôt ne peut ni configurer ni vérifier. C'est le prix de couvrir le
// chemin direct, et c'est le bon arbitrage : une validation que nous possédons
// sur un chemin sur deux vaut moins qu'une validation déléguée sur les deux.
// La seule façon de posséder vraiment la validation serait de rendre GoTrue
// inatteignable avec la clé publiable, ce que l'hébergement Supabase ne permet
// pas.
//
// ── Comptes désactivés ───────────────────────────────────────────────────────
// La désactivation (manage-user toggle_active) bannit le compte dans Supabase
// Auth : la connexion échoue alors dès signInWithPassword, ici comme en appel
// direct. Le contrôle de profiles.active ci-dessous est une seconde barrière
// (compte désactivé avant la mise en place du bannissement, compte Auth sans
// profil) : toutes les sessions du compte sont fermées, et la réponse reste la
// même que pour un mauvais mot de passe. Si le profil est seulement ILLISIBLE
// (base momentanément indisponible), rien ne dit que le compte est inactif :
// seule la session tout juste ouverte est fermée (l'utilisateur garde celles
// de ses autres postes) et la réponse est 503, pas « identifiants incorrects ».

import { clientAdmin, clientPublic, type SupabaseClient } from '../_shared/clients.ts';
import { entetesCors, reponsePreliminaire } from '../_shared/cors.ts';
import { reponseJson } from '../_shared/http.ts';
import { courrielInterne, estNumeroEmploye } from '../_shared/identifiants.ts';

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');
  const cors = entetesCors(origin);
  const json = (data: unknown, status: number) => reponseJson(data, status, cors);

  if (req.method === 'OPTIONS') {
    return reponsePreliminaire(origin);
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405);
  }

  // ── Lecture du body ────────────────────────────────────────────────────────
  let body: { employee_id?: unknown; password?: unknown; captcha_token?: unknown } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid_body' }, 400);
  }
  if (!body || typeof body !== 'object') {
    return json({ error: 'invalid_body' }, 400);
  }

  const employeeId = String(body.employee_id || '').trim().toLowerCase();
  const password   = String(body.password || '');
  const captcha    = String(body.captcha_token || '');

  if (!employeeId || !password) {
    return json({ error: 'missing_credentials' }, 400);
  }

  // ── Captcha : présence exigée avant tout le reste ──────────────────────────
  // Ce test ne vérifie que la PRÉSENCE du jeton : n'importe quelle chaîne non
  // vide le passe. Le jeton est validé par Supabase Auth (cf. note en tête), et
  // un captcha refusé par Auth (captcha_failed) n'est pas enregistré comme
  // tentative (étape 4). Ainsi, écrire une ligne d'échec sur un identifiant
  // exige un captcha valide à chaque fois — à condition que le captcha soit
  // activé dans la console ; sinon, Auth ne le vérifie pas.
  if (!captcha) {
    return json({ error: 'captcha_required' }, 400);
  }

  // ── N° employé : même motif qu'à la création (manage-user) ────────────────
  // Un identifiant mal formé ne peut correspondre à aucun compte : refus
  // générique AVANT toute RPC, donc aucune ligne écrite dans login_attempts
  // (ni identifiant arbitrairement long, ni valeur fantaisiste).
  if (!estNumeroEmploye(employeeId)) {
    return json({ error: 'invalid_credentials' }, 401);
  }

  // ── Clients : clé secrète pour les RPC service_role, clé publiable pour la
  // connexion. Configuration absente ou invalide → refus explicite (journal),
  // jamais une clé vide transmise en silence.
  let adminClient: SupabaseClient;
  let publicClient: SupabaseClient;
  try {
    adminClient  = clientAdmin();
    publicClient = clientPublic();
  } catch (e) {
    console.error('[auth-gate] configuration invalide :', e instanceof Error ? e.message : String(e));
    return json({ error: 'service_unavailable' }, 503);
  }

  // ── 1. Comptage : DÉTECTION seulement, jamais un blocage ───────────────────
  // Le seuil n'interdit plus rien ; il signale un balayage dans les journaux.
  // La donnée nécessaire existait déjà, il manquait l'alerte.
  const { data: rl, error: rlErr } = await adminClient.rpc('count_recent_login_failures', {
    p_employee_id: employeeId,
  });
  if (rlErr) {
    console.error('[auth-gate] comptage des échecs indisponible', rlErr.code ?? '', rlErr.message);
  } else if (rl && rl.count >= 5) {
    console.warn(`[auth-gate] ${rl.count} échecs récents sur un même identifiant — possible balayage`);
  }

  // ── 2. Appeler Supabase Auth, qui valide le captcha ────────────────────────
  const signInResult = await publicClient.auth.signInWithPassword({
    email: courrielInterne(employeeId),
    password,
    options: { captchaToken: captcha },
  });
  const session = !signInResult.error ? signInResult.data?.session : null;
  // Captcha refusé par Auth : aucune vérification d'identifiants n'a eu lieu.
  const captchaRefuse = signInResult.error?.code === 'captcha_failed';

  // ── 3. Compte actif ? (seconde barrière, cf. note en tête) ─────────────────
  let refus: 'aucun' | 'inactif' | 'profil_illisible' = 'aucun';
  if (session) {
    const { data: profil, error: profilErr } = await adminClient
      .from('profiles')
      .select('active')
      .eq('id', session.user.id)
      .maybeSingle();
    if (profilErr) {
      // État du compte inconnu : ne fermer QUE la session tout juste ouverte.
      refus = 'profil_illisible';
      console.error('[auth-gate] lecture du profil impossible', profilErr.code ?? '', profilErr.message);
      const { error: soErr } = await adminClient.auth.admin.signOut(session.access_token, 'local');
      if (soErr) console.error('[auth-gate] fermeture de session impossible', soErr.message);
    } else if (!profil || profil.active !== true) {
      refus = 'inactif';
      console.warn('[auth-gate] connexion refusée : compte sans profil ou désactivé');
      // Fermer TOUTES les sessions de ce compte, dont celle tout juste ouverte.
      const { error: soErr } = await adminClient.auth.admin.signOut(session.access_token, 'global');
      if (soErr) console.error('[auth-gate] fermeture de session impossible', soErr.message);
    }
  }

  // ── 4. Enregistrer l'attempt (sauf captcha refusé par Auth) ────────────────
  const success = !!session && refus === 'aucun';
  if (!captchaRefuse) {
    const { error: recErr } = await adminClient.rpc('record_login_attempt', {
      p_employee_id: employeeId,
      p_success:     success,
    });
    if (recErr) {
      console.error('[auth-gate] enregistrement de la tentative impossible', recErr.code ?? '', recErr.message);
    }
  }

  // ── 5. Réponse au client ──────────────────────────────────────────────────
  if (refus === 'profil_illisible') {
    return json({ error: 'service_unavailable' }, 503);
  }
  if (!success || !session) {
    // Message générique uniquement : ne rien renvoyer qui révèle l'existence
    // du compte ou son état (le message brut de l'auth est seulement journalisé).
    if (signInResult.error) {
      console.warn('[auth-gate] échec connexion:', signInResult.error.code ?? '', signInResult.error.message);
    }
    return json({ error: 'invalid_credentials' }, 401);
  }

  return json({
    access_token:  session.access_token,
    refresh_token: session.refresh_token,
    user:          signInResult.data.user,
  }, 200);
});
