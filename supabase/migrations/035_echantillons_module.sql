-- ============================================================
-- Migration 035 — Module Gestion des échantillons
-- Ajout du suivi de codes-barres d'échantillons sur les envois
-- hors-SILP (intra-grappe et hors-grappe).
--
-- Nouvelles colonnes :
--   envois.echantillons_depart     : codes-barres scannés au départ
--   envois.echantillons_reception  : codes-barres scannés à la réception
--   envois_hgrappe.echantillons_depart : codes-barres au départ (HG, pas de réception)
--
-- Fonctions mises à jour :
--   create_envoi_hsilp   + p_echantillons_depart (défaut '{}'  )
--   create_envoi_hgrappe + p_echantillons_depart (défaut '{}')
-- ============================================================

-- ── 1. Colonnes ───────────────────────────────────────────────────────────────

ALTER TABLE envois
  ADD COLUMN IF NOT EXISTS echantillons_depart    TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS echantillons_reception TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE envois_hgrappe
  ADD COLUMN IF NOT EXISTS echantillons_depart TEXT[] NOT NULL DEFAULT '{}';

-- ── 2. Index GIN pour recherche par code-barres ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_envois_echantillons_depart
  ON envois USING GIN(echantillons_depart);

CREATE INDEX IF NOT EXISTS idx_envois_echantillons_reception
  ON envois USING GIN(echantillons_reception);

CREATE INDEX IF NOT EXISTS idx_envois_hgrappe_echantillons_depart
  ON envois_hgrappe USING GIN(echantillons_depart);

-- ── 3. Mise à jour create_envoi_hsilp ─────────────────────────────────────────

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
  p_echantillons_depart TEXT[]  DEFAULT '{}'
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
    echantillons_depart
  ) VALUES (
    p_exp_labo_id, p_dest_labo_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_departements,
    p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche, '{}',
    p_echantillons_depart
  ) RETURNING numero INTO v_num;

  RETURN v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = 'public';

-- ── 4. Mise à jour create_envoi_hgrappe ───────────────────────────────────────

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
  p_echantillons_depart  TEXT[]  DEFAULT '{}'
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
    echantillons_depart
  ) VALUES (
    v_num, p_source, p_exp_labo_id, p_dest_ext_lab_id, p_temperature, p_transporteur,
    p_nb_echantillons, p_numeros_silp, p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche,
    p_echantillons_depart
  ) RETURNING confirm_token INTO v_token;
  RETURN json_build_object('numero', v_num, 'token', v_token::text);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = 'public';
