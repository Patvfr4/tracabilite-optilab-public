-- ============================================================
-- OPTILAB BSL-GAS — Schéma complet de base de données
-- Version consolidée — inclut toutes les migrations (001 → 011)
-- À exécuter dans Supabase SQL Editor sur une base vierge
-- ============================================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- SÉQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS hsilp_seq   START 1 INCREMENT 1;
CREATE SEQUENCE IF NOT EXISTS hgrappe_seq START 1 INCREMENT 1;

-- ============================================================
-- TABLES
-- ============================================================

-- Laboratoires du réseau BSL-GAS
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
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Configuration de l'application (clé / valeur JSONB)
CREATE TABLE IF NOT EXISTS app_config (
  key        TEXT        PRIMARY KEY,
  value      JSONB       NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profils utilisateurs (étend auth.users de Supabase)
CREATE TABLE IF NOT EXISTS profiles (
  id                   UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  employee_id          TEXT        NOT NULL UNIQUE,
  nom                  TEXT        NOT NULL,
  labo_id              UUID        REFERENCES laboratories(id),
  role                 TEXT        NOT NULL DEFAULT 'technicien'
                                   CHECK (role IN ('technicien','superviseur_labo','superviseur_grappe','admin')),
  active               BOOLEAN     DEFAULT TRUE,
  must_change_password BOOLEAN     DEFAULT FALSE,
  is_test              BOOLEAN     DEFAULT FALSE,
  created_by           TEXT        DEFAULT '',
  updated_by           TEXT        DEFAULT '',
  theme                TEXT        DEFAULT NULL,  -- 'light' | 'dark' | NULL (préférence OS)
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Envois inter-laboratoires (intra-grappe)
CREATE TABLE IF NOT EXISTS envois (
  id              UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero_liste    TEXT        NOT NULL UNIQUE,
  exp_labo_id     UUID        NOT NULL REFERENCES laboratories(id),
  dest_labo_id    UUID        NOT NULL REFERENCES laboratories(id),
  temperature     TEXT        NOT NULL,
  transporteur    TEXT        NOT NULL,
  nb_echantillons INTEGER,
  departements    TEXT[]      DEFAULT '{}',
  statut          TEXT        NOT NULL DEFAULT 'En transit'
                              CHECK (statut IN ('En transit','Reçu','En attente','Problème','Perdu')),
  notes           TEXT        DEFAULT '',
  cree_par_id     UUID        REFERENCES profiles(id),
  cree_par_nom    TEXT        DEFAULT '',
  recep_par_nom   TEXT        DEFAULT '',
  recep_obs       TEXT        DEFAULT '',
  type_specimen   TEXT        DEFAULT 'exempt',
  glace_seche     BOOLEAN     DEFAULT FALSE,
  ts_envoi        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ts_recep        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Journal d'audit générique
CREATE TABLE IF NOT EXISTS envois_audit (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  table_name     TEXT        NOT NULL,
  record_id      UUID        NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[]      DEFAULT '{}',
  changed_by_id  UUID        REFERENCES auth.users(id),
  changed_by_nom TEXT        NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Laboratoires externes (destinataires hors-grappe)
-- Supporte les sous-laboratoires via parent_id (ex : HEJ → HEJ - Immunosupprimé)
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

-- Envois hors-grappe (vers laboratoires externes)
CREATE TABLE IF NOT EXISTS envois_hgrappe (
  id                  UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero              TEXT        NOT NULL UNIQUE,
  source              TEXT        NOT NULL DEFAULT 'silp'
                                  CHECK (source IN ('silp','hsilp')),
  exp_labo_id         UUID        NOT NULL REFERENCES laboratories(id),
  dest_ext_lab_id     UUID        NOT NULL REFERENCES external_labs(id),
  temperature         TEXT        NOT NULL,
  transporteur        TEXT        NOT NULL,
  nb_echantillons     INTEGER,
  numeros_silp        TEXT[]      DEFAULT '{}',
  statut              TEXT        NOT NULL DEFAULT 'En transit'
                                  CHECK (statut IN ('En transit','Reçu','Problème','Aucune réponse reçue')),
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

-- ============================================================
-- TRIGGERS — updated_at automatique
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_envois_updated
  BEFORE UPDATE ON envois
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_envois_hgrappe_updated
  BEFORE UPDATE ON envois_hgrappe
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FONCTIONS UTILITAIRES
-- ============================================================

-- Rôle de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_role_name()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- labo_id de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_labo_id()
RETURNS UUID AS $$
  SELECT labo_id FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- FONCTIONS — Envois intra-grappe (HSILP)
-- ============================================================

-- Aperçu du prochain numéro HSILP sans consommer la séquence
CREATE OR REPLACE FUNCTION peek_next_hsilp()
RETURNS TEXT AS $$
  SELECT 'HSILP' || LPAD(
    CAST(CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS TEXT),
    5, '0'
  ) FROM hsilp_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Création atomique d'un envoi Hors SILP avec numérotation séquentielle
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
  p_glace_seche     BOOLEAN
) RETURNS TEXT AS $$
DECLARE
  v_num TEXT;
BEGIN
  v_num := 'HSILP' || LPAD(CAST(nextval('hsilp_seq') AS TEXT), 5, '0');
  INSERT INTO envois (
    numero_liste, exp_labo_id, dest_labo_id,
    temperature, transporteur, nb_echantillons, departements,
    statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche
  ) VALUES (
    v_num, p_exp_labo_id, p_dest_labo_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_departements,
    'En transit', p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche
  );
  RETURN v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- FONCTIONS — Envois hors-grappe
-- ============================================================

-- Aperçu du prochain numéro HG (format HG-YYMMDD-NNNNN)
CREATE OR REPLACE FUNCTION peek_next_hgrappe()
RETURNS TEXT AS $$
  SELECT 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(CAST(
      CASE WHEN is_called THEN last_value + 1 ELSE last_value END
    AS TEXT), 5, '0')
  FROM hgrappe_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Création atomique d'un envoi hors-grappe
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
  p_glace_seche      BOOLEAN
) RETURNS JSON AS $$
DECLARE
  v_num   TEXT;
  v_token UUID;
BEGIN
  v_num := 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
           LPAD(CAST(nextval('hgrappe_seq') AS TEXT), 5, '0');
  INSERT INTO envois_hgrappe (
    numero, source, exp_labo_id, dest_ext_lab_id,
    temperature, transporteur, nb_echantillons, numeros_silp,
    statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche
  ) VALUES (
    v_num, p_source, p_exp_labo_id, p_dest_ext_lab_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_numeros_silp,
    'En transit', p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche
  ) RETURNING confirm_token INTO v_token;
  RETURN json_build_object('numero', v_num, 'token', v_token::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Récupération d'un envoi par token (page de confirmation publique)
CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_token(p_token UUID)
RETURNS JSON AS $$
DECLARE
  v_e          envois_hgrappe%ROWTYPE;
  v_exp_name   TEXT;
  v_dest_name  TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE confirm_token = p_token;
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;
  SELECT name INTO v_exp_name  FROM laboratories  WHERE id = v_e.exp_labo_id;
  SELECT name INTO v_dest_name FROM external_labs WHERE id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero',              v_e.numero,
    'exp',                 v_exp_name,
    'dest',                v_dest_name,
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Récupération d'un envoi par numéro + code de vérification (page de confirmation)
-- Code de vérification = 6 premiers caractères du confirm_token UUID sans tirets, majuscules
-- Ex. token a3f9b2c1-... → code A3F9B2 — imprimé sur le F-G-74
CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_e          envois_hgrappe%ROWTYPE;
  v_exp_name   TEXT;
  v_dest_name  TEXT;
  v_expected   TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE numero = upper(trim(p_numero));
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;
  v_expected := upper(substr(replace(v_e.confirm_token::text, '-', ''), 1, 6));
  IF upper(trim(p_verify_code)) != v_expected THEN
    RETURN json_build_object('error', 'wrong_code');
  END IF;
  SELECT name INTO v_exp_name  FROM laboratories  WHERE id = v_e.exp_labo_id;
  SELECT name INTO v_dest_name FROM external_labs WHERE id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero',              v_e.numero,
    'token',               v_e.confirm_token,
    'exp',                 v_exp_name,
    'dest',                v_dest_name,
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Config publique pour la page de confirmation (lisible par anon)
CREATE OR REPLACE FUNCTION get_hg_confirm_cfg()
RETURNS JSON AS $$
DECLARE
  v_val TEXT;
BEGIN
  SELECT value::text INTO v_val FROM app_config WHERE key = 'hgrappe_confirm_by_numero';
  RETURN json_build_object(
    'confirm_by_numero', COALESCE(v_val NOT IN ('false','null','""'), TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Confirmation de réception (accessible sans auth via anon key)
CREATE OR REPLACE FUNCTION confirm_envoi_hgrappe(
  p_token       UUID,
  p_conforme    BOOLEAN,
  p_nc_types    TEXT[],
  p_commentaire TEXT,
  p_recu_par    TEXT,
  p_ts_confirm  TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
  v_id     UUID;
  v_statut TEXT;
BEGIN
  SELECT id INTO v_id
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
  RETURN json_build_object('ok', true, 'statut', v_statut);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE laboratories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois         ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_config     ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_audit   ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_labs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_hgrappe ENABLE ROW LEVEL SECURITY;

-- ---- laboratories ----
CREATE POLICY "Lecture labos (tous)"
  ON laboratories FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion labos (admin)"
  ON laboratories FOR ALL TO authenticated
  USING (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- ---- profiles ----
CREATE POLICY "Lecture profil (soi-même)"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());
CREATE POLICY "Lecture profils (superviseurs)"
  ON profiles FOR SELECT TO authenticated
  USING (
    current_role_name() = 'admin'
    OR current_role_name() = 'superviseur_grappe'
    OR (current_role_name() = 'superviseur_labo' AND labo_id = current_labo_id())
  );
CREATE POLICY "Modification profils (superviseurs)"
  ON profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR current_role_name() = 'admin'
    OR current_role_name() = 'superviseur_grappe'
    OR (current_role_name() = 'superviseur_labo' AND labo_id = current_labo_id())
  )
  WITH CHECK (
    current_role_name() IN ('admin','superviseur_grappe','superviseur_labo')
    OR id = auth.uid()
  );
CREATE POLICY "Insertion profils (service role)"
  ON profiles FOR INSERT TO service_role WITH CHECK (true);

-- ---- envois ----
CREATE POLICY "Lecture envois (tous)"
  ON envois FOR SELECT TO authenticated USING (true);
CREATE POLICY "Création envois"
  ON envois FOR INSERT TO authenticated
  WITH CHECK (
    exp_labo_id = current_labo_id()
    OR current_role_name() IN ('superviseur_grappe','admin')
  );
CREATE POLICY "Mise à jour envois"
  ON envois FOR UPDATE TO authenticated
  USING (
    dest_labo_id = current_labo_id()
    OR exp_labo_id = current_labo_id()
    OR current_role_name() IN ('superviseur_grappe','admin')
  )
  WITH CHECK (true);

-- ---- app_config ----
CREATE POLICY "Lecture config (tous)"
  ON app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lecture config (anon)"
  ON app_config FOR SELECT TO anon USING (true);
CREATE POLICY "Gestion config (admin)"
  ON app_config FOR ALL TO authenticated
  USING (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- ---- envois_audit ----
CREATE POLICY "Insertion audit"
  ON envois_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Lecture audit"
  ON envois_audit FOR SELECT TO authenticated USING (true);

-- ---- external_labs ----
CREATE POLICY "Lecture external_labs (tous)"
  ON external_labs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion external_labs (admin)"
  ON external_labs FOR ALL TO authenticated
  USING (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- ---- envois_hgrappe ----
CREATE POLICY "Lecture envois_hgrappe (tous)"
  ON envois_hgrappe FOR SELECT TO authenticated USING (true);
CREATE POLICY "Création envois_hgrappe"
  ON envois_hgrappe FOR INSERT TO authenticated
  WITH CHECK (
    exp_labo_id = current_labo_id()
    OR current_role_name() IN ('superviseur_grappe','admin')
  );
CREATE POLICY "Mise à jour envois_hgrappe"
  ON envois_hgrappe FOR UPDATE TO authenticated
  USING (
    exp_labo_id = current_labo_id()
    OR current_role_name() IN ('superviseur_grappe','admin')
  )
  WITH CHECK (true);

-- ============================================================
-- DROITS D'EXÉCUTION
-- ============================================================

GRANT EXECUTE ON FUNCTION peek_next_hsilp()   TO authenticated;
GRANT EXECUTE ON FUNCTION peek_next_hgrappe() TO authenticated;

GRANT EXECUTE ON FUNCTION create_envoi_hsilp(UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN)
  TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hgrappe(TEXT,UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN)
  TO authenticated;

-- Accessibles sans authentification (page de confirmation publique)
GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_token(UUID)                         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_numero(TEXT, TEXT)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_hg_confirm_cfg()                                     TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_envoi_hgrappe(UUID,BOOLEAN,TEXT[],TEXT,TEXT,TIMESTAMPTZ) TO anon, authenticated;

-- ============================================================
-- INDEX — performances
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_envois_exp_labo   ON envois(exp_labo_id);
CREATE INDEX IF NOT EXISTS idx_envois_dest_labo  ON envois(dest_labo_id);
CREATE INDEX IF NOT EXISTS idx_envois_statut     ON envois(statut);
CREATE INDEX IF NOT EXISTS idx_envois_ts_envoi   ON envois(ts_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_envois_numero     ON envois(numero_liste);
CREATE INDEX IF NOT EXISTS idx_profiles_emp_id   ON profiles(employee_id);
CREATE INDEX IF NOT EXISTS idx_profiles_labo     ON profiles(labo_id);
CREATE INDEX IF NOT EXISTS idx_audit_record      ON envois_audit(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed     ON envois_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_by          ON envois_audit(changed_by_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_exp       ON envois_hgrappe(exp_labo_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_dest      ON envois_hgrappe(dest_ext_lab_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_statut    ON envois_hgrappe(statut);
CREATE INDEX IF NOT EXISTS idx_hgrappe_ts        ON envois_hgrappe(ts_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_hgrappe_token     ON envois_hgrappe(confirm_token);
CREATE INDEX IF NOT EXISTS idx_hgrappe_numero    ON envois_hgrappe(numero);
CREATE INDEX IF NOT EXISTS idx_ext_labs_name     ON external_labs(name);
CREATE INDEX IF NOT EXISTS idx_ext_labs_par      ON external_labs(parent_id);

-- ============================================================
-- REALTIME — publications temps réel
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE envois;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE app_config;
ALTER PUBLICATION supabase_realtime ADD TABLE envois_hgrappe;
