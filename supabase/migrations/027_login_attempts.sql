-- ============================================================
-- Migration 027 — Rate-limit serveur sur la connexion
-- ============================================================
-- Le rate-limit actuel dans public/js/auth.js est uniquement côté client
-- (contournable par F5 ou onglet privé). Cette migration ajoute :
--
--   1. Table login_attempts(employee_id, attempted_at, success) qui journalise
--      les tentatives de connexion via l'edge function `auth-gate`.
--   2. RPC count_recent_login_failures() / record_login_attempt() utilisées
--      par auth-gate (service_role).
--
-- L'edge function `auth-gate` est le point d'entrée du login : elle vérifie
-- d'abord le compteur, applique le captcha Turnstile, puis relaie à Supabase
-- Auth. Si rate-limit atteint (5 échecs / 15 min par employee_id), erreur 429.
-- ============================================================

-- ── 1. Table de journalisation ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_attempts (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id   TEXT         NOT NULL,
  attempted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  success       BOOLEAN      NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_login_attempts_emp_ts
  ON login_attempts(employee_id, attempted_at DESC);

ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- Seuls les admins et superviseurs grappe peuvent lire (pour audit).
DROP POLICY IF EXISTS "Lecture login_attempts (admin/grappe)" ON login_attempts;
CREATE POLICY "Lecture login_attempts (admin/grappe)" ON login_attempts
  FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

-- Aucune écriture directe — passe par les RPC SECURITY DEFINER ci-dessous.

-- ── 2. RPC : compter les échecs récents pour un employee_id ──────────────────
-- Retourne { count, retry_after_seconds }.
-- Service_role uniquement (appelée par l'edge function auth-gate).
CREATE OR REPLACE FUNCTION count_recent_login_failures(p_employee_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_count        INTEGER;
  v_retry_after  INTEGER;
  v_window_start TIMESTAMPTZ;
  v_clean        TEXT;
BEGIN
  v_clean := LOWER(TRIM(COALESCE(p_employee_id, '')));
  IF v_clean = '' THEN
    RETURN json_build_object('count', 0, 'retry_after_seconds', 0);
  END IF;

  v_window_start := NOW() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_count
  FROM login_attempts
  WHERE LOWER(employee_id) = v_clean
    AND success = FALSE
    AND attempted_at > v_window_start;

  IF v_count < 5 THEN
    RETURN json_build_object('count', v_count, 'retry_after_seconds', 0);
  END IF;

  SELECT EXTRACT(EPOCH FROM (MIN(attempted_at) + INTERVAL '15 minutes' - NOW()))::INTEGER
    INTO v_retry_after
  FROM login_attempts
  WHERE LOWER(employee_id) = v_clean
    AND success = FALSE
    AND attempted_at > v_window_start;

  RETURN json_build_object('count', v_count, 'retry_after_seconds', GREATEST(v_retry_after, 1));
END;
$$;

-- ── 3. RPC : enregistrer une tentative (succès ou échec) ─────────────────────
CREATE OR REPLACE FUNCTION record_login_attempt(p_employee_id TEXT, p_success BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_employee_id IS NULL OR TRIM(p_employee_id) = '' THEN RETURN; END IF;
  INSERT INTO login_attempts (employee_id, success)
  VALUES (LOWER(TRIM(p_employee_id)), COALESCE(p_success, FALSE));

  -- Auto-purge opportuniste des entrées > 7 jours
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '7 days';
END;
$$;

-- ── 4. Droits — service_role uniquement ──────────────────────────────────────
REVOKE EXECUTE ON FUNCTION count_recent_login_failures(TEXT) FROM PUBLIC, authenticated, anon;
REVOKE EXECUTE ON FUNCTION record_login_attempt(TEXT, BOOLEAN) FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION count_recent_login_failures(TEXT) TO service_role;
GRANT  EXECUTE ON FUNCTION record_login_attempt(TEXT, BOOLEAN) TO service_role;
