-- ============================================================
-- OPTILAB BSL-GAS — Schéma complet de base de données
-- Version consolidée — migrations 001 → 024
-- Dernière mise à jour : 2026-05-09 (BETA 1.9.6)
-- À exécuter dans Supabase SQL Editor sur une base vierge
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SÉQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS hgrappe_seq START 1 INCREMENT 1;  -- numéros HG-YYMMDD-NNNNN
CREATE SEQUENCE IF NOT EXISTS envoi_seq   START 1 INCREMENT 1;  -- numéros SILP-/HSILP-YYMMDD-NNNNN
CREATE SEQUENCE IF NOT EXISTS bd_seq      START 1 INCREMENT 1;  -- numéros BD-YYYY-NNNN

-- ============================================================
-- TABLES
-- ============================================================

-- Grappes de laboratoires
CREATE TABLE IF NOT EXISTS grappes (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL,
  code       TEXT,
  active     BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Laboratoires du réseau
CREATE TABLE IF NOT EXISTS laboratories (
  id                  UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name                TEXT        NOT NULL UNIQUE,
  active              BOOLEAN     DEFAULT TRUE,
  adresse             TEXT        DEFAULT '',
  adresse2            TEXT        NOT NULL DEFAULT '',
  ville               TEXT        DEFAULT '',
  code_postal         TEXT        DEFAULT '',
  province            TEXT        NOT NULL DEFAULT '',
  pays                TEXT        NOT NULL DEFAULT '',
  telephone           TEXT        DEFAULT '',
  default_refrigerant TEXT        DEFAULT NULL,
  fax_bio_hema        TEXT        DEFAULT '',
  fax_micro           TEXT        DEFAULT '',
  fax_patho           TEXT        DEFAULT '',
  fax_general         TEXT        DEFAULT '',
  grappe_id           UUID        REFERENCES grappes(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration globale de l'application (clé / valeur JSONB)
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration par grappe
CREATE TABLE IF NOT EXISTS grappe_config (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  grappe_id  UUID        NOT NULL REFERENCES grappes(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grappe_id, key)
);

-- Configuration des modules par laboratoire (bons_depart, hgrappe, notifications…)
CREATE TABLE IF NOT EXISTS module_config (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  module     TEXT        NOT NULL,
  labo_id    UUID        REFERENCES laboratories(id) ON DELETE CASCADE,
  active     BOOLEAN     NOT NULL DEFAULT false,
  config     JSONB       DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module, labo_id)
);

-- Profils utilisateurs (étend auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  employee_id          TEXT        NOT NULL UNIQUE,
  nom                  TEXT        NOT NULL,
  labo_id              UUID        REFERENCES laboratories(id),
  labo_ids             UUID[]      DEFAULT '{}',
  role                 TEXT        NOT NULL DEFAULT 'technicien'
                                   CHECK (role IN ('technicien','superviseur_labo','superviseur_grappe','admin')),
  active               BOOLEAN     DEFAULT TRUE,
  must_change_password BOOLEAN     DEFAULT FALSE,
  is_test              BOOLEAN     DEFAULT FALSE,
  created_by           TEXT        DEFAULT '',
  updated_by           TEXT        DEFAULT '',
  theme                TEXT        DEFAULT NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Autorisations par laboratoire (rôle par labo par utilisateur)
CREATE TABLE IF NOT EXISTS user_lab_memberships (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  labo_id    UUID        NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  lab_role   TEXT        NOT NULL CHECK (lab_role IN ('technicien','responsable')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, labo_id)
);

-- Journal d'audit générique
CREATE TABLE IF NOT EXISTS envois_audit (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  table_name     TEXT        NOT NULL,
  record_id      UUID        NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','ANNULATION')),
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[]      DEFAULT '{}',
  changed_by_id  UUID        REFERENCES auth.users(id),
  changed_by_nom TEXT        NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Laboratoires externes (destinataires hors-grappe, avec support sous-labos)
CREATE TABLE IF NOT EXISTS external_labs (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES external_labs(id) ON DELETE SET NULL,
  adresse     TEXT        DEFAULT '',
  adresse2    TEXT        NOT NULL DEFAULT '',
  ville       TEXT        DEFAULT '',
  code_postal TEXT        NOT NULL DEFAULT '',
  province    TEXT        NOT NULL DEFAULT '',
  pays        TEXT        NOT NULL DEFAULT '',
  telephone   TEXT        DEFAULT '',
  label_text  TEXT        NOT NULL DEFAULT '',
  active      BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Envois inter-laboratoires (intra-grappe)
CREATE TABLE IF NOT EXISTS envois (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero          TEXT        UNIQUE,         -- auto-généré par trigger (SILP- ou HSILP-YYMMDD-NNNNN)
  numeros_silp    TEXT[]      NOT NULL DEFAULT '{}',  -- numéros de listes de repérage physiques
  exp_labo_id     UUID        NOT NULL REFERENCES laboratories(id),
  dest_labo_id    UUID        NOT NULL REFERENCES laboratories(id),
  temperature     TEXT        NOT NULL,
  transporteur    TEXT        DEFAULT '',     -- nullable si module bons_depart actif
  nb_echantillons INTEGER,
  departements    TEXT[]      DEFAULT '{}',
  statut          TEXT        NOT NULL DEFAULT 'En transit'
                              CHECK (statut IN ('En attente','En transit','Reçu','Problème','Perdu','Annulé')),
  notes           TEXT        DEFAULT '',
  cree_par_id     UUID        REFERENCES profiles(id),
  cree_par_nom    TEXT        DEFAULT '',
  recep_par_nom   TEXT        DEFAULT '',
  recep_obs       TEXT        DEFAULT '',
  type_specimen   TEXT        DEFAULT 'exempt',
  glace_seche     BOOLEAN     DEFAULT FALSE,
  ts_envoi        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ts_recep        TIMESTAMPTZ,
  annule_at       TIMESTAMPTZ,
  annule_par_id   UUID        REFERENCES profiles(id),
  annule_par_nom  TEXT,
  annule_note     TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Envois hors-grappe (vers laboratoires externes)
CREATE TABLE IF NOT EXISTS envois_hgrappe (
  id                  UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero              TEXT        NOT NULL UNIQUE,
  source              TEXT        NOT NULL DEFAULT 'silp' CHECK (source IN ('silp','hsilp')),
  exp_labo_id         UUID        NOT NULL REFERENCES laboratories(id),
  dest_ext_lab_id     UUID        NOT NULL REFERENCES external_labs(id),
  temperature         TEXT        NOT NULL,
  transporteur        TEXT        NOT NULL,
  nb_echantillons     INTEGER,
  numeros_silp        TEXT[]      DEFAULT '{}',
  statut              TEXT        NOT NULL DEFAULT 'En transit'
                                  CHECK (statut IN ('En attente','En transit','Reçu','Problème','Aucune réponse reçue')),
  notes               TEXT        DEFAULT '',
  cree_par_id         UUID        REFERENCES profiles(id),
  cree_par_nom        TEXT        DEFAULT '',
  type_specimen       TEXT        DEFAULT 'exempt',
  glace_seche         BOOLEAN     DEFAULT FALSE,
  confirm_token       UUID        NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  confirm_method      TEXT        CHECK (confirm_method IN ('online','fax')),
  confirm_conforme    BOOLEAN,
  confirm_nc_types    TEXT[]      DEFAULT '{}',
  confirm_commentaire TEXT        DEFAULT '',
  confirm_recu_par    TEXT        DEFAULT '',
  ts_confirm          TIMESTAMPTZ,
  ts_envoi            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Bons de départ (regroupement d'envois par transporteur)
CREATE TABLE IF NOT EXISTS bons_depart (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero       TEXT        NOT NULL UNIQUE,   -- BD-YYYY-NNNN
  labo_id      UUID        NOT NULL REFERENCES laboratories(id),
  cree_par_id  UUID        NOT NULL REFERENCES profiles(id),
  cree_par_nom TEXT        NOT NULL DEFAULT '',
  statut       TEXT        NOT NULL DEFAULT 'actif'
                           CHECK (statut IN ('actif','récupéré','annulé')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Sections de bon de départ (une par transporteur)
CREATE TABLE IF NOT EXISTS bons_depart_sections (
  id                   UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  bon_id               UUID        NOT NULL REFERENCES bons_depart(id) ON DELETE CASCADE,
  transporteur         TEXT        NOT NULL,
  bon_connaissement    TEXT        NOT NULL DEFAULT '',
  date_prise_en_charge TIMESTAMPTZ,
  nom_transporteur_reel TEXT       NOT NULL DEFAULT '',
  UNIQUE(bon_id, transporteur)
);

-- Liaison envois ↔ bon de départ
CREATE TABLE IF NOT EXISTS bons_depart_envois (
  id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  bon_id      UUID NOT NULL REFERENCES bons_depart(id) ON DELETE CASCADE,
  envoi_id    UUID REFERENCES envois(id),
  hg_envoi_id UUID REFERENCES envois_hgrappe(id),
  type        TEXT NOT NULL CHECK (type IN ('intra','hg')),
  CONSTRAINT bde_one_type CHECK (
    (type = 'intra' AND envoi_id    IS NOT NULL AND hg_envoi_id IS NULL) OR
    (type = 'hg'    AND hg_envoi_id IS NOT NULL AND envoi_id    IS NULL)
  )
);

-- Configuration des notifications par courriel
CREATE TABLE IF NOT EXISTS notification_config (
  id             SERIAL      PRIMARY KEY,
  enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  enabled_nc     BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_lost   BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_alarm  BOOLEAN     NOT NULL DEFAULT TRUE,
  provider       TEXT        NOT NULL DEFAULT 'resend' CHECK (provider IN ('resend','smtp')),
  resend_api_key TEXT        NOT NULL DEFAULT '',
  smtp_host      TEXT        NOT NULL DEFAULT '',
  smtp_port      INTEGER     NOT NULL DEFAULT 587,
  smtp_user      TEXT        NOT NULL DEFAULT '',
  smtp_pass      TEXT        NOT NULL DEFAULT '',
  smtp_from      TEXT        NOT NULL DEFAULT '',
  batch_hour     INTEGER     NOT NULL DEFAULT 18 CHECK (batch_hour >= 0 AND batch_hour <= 23),
  fallback_email TEXT        NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ          DEFAULT NOW()
);

-- Adresses courriel de notification par laboratoire et département
CREATE TABLE IF NOT EXISTS notification_emails (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  labo_id    UUID        NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  dept_id    TEXT                 DEFAULT NULL,
  email      TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ          DEFAULT NOW()
);

-- File d'attente des notifications à envoyer
CREATE TABLE IF NOT EXISTS notification_queue (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  type         TEXT        NOT NULL CHECK (type IN ('nc','lost','alarm','hg_nc')),
  envoi_id     UUID        REFERENCES envois(id)         ON DELETE SET NULL,
  envoi_hg_id  UUID        REFERENCES envois_hgrappe(id) ON DELETE SET NULL,
  exp_labo_id  UUID        REFERENCES laboratories(id)   ON DELETE SET NULL,
  dest_labo_id UUID        REFERENCES laboratories(id)   ON DELETE SET NULL,
  envoi_numero TEXT        NOT NULL DEFAULT '',
  departements TEXT[]      NOT NULL DEFAULT '{}',
  details      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ          DEFAULT NOW(),
  sent_at      TIMESTAMPTZ          DEFAULT NULL,
  batch_id     UUID                 DEFAULT NULL
);

-- Historique des courriels envoyés
CREATE TABLE IF NOT EXISTS notification_log (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id      UUID        NOT NULL,
  type          TEXT        NOT NULL DEFAULT '',
  to_email      TEXT        NOT NULL,
  labo_id       UUID        REFERENCES laboratories(id) ON DELETE SET NULL,
  dept_id       TEXT                 DEFAULT NULL,
  subject       TEXT        NOT NULL DEFAULT '',
  body_text     TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','error')),
  error_message TEXT                 DEFAULT NULL,
  sent_at       TIMESTAMPTZ          DEFAULT NOW(),
  queue_ids     UUID[]      NOT NULL DEFAULT '{}'
);

-- ============================================================
-- DONNÉES INITIALES
-- ============================================================

-- Ligne de config notifications (une seule ligne autorisée)
INSERT INTO notification_config (enabled, enabled_nc, enabled_lost, enabled_alarm)
SELECT FALSE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM notification_config);

-- ============================================================
-- FONCTIONS UTILITAIRES
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION current_role_name()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_labo_id()
RETURNS UUID AS $$
  SELECT labo_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Retourne tous les labos accessibles par l'utilisateur courant.
-- Admin/superviseur_grappe → tous les labos actifs.
-- Autres → labos de user_lab_memberships, avec fallback legacy sur labo_ids/labo_id.
CREATE OR REPLACE FUNCTION current_labo_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN current_role_name() IN ('admin','superviseur_grappe')
    THEN ARRAY(SELECT id FROM laboratories WHERE active = true)
    ELSE
      COALESCE(
        NULLIF(ARRAY(SELECT labo_id FROM user_lab_memberships WHERE profile_id = auth.uid()), '{}'),
        COALESCE(
          NULLIF((SELECT labo_ids FROM profiles WHERE id = auth.uid()), '{}'),
          ARRAY(SELECT labo_id FROM profiles WHERE id = auth.uid() AND labo_id IS NOT NULL)
        )
      )
  END;
$$;

-- Retourne le rôle de l'utilisateur courant dans un laboratoire donné.
CREATE OR REPLACE FUNCTION current_lab_role(p_labo_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN current_role_name() IN ('admin','superviseur_grappe') THEN 'responsable'
    ELSE (SELECT lab_role FROM user_lab_memberships
          WHERE profile_id = auth.uid() AND labo_id = p_labo_id)
  END;
$$;

-- Vérifie si un module est activé pour un laboratoire donné.
CREATE OR REPLACE FUNCTION is_module_active(p_module TEXT, p_labo_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT active FROM module_config WHERE module = p_module AND labo_id = p_labo_id),
    false
  );
$$;

-- Synchronise labo_ids lors de la création d'un profil.
CREATE OR REPLACE FUNCTION sync_labo_ids_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.labo_id IS NOT NULL AND (NEW.labo_ids IS NULL OR NEW.labo_ids = '{}') THEN
    NEW.labo_ids := ARRAY[NEW.labo_id];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- FONCTIONS — Numérotation envois intra-grappe
-- ============================================================

-- Auto-génère numero lors d'un INSERT sur envois.
-- SILP-YYMMDD-NNNNN si numeros_silp non vide, HSILP-YYMMDD-NNNNN sinon.
CREATE OR REPLACE FUNCTION generate_envoi_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    IF NEW.numeros_silp IS NULL OR array_length(NEW.numeros_silp, 1) IS NULL THEN
      NEW.numero := 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                    LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0');
    ELSE
      NEW.numero := 'SILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                    LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Affiche le prochain numéro HSILP sans consommer la séquence (pour l'UI).
CREATE OR REPLACE FUNCTION peek_next_hsilp()
RETURNS TEXT AS $$
  SELECT 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
         LPAD(CAST(
           CASE WHEN is_called THEN last_value + 1 ELSE last_value END
         AS TEXT), 5, '0')
  FROM envoi_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Création atomique d'un envoi HSILP (sans liste de repérage SILP).
-- Le trigger generate_envoi_numero génère le numéro automatiquement.
CREATE OR REPLACE FUNCTION create_envoi_hsilp(
  p_exp_labo_id     UUID,
  p_dest_labo_id    UUID,
  p_temperature     TEXT,
  p_transporteur    TEXT,
  p_nb_echantillons INTEGER,
  p_departements    TEXT[],
  p_notes           TEXT,
  p_cree_par_id     UUID,
  p_cree_par_nom    TEXT,
  p_type_specimen   TEXT,
  p_glace_seche     BOOLEAN,
  p_statut          TEXT DEFAULT 'En transit'
) RETURNS TEXT AS $$
DECLARE v_num TEXT;
BEGIN
  IF NOT (
    p_exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi pour ce laboratoire.';
  END IF;

  INSERT INTO envois (
    exp_labo_id, dest_labo_id,
    temperature, transporteur, nb_echantillons, departements,
    statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche, numeros_silp
  ) VALUES (
    p_exp_labo_id, p_dest_labo_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_departements,
    p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche, '{}'
  ) RETURNING numero INTO v_num;

  RETURN v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTIONS — Envois hors-grappe
-- ============================================================

CREATE OR REPLACE FUNCTION peek_next_hgrappe()
RETURNS TEXT AS $$
  SELECT 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(CAST(
      CASE WHEN is_called THEN last_value + 1 ELSE last_value END
    AS TEXT), 5, '0')
  FROM hgrappe_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION create_envoi_hgrappe(
  p_source           TEXT,
  p_exp_labo_id      UUID,
  p_dest_ext_lab_id  UUID,
  p_temperature      TEXT,
  p_transporteur     TEXT,
  p_nb_echantillons  INTEGER,
  p_numeros_silp     TEXT[],
  p_notes            TEXT,
  p_cree_par_id      UUID,
  p_cree_par_nom     TEXT,
  p_type_specimen    TEXT,
  p_glace_seche      BOOLEAN,
  p_statut           TEXT DEFAULT 'En transit'
) RETURNS JSON AS $$
DECLARE v_num TEXT; v_token UUID;
BEGIN
  IF NOT (
    p_exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi hors-grappe pour ce laboratoire.';
  END IF;
  v_num := 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
           LPAD(CAST(nextval('hgrappe_seq') AS TEXT), 5, '0');
  INSERT INTO envois_hgrappe (
    numero, source, exp_labo_id, dest_ext_lab_id, temperature, transporteur,
    nb_echantillons, numeros_silp, statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche
  ) VALUES (
    v_num, p_source, p_exp_labo_id, p_dest_ext_lab_id, p_temperature, p_transporteur,
    p_nb_echantillons, p_numeros_silp, p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche
  ) RETURNING confirm_token INTO v_token;
  RETURN json_build_object('numero', v_num, 'token', v_token::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_token(p_token UUID)
RETURNS JSON AS $$
DECLARE
  v_e                envois_hgrappe%ROWTYPE;
  v_exp_name         TEXT;
  v_dest_name        TEXT;
  v_dest_parent_name TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE confirm_token = p_token;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  SELECT name INTO v_exp_name FROM laboratories WHERE id = v_e.exp_labo_id;
  SELECT el.name, el2.name INTO v_dest_name, v_dest_parent_name
    FROM external_labs el LEFT JOIN external_labs el2 ON el2.id = el.parent_id
    WHERE el.id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero', v_e.numero, 'exp', v_exp_name, 'dest', v_dest_name,
    'dest_parent', v_dest_parent_name, 'temperature', v_e.temperature,
    'transporteur', v_e.transporteur, 'nb_echantillons', v_e.nb_echantillons,
    'ts_envoi', v_e.ts_envoi, 'statut', v_e.statut,
    'already_confirmed', v_e.ts_confirm IS NOT NULL,
    'confirm_conforme', v_e.confirm_conforme, 'confirm_nc_types', v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire, 'ts_confirm', v_e.ts_confirm,
    'confirm_recu_par', v_e.confirm_recu_par, 'confirm_method', v_e.confirm_method
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Code de vérification = 6 premiers caractères du token UUID sans tirets, majuscules
CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_e                envois_hgrappe%ROWTYPE;
  v_exp_name         TEXT;
  v_dest_name        TEXT;
  v_dest_parent_name TEXT;
  v_expected         TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE numero = upper(trim(p_numero));
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  v_expected := upper(substr(replace(v_e.confirm_token::text, '-', ''), 1, 6));
  IF upper(trim(p_verify_code)) != v_expected THEN
    RETURN json_build_object('error', 'wrong_code');
  END IF;
  SELECT name INTO v_exp_name FROM laboratories WHERE id = v_e.exp_labo_id;
  SELECT el.name, el2.name INTO v_dest_name, v_dest_parent_name
    FROM external_labs el LEFT JOIN external_labs el2 ON el2.id = el.parent_id
    WHERE el.id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero', v_e.numero, 'token', v_e.confirm_token,
    'exp', v_exp_name, 'dest', v_dest_name, 'dest_parent', v_dest_parent_name,
    'temperature', v_e.temperature, 'transporteur', v_e.transporteur,
    'nb_echantillons', v_e.nb_echantillons, 'ts_envoi', v_e.ts_envoi,
    'statut', v_e.statut, 'already_confirmed', v_e.ts_confirm IS NOT NULL,
    'confirm_conforme', v_e.confirm_conforme, 'confirm_nc_types', v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire, 'ts_confirm', v_e.ts_confirm,
    'confirm_recu_par', v_e.confirm_recu_par, 'confirm_method', v_e.confirm_method
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_hg_confirm_cfg()
RETURNS JSON AS $$
DECLARE v_val TEXT;
BEGIN
  SELECT value::text INTO v_val FROM app_config WHERE key = 'hgrappe_confirm_by_numero';
  RETURN json_build_object(
    'confirm_by_numero', COALESCE(v_val NOT IN ('false','null','""'), TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Confirmation de réception (page publique, accessible sans auth).
-- Insère dans notification_queue si non-conforme.
CREATE OR REPLACE FUNCTION confirm_envoi_hgrappe(
  p_token       UUID,
  p_conforme    BOOLEAN,
  p_nc_types    TEXT[],
  p_commentaire TEXT,
  p_recu_par    TEXT,
  p_ts_confirm  TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
  v_id       UUID;
  v_statut   TEXT;
  v_exp_labo UUID;
  v_numero   TEXT;
BEGIN
  SELECT id, exp_labo_id, numero
  INTO v_id, v_exp_labo, v_numero
  FROM envois_hgrappe
  WHERE confirm_token = p_token AND ts_confirm IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found_or_already_confirmed');
  END IF;

  v_statut := CASE WHEN p_conforme THEN 'Reçu' ELSE 'Problème' END;

  UPDATE envois_hgrappe SET
    statut              = v_statut,
    confirm_method      = 'online',
    confirm_conforme    = p_conforme,
    confirm_nc_types    = p_nc_types,
    confirm_commentaire = p_commentaire,
    confirm_recu_par    = p_recu_par,
    ts_confirm          = COALESCE(p_ts_confirm, NOW())
  WHERE id = v_id;

  IF NOT p_conforme THEN
    INSERT INTO notification_queue (
      type, envoi_hg_id, exp_labo_id, envoi_numero, details
    ) VALUES (
      'hg_nc', v_id, v_exp_labo, v_numero,
      json_build_object(
        'nc_types', p_nc_types, 'commentaire', p_commentaire,
        'recu_par', p_recu_par, 'conforme', false, 'method', 'online'
      )
    );
  END IF;

  RETURN json_build_object('ok', true, 'statut', v_statut);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTIONS — Annulation logique d'un envoi intra-grappe
-- ============================================================

-- Annule un envoi (reste en base pour traçabilité).
-- Créateur, responsable du labo ou superviseur/admin peuvent annuler.
CREATE OR REPLACE FUNCTION annuler_envoi(
  p_envoi_id UUID,
  p_note     TEXT
) RETURNS VOID AS $$
DECLARE
  v_statut    TEXT;
  v_exp_labo  UUID;
  v_annule    TIMESTAMPTZ;
  v_createur  UUID;
  v_in_bon    BOOLEAN;
  v_par_nom   TEXT;
BEGIN
  SELECT statut, exp_labo_id, annule_at, cree_par_id
  INTO v_statut, v_exp_labo, v_annule, v_createur
  FROM envois WHERE id = p_envoi_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Envoi introuvable.'; END IF;

  IF NOT (v_exp_labo = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe','admin'))
  THEN RAISE EXCEPTION 'Accès refusé.'; END IF;

  IF NOT (
    auth.uid() = v_createur
    OR current_lab_role(v_exp_labo) = 'responsable'
    OR current_role_name() IN ('superviseur_grappe','admin','superviseur_labo')
  ) THEN
    RAISE EXCEPTION 'Seul le créateur de l''envoi ou un responsable de laboratoire peut l''annuler.';
  END IF;

  IF v_annule IS NOT NULL THEN RAISE EXCEPTION 'Cet envoi est déjà annulé.'; END IF;

  IF v_statut NOT IN ('En attente','En transit') THEN
    RAISE EXCEPTION 'Seuls les envois en attente ou en transit peuvent être annulés.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM bons_depart_envois bde
    JOIN bons_depart bd ON bde.bon_id = bd.id
    WHERE bde.envoi_id = p_envoi_id AND bd.statut = 'actif'
  ) INTO v_in_bon;

  IF v_in_bon THEN
    RAISE EXCEPTION 'Cet envoi fait partie d''un bon de départ actif. Retirez-le du bon avant de l''annuler.';
  END IF;

  IF p_note IS NULL OR TRIM(p_note) = '' THEN
    RAISE EXCEPTION 'Un commentaire est requis pour annuler un envoi.';
  END IF;

  SELECT nom INTO v_par_nom FROM profiles WHERE id = auth.uid();

  UPDATE envois SET
    statut         = 'Annulé',
    annule_at      = NOW(),
    annule_par_id  = auth.uid(),
    annule_par_nom = v_par_nom,
    annule_note    = TRIM(p_note)
  WHERE id = p_envoi_id;

  INSERT INTO envois_audit (
    table_name, record_id, action,
    old_data, new_data, changed_fields,
    changed_by_id, changed_by_nom
  ) VALUES (
    'envois', p_envoi_id, 'ANNULATION',
    json_build_object('statut', v_statut, 'annule_at', NULL),
    json_build_object('statut','Annulé','annule_at',NOW(),'annule_note',TRIM(p_note)),
    ARRAY['statut','annule_at','annule_note'],
    auth.uid(), v_par_nom
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTIONS — Bons de départ
-- ============================================================

-- Vérifie si le bon doit passer en 'récupéré'.
CREATE OR REPLACE FUNCTION check_bon_completion(p_bon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE bons_depart SET statut = 'récupéré'
  WHERE id = p_bon_id AND statut = 'actif'
    AND (
      EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL)
      OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
                 WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
      OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
                 WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Création atomique d'un bon de départ.
-- p_transporteur_map : {"<envoi_id>": "Purolator", ...} — assigne le transporteur par envoi.
CREATE OR REPLACE FUNCTION create_bon_depart(
  p_labo_id            UUID,
  p_cree_par_id        UUID,
  p_cree_par_nom       TEXT,
  p_envoi_ids          UUID[],
  p_hg_envoi_ids       UUID[],
  p_bon_connaissements JSONB,
  p_transporteur_map   JSONB DEFAULT NULL
) RETURNS JSON AS $$
DECLARE v_num TEXT; v_bon_id UUID;
BEGIN
  IF NOT (p_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF cardinality(p_envoi_ids) = 0 AND cardinality(p_hg_envoi_ids) = 0 THEN
    RAISE EXCEPTION 'Aucun envoi sélectionné';
  END IF;
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;

  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
  END IF;

  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (transporteur IS NULL OR transporteur = '')
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois n''ont pas de transporteur assigné.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (transporteur IS NULL OR transporteur = '')
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG n''ont pas de transporteur assigné.'; END IF;

  v_num := 'BD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(CAST(nextval('bd_seq') AS TEXT), 4, '0');
  INSERT INTO bons_depart (numero, labo_id, cree_par_id, cree_par_nom)
  VALUES (v_num, p_labo_id, p_cree_par_id, p_cree_par_nom) RETURNING id INTO v_bon_id;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type) SELECT v_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;
  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type) SELECT v_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT v_bon_id, t.tr, COALESCE(p_bon_connaissements->>(t.tr), '')
  FROM (
    SELECT transporteur AS tr FROM envois WHERE id = ANY(p_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('numero', v_num, 'id', v_bon_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Annulation atomique d'un bon (remet les envois en 'En attente').
CREATE OR REPLACE FUNCTION cancel_bon_depart(p_bon_id UUID)
RETURNS JSON AS $$
DECLARE v_labo_id UUID;
BEGIN
  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = p_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou déjà annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
             WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
  OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
             WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
  THEN RAISE EXCEPTION 'Impossible d''annuler : au moins un envoi a été réceptionné.'; END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible d''annuler : la date de prise en charge a été renseignée.';
  END IF;

  UPDATE envois SET statut = 'En attente', ts_envoi = created_at
  WHERE id IN (SELECT envoi_id FROM bons_depart_envois WHERE bon_id = p_bon_id AND type = 'intra');
  UPDATE envois_hgrappe SET statut = 'En attente', ts_envoi = created_at
  WHERE id IN (SELECT hg_envoi_id FROM bons_depart_envois WHERE bon_id = p_bon_id AND type = 'hg');
  UPDATE bons_depart SET statut = 'annulé' WHERE id = p_bon_id;
  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Retire un envoi d'un bon actif.
CREATE OR REPLACE FUNCTION remove_envoi_from_bon(p_link_id UUID)
RETURNS JSON AS $$
DECLARE
  v_bon_id UUID; v_envoi_id UUID; v_hg_envoi_id UUID; v_type TEXT; v_labo_id UUID;
BEGIN
  SELECT bon_id, envoi_id, hg_envoi_id, type
  INTO v_bon_id, v_envoi_id, v_hg_envoi_id, v_type
  FROM bons_depart_envois WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liaison introuvable.'; END IF;

  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = v_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = v_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible de retirer un envoi : la date de prise en charge a été renseignée.';
  END IF;
  IF v_type = 'intra' THEN
    IF EXISTS (SELECT 1 FROM envois WHERE id = v_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
    UPDATE envois SET statut = 'En attente', ts_envoi = created_at WHERE id = v_envoi_id;
  ELSE
    IF EXISTS (SELECT 1 FROM envois_hgrappe WHERE id = v_hg_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
    UPDATE envois_hgrappe SET statut = 'En attente', ts_envoi = created_at WHERE id = v_hg_envoi_id;
  END IF;

  DELETE FROM bons_depart_envois WHERE id = p_link_id;
  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Ajoute des envois à un bon existant.
CREATE OR REPLACE FUNCTION add_envois_to_bon(
  p_bon_id           UUID,
  p_envoi_ids        UUID[],
  p_hg_envoi_ids     UUID[],
  p_transporteur_map JSONB DEFAULT NULL
) RETURNS JSON AS $$
DECLARE v_labo_id UUID;
BEGIN
  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = p_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF cardinality(p_envoi_ids) = 0 AND cardinality(p_hg_envoi_ids) = 0 THEN
    RAISE EXCEPTION 'Aucun envoi sélectionné';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
             WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
  OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
             WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
  THEN RAISE EXCEPTION 'Impossible d''ajouter : au moins un envoi du bon a été réceptionné.'; END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible d''ajouter : la date de prise en charge a été renseignée.';
  END IF;
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente.'; END IF;

  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
  END IF;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type) SELECT p_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;
  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type) SELECT p_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT p_bon_id, t.tr, ''
  FROM (
    SELECT transporteur AS tr FROM envois WHERE id = ANY(p_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTIONS — KPI
-- ============================================================

CREATE OR REPLACE FUNCTION get_labo_kpis(p_labo_id UUID, p_days INTEGER)
RETURNS JSON AS $$
DECLARE
  v_cutoff       TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_intra_total  INTEGER; v_intra_nc INTEGER; v_avg_transit NUMERIC;
  v_hg_total     INTEGER; v_hg_nc INTEGER; v_hg_confirmed INTEGER;
  v_total        INTEGER; v_nc_count INTEGER; v_flux JSON;
BEGIN
  IF current_role_name() NOT IN ('admin','superviseur_grappe') THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ts_recep - ts_envoi)) / 3600.0)
      FILTER (WHERE statut = 'Reçu' AND ts_recep IS NOT NULL), 1), 0)
  INTO v_intra_total, v_intra_nc, v_avg_transit
  FROM envois WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff;

  SELECT COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COUNT(*) FILTER (WHERE ts_confirm IS NOT NULL)::INTEGER
  INTO v_hg_total, v_hg_nc, v_hg_confirmed
  FROM envois_hgrappe WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff;

  v_total    := v_intra_total + v_hg_total;
  v_nc_count := v_intra_nc    + v_hg_nc;

  SELECT json_agg(d ORDER BY d.date) INTO v_flux
  FROM (
    SELECT date, SUM(volume)::INTEGER AS volume FROM (
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal','YYYY-MM-DD') AS date, COUNT(*) AS volume
      FROM envois WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff GROUP BY 1
      UNION ALL
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal','YYYY-MM-DD') AS date, COUNT(*) AS volume
      FROM envois_hgrappe WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff GROUP BY 1
    ) raw GROUP BY date ORDER BY date
  ) d;

  RETURN json_build_object(
    'stats_globales', json_build_object(
      'total', v_total,
      'nc_rate', CASE WHEN v_total > 0 THEN ROUND((v_nc_count::NUMERIC / v_total)*100,1) ELSE 0 END,
      'avg_transit', v_avg_transit,
      'hg_total', v_hg_total,
      'hg_confirmed', v_hg_confirmed
    ),
    'flux_quotidien', COALESCE(v_flux, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- TRIGGERS
-- ============================================================

-- updated_at automatique
CREATE TRIGGER trg_profiles_updated     BEFORE UPDATE ON profiles       FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_envois_updated       BEFORE UPDATE ON envois         FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_envois_hgrappe_updated BEFORE UPDATE ON envois_hgrappe FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Synchronise labo_ids à la création d'un profil
CREATE TRIGGER trg_profiles_labo_ids   BEFORE INSERT ON profiles FOR EACH ROW EXECUTE FUNCTION sync_labo_ids_on_insert();

-- Auto-génère envois.numero
CREATE TRIGGER trg_envoi_numero        BEFORE INSERT ON envois   FOR EACH ROW EXECUTE FUNCTION generate_envoi_numero();

-- Complétion automatique d'un bon de départ
CREATE OR REPLACE FUNCTION trg_bd_section_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_prise_en_charge IS NOT NULL THEN PERFORM check_bon_completion(NEW.bon_id); END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_envois_bon_completion()
RETURNS TRIGGER AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit') AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id FROM bons_depart_envois WHERE envoi_id = NEW.id LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION trg_hgrappe_bon_completion()
RETURNS TRIGGER AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit') AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id FROM bons_depart_envois WHERE hg_envoi_id = NEW.id LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_bd_sections_after_update  AFTER UPDATE ON bons_depart_sections FOR EACH ROW EXECUTE FUNCTION trg_bd_section_completion();
CREATE TRIGGER trg_envois_bon_completion     AFTER UPDATE ON envois                FOR EACH ROW EXECUTE FUNCTION trg_envois_bon_completion();
CREATE TRIGGER trg_hgrappe_bon_completion    AFTER UPDATE ON envois_hgrappe        FOR EACH ROW EXECUTE FUNCTION trg_hgrappe_bon_completion();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE grappes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE laboratories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config           ENABLE ROW LEVEL SECURITY;
ALTER TABLE grappe_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_lab_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_audit         ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_labs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois               ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_hgrappe       ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_depart          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_depart_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_depart_envois   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_emails  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log     ENABLE ROW LEVEL SECURITY;

-- ---- grappes ----
CREATE POLICY "Lecture grappes"  ON grappes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion grappes"  ON grappes FOR ALL    TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- ---- laboratories ----
CREATE POLICY "Lecture labos"    ON laboratories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion labos"    ON laboratories FOR ALL    TO authenticated
  USING (current_role_name() = 'admin') WITH CHECK (current_role_name() = 'admin');

-- ---- app_config ----
CREATE POLICY "Lecture config (auth)"  ON app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture config (anon)"  ON app_config FOR SELECT TO anon         USING (true);
CREATE POLICY "Gestion config"         ON app_config FOR ALL    TO authenticated
  USING (current_role_name() = 'admin') WITH CHECK (current_role_name() = 'admin');

-- ---- grappe_config ----
CREATE POLICY "Lecture grappe_config"  ON grappe_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion grappe_config"  ON grappe_config FOR ALL    TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- ---- module_config ----
CREATE POLICY "Lecture module_config"  ON module_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Ecriture module_config" ON module_config FOR ALL    TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- ---- profiles ----
CREATE POLICY "Lecture profil (soi-même)"   ON profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Lecture profils (superviseurs)" ON profiles FOR SELECT TO authenticated
  USING (current_role_name() = 'admin' OR current_role_name() = 'superviseur_grappe'
    OR (current_role_name() = 'superviseur_labo' AND labo_id = current_labo_id()));
CREATE POLICY "Modification profils"         ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid() OR current_role_name() = 'admin'
    OR (current_role_name() = 'superviseur_grappe' AND role <> 'admin')
    OR (current_role_name() = 'superviseur_labo' AND labo_id = current_labo_id() AND role <> 'admin'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe','superviseur_labo') OR id = auth.uid());
CREATE POLICY "Insertion profils (service role)" ON profiles FOR INSERT TO service_role WITH CHECK (true);

-- ---- user_lab_memberships ----
CREATE POLICY "Lecture memberships"   ON user_lab_memberships FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR current_role_name() IN ('admin','superviseur_grappe','superviseur_labo'));
CREATE POLICY "Gestion memberships"   ON user_lab_memberships FOR ALL    TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- ---- envois_audit ----
CREATE POLICY "Insertion audit"  ON envois_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Lecture audit"    ON envois_audit FOR SELECT TO authenticated USING (true);

-- ---- external_labs ----
CREATE POLICY "Lecture external_labs"  ON external_labs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion external_labs"  ON external_labs FOR ALL    TO authenticated
  USING (current_role_name() = 'admin') WITH CHECK (current_role_name() = 'admin');

-- ---- envois ----
CREATE POLICY "Lecture envois"       ON envois FOR SELECT TO authenticated USING (true);
CREATE POLICY "Création envois"      ON envois FOR INSERT TO authenticated
  WITH CHECK (exp_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));
CREATE POLICY "Mise à jour envois"   ON envois FOR UPDATE TO authenticated
  USING (dest_labo_id = ANY(current_labo_ids()) OR exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe','admin'))
  WITH CHECK (true);

-- ---- envois_hgrappe ----
CREATE POLICY "Lecture envois_hgrappe"      ON envois_hgrappe FOR SELECT TO authenticated USING (true);
CREATE POLICY "Création envois_hgrappe"     ON envois_hgrappe FOR INSERT TO authenticated
  WITH CHECK (exp_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));
CREATE POLICY "Mise à jour envois_hgrappe"  ON envois_hgrappe FOR UPDATE TO authenticated
  USING (exp_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'))
  WITH CHECK (true);

-- ---- bons_depart ----
CREATE POLICY "Lecture bons_depart"     ON bons_depart FOR SELECT TO authenticated
  USING (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));
CREATE POLICY "Création bons_depart"    ON bons_depart FOR INSERT TO authenticated
  WITH CHECK (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));
CREATE POLICY "Mise à jour bons_depart" ON bons_depart FOR UPDATE TO authenticated
  USING (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'))
  WITH CHECK (true);
CREATE POLICY "Lecture bons_depart_sections"    ON bons_depart_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Mise à jour bons_depart_sections" ON bons_depart_sections FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM bons_depart bd WHERE bd.id = bon_id
    AND (bd.labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'))))
  WITH CHECK (true);
CREATE POLICY "Lecture bons_depart_envois"      ON bons_depart_envois   FOR SELECT TO authenticated USING (true);

-- ---- notifications ----
CREATE POLICY "Lecture notif_config"  ON notification_config FOR SELECT TO authenticated USING (current_role_name() = 'admin');
CREATE POLICY "MAJ notif_config"      ON notification_config FOR UPDATE TO authenticated USING (current_role_name()='admin') WITH CHECK (current_role_name()='admin');
CREATE POLICY "Lecture notif_emails"  ON notification_emails FOR SELECT TO authenticated USING (current_role_name() IN ('admin','superviseur_grappe'));
CREATE POLICY "Gestion notif_emails"  ON notification_emails FOR ALL    TO authenticated USING (current_role_name()='admin') WITH CHECK (current_role_name()='admin');
CREATE POLICY "Insertion notif_queue" ON notification_queue  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Lecture notif_queue"   ON notification_queue  FOR SELECT TO authenticated USING (current_role_name() IN ('admin','superviseur_grappe'));
CREATE POLICY "Lecture notif_log"     ON notification_log    FOR SELECT TO authenticated USING (current_role_name() IN ('admin','superviseur_grappe'));

-- ============================================================
-- DROITS D'EXÉCUTION
-- ============================================================

GRANT EXECUTE ON FUNCTION current_labo_ids()                                                                        TO authenticated;
GRANT EXECUTE ON FUNCTION current_lab_role(UUID)                                                                    TO authenticated;
GRANT EXECUTE ON FUNCTION is_module_active(TEXT, UUID)                                                              TO authenticated;
GRANT EXECUTE ON FUNCTION peek_next_hsilp()                                                                         TO authenticated;
GRANT EXECUTE ON FUNCTION peek_next_hgrappe()                                                                       TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hsilp(UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN,TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hgrappe(TEXT,UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION annuler_envoi(UUID, TEXT)                                                                 TO authenticated;
GRANT EXECUTE ON FUNCTION create_bon_depart(UUID,UUID,TEXT,UUID[],UUID[],JSONB,JSONB)                               TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_bon_depart(UUID)                                                                   TO authenticated;
GRANT EXECUTE ON FUNCTION remove_envoi_from_bon(UUID)                                                               TO authenticated;
GRANT EXECUTE ON FUNCTION add_envois_to_bon(UUID,UUID[],UUID[],JSONB)                                               TO authenticated;
GRANT EXECUTE ON FUNCTION check_bon_completion(UUID)                                                                TO authenticated;
GRANT EXECUTE ON FUNCTION get_labo_kpis(UUID, INTEGER)                                                              TO authenticated;
GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_token(UUID)                                                          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_numero(TEXT, TEXT)                                                   TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_hg_confirm_cfg()                                                                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_envoi_hgrappe(UUID,BOOLEAN,TEXT[],TEXT,TEXT,TIMESTAMPTZ)                          TO anon, authenticated;

-- ============================================================
-- INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_labs_grappe           ON laboratories(grappe_id);
CREATE INDEX IF NOT EXISTS idx_grappe_config_grappe  ON grappe_config(grappe_id);
CREATE INDEX IF NOT EXISTS idx_module_config_module_labo ON module_config(module, labo_id);
CREATE INDEX IF NOT EXISTS idx_profiles_emp_id       ON profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_labo         ON profiles(labo_id);
CREATE INDEX IF NOT EXISTS idx_profiles_labo_ids     ON profiles USING GIN(labo_ids);
CREATE INDEX IF NOT EXISTS idx_ulm_profile           ON user_lab_memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_ulm_labo              ON user_lab_memberships(labo_id);
CREATE INDEX IF NOT EXISTS idx_audit_record          ON envois_audit(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed         ON envois_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_by              ON envois_audit(changed_by_id);
CREATE INDEX IF NOT EXISTS idx_ext_labs_name         ON external_labs(name);
CREATE INDEX IF NOT EXISTS idx_ext_labs_par          ON external_labs(parent_id);
CREATE INDEX IF NOT EXISTS idx_envois_numero         ON envois(numero);
CREATE INDEX IF NOT EXISTS idx_envois_numeros_silp   ON envois USING GIN(numeros_silp);
CREATE INDEX IF NOT EXISTS idx_envois_exp_labo       ON envois(exp_labo_id);
CREATE INDEX IF NOT EXISTS idx_envois_dest_labo      ON envois(dest_labo_id);
CREATE INDEX IF NOT EXISTS idx_envois_statut         ON envois(statut);
CREATE INDEX IF NOT EXISTS idx_envois_ts_envoi       ON envois(ts_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_envois_annule         ON envois(annule_at) WHERE annule_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hgrappe_numero        ON envois_hgrappe(numero);
CREATE INDEX IF NOT EXISTS idx_hgrappe_exp           ON envois_hgrappe(exp_labo_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_dest          ON envois_hgrappe(dest_ext_lab_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_statut        ON envois_hgrappe(statut);
CREATE INDEX IF NOT EXISTS idx_hgrappe_ts            ON envois_hgrappe(ts_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_hgrappe_token         ON envois_hgrappe(confirm_token);
CREATE INDEX IF NOT EXISTS idx_bons_depart_labo      ON bons_depart(labo_id);
CREATE INDEX IF NOT EXISTS idx_bons_depart_statut    ON bons_depart(statut);
CREATE INDEX IF NOT EXISTS idx_bons_depart_created   ON bons_depart(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_sections_bon       ON bons_depart_sections(bon_id);
CREATE INDEX IF NOT EXISTS idx_bd_envois_bon         ON bons_depart_envois(bon_id);
CREATE INDEX IF NOT EXISTS idx_bd_envois_envoi_id    ON bons_depart_envois(envoi_id)    WHERE envoi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bd_envois_hg_id       ON bons_depart_envois(hg_envoi_id) WHERE hg_envoi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notif_queue_pending   ON notification_queue(created_at)  WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_queue_envoi     ON notification_queue(envoi_id);
CREATE INDEX IF NOT EXISTS idx_notif_emails_labo     ON notification_emails(labo_id, dept_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent        ON notification_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_batch       ON notification_log(batch_id);

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE envois;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE app_config;
ALTER PUBLICATION supabase_realtime ADD TABLE envois_hgrappe;
