// Test d'intégration des quatre fonctions Edge. Chaque index.ts RÉEL tourne
// dans un sous-processus Deno, comme sur la plateforme, contre le simulacre
// local de Supabase et de Resend (outils/simulacre.ts) servi sur 127.0.0.1,
// avec des clés FACTICES. Aucun appel externe : les sous-processus n'ont que
// --allow-net=127.0.0.1, et outils/preload.ts refuse tout autre hôte.
//
// Permissions requises ; sans elles, le test est IGNORÉ (et affiché comme tel) :
//   deno test --frozen --allow-env --allow-net=127.0.0.1 --allow-run --allow-read \
//     --config supabase/functions/deno.json supabase/functions/tests/
// Les portes d'entrée (exigerDemandeur, x-trigger-secret) sont aussi couvertes
// sans permission particulière par autorisation_test.ts.

import { CAPTCHA_REFUSE, creerSimulacre, LABO_A, LABO_B, PUBLIABLE, SECRETE } from './outils/simulacre.ts';

const PERMISSIONS: Deno.PermissionDescriptor[] = [
  { name: 'run' },
  { name: 'read' },
  { name: 'env' },
  { name: 'net', host: '127.0.0.1' },
];
const PERMIS = PERMISSIONS.every((p) => Deno.permissions.querySync(p).state === 'granted');
if (!PERMIS) {
  console.warn(
    '[integration_test] IGNORÉ : relancer avec --allow-env --allow-net=127.0.0.1 --allow-run --allow-read.',
  );
}

/** Chemin local d'un fichier relatif à ce module (Windows compris). */
function chemin(relatif: string): string {
  const p = decodeURIComponent(new URL(relatif, import.meta.url).pathname);
  return Deno.build.os === 'windows' ? p.replace(/^\/([A-Za-z]:)/, '$1') : p;
}
const FONCTIONS = chemin('../');
const PRELOAD = chemin('./outils/preload.ts');

const PORT_SIMULACRE = 54999;
const SIMULACRE_URL = `http://127.0.0.1:${PORT_SIMULACRE}`;

interface Fonction {
  port: number;
  journal: string[];
  processus: Deno.ChildProcess;
  lecture: Promise<void>;
}

async function lancer(fonction: string, port: number, envSup: Record<string, string> = {}): Promise<Fonction> {
  const processus = new Deno.Command(Deno.execPath(), {
    args: [
      'run', '--frozen', '--config', `${FONCTIONS}deno.json`, '--allow-net=127.0.0.1', '--allow-env',
      '--preload', PRELOAD, `${FONCTIONS}${fonction}/index.ts`,
    ],
    env: {
      SUPABASE_URL: SIMULACRE_URL,
      SUPABASE_SECRET_KEYS: JSON.stringify({ default: SECRETE }),
      SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: PUBLIABLE }),
      EDGE_SECRET_KEY_NAME: '',
      EDGE_PUBLISHABLE_KEY_NAME: '',
      FN_PORT: String(port),
      SIMULACRE_URL,
      ...envSup,
    },
    stdin: 'null',
    stdout: 'null',
    stderr: 'piped',
  }).spawn();
  const journal: string[] = [];
  const lecture = (async () => {
    for await (const morceau of processus.stderr.pipeThrough(new TextDecoderStream())) journal.push(morceau);
  })();
  const f: Fonction = { port, journal, processus, lecture };
  for (let i = 0; i < 240; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/`, { method: 'OPTIONS' });
      await r.body?.cancel();
      return f;
    } catch (_) {
      await new Promise((ok) => setTimeout(ok, 250));
    }
  }
  throw new Error(`${fonction} ne démarre pas : ${journal.join('')}`);
}

async function appeler(f: Fonction, corps: unknown, entetes: Record<string, string> = {}, methode = 'POST') {
  const r = await fetch(`http://127.0.0.1:${f.port}/`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...entetes },
    body: methode === 'GET' ? undefined : typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
  const texte = await r.text();
  // deno-lint-ignore no-explicit-any -- réponse JSON libre, lue champ par champ.
  let json: Record<string, any> = {};
  try {
    json = JSON.parse(texte);
  } catch (_) { /* corps non JSON */ }
  return { statut: r.status, json, entetes: r.headers };
}

const bearer = (jeton: string) => ({ Authorization: `Bearer ${jeton}` });

/** Vérifications groupées : toutes sont évaluées, l'étape échoue avec la liste. */
function verificateur() {
  const echecs: string[] = [];
  return {
    verifier(nom: string, condition: boolean, detail?: unknown) {
      if (!condition) echecs.push(`${nom}  → ${JSON.stringify(detail ?? null)}`);
    },
    bilan() {
      if (echecs.length) throw new Error(`${echecs.length} vérification(s) en échec :\n- ${echecs.join('\n- ')}`);
    },
  };
}

Deno.test({
  name: 'intégration : fonctions Edge réelles contre un simulacre local de Supabase',
  ignore: !PERMIS,
  async fn(t) {
    const sim = creerSimulacre();
    const serveur = Deno.serve({ port: PORT_SIMULACRE, hostname: '127.0.0.1', onListen() {} }, sim.gerer);
    const fonctions: Fonction[] = [];
    const demarrer = async (nom: string, port: number, env?: Record<string, string>) => {
      const f = await lancer(nom, port, env);
      fonctions.push(f);
      return f;
    };

    try {
      const [AG, MU, TN, SN, MU_SANS_CLE, SN_JWT] = await Promise.all([
        demarrer('auth-gate', 55001),
        demarrer('manage-user', 55002),
        demarrer('test-notification', 55003),
        demarrer('send-notifications', 55004),
        demarrer('manage-user', 55005, { SUPABASE_SECRET_KEYS: '' }),
        demarrer('send-notifications', 55006, {
          SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'eyJhbGciOiJIUzI1NiJ9.e30.factice' }),
        }),
      ]);
      const SECRET_DECLENCHEUR = 'f'.repeat(64);

      await t.step('configuration de plateforme absente ou héritée : échec fermé (503)', async () => {
        const v = verificateur();
        const admin = sim.ajouter('CFG-ADM', 'admin');
        const r = await appeler(MU_SANS_CLE, { action: 'create', payload: {} }, bearer(sim.ouvrirSession(admin.id)));
        v.verifier('SUPABASE_SECRET_KEYS absente → 503 générique', r.statut === 503 && r.json.error === 'Service momentanément indisponible.', r);
        v.verifier('le journal nomme la variable manquante', MU_SANS_CLE.journal.join('').includes('SUPABASE_SECRET_KEYS absente'));
        const r2 = await appeler(SN_JWT, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        v.verifier('clé héritée JWT refusée par send-notifications → 503', r2.statut === 503, r2);
        v.verifier('la valeur de la clé n\'apparaît pas dans le journal', !SN_JWT.journal.join('').includes('eyJhbGci'));
        v.bilan();
      });

      await t.step('auth-gate', async () => {
        const v = verificateur();
        sim.ajouter('AG-OK', 'technicien', { password: 'bon-mot-de-passe' });
        const inactif = sim.ajouter('AG-INACTIF', 'admin', { active: false, password: 'bon-mot-de-passe' });
        const orphelin = sim.ajouter('AG-ORPHELIN', 'technicien', { profil: false, password: 'bon-mot-de-passe' });
        const banni = sim.ajouter('AG-BANNI', 'technicien', { password: 'bon-mot-de-passe' });
        banni.banned = true;
        const enregistrements = () => sim.rpcAppels.filter((a) => a.nom === 'record_login_attempt');

        for (const [origine, attendue] of [
          ['http://localhost:5500', 'http://localhost:5500'],
          ['https://evil.example', 'https://optilab-envois.pages.dev'],
        ]) {
          const o = await fetch(`http://127.0.0.1:${AG.port}/`, { method: 'OPTIONS', headers: { Origin: origine } });
          await o.body?.cancel();
          v.verifier(`CORS ${origine}`, o.headers.get('Access-Control-Allow-Origin') === attendue);
        }

        let r = await appeler(AG, { employee_id: 'AG-OK', password: 'bon-mot-de-passe' });
        v.verifier('captcha exigé', r.statut === 400 && r.json.error === 'captcha_required', r);

        let avant = sim.requetes.length;
        r = await appeler(AG, { employee_id: 'AG-OK', password: 'bon-mot-de-passe', captcha_token: 'c' });
        v.verifier('compte actif → jetons', r.statut === 200 && typeof r.json.access_token === 'string', r);
        const connexion = sim.requetes.slice(avant).find((q) => q.chemin === '/auth/v1/token');
        v.verifier('connexion avec la clé PUBLIABLE', connexion?.apikey === PUBLIABLE, connexion);
        const succes = enregistrements().at(-1);
        v.verifier('tentative enregistrée (succès) avec la clé secrète', succes?.args.p_success === true && succes?.apikey === SECRETE, succes);

        r = await appeler(AG, { employee_id: 'AG-INACTIF', password: 'bon-mot-de-passe', captcha_token: 'c' });
        v.verifier('compte inactif → 401 générique', r.statut === 401 && r.json.error === 'invalid_credentials' && !r.json.access_token, r);
        v.verifier('compte inactif : toutes ses sessions fermées (global)', sim.logouts.at(-1)?.scope === 'global' && sim.auth.get(inactif.id)!.sessions.size === 0, sim.logouts.at(-1));
        v.verifier('compte inactif : tentative en échec', enregistrements().at(-1)?.args.p_success === false);
        r = await appeler(AG, { employee_id: 'AG-ORPHELIN', password: 'bon-mot-de-passe', captcha_token: 'c' });
        v.verifier('compte Auth sans profil → 401', r.statut === 401 && sim.auth.get(orphelin.id)!.sessions.size === 0, r);
        r = await appeler(AG, { employee_id: 'AG-BANNI', password: 'bon-mot-de-passe', captcha_token: 'c' });
        v.verifier('compte banni → 401', r.statut === 401, r);
        r = await appeler(AG, { employee_id: 'AG-OK', password: 'mauvais', captcha_token: 'c' });
        v.verifier('mauvais mot de passe → 401', r.statut === 401 && r.json.error === 'invalid_credentials', r);

        // N° employé mal formé : refus générique, AUCUNE requête vers Supabase.
        for (const id of ['a..b', 'a.', 'x'.repeat(65), 'a@evil.example']) {
          avant = sim.requetes.length;
          r = await appeler(AG, { employee_id: id, password: 'bon-mot-de-passe', captcha_token: 'c' });
          v.verifier(`N° employé « ${id.slice(0, 12)} » → 401 sans requête`, r.statut === 401 && r.json.error === 'invalid_credentials' && sim.requetes.length === avant, r);
        }

        // Captcha refusé par Auth : pas de ligne d'échec sur l'identifiant visé.
        const nbEnreg = enregistrements().length;
        r = await appeler(AG, { employee_id: 'AG-OK', password: 'mauvais', captcha_token: CAPTCHA_REFUSE });
        v.verifier('captcha refusé → 401', r.statut === 401 && r.json.error === 'invalid_credentials', r);
        v.verifier('captcha refusé → aucune tentative enregistrée', enregistrements().length === nbEnreg, enregistrements().length - nbEnreg);

        // Profil illisible : 503, seule la nouvelle session est fermée.
        const panne = sim.ajouter('AG-PANNE', 'technicien', { password: 'bon-mot-de-passe' });
        const jAilleurs = sim.ouvrirSession(panne.id);
        const sessionAilleurs = sim.jetons.get(jAilleurs)!.sessionId;
        sim.pannes.lectureProfils = true;
        r = await appeler(AG, { employee_id: 'AG-PANNE', password: 'bon-mot-de-passe', captcha_token: 'c' });
        sim.pannes.lectureProfils = false;
        const sessions = sim.auth.get(panne.id)!.sessions;
        v.verifier('profil illisible → 503 service_unavailable, sans jeton', r.statut === 503 && r.json.error === 'service_unavailable' && !r.json.access_token, r);
        v.verifier('profil illisible → seule la session ouverte est fermée (local)', sim.logouts.at(-1)?.scope === 'local' && sessions.size === 1 && sessions.has(sessionAilleurs), { logout: sim.logouts.at(-1), n: sessions.size });
        v.verifier('profil illisible → tentative en échec', enregistrements().at(-1)?.args.p_success === false);
        v.bilan();
      });

      await t.step('manage-user : portes, create, reset_password, toggle_active', async () => {
        const v = verificateur();
        const admin = sim.ajouter('MU-ADM', 'admin');
        const jAdmin = sim.ouvrirSession(admin.id);
        const adminInactif = sim.ajouter('MU-ADM-OFF', 'admin', { active: false });
        const jAdminInactif = sim.ouvrirSession(adminInactif.id);
        const adminMcp = sim.ajouter('MU-ADM-MCP', 'admin', { mcp: true });
        const tech = sim.ajouter('MU-TECH', 'technicien');
        const supLabo = sim.ajouter('MU-SUPL', 'superviseur_labo', { labo: LABO_A });
        const cible = sim.ajouter('MU-CIBLE', 'technicien', { labo: LABO_A, password: 'ancien-mot-de-passe' });
        sim.ouvrirSession(cible.id);

        let r = await appeler(MU, { action: 'create', payload: {} });
        v.verifier('sans jeton → 401', r.statut === 401, r);
        r = await appeler(MU, { action: 'create', payload: {} }, bearer('jeton-bidon'));
        v.verifier('jeton invalide → 401', r.statut === 401, r);
        r = await appeler(MU, { action: 'nimporte', payload: {} }, bearer(jAdmin));
        v.verifier('action inconnue → 400', r.statut === 400, r);
        r = await appeler(MU, '{json cassé', bearer(jAdmin));
        v.verifier('corps invalide → 400', r.statut === 400, r);
        r = await appeler(MU, null, {}, 'GET');
        v.verifier('GET → 405', r.statut === 405, r);

        // EDGE-1 / AUTH-1 : un admin désactivé ne peut plus rien faire.
        r = await appeler(MU, { action: 'toggle_active', payload: { profile_id: adminInactif.id, active: true } }, bearer(jAdminInactif));
        v.verifier('admin INACTIF ne peut pas se réactiver → 403', r.statut === 403 && sim.profilDe(adminInactif.id).active === false, r);
        r = await appeler(MU, { action: 'reset_password', payload: { profile_id: admin.id, new_password: 'nouveau-mot-de-passe' } }, bearer(jAdminInactif));
        v.verifier('admin INACTIF ne peut pas réinitialiser un admin → 403', r.statut === 403 && sim.auth.get(admin.id)!.password !== 'nouveau-mot-de-passe', r);
        r = await appeler(MU, { action: 'create', payload: { employee_id: 'PIRATE', password: 'mot-de-passe-long', nom: 'P', labo_id: LABO_A, role: 'admin' } }, bearer(jAdminInactif));
        v.verifier('admin INACTIF ne peut pas créer → 403', r.statut === 403 && !sim.tables.profiles.some((p) => p.employee_id === 'PIRATE'), r);
        r = await appeler(MU, { action: 'create', payload: { employee_id: 'X1', password: 'mot-de-passe-long', nom: 'X', labo_id: LABO_A, role: 'technicien' } }, bearer(sim.ouvrirSession(adminMcp.id)));
        v.verifier('admin avec changement de mot de passe en attente → 403 password_change_required', r.statut === 403 && r.json.code === 'password_change_required', r);
        r = await appeler(MU, { action: 'create', payload: { employee_id: 'X2', password: 'mot-de-passe-long', nom: 'X', labo_id: LABO_A, role: 'technicien' } }, bearer(sim.ouvrirSession(tech.id)));
        v.verifier('technicien → 403', r.statut === 403, r);

        // create
        const base = { employee_id: 'NOUVEAU-1', nom: 'Nouveau', labo_id: LABO_A, labo_ids: [LABO_A], role: 'technicien' };
        r = await appeler(MU, { action: 'create', payload: { ...base, password: 'court' } }, bearer(jAdmin));
        v.verifier('create : mot de passe < 12 → 400', r.statut === 400 && String(r.json.error).includes('12'), r);
        r = await appeler(MU, { action: 'create', payload: { ...base, employee_id: 'a..b', password: 'mot-de-passe-long' } }, bearer(jAdmin));
        v.verifier('create : N° employé mal formé → 400 invalid_employee_id', r.statut === 400 && r.json.code === 'invalid_employee_id', r);
        const nbAuth = sim.auth.size;
        r = await appeler(MU, { action: 'create', payload: { ...base, employee_id: 'refus-auth-1', password: 'mot-de-passe-long' } }, bearer(jAdmin));
        v.verifier('create : adresse refusée par Auth → 400 invalid_employee_id', r.statut === 400 && r.json.code === 'invalid_employee_id' && sim.auth.size === nbAuth, r);
        r = await appeler(MU, { action: 'create', payload: { ...base, password: 'mot-de-passe-long' } }, bearer(jAdmin));
        const cree = sim.tables.profiles.find((p) => p.employee_id === 'NOUVEAU-1');
        v.verifier('create OK : must_change_password=true, actif', r.statut === 200 && r.json.success === true && cree?.must_change_password === true && cree?.active === true, r);
        r = await appeler(MU, { action: 'create', payload: { ...base, password: 'mot-de-passe-long' } }, bearer(jAdmin));
        v.verifier('create : doublon → 409', r.statut === 409, r);
        const jSupLabo = sim.ouvrirSession(supLabo.id);
        r = await appeler(MU, { action: 'create', payload: { ...base, employee_id: 'NOUVEAU-2', labo_id: LABO_B, labo_ids: [LABO_B], password: 'mot-de-passe-long' } }, bearer(jSupLabo));
        v.verifier('create : superviseur_labo hors périmètre → 403', r.statut === 403, r);
        r = await appeler(MU, { action: 'create', payload: { ...base, employee_id: 'NOUVEAU-SL', role: 'superviseur_labo', password: 'mot-de-passe-long' } }, bearer(jSupLabo));
        v.verifier('create : superviseur_labo → superviseur_labo (même rang) → 403', r.statut === 403 && !sim.tables.profiles.some((p) => p.employee_id === 'NOUVEAU-SL'), r);
        sim.pannes.insertProfil = true;
        const nbAuthAvant = sim.auth.size;
        r = await appeler(MU, { action: 'create', payload: { ...base, employee_id: 'NOUVEAU-3', password: 'mot-de-passe-long' } }, bearer(jAdmin));
        sim.pannes.insertProfil = false;
        v.verifier('erreur interne → 500 générique + ref, sans détail', r.statut === 500 && typeof r.json.ref === 'string' && !JSON.stringify(r.json).includes('DETAIL INTERNE'), r);
        v.verifier('compte Auth annulé si le profil échoue', sim.auth.size === nbAuthAvant);
        v.verifier('détail interne journalisé avec la ref', MU.journal.join('').includes(String(r.json.ref)) && MU.journal.join('').includes('DETAIL INTERNE'));

        // reset_password
        r = await appeler(MU, { action: 'reset_password', payload: { profile_id: cible.id, new_password: 'reinit-mot-de-passe' } }, bearer(jAdmin));
        v.verifier('reset OK : drapeau posé, sessions de la cible révoquées',
          r.statut === 200 && sim.profilDe(cible.id).must_change_password === true && sim.auth.get(cible.id)!.password === 'reinit-mot-de-passe' && sim.auth.get(cible.id)!.sessions.size === 0, r);
        sim.profilDe(cible.id).must_change_password = false;
        r = await appeler(MU, { action: 'reset_password', payload: { profile_id: cible.id, new_password: 'mot-de-passe-faible' } }, bearer(jAdmin));
        v.verifier('reset refusé par Auth → 400 et drapeau rétabli', r.statut === 400 && sim.profilDe(cible.id).must_change_password === false, r);
        r = await appeler(MU, { action: 'reset_password', payload: { profile_id: 'pas-un-uuid', new_password: 'reinit-mot-de-passe' } }, bearer(jAdmin));
        v.verifier('profile_id invalide → 400', r.statut === 400, r);
        r = await appeler(MU, { action: 'reset_password', payload: { profile_id: admin.id, new_password: 'reinit-mot-de-passe' } }, bearer(jSupLabo));
        v.verifier('superviseur sur un admin → 403', r.statut === 403, r);

        // toggle_active
        const jCible = sim.ouvrirSession(cible.id);
        r = await appeler(MU, { action: 'toggle_active', payload: { profile_id: admin.id, active: false } }, bearer(jAdmin));
        v.verifier('toggle_active sur soi-même → 400', r.statut === 400 && sim.profilDe(admin.id).active === true, r);
        r = await appeler(MU, { action: 'toggle_active', payload: { profile_id: cible.id, active: 'non' } }, bearer(jAdmin));
        v.verifier('active non booléen → 400', r.statut === 400, r);
        r = await appeler(MU, { action: 'toggle_active', payload: { profile_id: cible.id, active: false } }, bearer(jAdmin));
        const revocation = sim.rpcAppels.filter((a) => a.nom === 'revoke_user_sessions').at(-1);
        v.verifier('désactivation = ban + profil inactif + revoke_user_sessions',
          r.statut === 200 && sim.auth.get(cible.id)!.banned && sim.profilDe(cible.id).active === false && revocation?.args.p_user_id === cible.id && sim.auth.get(cible.id)!.sessions.size === 0, { r, revocation });
        sim.profilDe(cible.id).active = true; // même avec un profil encore actif, Auth refuse le jeton
        r = await appeler(MU, { action: 'create', payload: {} }, bearer(jCible));
        v.verifier('jeton antérieur au bannissement → 401', r.statut === 401, r);
        sim.profilDe(cible.id).active = false;
        r = await appeler(MU, { action: 'toggle_active', payload: { profile_id: cible.id, active: true } }, bearer(jAdmin));
        v.verifier('réactivation = levée du ban + profil actif', r.statut === 200 && !sim.auth.get(cible.id)!.banned && sim.profilDe(cible.id).active === true, r);

        const ecritures = sim.requetes.filter((q) => q.chemin.startsWith('/rest/v1/') || q.chemin.startsWith('/auth/v1/admin/'));
        v.verifier('PostgREST et API admin appelés avec la clé secrète uniquement', ecritures.every((q) => q.apikey === SECRETE), ecritures.filter((q) => q.apikey !== SECRETE));
        v.bilan();
      });

      await t.step('manage-user : change_own_password', async () => {
        const v = verificateur();
        const changement = (jeton: string, payload: Record<string, unknown>) =>
          appeler(MU, { action: 'change_own_password', payload }, bearer(jeton));
        const dernierPut = () => sim.requetes.filter((q) => q.chemin === '/auth/v1/user' && q.methode === 'PUT').at(-1);

        // Réglage « mot de passe actuel exigé » désactivé (défaut).
        const nouvel = sim.ajouter('MU-NOUVEL', 'technicien', { mcp: true, password: 'temporaire-connu' });
        const jNouvel = sim.ouvrirSession(nouvel.id);
        const jNouvelAutre = sim.ouvrirSession(nouvel.id);
        let r = await appeler(MU, { action: 'create', payload: {} }, bearer(jNouvel));
        v.verifier('compte à mot de passe imposé → autres actions refusées (403)', r.statut === 403, r);
        r = await changement(jNouvel, { new_password: 'temporaire-connu' });
        v.verifier('même mot de passe → 400 same_password, drapeau inchangé', r.statut === 400 && r.json.code === 'same_password' && sim.profilDe(nouvel.id).must_change_password === true, r);
        r = await changement(jNouvel, { new_password: 'court' });
        v.verifier('< 12 caractères → 400', r.statut === 400, r);
        r = await changement(jNouvel, { new_password: 'mon-propre-secret' });
        const put = dernierPut();
        v.verifier('OK → { success: true }, drapeau false', r.statut === 200 && r.json.success === true && sim.profilDe(nouvel.id).must_change_password === false && sim.auth.get(nouvel.id)!.password === 'mon-propre-secret', r);
        v.verifier('via l\'API utilisateur (clé publiable + jeton du demandeur), sans current_password si absent',
          put?.apikey === PUBLIABLE && put?.bearer === jNouvel && put?.corps !== null && !('current_password' in put.corps), put);
        r = await changement(jNouvel, { new_password: 'encore-un-autre' });
        v.verifier('session courante conservée ; drapeau false → 409', r.statut === 409, r);
        r = await changement(jNouvelAutre, { new_password: 'encore-un-autre' });
        v.verifier('les AUTRES sessions sont révoquées → 401', r.statut === 401, r);
        const inactif = sim.ajouter('MU-MCP-OFF', 'technicien', { mcp: true, active: false });
        r = await changement(sim.ouvrirSession(inactif.id), { new_password: 'mon-nouveau-secret' });
        v.verifier('refusé à un compte inactif → 403', r.statut === 403, r);

        // Réglage « Require current password when changing password » activé.
        sim.reglages.exigerMotDePasseActuel = true;
        try {
          const autre = sim.ajouter('MU-CPW', 'technicien', { mcp: true, password: 'temporaire-connu' });
          const jAutre = sim.ouvrirSession(autre.id);
          r = await changement(jAutre, { new_password: 'mon-propre-secret' });
          v.verifier('sans mot de passe actuel → 400 current_password_required', r.statut === 400 && r.json.code === 'current_password_required' && sim.profilDe(autre.id).must_change_password === true, r);
          r = await changement(jAutre, { new_password: 'mon-propre-secret', current_password: 'pas-le-bon-mdp' });
          v.verifier('mot de passe actuel faux → 400 current_password_invalid', r.statut === 400 && r.json.code === 'current_password_invalid' && sim.auth.get(autre.id)!.password === 'temporaire-connu', r);
          r = await changement(jAutre, { new_password: 'mon-propre-secret', current_password: 'temporaire-connu' });
          v.verifier('mot de passe actuel juste → succès', r.statut === 200 && r.json.success === true && sim.profilDe(autre.id).must_change_password === false, r);
          v.verifier('current_password transmis tel quel à Auth', dernierPut()?.corps?.current_password === 'temporaire-connu');
        } finally {
          sim.reglages.exigerMotDePasseActuel = false;
        }

        // Remise à false du drapeau en échec APRÈS le changement du mot de passe.
        const unEchec = sim.ajouter('MU-FLAG-1', 'technicien', { mcp: true, password: 'temporaire-connu' });
        sim.pannes.ecrituresProfils = 1;
        r = await changement(sim.ouvrirSession(unEchec.id), { new_password: 'mon-propre-secret' });
        v.verifier('un échec d\'écriture → seconde tentative réussie', r.statut === 200 && sim.profilDe(unEchec.id).must_change_password === false, r);
        const deuxEchecs = sim.ajouter('MU-FLAG-2', 'technicien', { mcp: true, password: 'temporaire-connu' });
        sim.pannes.ecrituresProfils = 2;
        r = await changement(sim.ouvrirSession(deuxEchecs.id), { new_password: 'mon-propre-secret' });
        sim.pannes.ecrituresProfils = 0;
        v.verifier('deux échecs → 500 flag_pending explicite (mot de passe déjà changé)',
          r.statut === 500 && r.json.code === 'flag_pending' && String(r.json.error).includes('Mot de passe changé') && sim.auth.get(deuxEchecs.id)!.password === 'mon-propre-secret', r);
        v.verifier('flag_pending : identifiant journalisé pour correction', MU.journal.join('').includes(deuxEchecs.id));
        v.verifier('aucun mot de passe dans le journal', !MU.journal.join('').includes('mon-propre-secret') && !MU.journal.join('').includes('temporaire-connu'));
        v.bilan();
      });

      await t.step('test-notification', async () => {
        const v = verificateur();
        sim.tables.notification_config.push({
          id: 1, enabled: true, enabled_nc: true, enabled_lost: true, enabled_alarm: true, provider: 'resend',
          smtp_host: null, smtp_port: null, smtp_user: null, smtp_from: null, batch_hour: 7, fallback_email: 'repli@exemple.test',
        });
        const admin = sim.ajouter('TN-ADM', 'admin');
        const jAdmin = sim.ouvrirSession(admin.id);
        const adminOff = sim.ajouter('TN-ADM-OFF', 'admin', { active: false });
        const sup = sim.ajouter('TN-SUPG', 'superviseur_grappe');
        let r = await appeler(TN, { email: 'a@exemple.test' }, bearer(sim.ouvrirSession(sup.id)));
        v.verifier('non-admin → 403', r.statut === 403, r);
        r = await appeler(TN, { email: 'a@exemple.test' }, bearer(sim.ouvrirSession(adminOff.id)));
        v.verifier('admin inactif → 403', r.statut === 403, r);
        r = await appeler(TN, { email: 'pas une adresse' }, bearer(jAdmin));
        v.verifier('adresse invalide → 400', r.statut === 400, r);
        r = await appeler(TN, { email: 'a@exemple.test' }, bearer(jAdmin));
        v.verifier('secret absent du Vault → 500 explicite', r.statut === 500 && String(r.json.error).includes('RESEND_API_KEY non configurée'), r);
        sim.vault.set('RESEND_API_KEY', 're_FACTICE_test');
        r = await appeler(TN, { email: 'a@exemple.test' }, bearer(jAdmin));
        v.verifier('envoi via Resend avec la clé du Vault', r.statut === 200 && sim.resendRecus.at(-1)?.auth === 'Bearer re_FACTICE_test', { r, dernier: sim.resendRecus.at(-1) });
        v.verifier('journalisé dans notification_log', sim.tables.notification_log.some((l) => l.type === 'test' && l.status === 'sent'));
        sim.pannes.getAppSecret = true;
        r = await appeler(TN, { email: 'a@exemple.test' }, bearer(jAdmin));
        sim.pannes.getAppSecret = false;
        v.verifier('Vault illisible → message générique (pas de repli env)', r.statut === 500 && String(r.json.error).includes('Vault') && !String(r.json.error).includes('panne simulée'), r);
        v.bilan();
      });

      await t.step('send-notifications', async () => {
        const v = verificateur();
        const lecturesVault = () => sim.rpcAppels.filter((a) => a.nom === 'get_app_secret').length;
        let n0 = lecturesVault();
        let r = await appeler(SN, {});
        v.verifier('sans en-tête → 403 sans lecture du Vault', r.statut === 403 && lecturesVault() === n0, r);
        for (const entete of ['abc', 'A'.repeat(64), 'a'.repeat(600)]) {
          r = await appeler(SN, {}, { 'x-trigger-secret': entete });
          v.verifier(`en-tête mal formé (${entete.length} car.) → 403 sans lecture du Vault`, r.statut === 403 && lecturesVault() === n0, r);
        }
        r = await appeler(SN, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        v.verifier('secret absent du Vault → 503 (fail-closed)', r.statut === 503 && lecturesVault() === n0 + 1, r);
        sim.vault.set('NOTIFY_TRIGGER_SECRET', SECRET_DECLENCHEUR);
        r = await appeler(SN, {}, { 'x-trigger-secret': 'e'.repeat(64) });
        v.verifier('mauvais secret → 403', r.statut === 403, r);
        sim.pannes.getAppSecret = true;
        r = await appeler(SN, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        sim.pannes.getAppSecret = false;
        v.verifier('Vault illisible → 503', r.statut === 503, r);
        r = await appeler(SN, null, { 'x-trigger-secret': SECRET_DECLENCHEUR }, 'GET');
        v.verifier('GET → 405', r.statut === 405, r);

        sim.tables.notification_emails.push(
          { labo_id: LABO_A, dept_id: null, email: 'chef-a@exemple.test', active: true },
          { labo_id: LABO_B, dept_id: null, email: 'chef-b@exemple.test', active: true },
        );
        sim.tables.notification_queue.push({
          id: crypto.randomUUID(), type: 'nc', envoi_id: null, envoi_hg_id: null, exp_labo_id: LABO_A, dest_labo_id: LABO_B,
          envoi_numero: 'E-1', departements: [], details: {}, created_at: new Date().toISOString(), sent_at: null,
        });
        sim.pannes.resend = true;
        r = await appeler(SN, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        sim.pannes.resend = false;
        v.verifier('tous les envois en échec → 502', r.statut === 502 && r.json.errors === 2 && r.json.sent === 0, r);
        n0 = sim.rpcAppels.filter((a) => a.nom === 'get_app_secret' && a.args.p_name === 'RESEND_API_KEY').length;
        r = await appeler(SN, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        const lecturesResend = sim.rpcAppels.filter((a) => a.nom === 'get_app_secret' && a.args.p_name === 'RESEND_API_KEY').length - n0;
        v.verifier('secret correct → 200, 2 destinataires', r.statut === 200 && r.json.sent === 1 && r.json.recipients === 2, r);
        v.verifier('RESEND_API_KEY lue une seule fois pour 2 destinataires', lecturesResend === 1, lecturesResend);
        v.verifier('file marquée envoyée', sim.tables.notification_queue.every((q) => q.sent_at));
        sim.tables.notification_config[0].enabled = false;
        r = await appeler(SN, {}, { 'x-trigger-secret': SECRET_DECLENCHEUR });
        v.verifier('désactivé → skipped', r.statut === 200 && r.json.skipped === 'disabled', r);
        v.verifier('aucune valeur de secret dans le journal', !SN.journal.join('').includes(SECRET_DECLENCHEUR) && !SN.journal.join('').includes('re_FACTICE'));
        v.bilan();
      });
    } finally {
      for (const f of fonctions) {
        try {
          f.processus.kill();
        } catch (_) { /* déjà arrêté */ }
      }
      await Promise.allSettled(fonctions.map((f) => f.processus.status));
      await Promise.allSettled(fonctions.map((f) => f.lecture));
      await serveur.shutdown();
    }
  },
});
