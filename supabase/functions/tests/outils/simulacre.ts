// Simulacre en mémoire de Supabase (GoTrue + PostgREST) et de Resend, pour les
// tests des fonctions Edge. Deux usages :
//   · tests unitaires : globalThis.fetch remplacé par simulacre.gerer (aucun
//     accès réseau, aucune permission requise) ;
//   · test d'intégration : servi sur 127.0.0.1 pendant que chaque index.ts réel
//     tourne dans un sous-processus.
// Les comportements de GoTrue reproduits ici viennent de son code source
// (supabase/auth : internal/api/user.go, admin.go, token.go, logout.go) ; ils
// sont signalés au cas par cas. Valeurs FACTICES uniquement.

export const SECRETE = 'sb_secret_FACTICE_test_local';
export const PUBLIABLE = 'sb_publishable_FACTICE_test_local';
/** Jeton captcha que le simulacre refuse comme le ferait Auth (captcha_failed). */
export const CAPTCHA_REFUSE = 'captcha-refuse';

export const LABO_A = '11111111-1111-4111-8111-111111111111';
export const LABO_B = '22222222-2222-4222-8222-222222222222';

export type Ligne = Record<string, unknown>;

export interface CompteAuth {
  id: string;
  email: string;
  password: string;
  banned: boolean;
  sessions: Set<string>;
}

export interface OptionsCompte {
  active?: boolean;
  mcp?: boolean;
  labo?: string;
  profil?: boolean;
  password?: string;
}

function reponse(corps: unknown, statut = 200): Response {
  return new Response(corps === null ? null : JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Format d'erreur de GoTrue (version d'API antérieure à 2024-01-01).
const erreurAuth = (statut: number, code: string, msg: string) =>
  reponse({ code: statut, error_code: code, msg }, statut);

function filtrer(lignes: Ligne[], params: URLSearchParams): Ligne[] {
  let res = lignes;
  for (const [col, expr] of params) {
    if (['select', 'order', 'limit', 'columns', 'on_conflict'].includes(col)) continue;
    if (expr.startsWith('eq.')) res = res.filter((r) => String(r[col]) === expr.slice(3));
    else if (expr === 'is.null') res = res.filter((r) => r[col] === null || r[col] === undefined);
    else if (expr === 'not.is.null') res = res.filter((r) => r[col] !== null && r[col] !== undefined);
    else if (expr.startsWith('in.(')) {
      const valeurs = expr.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
      res = res.filter((r) => valeurs.includes(String(r[col])));
    } else if (expr.startsWith('lt.')) res = res.filter((r) => r[col] !== null && String(r[col]) < expr.slice(3));
  }
  return res;
}

// Politique de mot de passe du simulacre : 12 caractères, et tout mot de passe
// contenant « faible » est refusé (pour provoquer weak_password à la demande).
const motDePasseFaible = (p: string) => p.length < 12 || p.includes('faible');

export type Simulacre = ReturnType<typeof creerSimulacre>;

export function creerSimulacre() {
  const auth = new Map<string, CompteAuth>();
  const jetons = new Map<string, { userId: string; sessionId: string }>();
  const tables: Record<string, Ligne[]> = {
    profiles: [], notification_config: [], notification_queue: [], notification_emails: [],
    laboratories: [], notification_log: [],
  };
  const vault = new Map<string, string>();
  const rpcAppels: { nom: string; args: Ligne; apikey: string | null }[] = [];
  const requetes: { methode: string; chemin: string; apikey: string | null; bearer: string | null; corps: Ligne | null }[] = [];
  const resendRecus: { auth: string | null; to: string[] }[] = [];
  const logouts: { scope: string; bearer: string | null }[] = [];
  const pannes = {
    getAppSecret: false,
    resend: false,
    insertProfil: false,
    /** Toute lecture de profiles échoue (PostgREST indisponible). */
    lectureProfils: false,
    /** Nombre de prochaines écritures (PATCH) de profiles à faire échouer. */
    ecrituresProfils: 0,
    /** GET /auth/v1/user répond 500. */
    authIndisponible: false,
  };
  const reglages = {
    /** « Require current password when changing password » (API utilisateur). */
    exigerMotDePasseActuel: false,
  };

  function ouvrirSession(userId: string): string {
    const sessionId = crypto.randomUUID();
    auth.get(userId)!.sessions.add(sessionId);
    const jeton = 'jeton_factice_' + crypto.randomUUID();
    jetons.set(jeton, { userId, sessionId });
    return jeton;
  }

  function userJson(u: CompteAuth) {
    return {
      id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, app_metadata: {}, user_metadata: {},
      created_at: new Date().toISOString(), banned_until: u.banned ? '2126-01-01T00:00:00Z' : null,
    };
  }

  // requireAuthentication de GoTrue : jeton inconnu, compte banni (même pour un
  // jeton émis avant le bannissement) ou session révoquée → refus.
  function utilisateurDuJeton(bearer: string | null): { u: CompteAuth; sessionId: string } | Response {
    const t = bearer ? jetons.get(bearer) : undefined;
    if (!t) return erreurAuth(401, 'bad_jwt', 'invalid JWT');
    const u = auth.get(t.userId);
    if (!u) return erreurAuth(403, 'user_not_found', 'User from sub claim in JWT does not exist');
    if (u.banned) return erreurAuth(403, 'user_banned', 'User is banned');
    if (!u.sessions.has(t.sessionId)) return erreurAuth(403, 'session_not_found', 'Session not found');
    return { u, sessionId: t.sessionId };
  }

  function ajouter(employee: string, role: string, opts: OptionsCompte = {}): CompteAuth {
    const u: CompteAuth = {
      id: crypto.randomUUID(), email: `${employee.toLowerCase()}@optilab.internal`,
      password: opts.password ?? 'mot-de-passe-initial', banned: false, sessions: new Set(),
    };
    auth.set(u.id, u);
    if (opts.profil !== false) {
      tables.profiles.push({
        id: u.id, employee_id: employee, nom: employee, role, labo_id: opts.labo ?? LABO_A,
        labo_ids: [opts.labo ?? LABO_A], active: opts.active ?? true, must_change_password: opts.mcp ?? false,
      });
    }
    return u;
  }

  const profilDe = (id: string) => tables.profiles.find((p) => p.id === id)!;

  async function gerer(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const apikey = req.headers.get('apikey');
    const authz = req.headers.get('Authorization');
    const bearer = authz?.startsWith('Bearer ') ? authz.slice(7) : null;
    const texte = req.method === 'GET' || req.method === 'HEAD' ? '' : await req.text();
    // deno-lint-ignore no-explicit-any -- corps JSON libre, lu champ par champ.
    const corps: any = texte ? JSON.parse(texte) : null;
    requetes.push({ methode: req.method, chemin: url.pathname, apikey, bearer, corps });

    if (url.hostname === 'api.resend.com' || url.pathname.startsWith('/resend/')) {
      resendRecus.push({ auth: authz, to: corps?.to ?? [] });
      if (pannes.resend) return reponse({ name: 'application_error', message: 'panne simulée' }, 500);
      if (authz !== `Bearer ${vault.get('RESEND_API_KEY')}`) return reponse({ message: 'API key is invalid' }, 401);
      return reponse({ id: crypto.randomUUID() });
    }

    // Passerelle : seule une clé connue est admise.
    if (apikey !== SECRETE && apikey !== PUBLIABLE) return reponse({ message: 'Invalid API key' }, 401);
    const admin = apikey === SECRETE;

    // ── GoTrue ──
    if (url.pathname === '/auth/v1/token') {
      // token.go : le captcha est vérifié AVANT les identifiants.
      if (corps?.gotrue_meta_security?.captcha_token === CAPTCHA_REFUSE) {
        return erreurAuth(400, 'captcha_failed', 'captcha protection: request disallowed (timeout-or-duplicate)');
      }
      const u = [...auth.values()].find((x) => x.email === corps?.email);
      if (!u || u.password !== corps?.password) return erreurAuth(400, 'invalid_credentials', 'Invalid login credentials');
      if (u.banned) return erreurAuth(400, 'user_banned', 'User is banned');
      const jeton = ouvrirSession(u.id);
      return reponse({
        access_token: jeton, token_type: 'bearer', expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600, refresh_token: 'r_' + jeton, user: userJson(u),
      });
    }
    if (url.pathname === '/auth/v1/user') {
      if (pannes.authIndisponible) return erreurAuth(500, 'unexpected_failure', 'panne simulée');
      const r = utilisateurDuJeton(bearer);
      if (r instanceof Response) return r;
      if (req.method === 'GET') return reponse(userJson(r.u));
      if (req.method === 'PUT') {
        // user.go, dans cet ordre : mot de passe actuel (si le réglage est
        // activé), puis mot de passe identique, puis enregistrement.
        const p = String(corps?.password ?? '');
        if (reglages.exigerMotDePasseActuel) {
          const actuel = corps?.current_password;
          if (typeof actuel !== 'string' || actuel === '') {
            return erreurAuth(400, 'current_password_required', 'Current password required when setting new password.');
          }
          if (actuel !== r.u.password) {
            return erreurAuth(400, 'current_password_invalid', 'Current password required when setting new password.');
          }
        }
        if (p === r.u.password) return erreurAuth(422, 'same_password', 'New password should be different from the old password.');
        if (motDePasseFaible(p)) return erreurAuth(422, 'weak_password', 'Password is too weak');
        r.u.password = p;
        // models/user.go : UpdatePassword(tx, &sessionId) → LogoutAllExceptMe.
        for (const s of [...r.u.sessions]) if (s !== r.sessionId) r.u.sessions.delete(s);
        return reponse(userJson(r.u));
      }
    }
    if (url.pathname === '/auth/v1/logout') {
      const scope = url.searchParams.get('scope') ?? 'global';
      logouts.push({ scope, bearer });
      const t = bearer ? jetons.get(bearer) : undefined;
      const u = t ? auth.get(t.userId) : undefined;
      if (t && u) {
        if (scope === 'global') u.sessions.clear();
        else if (scope === 'local') u.sessions.delete(t.sessionId);
      }
      return new Response(null, { status: 204 });
    }
    if (url.pathname.startsWith('/auth/v1/admin/users')) {
      if (!admin || bearer !== SECRETE) return erreurAuth(403, 'not_admin', 'User not allowed');
      const id = url.pathname.split('/')[5];
      if (req.method === 'POST') {
        // admin.go : adresse refusée par la validation d'Auth.
        if (String(corps?.email).startsWith('refus-auth')) {
          return erreurAuth(400, 'validation_failed', 'Unable to validate email address: invalid format');
        }
        if ([...auth.values()].some((x) => x.email === corps?.email)) {
          return erreurAuth(422, 'email_exists', 'A user with this email address has already been registered');
        }
        if (motDePasseFaible(corps?.password ?? '')) return erreurAuth(422, 'weak_password', 'Password is too weak');
        const u: CompteAuth = { id: crypto.randomUUID(), email: corps.email, password: corps.password, banned: false, sessions: new Set() };
        auth.set(u.id, u);
        return reponse(userJson(u));
      }
      const u = auth.get(id);
      if (!u) return erreurAuth(404, 'user_not_found', 'User not found');
      if (req.method === 'PUT') {
        if (corps?.password !== undefined) {
          if (motDePasseFaible(corps.password)) return erreurAuth(422, 'weak_password', 'Password is too weak');
          u.password = corps.password;
          u.sessions.clear(); // admin.go : UpdatePassword(tx, nil) → toutes les sessions.
        }
        if (corps?.ban_duration !== undefined) u.banned = corps.ban_duration !== 'none';
        return reponse(userJson(u));
      }
      if (req.method === 'DELETE') {
        auth.delete(id);
        return reponse(userJson(u));
      }
    }

    // ── PostgREST ──
    if (url.pathname.startsWith('/rest/v1/rpc/')) {
      const nom = url.pathname.split('/')[4];
      rpcAppels.push({ nom, args: corps ?? {}, apikey });
      if (!admin) return reponse({ code: '42501', message: 'permission denied for function ' + nom }, 403);
      switch (nom) {
        case 'get_app_secret':
          if (pannes.getAppSecret) return reponse({ code: 'XX000', message: 'panne simulée du Vault' }, 500);
          return reponse(vault.get(String(corps?.p_name)) ?? null);
        case 'revoke_user_sessions':
          auth.get(String(corps?.p_user_id))?.sessions.clear();
          return new Response(null, { status: 204 });
        case 'count_recent_login_failures':
          return reponse({ count: 0 });
        case 'record_login_attempt':
          return new Response(null, { status: 204 });
      }
      return reponse({ code: 'PGRST202', message: 'fonction inconnue' }, 404);
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      if (!admin) return reponse({ code: '42501', message: 'clé publiable : accès refusé (test)' }, 403);
      const table = url.pathname.split('/')[3];
      const lignes = tables[table];
      if (!lignes) return reponse({ code: '42P01', message: 'table inconnue' }, 404);
      const cibles = filtrer(lignes, url.searchParams);
      if (req.method === 'GET') {
        if (table === 'profiles' && pannes.lectureProfils) {
          return reponse({ code: 'XX000', message: 'panne simulée de lecture' }, 500);
        }
        if ((req.headers.get('Accept') ?? '').includes('vnd.pgrst.object')) {
          return cibles.length === 1 ? reponse(cibles[0]) : reponse({ code: 'PGRST116', message: 'not 1 row' }, 406);
        }
        return reponse(cibles);
      }
      if (req.method === 'POST') {
        for (const r of Array.isArray(corps) ? corps : [corps]) {
          if (table === 'profiles') {
            if (pannes.insertProfil) return reponse({ code: 'XX000', message: 'DETAIL INTERNE A NE PAS DIVULGUER' }, 500);
            if (lignes.some((x) => x.employee_id === r.employee_id)) return reponse({ code: '23505', message: 'duplicate key' }, 409);
          }
          lignes.push({ ...r });
        }
        return new Response(null, { status: 201 });
      }
      if (req.method === 'PATCH') {
        if (table === 'profiles' && pannes.ecrituresProfils > 0) {
          pannes.ecrituresProfils--;
          return reponse({ code: 'XX000', message: 'panne simulée d\'écriture' }, 500);
        }
        for (const r of cibles) Object.assign(r, corps);
        return new Response(null, { status: 204 });
      }
      if (req.method === 'DELETE') {
        tables[table] = lignes.filter((r) => !cibles.includes(r));
        return new Response(null, { status: 204 });
      }
    }
    return reponse({ message: 'route inconnue du simulacre' }, 404);
  }

  return {
    auth, jetons, tables, vault, rpcAppels, requetes, resendRecus, logouts, pannes, reglages,
    gerer, ouvrirSession, ajouter, profilDe,
  };
}
