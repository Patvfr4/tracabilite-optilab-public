-- ============================================================
-- Migration 025 — Supabase Vault pour les secrets de l'application
-- ============================================================
-- Remplace le stockage en clair des secrets (resend_api_key, smtp_pass) par
-- Supabase Vault, qui chiffre les valeurs au repos via pgsodium.
--
-- Les secrets sont saisis/rotés via l'UI admin (RPC set_app_secret)
-- mais JAMAIS retournés en clair au client. Seul le service_role peut
-- déchiffrer (depuis les edge functions).
--
-- AVANT exécution : si tu as déjà des valeurs dans notification_config,
-- les noter pour les ressaisir dans l'UI après cette migration :
--   SELECT resend_api_key, smtp_pass FROM notification_config WHERE id = 1;
-- ============================================================

-- ── 1. Activer l'extension Vault ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault CASCADE;

-- ── 2. Table d'audit des changements de secrets ──────────────────────────────
CREATE TABLE IF NOT EXISTS app_secrets_audit (
  id             UUID         DEFAULT uuid_generate_v4() PRIMARY KEY,
  secret_name    TEXT         NOT NULL,
  action         TEXT         NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE')),
  changed_by_id  UUID         REFERENCES auth.users(id),
  changed_by_nom TEXT         NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_app_secrets_audit_name ON app_secrets_audit(secret_name, changed_at DESC);

ALTER TABLE app_secrets_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Lecture audit secrets (admin)" ON app_secrets_audit;
CREATE POLICY "Lecture audit secrets (admin)" ON app_secrets_audit
  FOR SELECT TO authenticated
  USING (current_role_name() = 'admin');

DROP POLICY IF EXISTS "Insertion audit secrets" ON app_secrets_audit;
CREATE POLICY "Insertion audit secrets" ON app_secrets_audit
  FOR INSERT TO authenticated
  WITH CHECK (current_role_name() = 'admin');

-- ── 3. Liste blanche des noms de secrets autorisés ───────────────────────────
-- Un attaquant ne peut pas créer un secret arbitraire pour exfiltrer des données.
CREATE OR REPLACE FUNCTION _allowed_secret_names()
RETURNS TEXT[] LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'RESEND_API_KEY',
    'SMTP_PASS',
    'TURNSTILE_SECRET_KEY'
  ];
$$;

-- ── 4. RPC : Enregistrer/roter un secret (admin only) ────────────────────────
-- Crée le secret s'il n'existe pas, sinon le met à jour.
-- Ne retourne JAMAIS la valeur — uniquement un statut.
CREATE OR REPLACE FUNCTION set_app_secret(p_name TEXT, p_value TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_existing_id UUID;
  v_action      TEXT;
  v_par_nom     TEXT;
BEGIN
  -- Auth : admin uniquement
  IF current_role_name() != 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.';
  END IF;

  -- Validation
  IF p_name IS NULL OR TRIM(p_name) = '' THEN
    RAISE EXCEPTION 'Nom de secret requis.';
  END IF;
  IF p_value IS NULL OR LENGTH(p_value) = 0 THEN
    RAISE EXCEPTION 'Valeur de secret requise.';
  END IF;
  IF NOT (p_name = ANY(_allowed_secret_names())) THEN
    RAISE EXCEPTION 'Nom de secret non autorisé : %', p_name;
  END IF;

  -- Détecter existence
  SELECT id INTO v_existing_id FROM vault.secrets WHERE name = p_name;

  IF v_existing_id IS NOT NULL THEN
    -- Rotation : UPDATE direct (le trigger Vault chiffre la nouvelle valeur)
    UPDATE vault.secrets SET secret = p_value WHERE id = v_existing_id;
    v_action := 'UPDATE';
  ELSE
    -- Création
    PERFORM vault.create_secret(p_value, p_name, '');
    v_action := 'CREATE';
  END IF;

  -- Audit
  SELECT nom INTO v_par_nom FROM profiles WHERE id = auth.uid();
  INSERT INTO app_secrets_audit (secret_name, action, changed_by_id, changed_by_nom)
  VALUES (p_name, v_action, auth.uid(), COALESCE(v_par_nom, ''));

  RETURN json_build_object('ok', true, 'name', p_name, 'action', v_action);
END;
$$;

-- ── 5. RPC : Statut d'un secret (admin only) — sans la valeur ────────────────
CREATE OR REPLACE FUNCTION get_app_secret_status(p_name TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_updated   TIMESTAMPTZ;
  v_exists    BOOLEAN;
  v_action    TEXT;
  v_par_nom   TEXT;
  v_par_at    TIMESTAMPTZ;
BEGIN
  IF current_role_name() != 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.';
  END IF;

  SELECT (id IS NOT NULL), updated_at
  INTO v_exists, v_updated
  FROM vault.secrets WHERE name = p_name;

  v_exists := COALESCE(v_exists, FALSE);

  SELECT action, changed_by_nom, changed_at
  INTO v_action, v_par_nom, v_par_at
  FROM app_secrets_audit
  WHERE secret_name = p_name
  ORDER BY changed_at DESC LIMIT 1;

  RETURN json_build_object(
    'name',              p_name,
    'configured',        v_exists,
    'updated_at',        v_updated,
    'last_action',       v_action,
    'last_changed_by',   v_par_nom,
    'last_changed_at',   v_par_at
  );
END;
$$;

-- ── 6. RPC : Statut de tous les secrets connus (admin only) ──────────────────
CREATE OR REPLACE FUNCTION list_app_secrets_status()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_result JSON;
BEGIN
  IF current_role_name() != 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.';
  END IF;

  SELECT json_object_agg(k.name, json_build_object(
    'configured',       s.id IS NOT NULL,
    'updated_at',       s.updated_at,
    'last_changed_by',  a.changed_by_nom,
    'last_changed_at',  a.changed_at,
    'last_action',      a.action
  ))
  INTO v_result
  FROM (
    SELECT unnest(_allowed_secret_names()) AS name
  ) k
  LEFT JOIN vault.secrets s ON s.name = k.name
  LEFT JOIN LATERAL (
    SELECT action, changed_by_nom, changed_at
    FROM app_secrets_audit
    WHERE secret_name = k.name
    ORDER BY changed_at DESC LIMIT 1
  ) a ON TRUE;

  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;

-- ── 7. RPC : Lecture du secret en clair — RÉSERVÉE au service_role ───────────
-- Appelée UNIQUEMENT par les edge functions (qui s'authentifient avec
-- le service_role key). Jamais exposée aux utilisateurs authentifiés.
CREATE OR REPLACE FUNCTION get_app_secret(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name;
  RETURN v_secret;
END;
$$;

-- ── 8. Droits d'exécution ────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION set_app_secret(TEXT, TEXT)         TO authenticated;
GRANT EXECUTE ON FUNCTION get_app_secret_status(TEXT)        TO authenticated;
GRANT EXECUTE ON FUNCTION list_app_secrets_status()          TO authenticated;

-- get_app_secret : RÉVOQUER aux rôles "publics" et n'autoriser que le service_role
REVOKE EXECUTE ON FUNCTION get_app_secret(TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_app_secret(TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION get_app_secret(TEXT) FROM anon;
GRANT  EXECUTE ON FUNCTION get_app_secret(TEXT) TO service_role;

-- ── 9. Nettoyage : retirer les colonnes secrètes de notification_config ──────
-- IMPORTANT : ré-saisir les valeurs dans l'UI admin APRÈS cette migration.
ALTER TABLE notification_config DROP COLUMN IF EXISTS resend_api_key;
ALTER TABLE notification_config DROP COLUMN IF EXISTS smtp_pass;
