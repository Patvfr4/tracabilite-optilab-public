-- Migration 040 : Gestion des valeurs pondérées (Workload) — codes ICR
-- Table référentiel icr_codes, colonnes hors_corridor + codes_icr sur envois,
-- fonctions de calcul automatique et RPC de statistiques.

SET search_path = 'public';

-- ── 1. Table référentiel ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS icr_codes (
  code    TEXT    PRIMARY KEY,
  libelle TEXT    NOT NULL,
  actif   BOOLEAN NOT NULL DEFAULT TRUE,
  ordre   INT     NOT NULL DEFAULT 0
);

ALTER TABLE icr_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "icr_codes_read"  ON icr_codes FOR SELECT USING (TRUE);
CREATE POLICY "icr_codes_admin" ON icr_codes FOR ALL USING (current_role_name() = 'admin');

INSERT INTO icr_codes (code, libelle, ordre) VALUES
  ('70008', 'Glace sèche',              1),
  ('70009', 'Transport hors corridor',  2)
ON CONFLICT (code) DO NOTHING;

-- ── 2. Colonnes sur envois ────────────────────────────────────────────────────

ALTER TABLE envois
  ADD COLUMN IF NOT EXISTS hors_corridor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS codes_icr     TEXT[]  NOT NULL DEFAULT '{}';

ALTER TABLE envois_hgrappe
  ADD COLUMN IF NOT EXISTS hors_corridor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS codes_icr     TEXT[]  NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_envois_codes_icr         ON envois         USING GIN(codes_icr);
CREATE INDEX IF NOT EXISTS idx_envois_hgrappe_codes_icr ON envois_hgrappe USING GIN(codes_icr);

-- ── 3. Calcul automatique des codes ICR ──────────────────────────────────────

CREATE OR REPLACE FUNCTION _compute_codes_icr(p_glace_seche BOOLEAN, p_hors_corridor BOOLEAN)
RETURNS TEXT[]
LANGUAGE sql STABLE
SET search_path = 'public'
AS $$
  SELECT COALESCE(ARRAY(
    SELECT c.code FROM icr_codes c
    WHERE c.actif = TRUE AND (
      (c.code = '70008' AND p_glace_seche    = TRUE)
      OR
      (c.code = '70009' AND p_hors_corridor  = TRUE)
    )
    ORDER BY c.ordre
  ), '{}');
$$;

-- ── 4. Mise à jour create_envoi_hsilp ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION create_envoi_hsilp(
  p_exp_labo_id         UUID,
  p_dest_labo_id        UUID,
  p_temperature         TEXT,
  p_transporteur        TEXT,
  p_nb_echantillons     INTEGER,
  p_departements        TEXT[],
  p_notes               TEXT,
  p_cree_par_id         UUID,
  p_cree_par_nom        TEXT,
  p_type_specimen       TEXT,
  p_glace_seche         BOOLEAN,
  p_statut              TEXT    DEFAULT 'En transit',
  p_echantillons_depart TEXT[]  DEFAULT '{}',
  p_hors_corridor       BOOLEAN DEFAULT FALSE
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
    ts_envoi, type_specimen, glace_seche, numeros_silp,
    echantillons_depart,
    hors_corridor, codes_icr
  ) VALUES (
    p_exp_labo_id, p_dest_labo_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_departements,
    p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche, '{}',
    p_echantillons_depart,
    p_hors_corridor, _compute_codes_icr(p_glace_seche, p_hors_corridor)
  ) RETURNING numero INTO v_num;

  RETURN v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = 'public';

-- ── 5. Mise à jour create_envoi_hgrappe ───────────────────────────────────────

CREATE OR REPLACE FUNCTION create_envoi_hgrappe(
  p_source               TEXT,
  p_exp_labo_id          UUID,
  p_dest_ext_lab_id      UUID,
  p_temperature          TEXT,
  p_transporteur         TEXT,
  p_nb_echantillons      INTEGER,
  p_numeros_silp         TEXT[],
  p_notes                TEXT,
  p_cree_par_id          UUID,
  p_cree_par_nom         TEXT,
  p_type_specimen        TEXT,
  p_glace_seche          BOOLEAN,
  p_statut               TEXT    DEFAULT 'En transit',
  p_echantillons_depart  TEXT[]  DEFAULT '{}',
  p_hors_corridor        BOOLEAN DEFAULT FALSE
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
    ts_envoi, type_specimen, glace_seche,
    echantillons_depart,
    hors_corridor, codes_icr
  ) VALUES (
    v_num, p_source, p_exp_labo_id, p_dest_ext_lab_id, p_temperature, p_transporteur,
    p_nb_echantillons, p_numeros_silp, p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche,
    p_echantillons_depart,
    p_hors_corridor, _compute_codes_icr(p_glace_seche, p_hors_corridor)
  ) RETURNING confirm_token INTO v_token;
  RETURN json_build_object('numero', v_num, 'token', v_token::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = 'public';

-- ── 6. RPC statistiques ICR ───────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_icr_stats(p_labo_id UUID, p_days INT DEFAULT 30)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'code',       ic.code,
      'libelle',    ic.libelle,
      'nb_intra',   (
        SELECT COUNT(*) FROM envois
        WHERE exp_labo_id = p_labo_id
          AND ts_envoi >= NOW() - (p_days || ' days')::INTERVAL
          AND codes_icr @> ARRAY[ic.code]
      ),
      'nb_hgrappe', (
        SELECT COUNT(*) FROM envois_hgrappe
        WHERE exp_labo_id = p_labo_id
          AND ts_envoi >= NOW() - (p_days || ' days')::INTERVAL
          AND codes_icr @> ARRAY[ic.code]
      )
    ) ORDER BY ic.ordre)
    FROM icr_codes ic WHERE ic.actif = TRUE
  );
END;
$$;
