-- ============================================================
-- Shim de compatibilité plateforme Supabase — pour Postgres vierge
--
-- schema.sql déclare en en-tête ses prérequis « fournis par Supabase » :
-- schémas auth / vault, rôles anon / authenticated / service_role. Sur un
-- Postgres standard, ces objets n'existent pas et le schéma ne se charge pas.
-- Ce fichier fournit le minimum structurel pour que schema.sql s'applique
-- intégralement, fonctions, policies et ACL comprises, ET il reproduit les
-- comportements de la plateforme dont dépend la sécurité du schéma, pour que
-- la CI échoue là où Supabase échouerait :
--   · privilèges par défaut des anciens projets Supabase : tout objet créé
--     par postgres dans public est accordé d'office à anon, authenticated et
--     service_role. schema.sql doit les neutraliser lui-même ;
--   · Vault : écriture seulement par vault.create_secret / vault.update_secret
--     (depuis supabase_vault 0.3, postgres n'a pas INSERT ni UPDATE sur
--     vault.secrets ; DELETE reste permis). Un UPDATE direct échoue ici aussi.
--     Droits de service_role sur le Vault : ceux, larges, que l'extension lui
--     accorde sur Supabase (voir la section « Schéma vault »).
--
-- Deux usages :
--   1. CI — test de restauration sur base vierge (workflow « CI », job
--      « restauration-schema ») : shim, puis schema.sql, puis
--      verif_restauration.sql (invariants et tests fonctionnels).
--   2. Bootstrap d'un Postgres auto-hébergé, comme point de départ.
--
-- ⚠ Ce n'est PAS un substitut fonctionnel à Supabase :
--   · vault.secrets stocke EN CLAIR — aucun chiffrement. Ne jamais utiliser
--     ce shim sur une base contenant de vrais secrets.
--   · auth.uid() lit le claim JWT posé sur la session ; il n'y a ni GoTrue,
--     ni validation de jeton. Les tables auth.* n'ont que les colonnes lues ou
--     écrites par ce dépôt (schéma, seeds).
-- Pour un hébergement réel, utiliser la stack Supabase auto-hébergée
-- (supabase/docker), qui fournit les vrais GoTrue, PostgREST et Vault.
--
-- À exécuter en tant que postgres (superutilisateur en CI).
-- ============================================================

SET client_min_messages = warning;

-- ── Rôles PostgREST / Supabase (idempotent) ─────────────────────────────────
-- service_role contourne la RLS, comme sur Supabase.
DO $$
DECLARE
  r TEXT;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT', r);
    END IF;
  END LOOP;
  ALTER ROLE service_role BYPASSRLS;
END $$;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── Privilèges par défaut des projets Supabase existants ────────────────────
-- Doc Supabase « Securing your API › Default privileges » : sur les projets
-- existants, toute table, séquence et fonction créée par postgres dans public
-- est accordée à anon, authenticated et service_role. Reproduit AVANT le
-- chargement de schema.sql : un schéma qui ne révoque pas ces octrois exposerait
-- tout à anon, et les invariants de verif_restauration.sql le détecteraient.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;

-- ── Schéma auth ─────────────────────────────────────────────────────────────
-- Trois clés étrangères de schema.sql pointent sur auth.users(id) (profiles,
-- envois_audit, app_secrets_audit) ; les fonctions et policies appellent
-- auth.uid() ; revoke_user_sessions supprime dans auth.sessions. Les colonnes
-- supplémentaires d'auth.users et auth.identities sont celles qu'écrit
-- supabase/seed_demo_users.sql.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id    uuid PRIMARY KEY,
  email text
);
ALTER TABLE auth.users
  ADD COLUMN IF NOT EXISTS instance_id            uuid,
  ADD COLUMN IF NOT EXISTS aud                    text,
  ADD COLUMN IF NOT EXISTS role                   text,
  ADD COLUMN IF NOT EXISTS encrypted_password     text,
  ADD COLUMN IF NOT EXISTS email_confirmed_at     timestamptz,
  ADD COLUMN IF NOT EXISTS raw_app_meta_data      jsonb,
  ADD COLUMN IF NOT EXISTS raw_user_meta_data     jsonb,
  ADD COLUMN IF NOT EXISTS is_super_admin         boolean,
  ADD COLUMN IF NOT EXISTS created_at             timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz,
  ADD COLUMN IF NOT EXISTS confirmation_token     text,
  ADD COLUMN IF NOT EXISTS recovery_token         text,
  ADD COLUMN IF NOT EXISTS email_change           text,
  ADD COLUMN IF NOT EXISTS email_change_token_new text,
  ADD COLUMN IF NOT EXISTS phone                  text,
  ADD COLUMN IF NOT EXISTS banned_until           timestamptz;

CREATE TABLE IF NOT EXISTS auth.identities (
  id              uuid PRIMARY KEY,
  provider_id     text NOT NULL,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  identity_data   jsonb NOT NULL,
  provider        text NOT NULL,
  last_sign_in_at timestamptz,
  created_at      timestamptz,
  updated_at      timestamptz,
  UNIQUE (provider_id, provider)
);

-- Comme GoTrue : supprimer une session supprime ses refresh tokens.
CREATE TABLE IF NOT EXISTS auth.sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
  id         bigserial PRIMARY KEY,
  token      text,
  user_id    varchar(255),
  session_id uuid REFERENCES auth.sessions(id) ON DELETE CASCADE,
  revoked    boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Implémentation identique à celle de Supabase : lecture du claim « sub » des
-- claims JWT injectés par PostgREST dans la session.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE
  AS $$
  SELECT NULLIF(
           current_setting('request.jwt.claims', true)::json ->> 'sub',
           ''
         )::uuid
$$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE
  AS $$
  SELECT COALESCE(
           NULLIF(current_setting('request.jwt.claims', true), '')::jsonb,
           '{}'::jsonb
         )
$$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;

-- ── Schéma vault ────────────────────────────────────────────────────────────
-- Remplace l'extension supabase_vault (0.3.x), indisponible hors Supabase.
-- Ici le « déchiffrement » est l'identité — voir l'avertissement en en-tête.
-- Signatures alignées sur supabase_vault 0.3 : create_secret(new_secret,
-- new_name, new_description, new_key_id) et update_secret(secret_id,
-- new_secret, new_name, new_description, new_key_id), seule voie d'écriture.
CREATE SCHEMA IF NOT EXISTS vault;

CREATE TABLE IF NOT EXISTS vault.secrets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text UNIQUE,
  description text        NOT NULL DEFAULT '',
  secret      text        NOT NULL,
  key_id      uuid,
  nonce       bytea,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, description, secret, secret AS decrypted_secret,
         key_id, nonce, created_at, updated_at
  FROM vault.secrets;

-- Écriture réservée à l'API du Vault : un INSERT ou UPDATE direct sur
-- vault.secrets échoue, comme pour postgres sur Supabase. (La CI tourne en
-- superutilisateur, que les GRANT n'arrêteraient pas : d'où un déclencheur.)
CREATE OR REPLACE FUNCTION vault._shim_ecriture_api_seulement() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF COALESCE(current_setting('vault.shim_api', true), '') <> 'on' THEN
    RAISE EXCEPTION 'permission denied for table secrets (shim : passer par vault.create_secret / vault.update_secret)'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS shim_ecriture_api_seulement ON vault.secrets;
CREATE TRIGGER shim_ecriture_api_seulement
  BEFORE INSERT OR UPDATE ON vault.secrets
  FOR EACH ROW EXECUTE FUNCTION vault._shim_ecriture_api_seulement();

DROP FUNCTION IF EXISTS vault.create_secret(text, text, text);
CREATE OR REPLACE FUNCTION vault.create_secret(
  new_secret      text,
  new_name        text DEFAULT NULL,
  new_description text DEFAULT '',
  new_key_id      uuid DEFAULT NULL
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
DECLARE
  v_id uuid;
BEGIN
  PERFORM set_config('vault.shim_api', 'on', true);
  INSERT INTO vault.secrets (name, description, secret, key_id)
  VALUES (new_name, COALESCE(new_description, ''), new_secret, new_key_id)
  RETURNING id INTO v_id;
  PERFORM set_config('vault.shim_api', 'off', true);
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION vault.update_secret(
  secret_id       uuid,
  new_secret      text DEFAULT NULL,
  new_name        text DEFAULT NULL,
  new_description text DEFAULT NULL,
  new_key_id      uuid DEFAULT NULL
) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = ''
  AS $$
BEGIN
  PERFORM set_config('vault.shim_api', 'on', true);
  UPDATE vault.secrets
     SET secret      = COALESCE(new_secret, secret),
         name        = COALESCE(new_name, name),
         description = COALESCE(new_description, description),
         key_id      = COALESCE(new_key_id, key_id),
         updated_at  = now()
   WHERE id = secret_id;
  PERFORM set_config('vault.shim_api', 'off', true);
END;
$$;

-- Droits alignés sur ceux de l'extension supabase_vault (script after-create
-- de supabase/postgres) : rien pour PUBLIC, anon ni authenticated. MAIS
-- service_role reçoit, pour compatibilité avec Vault ≤ 0.2.8, l'usage du
-- schéma, SELECT et DELETE sur vault.secrets et vault.decrypted_secrets, et
-- l'exécution de create_secret et update_secret (et de
-- _crypto_aead_det_decrypt, sans équivalent ici). Ces octrois ont pour
-- grantor supabase_admin : postgres ne peut pas les retirer depuis
-- schema.sql. La clé secrète donne donc un accès direct au Vault par SQL ; la
-- liste blanche de get_app_secret ne borne que les appels PostgREST, et
-- « vault » ne doit jamais être ajouté aux schémas exposés de la Data API.
REVOKE ALL ON SCHEMA vault FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA vault FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION vault.create_secret(text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION vault.update_secret(uuid, text, text, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION vault._shim_ecriture_api_seulement() FROM PUBLIC;
GRANT USAGE ON SCHEMA vault TO service_role;
GRANT SELECT, DELETE ON vault.secrets, vault.decrypted_secrets TO service_role;
GRANT EXECUTE ON FUNCTION vault.create_secret(text, text, text, uuid),
                          vault.update_secret(uuid, text, text, text, uuid) TO service_role;

-- ── Publication Realtime ────────────────────────────────────────────────────
-- Créée par Supabase ; schema.sql la restreint à deux tables.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
