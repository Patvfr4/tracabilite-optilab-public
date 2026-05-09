-- ============================================================
-- OPTILAB BSL-GAS — Migration 006 : Mode Hors-grappe
-- Nouvelles tables : external_labs, envois_hgrappe
-- Nouvelles fonctions : create_envoi_hgrappe, confirm_envoi_hgrappe,
--                       get_envoi_hgrappe_by_token, peek_next_hgrappe
-- Modification table laboratories : colonnes fax
-- ============================================================

-- ── Séquence de numérotation HGRAPPE ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS hgrappe_seq START 1 INCREMENT 1;

-- ── Laboratoires externes (destinataires hors-grappe) ───────────────────────
-- Supporte les sous-laboratoires via parent_id (ex : HEJ → HEJ - Immunosupprimé)
CREATE TABLE IF NOT EXISTS external_labs (
  id          UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name        TEXT        NOT NULL,
  parent_id   UUID        REFERENCES external_labs(id) ON DELETE SET NULL,
  adresse     TEXT        DEFAULT '',
  ville       TEXT        DEFAULT '',
  telephone   TEXT        DEFAULT '',
  active      BOOLEAN     DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Numéros de fax par département sur les labos expéditeurs ────────────────
ALTER TABLE laboratories
  ADD COLUMN IF NOT EXISTS fax_bio_hema TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fax_micro    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fax_patho    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS fax_general  TEXT DEFAULT '';

-- ── Envois hors-grappe ───────────────────────────────────────────────────────
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
                                  CHECK (statut IN ('En transit','Reçu','Problème')),
  notes               TEXT        DEFAULT '',
  cree_par_id         UUID        REFERENCES profiles(id),
  cree_par_nom        TEXT        DEFAULT '',
  type_specimen       TEXT        DEFAULT 'exempt',
  glace_seche         BOOLEAN     DEFAULT FALSE,
  -- Token unique pour la page de confirmation publique
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

CREATE TRIGGER trg_envois_hgrappe_updated
  BEFORE UPDATE ON envois_hgrappe
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- FONCTIONS
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

-- Récupération d'un envoi par son token de confirmation (accessible sans auth)
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
  SELECT name INTO v_exp_name FROM laboratories  WHERE id = v_e.exp_labo_id;
  SELECT name INTO v_dest_name FROM external_labs WHERE id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero',            v_e.numero,
    'exp',               v_exp_name,
    'dest',              v_dest_name,
    'temperature',       v_e.temperature,
    'transporteur',      v_e.transporteur,
    'nb_echantillons',   v_e.nb_echantillons,
    'ts_envoi',          v_e.ts_envoi,
    'statut',            v_e.statut,
    'already_confirmed', v_e.ts_confirm IS NOT NULL,
    'confirm_conforme',  v_e.confirm_conforme,
    'confirm_nc_types',  v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire,
    'ts_confirm',        v_e.ts_confirm,
    'confirm_recu_par',  v_e.confirm_recu_par,
    'confirm_method',    v_e.confirm_method
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

ALTER TABLE external_labs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE envois_hgrappe ENABLE ROW LEVEL SECURITY;

-- external_labs : lecture pour tous les authentifiés, écriture admin
CREATE POLICY "Lecture external_labs (tous)"
  ON external_labs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Gestion external_labs (admin)"
  ON external_labs FOR ALL TO authenticated
  USING (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- envois_hgrappe : lecture globale, création/modif par le labo expéditeur ou superviseurs
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

GRANT EXECUTE ON FUNCTION peek_next_hgrappe() TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hgrappe(TEXT,UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;
-- Accessibles sans authentification (page de confirmation publique)
GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_token(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION confirm_envoi_hgrappe(UUID,BOOLEAN,TEXT[],TEXT,TEXT,TIMESTAMPTZ) TO anon, authenticated;

-- ============================================================
-- INDEX
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_hgrappe_exp    ON envois_hgrappe(exp_labo_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_dest   ON envois_hgrappe(dest_ext_lab_id);
CREATE INDEX IF NOT EXISTS idx_hgrappe_statut ON envois_hgrappe(statut);
CREATE INDEX IF NOT EXISTS idx_hgrappe_ts     ON envois_hgrappe(ts_envoi DESC);
CREATE INDEX IF NOT EXISTS idx_hgrappe_token  ON envois_hgrappe(confirm_token);
CREATE INDEX IF NOT EXISTS idx_ext_labs_name  ON external_labs(name);
CREATE INDEX IF NOT EXISTS idx_ext_labs_par   ON external_labs(parent_id);

-- ============================================================
-- REALTIME
-- ============================================================

ALTER PUBLICATION supabase_realtime ADD TABLE envois_hgrappe;
