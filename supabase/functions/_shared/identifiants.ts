// Module partagé : format du N° employé et adresse de connexion interne.
//
// Le N° employé sert de partie locale de l'adresse {id}@optilab.internal sous
// laquelle le compte existe dans Supabase Auth. Il doit donc former une partie
// locale valide (RFC 5322, dot-atom) : pas de point initial, final ni doublé.
// Le même motif sert à la création (manage-user) et à la connexion (auth-gate),
// qui refuse un identifiant mal formé avant toute écriture en base.

/** 1 à 64 caractères ; un « . » doit être suivi d'un caractère autre que « . ». */
export const MOTIF_EMPLOYE = /^[A-Za-z0-9](?:[A-Za-z0-9_-]|\.(?=[A-Za-z0-9_-])){0,63}$/;

export function estNumeroEmploye(valeur: unknown): valeur is string {
  return typeof valeur === 'string' && MOTIF_EMPLOYE.test(valeur);
}

/** Adresse de connexion Supabase Auth d'un N° employé (toujours en minuscules). */
export function courrielInterne(employeeId: string): string {
  return `${employeeId.toLowerCase()}@optilab.internal`;
}
