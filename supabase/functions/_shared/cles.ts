// Module partagé : clés API Supabase (nouveau modèle sb_secret_ / sb_publishable_).
//
// La plateforme injecte dans chaque fonction Edge deux dictionnaires JSON
// indexés par nom de clé (https://supabase.com/docs/guides/functions/secrets) :
//   · SUPABASE_SECRET_KEYS      → clés secrètes (rôle Postgres service_role,
//                                  contournent la RLS : serveur uniquement) ;
//   · SUPABASE_PUBLISHABLE_KEYS → clés publiables (rôle anon / jeton utilisateur).
// Tout projet possède une clé de chaque type nommée « default ».
//
// Les variables héritées (clés « anon » et « service_role » au format JWT) ne
// sont plus lues : elles portent les clés dépréciées (fin 2026), que l'on ne
// peut ni révoquer une à une ni faire tourner sans déconnecter tout le monde.
//
// Échec FERMÉ : variable absente, JSON invalide, nom de clé introuvable ou
// format inattendu (une clé héritée JWT collée par erreur, par exemple) lèvent
// ErreurConfiguration avec un message explicite dans le journal. Aucune valeur
// de clé n'est jamais journalisée.
//
// Rotation sans coupure (facultatif) : créer une nouvelle clé nommée dans la
// console (Settings > API Keys), poser son NOM (pas sa valeur) dans le secret
// de fonction EDGE_SECRET_KEY_NAME (resp. EDGE_PUBLISHABLE_KEY_NAME), puis
// supprimer l'ancienne. Sans ces variables, la clé « default » est utilisée.

/** Configuration de plateforme absente ou invalide : la fonction doit refuser. */
export class ErreurConfiguration extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ErreurConfiguration';
  }
}

const NOM_CLE_PAR_DEFAUT = 'default';
const MOTIF_NOM_CLE = /^[A-Za-z0-9_-]{1,64}$/;

type TypeCle = 'secrete' | 'publiable';

const DEFINITIONS: Record<TypeCle, { variable: string; variableNom: string; prefixe: string }> = {
  secrete:   { variable: 'SUPABASE_SECRET_KEYS',      variableNom: 'EDGE_SECRET_KEY_NAME',      prefixe: 'sb_secret_' },
  publiable: { variable: 'SUPABASE_PUBLISHABLE_KEYS', variableNom: 'EDGE_PUBLISHABLE_KEY_NAME', prefixe: 'sb_publishable_' },
};

// Les variables d'environnement ne changent pas pendant la vie d'un isolat :
// une clé valide est mémorisée ; une erreur est relevée à chaque appel.
const memo = new Map<TypeCle, string>();

function nomDeCle(variableNom: string): string {
  const brut = (Deno.env.get(variableNom) ?? '').trim();
  if (!brut) return NOM_CLE_PAR_DEFAUT;
  if (!MOTIF_NOM_CLE.test(brut)) {
    throw new ErreurConfiguration(`${variableNom} : nom de clé invalide.`);
  }
  return brut;
}

function lireCle(type: TypeCle): string {
  const deja = memo.get(type);
  if (deja) return deja;

  const { variable, variableNom, prefixe } = DEFINITIONS[type];
  const brut = Deno.env.get(variable);
  if (!brut) {
    throw new ErreurConfiguration(`${variable} absente de l'environnement de la fonction.`);
  }

  let dictionnaire: unknown;
  try {
    dictionnaire = JSON.parse(brut);
  } catch (_) {
    throw new ErreurConfiguration(`${variable} n'est pas un JSON valide.`);
  }
  if (!dictionnaire || typeof dictionnaire !== 'object' || Array.isArray(dictionnaire)) {
    throw new ErreurConfiguration(`${variable} n'est pas un dictionnaire JSON.`);
  }

  const nom = nomDeCle(variableNom);
  const cle = (dictionnaire as Record<string, unknown>)[nom];
  if (typeof cle !== 'string' || cle.length === 0) {
    throw new ErreurConfiguration(`${variable} : aucune clé nommée « ${nom} ».`);
  }
  if (!cle.startsWith(prefixe)) {
    // Ne jamais journaliser la valeur : seul le format attendu est cité.
    throw new ErreurConfiguration(`${variable}[« ${nom} »] n'a pas le format attendu (${prefixe}…).`);
  }

  memo.set(type, cle);
  return cle;
}

/** Clé secrète (rôle service_role). Serveur uniquement, jamais renvoyée. */
export function cleSecrete(): string {
  return lireCle('secrete');
}

/** Clé publiable (rôle anon ; sert aussi à porter le jeton d'un utilisateur). */
export function clePubliable(): string {
  return lireCle('publiable');
}

/** URL de l'API du projet (passerelle), injectée par la plateforme. */
export function urlSupabase(): string {
  const brut = Deno.env.get('SUPABASE_URL');
  if (!brut) throw new ErreurConfiguration("SUPABASE_URL absente de l'environnement de la fonction.");
  let url: URL;
  try {
    url = new URL(brut);
  } catch (_) {
    throw new ErreurConfiguration("SUPABASE_URL n'est pas une URL valide.");
  }
  // En local, la plateforme injecte http://kong:8000 : http est donc admis.
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ErreurConfiguration('SUPABASE_URL : protocole inattendu.');
  }
  return brut.replace(/\/+$/, '');
}
