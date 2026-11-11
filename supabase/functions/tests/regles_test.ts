// Tests unitaires des règles pures de manage-user et de la lecture des clés.
// Sans dépendance externe (pas de bibliothèque d'assertions à verrouiller).
// Lancement : deno test --frozen --allow-env --config supabase/functions/deno.json supabase/functions/tests/

import { ErreurHttp } from '../_shared/http.ts';
import { cleSecrete, clePubliable, ErreurConfiguration, urlSupabase } from '../_shared/cles.ts';
import type { Profil } from '../_shared/autorisation.ts';
import { courrielInterne, estNumeroEmploye } from '../_shared/identifiants.ts';
import {
  exigerMotDePasseValide,
  lireDemandeCreation,
  lireMotDePasseActuel,
  verifierDroitCreation,
  verifierDroitGestion,
} from '../manage-user/regles.ts';

function verifier(condition: unknown, message: string): void {
  if (!condition) throw new Error(`Échec : ${message}`);
}

function leve(fn: () => unknown, statut?: number): ErreurHttp {
  try {
    fn();
  } catch (e) {
    verifier(e instanceof ErreurHttp, `ErreurHttp attendue, reçu ${e}`);
    const err = e as ErreurHttp;
    if (statut !== undefined) verifier(err.statut === statut, `statut ${statut} attendu, reçu ${err.statut}`);
    return err;
  }
  throw new Error('Une erreur était attendue');
}

const LABO_A = '11111111-1111-4111-8111-111111111111';
const LABO_B = '22222222-2222-4222-8222-222222222222';

function profil(role: Profil['role'], labo: string | null = LABO_A, labos: string[] = []): Profil {
  return { id: crypto.randomUUID(), role, labo_id: labo, labo_ids: labos, active: true, must_change_password: false };
}

Deno.test('mot de passe : 12 caractères minimum, 72 octets maximum', () => {
  leve(() => exigerMotDePasseValide(''), 400);
  leve(() => exigerMotDePasseValide(undefined), 400);
  leve(() => exigerMotDePasseValide(12345678901234), 400);
  verifier(leve(() => exigerMotDePasseValide('a'.repeat(11)), 400).code === 'weak_password', 'code weak_password');
  verifier(exigerMotDePasseValide('a'.repeat(12)) === 'a'.repeat(12), '12 caractères acceptés');
  verifier(exigerMotDePasseValide('a'.repeat(72)).length === 72, '72 octets acceptés');
  leve(() => exigerMotDePasseValide('a'.repeat(73)), 400);
  // 37 « é » = 37 caractères mais 74 octets UTF-8 : refusé.
  leve(() => exigerMotDePasseValide('é'.repeat(37)), 400);
});

Deno.test('mot de passe actuel (change_own_password) : facultatif, 72 octets maximum', () => {
  verifier(lireMotDePasseActuel(undefined) === undefined, 'absent');
  verifier(lireMotDePasseActuel(null) === undefined, 'null');
  verifier(lireMotDePasseActuel('') === undefined, 'chaîne vide = absent');
  verifier(lireMotDePasseActuel('temporaire') === 'temporaire', 'transmis tel quel (pas de minimum : ancien mot de passe)');
  verifier(leve(() => lireMotDePasseActuel(42), 400).code === 'current_password_invalid', 'type invalide');
  leve(() => lireMotDePasseActuel('é'.repeat(37)), 400);
});

Deno.test('N° employé : partie locale d\'adresse valide, 64 caractères au plus', () => {
  for (const ok of ['E1', 'EMP-001', 'demo_adm.01', 'a.b-c_d', 'A'.repeat(64)]) {
    verifier(estNumeroEmploye(ok), `« ${ok} » accepté`);
  }
  for (const ko of ['', '.a', 'a.', 'a..b', '-a', '_a', 'a b', 'a@b', 'é1', 'A'.repeat(65), 'a.'.repeat(10)]) {
    verifier(!estNumeroEmploye(ko), `« ${ko} » refusé`);
  }
  verifier(!estNumeroEmploye(12), 'type non chaîne refusé');
  verifier(courrielInterne('DEMO-Adm01') === 'demo-adm01@optilab.internal', 'adresse en minuscules');
  const base = { password: 'motdepasse-long', nom: 'N', labo_id: LABO_A, role: 'technicien' };
  verifier(leve(() => lireDemandeCreation({ ...base, employee_id: 'a..b' }), 400).code === 'invalid_employee_id', 'code invalid_employee_id');
  leve(() => lireDemandeCreation({ ...base, employee_id: 'a.' }), 400);
});

Deno.test('création : validation et normalisation de la charge utile', () => {
  const base = {
    employee_id: ' EMP-001 ', password: 'motdepasse-long', nom: ' Alice ', labo_id: LABO_A, role: 'technicien',
  };
  const d = lireDemandeCreation({ ...base, labo_ids: [] });
  verifier(d.employee_id === 'EMP-001' && d.nom === 'Alice', 'espaces retirés');
  verifier(d.labo_ids.length === 1 && d.labo_ids[0] === LABO_A, 'labo_ids vide → [labo_id]');
  verifier(lireDemandeCreation(base).labo_ids[0] === LABO_A, 'labo_ids absent → [labo_id]');
  verifier(lireDemandeCreation({ ...base, labo_ids: [LABO_B, LABO_B] }).labo_ids.length === 1, 'doublons retirés');

  leve(() => lireDemandeCreation(null), 400);
  leve(() => lireDemandeCreation([]), 400);
  leve(() => lireDemandeCreation({ ...base, employee_id: 'x@evil.example' }), 400);
  leve(() => lireDemandeCreation({ ...base, employee_id: '' }), 400);
  leve(() => lireDemandeCreation({ ...base, role: 'root' }), 400);
  leve(() => lireDemandeCreation({ ...base, labo_id: 'pas-un-uuid' }), 400);
  leve(() => lireDemandeCreation({ ...base, labo_ids: ['pas-un-uuid'] }), 400);
  leve(() => lireDemandeCreation({ ...base, labo_ids: 'x' }), 400);
  leve(() => lireDemandeCreation({ ...base, nom: '   ' }), 400);
  leve(() => lireDemandeCreation({ ...base, password: 'court' }), 400);
});

Deno.test('création : rang et périmètre du demandeur', () => {
  const demande = (role: Profil['role'], labo = LABO_A, labos = [LABO_A]) =>
    lireDemandeCreation({ employee_id: 'E1', password: 'motdepasse-long', nom: 'N', labo_id: labo, labo_ids: labos, role });

  leve(() => verifierDroitCreation(profil('superviseur_grappe'), demande('admin')), 403);
  verifierDroitCreation(profil('admin'), demande('admin'));
  // Hors admin, rang STRICTEMENT inférieur : pas de seconde identité de même rang.
  leve(() => verifierDroitCreation(profil('superviseur_grappe'), demande('superviseur_grappe')), 403);
  leve(() => verifierDroitCreation(profil('superviseur_labo', LABO_A), demande('superviseur_labo')), 403);
  leve(() => verifierDroitCreation(profil('superviseur_labo', LABO_A), demande('superviseur_grappe')), 403);
  verifierDroitCreation(profil('superviseur_grappe'), demande('superviseur_labo'));
  verifierDroitCreation(profil('admin'), demande('superviseur_grappe'));
  verifierDroitCreation(profil('superviseur_labo', LABO_A), demande('technicien'));
  // superviseur_labo : labo principal OU l'un des labo_ids hors périmètre → refus.
  leve(() => verifierDroitCreation(profil('superviseur_labo', LABO_A), demande('technicien', LABO_B, [LABO_B])), 403);
  leve(() => verifierDroitCreation(profil('superviseur_labo', LABO_A), demande('technicien', LABO_A, [LABO_A, LABO_B])), 403);
  verifierDroitCreation(profil('superviseur_labo', LABO_A, [LABO_B]), demande('technicien', LABO_B, [LABO_B]));
});

Deno.test('gestion : admin protégé, rang strictement inférieur, périmètre labo', () => {
  leve(() => verifierDroitGestion(profil('superviseur_grappe'), profil('admin')), 403);
  verifierDroitGestion(profil('admin'), profil('admin'));
  leve(() => verifierDroitGestion(profil('superviseur_grappe'), profil('superviseur_grappe')), 403);
  verifierDroitGestion(profil('superviseur_grappe'), profil('superviseur_labo', LABO_B));
  leve(() => verifierDroitGestion(profil('superviseur_labo', LABO_A), profil('technicien', LABO_B)), 403);
  leve(() => verifierDroitGestion(profil('superviseur_labo', LABO_A), profil('technicien', null)), 403);
  verifierDroitGestion(profil('superviseur_labo', LABO_A), profil('technicien', LABO_A));
  leve(() => verifierDroitGestion(profil('technicien'), profil('technicien')), 403);
});

Deno.test('clés : échec fermé explicite, puis lecture de la clé « default »', () => {
  const echoue = (fn: () => unknown, extrait: string) => {
    try {
      fn();
    } catch (e) {
      verifier(e instanceof ErreurConfiguration, `ErreurConfiguration attendue, reçu ${e}`);
      verifier((e as Error).message.includes(extrait), `message contenant « ${extrait} », reçu « ${(e as Error).message} »`);
      return;
    }
    throw new Error('ErreurConfiguration attendue');
  };
  // Valeurs factices de test, sans rapport avec un projet réel.
  const SECRETE = 'sb_secret_valeur_factice_de_test';
  const PUBLIABLE = 'sb_publishable_valeur_factice_de_test';

  Deno.env.delete('SUPABASE_SECRET_KEYS');
  Deno.env.delete('EDGE_SECRET_KEY_NAME');
  echoue(cleSecrete, 'absente');
  Deno.env.set('SUPABASE_SECRET_KEYS', '{pas du json');
  echoue(cleSecrete, 'JSON valide');
  Deno.env.set('SUPABASE_SECRET_KEYS', '["sb_secret_x"]');
  echoue(cleSecrete, 'dictionnaire');
  Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ autre: SECRETE }));
  echoue(cleSecrete, '« default »');
  // Clé héritée (JWT) collée par erreur : refusée, et sa valeur n'est pas citée.
  Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'eyJhbGciOiJIUzI1NiJ9.e30.x' }));
  try {
    cleSecrete();
    throw new Error('refus attendu');
  } catch (e) {
    verifier(e instanceof ErreurConfiguration, 'ErreurConfiguration attendue');
    verifier(!(e as Error).message.includes('eyJ'), 'la valeur ne doit jamais apparaître dans le message');
  }
  Deno.env.set('EDGE_SECRET_KEY_NAME', 'nom invalide !');
  Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: SECRETE }));
  echoue(cleSecrete, 'nom de clé invalide');
  // Rotation : le nom choisi l'emporte sur « default ».
  Deno.env.set('EDGE_SECRET_KEY_NAME', 'edge');
  Deno.env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'sb_secret_ancienne', edge: SECRETE }));
  verifier(cleSecrete() === SECRETE, 'clé nommée par EDGE_SECRET_KEY_NAME');
  Deno.env.delete('EDGE_SECRET_KEY_NAME');

  Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: SECRETE }));
  echoue(clePubliable, 'sb_publishable_');
  Deno.env.set('SUPABASE_PUBLISHABLE_KEYS', JSON.stringify({ default: PUBLIABLE }));
  verifier(clePubliable() === PUBLIABLE, 'clé publiable « default »');

  Deno.env.delete('SUPABASE_URL');
  echoue(urlSupabase, 'SUPABASE_URL');
  Deno.env.set('SUPABASE_URL', 'ftp://exemple.invalid');
  echoue(urlSupabase, 'protocole');
  Deno.env.set('SUPABASE_URL', 'http://kong:8000/');
  verifier(urlSupabase() === 'http://kong:8000', 'barre finale retirée');
});
