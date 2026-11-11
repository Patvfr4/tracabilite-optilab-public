// Règles pures de manage-user (sans accès réseau) : validation des entrées,
// politique de mot de passe et hiérarchie des rôles. Séparées du gestionnaire
// pour être testées isolément (supabase/functions/tests/regles_test.ts).

import { estRole, type Profil, type Role } from '../_shared/autorisation.ts';
import { ErreurHttp } from '../_shared/http.ts';
import { estNumeroEmploye } from '../_shared/identifiants.ts';

/** Longueur minimale imposée côté serveur (alignée sur [auth] de config.toml). */
export const MDP_LONGUEUR_MIN = 12;
/** bcrypt (Supabase Auth) ignore tout au-delà de 72 octets : refuser plutôt que tronquer. */
export const MDP_OCTETS_MAX = 72;

/** Rang hiérarchique d'un rôle (plus élevé = plus de privilèges). */
export const ROLE_RANK: Record<Role, number> = {
  admin: 4, superviseur_grappe: 3, superviseur_labo: 2, technicien: 1,
};

/** Rôles autorisés à gérer des comptes. */
export const ROLES_GESTIONNAIRES: readonly Role[] = ['superviseur_labo', 'superviseur_grappe', 'admin'];

const MOTIF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LABOS_MAX = 50;

export function estUuid(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && MOTIF_UUID.test(valeur);
}

/** Contrôle de la politique de mot de passe ; lève une ErreurHttp 400. */
export function exigerMotDePasseValide(valeur: unknown): string {
  if (typeof valeur !== 'string' || valeur.length === 0) {
    throw new ErreurHttp(400, 'Mot de passe manquant.');
  }
  if (valeur.length < MDP_LONGUEUR_MIN) {
    throw new ErreurHttp(400, `Le mot de passe doit contenir au moins ${MDP_LONGUEUR_MIN} caractères.`, 'weak_password');
  }
  if (new TextEncoder().encode(valeur).length > MDP_OCTETS_MAX) {
    throw new ErreurHttp(400, `Le mot de passe est trop long (${MDP_OCTETS_MAX} octets au maximum).`, 'weak_password');
  }
  return valeur;
}

/**
 * Mot de passe actuel, facultatif (change_own_password) : absent, ou chaîne
 * d'au plus 72 octets transmise telle quelle à Supabase Auth, qui le vérifie
 * quand le réglage « Require current password when changing password » est
 * activé (et l'ignore sinon).
 */
export function lireMotDePasseActuel(valeur: unknown): string | undefined {
  if (valeur === undefined || valeur === null || valeur === '') return undefined;
  if (typeof valeur !== 'string' || new TextEncoder().encode(valeur).length > MDP_OCTETS_MAX) {
    throw new ErreurHttp(400, 'Mot de passe actuel incorrect.', 'current_password_invalid');
  }
  return valeur;
}

/** Objet JSON attendu pour payload ; lève une ErreurHttp 400 sinon. */
export function exigerObjet(valeur: unknown): Record<string, unknown> {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) {
    throw new ErreurHttp(400, 'Requête invalide.');
  }
  return valeur as Record<string, unknown>;
}

export function exigerUuid(valeur: unknown, champ: string): string {
  if (!estUuid(valeur)) throw new ErreurHttp(400, `Paramètre ${champ} invalide.`);
  return valeur;
}

export interface DemandeCreation {
  employee_id: string;
  password: string;
  nom: string;
  labo_id: string;
  labo_ids: string[];
  role: Role;
}

/** Valide et normalise la charge utile de l'action create. */
export function lireDemandeCreation(payload: unknown): DemandeCreation {
  const p = exigerObjet(payload);

  const employee_id = typeof p.employee_id === 'string' ? p.employee_id.trim() : '';
  if (!estNumeroEmploye(employee_id)) {
    throw new ErreurHttp(
      400,
      'N° employé invalide (lettres, chiffres, « _ », « - » ou « . » entre deux caractères, 64 caractères au plus).',
      'invalid_employee_id',
    );
  }

  const nom = typeof p.nom === 'string' ? p.nom.trim() : '';
  if (!nom || nom.length > 200) throw new ErreurHttp(400, 'Nom invalide.');

  if (!estRole(p.role)) throw new ErreurHttp(400, 'Rôle invalide.');

  const labo_id = exigerUuid(p.labo_id, 'labo_id');
  let labo_ids: string[];
  if (p.labo_ids === undefined || p.labo_ids === null) {
    labo_ids = [labo_id];
  } else {
    if (!Array.isArray(p.labo_ids) || p.labo_ids.length > LABOS_MAX || !p.labo_ids.every(estUuid)) {
      throw new ErreurHttp(400, 'Paramètre labo_ids invalide.');
    }
    // labo_ids doit toujours contenir au moins labo_id
    labo_ids = p.labo_ids.length > 0 ? [...new Set(p.labo_ids as string[])] : [labo_id];
  }

  const password = exigerMotDePasseValide(p.password);

  return { employee_id, password, nom, labo_id, labo_ids, role: p.role };
}

/**
 * Création : hors admin, on ne crée que des comptes de rang STRICTEMENT
 * inférieur au sien (bloque superviseur_grappe → admin, E-1), comme pour la
 * gestion (verifierDroitGestion). Un rang égal est refusé : le créateur ne
 * pourrait ensuite ni réinitialiser ni désactiver ce compte, mais il en
 * connaîtrait le mot de passe temporaire et pourrait lui-même faire le
 * changement imposé, ce qui lui donnerait une seconde identité de même rang.
 * Seul un admin crée un admin.
 * Un superviseur_labo est cantonné à ses laboratoires, pour le labo principal
 * ET pour chaque entrée de labo_ids (M-3).
 */
export function verifierDroitCreation(demandeur: Profil, demande: DemandeCreation): void {
  if (demandeur.role !== 'admin' && ROLE_RANK[demande.role] >= (ROLE_RANK[demandeur.role] ?? 0)) {
    throw new ErreurHttp(403, 'Rôle non autorisé : vous ne pouvez créer que des comptes de rang inférieur au vôtre.');
  }
  if (demandeur.role === 'superviseur_labo') {
    const autorises = laboratoiresDe(demandeur);
    if ([demande.labo_id, ...demande.labo_ids].some((l) => !autorises.has(l))) {
      throw new ErreurHttp(403, 'Vous ne pouvez créer des utilisateurs que pour vos laboratoires.');
    }
  }
}

function laboratoiresDe(profil: Pick<Profil, 'labo_id' | 'labo_ids'>): Set<string> {
  return new Set<string>([
    ...(profil.labo_ids ?? []),
    ...(profil.labo_id ? [profil.labo_id] : []),
  ]);
}

/**
 * Autorise une action de gestion (réinitialisation, activation) du demandeur
 * sur une cible :
 *   0. un compte administrateur n'est géré que par un administrateur ;
 *   1. rang : jamais sur un compte de rang égal ou supérieur au sien (un admin
 *      n'est pas restreint ici) ;
 *   2. périmètre : un superviseur_labo est cantonné à ses laboratoires
 *      (labo_ids + labo_id, pas seulement le labo principal).
 */
export function verifierDroitGestion(
  demandeur: Pick<Profil, 'role' | 'labo_id' | 'labo_ids'>,
  cible: Pick<Profil, 'role' | 'labo_id'>,
): void {
  if (cible.role === 'admin' && demandeur.role !== 'admin') {
    throw new ErreurHttp(403, 'Les comptes administrateur ne peuvent être modifiés que par un administrateur.');
  }
  if (demandeur.role === 'admin') return;

  const rangDemandeur = ROLE_RANK[demandeur.role] ?? 0;
  const rangCible = ROLE_RANK[cible.role] ?? 99;
  if (rangCible >= rangDemandeur) {
    throw new ErreurHttp(403, 'Droits insuffisants : vous ne pouvez pas gérer un compte de rang égal ou supérieur au vôtre.');
  }

  if (demandeur.role === 'superviseur_labo') {
    if (!cible.labo_id || !laboratoiresDe(demandeur).has(cible.labo_id)) {
      throw new ErreurHttp(403, 'Vous ne pouvez gérer que les utilisateurs de vos laboratoires.');
    }
  }
}
