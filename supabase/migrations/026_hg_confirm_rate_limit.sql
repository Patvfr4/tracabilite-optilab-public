-- ============================================================
-- Migration 026 — Rate-limit anti brute-force sur la confirmation HG
-- ============================================================
-- La fonction get_envoi_hgrappe_by_numero(numero, code) est exposée à `anon`
-- avec un code de vérification de 6 caractères hex (~16,7 M valeurs).
-- Sans protection, un attaquant peut brute-forcer un envoi HG d'une journée
-- en quelques heures et accéder à ses métadonnées (expéditeur, destinataire,
-- spécimens, etc.).
--
-- Cette migration ajoute :
--   1. Une table hg_confirm_attempts qui journalise les échecs par numéro
--   2. Une garde dans get_envoi_hgrappe_by_numero : >= 5 échecs en 15 min
--      sur le même numéro → erreur 'too_many_attempts'
--   3. Une auto-purge des entrées > 24 h à chaque appel
--
-- Le path get_envoi_hgrappe_by_token(uuid) n'est PAS rate-limité car le UUID
-- complet (128 bits) est non-énumérable.
-- ============================================================

-- ── 1. Table de journalisation des tentatives échouées ───────────────────────
CREATE TABLE IF NOT EXISTS hg_confirm_attempts (
  id            UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  numero        TEXT         NOT NULL,
  attempted_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reason        TEXT         NOT NULL CHECK (reason IN ('wrong_code','not_found'))
);

CREATE INDEX IF NOT EXISTS idx_hg_confirm_attempts_numero_ts
  ON hg_confirm_attempts(numero, attempted_at DESC);

-- RLS : aucune lecture/écriture directe pour les utilisateurs.
-- Seules les fonctions SECURITY DEFINER y accèdent.
ALTER TABLE hg_confirm_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture attempts (admin)" ON hg_confirm_attempts;
CREATE POLICY "Lecture attempts (admin)" ON hg_confirm_attempts
  FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

-- Aucune politique INSERT/UPDATE/DELETE pour anon ni authenticated.
-- Les INSERT passent uniquement par la fonction get_envoi_hgrappe_by_numero
-- qui est SECURITY DEFINER et contourne donc la RLS.

-- ── 2. Wrapper de la fonction avec rate-limit ────────────────────────────────
-- On REMPLACE la fonction existante. La signature et les codes d'erreur
-- restent compatibles ; on ajoute uniquement le cas 'too_many_attempts'.
CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
VOLATILE
AS $$
DECLARE
  v_e                envois_hgrappe%ROWTYPE;
  v_exp_name         TEXT;
  v_dest_name        TEXT;
  v_dest_parent_name TEXT;
  v_expected         TEXT;
  v_numero_clean     TEXT;
  v_fail_count       INTEGER;
  v_retry_after      INTEGER;
  v_window_start     TIMESTAMPTZ;
BEGIN
  v_numero_clean := UPPER(TRIM(COALESCE(p_numero, '')));
  IF v_numero_clean = '' THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  -- ── Rate-limit : 5 échecs / 15 min par numéro ──────────────────────────────
  v_window_start := NOW() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_fail_count
  FROM hg_confirm_attempts
  WHERE numero = v_numero_clean
    AND attempted_at > v_window_start;

  IF v_fail_count >= 5 THEN
    -- Combien de secondes avant le premier essai sortant de la fenêtre ?
    SELECT EXTRACT(EPOCH FROM (
      MIN(attempted_at) + INTERVAL '15 minutes' - NOW()
    ))::INTEGER
    INTO v_retry_after
    FROM hg_confirm_attempts
    WHERE numero = v_numero_clean
      AND attempted_at > v_window_start;

    RETURN json_build_object(
      'error',               'too_many_attempts',
      'retry_after_seconds', GREATEST(v_retry_after, 1)
    );
  END IF;

  -- ── Logique de lookup ──────────────────────────────────────────────────────
  SELECT * INTO v_e FROM envois_hgrappe WHERE numero = v_numero_clean;
  IF NOT FOUND THEN
    INSERT INTO hg_confirm_attempts (numero, reason) VALUES (v_numero_clean, 'not_found');
    RETURN json_build_object('error', 'not_found');
  END IF;

  v_expected := upper(substr(replace(v_e.confirm_token::text, '-', ''), 1, 6));
  IF upper(trim(COALESCE(p_verify_code, ''))) != v_expected THEN
    INSERT INTO hg_confirm_attempts (numero, reason) VALUES (v_numero_clean, 'wrong_code');
    RETURN json_build_object('error', 'wrong_code');
  END IF;

  -- ── Succès — Auto-purge opportuniste des entrées > 24 h ────────────────────
  DELETE FROM hg_confirm_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';

  -- ── Réponse normale ────────────────────────────────────────────────────────
  SELECT name INTO v_exp_name FROM laboratories WHERE id = v_e.exp_labo_id;
  SELECT el.name, el2.name INTO v_dest_name, v_dest_parent_name
    FROM external_labs el LEFT JOIN external_labs el2 ON el2.id = el.parent_id
    WHERE el.id = v_e.dest_ext_lab_id;

  RETURN json_build_object(
    'numero',              v_e.numero,
    'token',               v_e.confirm_token,
    'exp',                 v_exp_name,
    'dest',                v_dest_name,
    'dest_parent',         v_dest_parent_name,
    'temperature',         v_e.temperature,
    'transporteur',        v_e.transporteur,
    'nb_echantillons',     v_e.nb_echantillons,
    'ts_envoi',            v_e.ts_envoi,
    'statut',              v_e.statut,
    'already_confirmed',   v_e.ts_confirm IS NOT NULL,
    'confirm_conforme',    v_e.confirm_conforme,
    'confirm_nc_types',    v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire,
    'ts_confirm',          v_e.ts_confirm,
    'confirm_recu_par',    v_e.confirm_recu_par,
    'confirm_method',      v_e.confirm_method
  );
END;
$$;

-- Le GRANT existant TO anon, authenticated reste valable (signature identique).
