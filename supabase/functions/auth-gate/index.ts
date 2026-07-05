// Edge Function : auth-gate
// Point d'entrée du login. Vérifie le rate-limit serveur (par employee_id)
// et relaie à Supabase Auth avec validation du captcha Turnstile.
//
// Workflow :
//   1. Reçoit { employee_id, password, captcha_token }
//   2. Vérifie le rate-limit via count_recent_login_failures()
//   3. Si OK, appelle sb.auth.signInWithPassword({ email, password, captchaToken })
//      → Supabase Auth valide le captcha côté serveur si activé dans le dashboard.
//   4. Enregistre l'attempt via record_login_attempt()
//   5. Retourne la session (access_token + refresh_token) au client, ou une erreur
//
// Le client appelle ensuite sb.auth.setSession(data) pour activer la session.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS — restreint aux domaines de production ─────────────────────────────
const ALLOWED_ORIGINS = new Set([
  'https://optilab-envois.pages.dev',
  'https://tests-deploiement.optilab-envois.pages.dev',
  'https://optilab-envois.onrender.com',
  'https://dev-optilab-envois.onrender.com',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://localhost:8080',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:8080',
]);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://optilab-envois.pages.dev';
  return {
    'Access-Control-Allow-Origin':  allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary':                         'Origin',
  };
}

function json(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('Origin');

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method Not Allowed' }, 405, origin);
  }

  // ── Lecture du body ────────────────────────────────────────────────────────
  let body: { employee_id?: string; password?: string; captcha_token?: string } = {};
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'invalid_body' }, 400, origin);
  }

  const employeeId = String(body.employee_id || '').trim().toLowerCase();
  const password   = String(body.password || '');
  const captcha    = String(body.captcha_token || '');

  if (!employeeId || !password) {
    return json({ error: 'missing_credentials' }, 400, origin);
  }

  // ── Client admin pour les RPC service_role ────────────────────────────────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // ── 1. Vérifier le rate-limit ──────────────────────────────────────────────
  const { data: rl, error: rlErr } = await adminClient.rpc('count_recent_login_failures', {
    p_employee_id: employeeId,
  });

  if (rlErr) {
    console.error('[auth-gate] rate-limit check failed', rlErr);
    // En cas d'erreur, on continue (defense in depth — Supabase Auth a aussi son rate-limit)
  } else if (rl && rl.retry_after_seconds > 0) {
    return json({
      error:               'too_many_attempts',
      retry_after_seconds: rl.retry_after_seconds,
    }, 429, origin);
  }

  // ── 2. Appeler Supabase Auth (le captcha est validé par Supabase si activé) ─
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const email = `${employeeId}@optilab.internal`;
  const signInResult = await anonClient.auth.signInWithPassword({
    email,
    password,
    options: captcha ? { captchaToken: captcha } : undefined,
  });

  // ── 3. Enregistrer l'attempt ──────────────────────────────────────────────
  const success = !signInResult.error && !!signInResult.data?.session;
  await adminClient.rpc('record_login_attempt', {
    p_employee_id: employeeId,
    p_success:     success,
  });

  // ── 4. Réponse au client ──────────────────────────────────────────────────
  if (!success) {
    const msg = signInResult.error?.message || 'invalid_credentials';
    // Pour ne pas révéler si l'employee_id existe : un seul message générique.
    return json({ error: 'invalid_credentials', detail: msg }, 401, origin);
  }

  return json({
    access_token:  signInResult.data.session!.access_token,
    refresh_token: signInResult.data.session!.refresh_token,
    user:          signInResult.data.user,
  }, 200, origin);
});
