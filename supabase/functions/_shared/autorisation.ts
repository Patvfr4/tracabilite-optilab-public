// Module partagé : identité et droits du demandeur.
//
// Pourquoi ce module existe : les fonctions Edge lisent le profil avec la clé
// secrète, donc HORS RLS. Les gardes SQL (current_role_name(), qui refuse un
// compte inactif ou devant changer son mot de passe) ne s'y appliquent pas.
// Chaque fonction doit donc refaire ces contrôles elle-même, de la même façon :
//   1. jeton d'accès présent et VALIDE auprès de Supabase Auth (getUser) — un
//      appel réseau plutôt qu'une simple vérification de signature, parce que
//      Auth refuse aussi un compte banni ou une session révoquée, même avec un
//      jeton encore dans sa durée de validité ;
//   2. profil existant ET actif (profiles.active = true) ;
//   3. must_change_password = false, sauf pour l'action dédiée au changement ;
//   4. rôle parmi ceux exigés.
// Le client ne reçoit que des messages génériques.

import { clientPublic, type SupabaseClient, type User } from './clients.ts';
import { ErreurHttp } from './http.ts';

export type Role = 'technicien' | 'superviseur_labo' | 'superviseur_grappe' | 'admin';

export const ROLES: readonly Role[] = ['technicien', 'superviseur_labo', 'superviseur_grappe', 'admin'];

export function estRole(valeur: unknown): valeur is Role {
  return typeof valeur === 'string' && (ROLES as readonly string[]).includes(valeur);
}

/** Colonnes du profil utiles aux contrôles d'accès. */
export interface Profil {
  id: string;
  role: Role;
  labo_id: string | null;
  labo_ids: string[] | null;
  active: boolean | null;
  must_change_password: boolean | null;
}

const COLONNES_PROFIL = 'id, role, labo_id, labo_ids, active, must_change_password';

export interface OptionsAcces {
  /** Rôles admis ; absent = tout rôle (le profil doit quand même être actif). */
  roles?: readonly Role[];
  /**
   * 'interdit' (défaut) : refuse un compte qui doit changer son mot de passe.
   * 'requis' : réservé à l'action de changement ; exige ce drapeau.
   */
  changementMotDePasse?: 'interdit' | 'requis';
}

export interface Demandeur {
  jeton: string;
  user: User;
  profil: Profil;
}

/** Jeton d'accès de l'en-tête Authorization (« Bearer … »), sinon 401. */
export function extraireJeton(req: Request): string {
  const entete = (req.headers.get('Authorization') ?? '').trim();
  const correspondance = /^Bearer\s+(\S+)$/i.exec(entete);
  if (!correspondance) throw new ErreurHttp(401, 'Non authentifié.');
  return correspondance[1];
}

/** Valide le jeton auprès de Supabase Auth et renvoie l'utilisateur. */
export async function verifierJeton(jeton: string): Promise<User> {
  const { data, error } = await clientPublic().auth.getUser(jeton);
  if (error || !data?.user) {
    const statut = (error as { status?: number } | null)?.status ?? 0;
    if (error && (statut === 0 || statut >= 500)) {
      // Auth injoignable : ce n'est pas la faute du client, ne pas dire 401.
      console.error('[autorisation] Supabase Auth indisponible :', statut, error.message);
      throw new ErreurHttp(503, "Service d'authentification momentanément indisponible.");
    }
    // Jeton invalide ou expiré, compte banni, session révoquée : même réponse.
    throw new ErreurHttp(401, 'Session invalide ou expirée.');
  }
  return data.user;
}

/** Profil par identifiant (client admin) ; null s'il n'existe pas. */
export async function chargerProfil(admin: SupabaseClient, id: string): Promise<Profil | null> {
  const { data, error } = await admin
    .from('profiles')
    .select(COLONNES_PROFIL)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`lecture du profil impossible (${error.code ?? '?'}) : ${error.message}`);
  return (data as Profil | null) ?? null;
}

/**
 * Établit l'identité ET les droits du demandeur, ou lève une ErreurHttp.
 * À appeler avant toute action faite avec le client admin.
 */
export async function exigerDemandeur(
  req: Request,
  admin: SupabaseClient,
  options: OptionsAcces = {},
): Promise<Demandeur> {
  const jeton = extraireJeton(req);
  const user = await verifierJeton(jeton);
  const profil = await chargerProfil(admin, user.id);

  // Compte sans profil (inscription hors application) ou désactivé.
  if (!profil || profil.active !== true) {
    throw new ErreurHttp(403, 'Accès refusé.');
  }

  const doitChanger = profil.must_change_password === true;
  if ((options.changementMotDePasse ?? 'interdit') === 'requis') {
    if (!doitChanger) {
      throw new ErreurHttp(409, "Aucun changement de mot de passe n'est requis pour ce compte.");
    }
  } else if (doitChanger) {
    throw new ErreurHttp(
      403,
      'Changement de mot de passe requis avant toute autre action.',
      'password_change_required',
    );
  }

  if (options.roles && !options.roles.includes(profil.role)) {
    throw new ErreurHttp(403, 'Droits insuffisants.');
  }

  return { jeton, user, profil };
}
