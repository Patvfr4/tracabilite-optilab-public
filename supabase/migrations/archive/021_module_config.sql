-- ============================================================
-- Migration 021 — Module_config + transporteur BD
-- Système de modules activables par laboratoire.
-- Premier module : bons_depart (transporteur à la création du bon).
-- ============================================================

-- 1. Table module_config
CREATE TABLE IF NOT EXISTS module_config (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  module     TEXT        NOT NULL,
  labo_id    UUID        REFERENCES laboratories(id) ON DELETE CASCADE,
  active     BOOLEAN     NOT NULL DEFAULT false,
  config     JSONB       DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(module, labo_id)
);

-- 2. Fonction is_module_active(module, labo_id)
CREATE OR REPLACE FUNCTION is_module_active(p_module TEXT, p_labo_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT COALESCE(
    (SELECT active FROM module_config WHERE module = p_module AND labo_id = p_labo_id),
    false
  );
$$;

-- 3. Migration des données existantes depuis app_config
INSERT INTO module_config (module, labo_id, active)
SELECT 'bons_depart', lab_id::UUID, true
FROM (
  SELECT jsonb_array_elements_text(value) AS lab_id
  FROM app_config
  WHERE key = 'bons_depart_enabled_labs'
) sub
ON CONFLICT (module, labo_id) DO UPDATE SET active = EXCLUDED.active;

-- 4. Rendre envois.transporteur nullable (transporteur assigné lors du bon si BD actif)
ALTER TABLE envois ALTER COLUMN transporteur DROP NOT NULL;
ALTER TABLE envois ALTER COLUMN transporteur SET DEFAULT '';

-- 5. RLS
ALTER TABLE module_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture module_config"
  ON module_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Ecriture module_config"
  ON module_config FOR ALL TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- 6. Mise à jour create_bon_depart : accepte p_transporteur_map JSONB optionnel
--    { "<envoi_id>": "Purolator", "<hg_envoi_id>": "FedEx" }
--    Met à jour envois.transporteur avant de créer les sections.
DROP FUNCTION IF EXISTS create_bon_depart(UUID, UUID, TEXT, UUID[], UUID[], JSONB);

CREATE OR REPLACE FUNCTION create_bon_depart(
  p_labo_id            UUID,
  p_cree_par_id        UUID,
  p_cree_par_nom       TEXT,
  p_envoi_ids          UUID[],
  p_hg_envoi_ids       UUID[],
  p_bon_connaissements JSONB,
  p_transporteur_map   JSONB DEFAULT NULL
) RETURNS JSON AS $$
DECLARE
  v_num    TEXT;
  v_bon_id UUID;
BEGIN
  IF NOT (p_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  IF cardinality(p_envoi_ids) = 0 AND cardinality(p_hg_envoi_ids) = 0 THEN
    RAISE EXCEPTION 'Aucun envoi sélectionné';
  END IF;

  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids)
      AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN
    RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.';
  END IF;

  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids)
      AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN
    RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente ou n''appartiennent pas à ce laboratoire.';
  END IF;

  -- Appliquer la carte transporteur si fournie
  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois
      SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids)
        AND p_transporteur_map->>(id::text) IS NOT NULL
        AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe
      SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids)
        AND p_transporteur_map->>(id::text) IS NOT NULL
        AND p_transporteur_map->>(id::text) != '';
    END IF;
  END IF;

  -- Vérifier que tous les envois ont un transporteur non-vide
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids)
      AND (transporteur IS NULL OR transporteur = '')
  ) THEN
    RAISE EXCEPTION 'Un ou plusieurs envois n''ont pas de transporteur assigné.';
  END IF;

  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids)
      AND (transporteur IS NULL OR transporteur = '')
  ) THEN
    RAISE EXCEPTION 'Un ou plusieurs envois HG n''ont pas de transporteur assigné.';
  END IF;

  v_num := 'BD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(CAST(nextval('bd_seq') AS TEXT), 4, '0');

  INSERT INTO bons_depart (numero, labo_id, cree_par_id, cree_par_nom)
  VALUES (v_num, p_labo_id, p_cree_par_id, p_cree_par_nom)
  RETURNING id INTO v_bon_id;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type)
    SELECT v_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;

  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type)
    SELECT v_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT v_bon_id, t.tr, COALESCE(p_bon_connaissements->>(t.tr), '')
  FROM (
    SELECT transporteur AS tr FROM envois        WHERE id = ANY(p_envoi_ids)    AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('numero', v_num, 'id', v_bon_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Mise à jour add_envois_to_bon : même pattern
DROP FUNCTION IF EXISTS add_envois_to_bon(UUID, UUID[], UUID[]);

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

  IF EXISTS (
    SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
    WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit')
  ) OR EXISTS (
    SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
    WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit')
  ) THEN
    RAISE EXCEPTION 'Impossible d''ajouter : au moins un envoi du bon a été réceptionné.';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible d''ajouter : la date de prise en charge a été renseignée.';
  END IF;

  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;

  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente.'; END IF;

  -- Appliquer la carte transporteur si fournie
  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois
      SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids)
        AND p_transporteur_map->>(id::text) IS NOT NULL
        AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe
      SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids)
        AND p_transporteur_map->>(id::text) IS NOT NULL
        AND p_transporteur_map->>(id::text) != '';
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
    SELECT transporteur AS tr FROM envois        WHERE id = ANY(p_envoi_ids)    AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Grants
GRANT EXECUTE ON FUNCTION is_module_active(TEXT, UUID)                              TO authenticated;
GRANT EXECUTE ON FUNCTION create_bon_depart(UUID,UUID,TEXT,UUID[],UUID[],JSONB,JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION add_envois_to_bon(UUID,UUID[],UUID[],JSONB)               TO authenticated;

-- 9. Index
CREATE INDEX IF NOT EXISTS idx_module_config_module_labo ON module_config(module, labo_id);
