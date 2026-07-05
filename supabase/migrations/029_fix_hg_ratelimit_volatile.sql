-- ============================================================
-- Migration 029 — Correctif : STABLE → VOLATILE sur get_envoi_hgrappe_by_numero
-- ============================================================
-- La migration 026 a créé la fonction avec STABLE, ce qui amène PostgREST
-- à l'exécuter dans une transaction read-only. Les INSERT dans
-- hg_confirm_attempts échouaient silencieusement (erreur 400), rendant le
-- rate-limit inopérant. VOLATILE est correct puisque la fonction modifie la BD.
-- ============================================================

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
