-- ============================================================
-- OPTILAB BSL-GAS — Migration Hors SILP
-- Séquence atomique + fonctions pour les numéros HSILP
-- ============================================================

-- Séquence dédiée aux envois Hors SILP
CREATE SEQUENCE IF NOT EXISTS hsilp_seq START 1 INCREMENT 1;

-- Aperçu du prochain numéro sans consommer la séquence
CREATE OR REPLACE FUNCTION peek_next_hsilp()
RETURNS TEXT AS $$
  SELECT 'HSILP' || LPAD(
    CAST(CASE WHEN is_called THEN last_value + 1 ELSE last_value END AS TEXT),
    5, '0'
  ) FROM hsilp_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Création atomique d'un envoi Hors SILP avec numérotation via nextval
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

-- Droits d'exécution pour les utilisateurs authentifiés
GRANT EXECUTE ON FUNCTION peek_next_hsilp() TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hsilp(UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN) TO authenticated;
