// Edge Function : set-secret
// Appelle les fonctions vault via connexion PostgreSQL directe dans une transaction,
// en injectant le claim JWT pour que auth.uid() / current_role_name() fonctionnent.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import postgres from 'https://deno.land/x/postgresjs@v3.4.4/mod.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  // ── Authentification ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Non authentifié.' }, 401);

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user }, error: userErr } = await anonClient.auth.getUser();
  if (userErr || !user) return json({ error: 'Session invalide.' }, 401);

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: profile } = await adminClient
    .from('profiles').select('role').eq('id', user.id).single();

  if (!profile || profile.role !== 'admin') {
    return json({ error: 'Accès refusé : administrateur uniquement.' }, 403);
  }

  // ── Corps ─────────────────────────────────────────────────────────────────
  let body: { action?: string; name?: string; value?: string } = {};
  try { body = await req.json(); } catch (_) { return json({ error: 'Corps invalide.' }, 400); }

  const action = body.action || '';
  const claims = JSON.stringify({ sub: user.id, role: 'authenticated' });

  // ── Connexion directe PostgreSQL ──────────────────────────────────────────
  const dbUrl = Deno.env.get('SUPABASE_DB_URL');
  if (!dbUrl) return json({ error: 'SUPABASE_DB_URL non disponible.' }, 500);

  const sql = postgres(dbUrl, { max: 1 });

  try {
    if (action === 'set') {
      if (!body.name || !body.value) return json({ error: 'Paramètres manquants.' }, 400);
      const { name, value } = body;

      // Transaction : injecter les claims JWT puis appeler la fonction vault
      const result = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
        const rows = await tx`SELECT set_app_secret(${name}, ${value}) AS r`;
        return rows[0]?.r;
      });

      return json(result ?? { ok: true });
    }

    if (action === 'list') {
      const result = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
        const rows = await tx`SELECT list_app_secrets_status() AS r`;
        return rows[0]?.r;
      });
      return json(result ?? {});
    }

    if (action === 'status') {
      if (!body.name) return json({ error: 'Paramètre name manquant.' }, 400);
      const result = await sql.begin(async (tx) => {
        await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
        const rows = await tx`SELECT get_app_secret_status(${body.name}) AS r`;
        return rows[0]?.r;
      });
      return json(result ?? {});
    }

    return json({ error: `Action inconnue : ${action}` }, 400);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: msg }, 500);
  } finally {
    await sql.end();
  }
});
