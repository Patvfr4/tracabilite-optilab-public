-- ============================================================
-- Migration 015 — Bons de départ
-- ============================================================

-- 1. Ajout du statut 'En attente' sur les deux tables d'envois
ALTER TABLE envois
  DROP CONSTRAINT IF EXISTS envois_statut_check,
  ADD CONSTRAINT envois_statut_check
    CHECK (statut IN ('En attente','En transit','Reçu','Problème','Perdu'));

ALTER TABLE envois_hgrappe
  DROP CONSTRAINT IF EXISTS envois_hgrappe_statut_check,
  ADD CONSTRAINT envois_hgrappe_statut_check
    CHECK (statut IN ('En attente','En transit','Reçu','Problème','Aucune réponse reçue'));

-- 2. Séquence de numérotation des bons
CREATE SEQUENCE IF NOT EXISTS bd_seq START 1 INCREMENT 1;

-- 3. Table principale
CREATE TABLE IF NOT EXISTS bons_depart (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  numero       TEXT        NOT NULL UNIQUE,
  labo_id      UUID        NOT NULL REFERENCES laboratories(id),
  cree_par_id  UUID        NOT NULL REFERENCES profiles(id),
  cree_par_nom TEXT        NOT NULL DEFAULT '',
  statut       TEXT        NOT NULL DEFAULT 'actif'
                           CHECK (statut IN ('actif','annulé')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Sections par transporteur (une par transporteur unique par bon)
CREATE TABLE IF NOT EXISTS bons_depart_sections (
  id                    UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  bon_id                UUID  NOT NULL REFERENCES bons_depart(id) ON DELETE CASCADE,
  transporteur          TEXT  NOT NULL,
  bon_connaissement     TEXT  NOT NULL DEFAULT '',
  date_prise_en_charge  TIMESTAMPTZ,
  nom_transporteur_reel TEXT  NOT NULL DEFAULT '',
  UNIQUE(bon_id, transporteur)
);

-- 5. Liaison envois ↔ bon de départ
CREATE TABLE IF NOT EXISTS bons_depart_envois (
  id          UUID  DEFAULT uuid_generate_v4() PRIMARY KEY,
  bon_id      UUID  NOT NULL REFERENCES bons_depart(id) ON DELETE CASCADE,
  envoi_id    UUID  REFERENCES envois(id),
  hg_envoi_id UUID  REFERENCES envois_hgrappe(id),
  type        TEXT  NOT NULL CHECK (type IN ('intra','hg')),
  CONSTRAINT bde_one_type CHECK (
    (type = 'intra' AND envoi_id    IS NOT NULL AND hg_envoi_id IS NULL) OR
    (type = 'hg'    AND hg_envoi_id IS NOT NULL AND envoi_id    IS NULL)
  )
);

-- 6. RLS
ALTER TABLE bons_depart          ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_depart_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE bons_depart_envois   ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Lecture bons_depart"
  ON bons_depart FOR SELECT TO authenticated
  USING (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));

CREATE POLICY "Création bons_depart"
  ON bons_depart FOR INSERT TO authenticated
  WITH CHECK (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'));

CREATE POLICY "Mise à jour bons_depart"
  ON bons_depart FOR UPDATE TO authenticated
  USING (labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'))
  WITH CHECK (true);

CREATE POLICY "Lecture bons_depart_sections"
  ON bons_depart_sections FOR SELECT TO authenticated USING (true);

CREATE POLICY "Mise à jour bons_depart_sections"
  ON bons_depart_sections FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM bons_depart bd WHERE bd.id = bon_id
      AND (bd.labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin'))
  ))
  WITH CHECK (true);

CREATE POLICY "Lecture bons_depart_envois"
  ON bons_depart_envois FOR SELECT TO authenticated USING (true);

-- 7. Fonction : création atomique d'un bon de départ
CREATE OR REPLACE FUNCTION create_bon_depart(
  p_labo_id            UUID,
  p_cree_par_id        UUID,
  p_cree_par_nom       TEXT,
  p_envoi_ids          UUID[],
  p_hg_envoi_ids       UUID[],
  p_bon_connaissements JSONB
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
    SELECT transporteur AS tr FROM envois        WHERE id = ANY(p_envoi_ids)
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids)
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('numero', v_num, 'id', v_bon_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Fonction : annulation atomique
CREATE OR REPLACE FUNCTION cancel_bon_depart(p_bon_id UUID)
RETURNS JSON AS $$
DECLARE v_labo_id UUID;
BEGIN
  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = p_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou déjà annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  -- Vérification des verrous métier
  IF EXISTS (
    SELECT 1 FROM bons_depart_envois bde
    JOIN envois e ON bde.envoi_id = e.id
    WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit')
  ) OR EXISTS (
    SELECT 1 FROM bons_depart_envois bde
    JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
    WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit')
  ) THEN
    RAISE EXCEPTION 'Impossible d''annuler : au moins un envoi a été réceptionné.';
  END IF;
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

-- 9. Fonction : retrait d'un envoi d'un bon actif
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

  -- Vérification des verrous métier
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = v_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible de retirer un envoi : la date de prise en charge a été renseignée.';
  END IF;
  IF v_type = 'intra' THEN
    IF EXISTS (SELECT 1 FROM envois WHERE id = v_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
  ELSE
    IF EXISTS (SELECT 1 FROM envois_hgrappe WHERE id = v_hg_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
  END IF;

  IF v_type = 'intra' THEN
    UPDATE envois SET statut = 'En attente', ts_envoi = created_at WHERE id = v_envoi_id;
  ELSE
    UPDATE envois_hgrappe SET statut = 'En attente', ts_envoi = created_at WHERE id = v_hg_envoi_id;
  END IF;

  DELETE FROM bons_depart_envois WHERE id = p_link_id;
  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Mise à jour de create_envoi_hsilp (ajout p_statut)
DROP FUNCTION IF EXISTS create_envoi_hsilp(UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN);

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
  IF NOT (p_exp_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi pour ce laboratoire.';
  END IF;
  v_num := 'HSILP' || LPAD(CAST(nextval('hsilp_seq') AS TEXT), 5, '0');
  INSERT INTO envois (
    numero_liste, exp_labo_id, dest_labo_id, temperature, transporteur,
    nb_echantillons, departements, statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche
  ) VALUES (
    v_num, p_exp_labo_id, p_dest_labo_id, p_temperature, p_transporteur,
    p_nb_echantillons, p_departements, p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche
  );
  RETURN v_num;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 11. Mise à jour de create_envoi_hgrappe (ajout p_statut)
DROP FUNCTION IF EXISTS create_envoi_hgrappe(TEXT,UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN);

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
  IF NOT (p_exp_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi hors-grappe pour ce laboratoire.';
  END IF;
  v_num := 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' || LPAD(CAST(nextval('hgrappe_seq') AS TEXT), 5, '0');
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

-- 12. Fonction : ajout d'envois à un bon existant
CREATE OR REPLACE FUNCTION add_envois_to_bon(
  p_bon_id       UUID,
  p_envoi_ids    UUID[],
  p_hg_envoi_ids UUID[]
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

  -- Verrous métier
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

  -- Validation
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;

  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente.'; END IF;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type)
    SELECT p_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;

  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type)
    SELECT p_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  -- Créer les sections manquantes pour les nouveaux transporteurs
  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT p_bon_id, t.tr, ''
  FROM (
    SELECT transporteur AS tr FROM envois        WHERE id = ANY(p_envoi_ids)
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids)
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Grants
GRANT EXECUTE ON FUNCTION create_bon_depart(UUID,UUID,TEXT,UUID[],UUID[],JSONB)       TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_bon_depart(UUID)                                      TO authenticated;
GRANT EXECUTE ON FUNCTION remove_envoi_from_bon(UUID)                                  TO authenticated;
GRANT EXECUTE ON FUNCTION add_envois_to_bon(UUID,UUID[],UUID[])                        TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hsilp(UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN,TEXT)   TO authenticated;
GRANT EXECUTE ON FUNCTION create_envoi_hgrappe(TEXT,UUID,UUID,TEXT,TEXT,INTEGER,TEXT[],TEXT,UUID,TEXT,TEXT,BOOLEAN,TEXT) TO authenticated;

-- Si la table existait déjà avec DATE, la convertir en TIMESTAMPTZ
ALTER TABLE IF EXISTS bons_depart_sections
  ALTER COLUMN date_prise_en_charge TYPE TIMESTAMPTZ
  USING date_prise_en_charge::TIMESTAMPTZ;

-- 13. Index
CREATE INDEX IF NOT EXISTS idx_bons_depart_labo    ON bons_depart(labo_id);
CREATE INDEX IF NOT EXISTS idx_bons_depart_statut  ON bons_depart(statut);
CREATE INDEX IF NOT EXISTS idx_bons_depart_created ON bons_depart(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_envois_bon       ON bons_depart_envois(bon_id);
CREATE INDEX IF NOT EXISTS idx_bd_envois_envoi_id  ON bons_depart_envois(envoi_id) WHERE envoi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bd_envois_hg_id     ON bons_depart_envois(hg_envoi_id) WHERE hg_envoi_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bd_sections_bon     ON bons_depart_sections(bon_id);

-- ============================================================
-- 14. Statut 'récupéré' — mise à jour automatique
-- ============================================================

-- Mettre à jour la contrainte pour inclure 'récupéré'
ALTER TABLE bons_depart DROP CONSTRAINT IF EXISTS bons_depart_statut_check;
ALTER TABLE bons_depart ADD CONSTRAINT bons_depart_statut_check
  CHECK (statut IN ('actif','récupéré','annulé'));

-- Fonction centrale : vérifie si le bon doit passer en 'récupéré'
CREATE OR REPLACE FUNCTION check_bon_completion(p_bon_id UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE bons_depart SET statut = 'récupéré'
  WHERE id = p_bon_id
    AND statut = 'actif'
    AND (
      EXISTS (
        SELECT 1 FROM bons_depart_sections
        WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM bons_depart_envois bde
        JOIN envois e ON bde.envoi_id = e.id
        WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit')
      )
      OR EXISTS (
        SELECT 1 FROM bons_depart_envois bde
        JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
        WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit')
      )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION check_bon_completion(UUID) TO authenticated;

-- Trigger : date de prise en charge renseignée sur une section
CREATE OR REPLACE FUNCTION trg_bd_section_completion()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.date_prise_en_charge IS NOT NULL THEN
    PERFORM check_bon_completion(NEW.bon_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_bd_sections_after_update ON bons_depart_sections;
CREATE TRIGGER trg_bd_sections_after_update
  AFTER UPDATE ON bons_depart_sections
  FOR EACH ROW EXECUTE FUNCTION trg_bd_section_completion();

-- Trigger : envoi intra réceptionné
CREATE OR REPLACE FUNCTION trg_envois_bon_completion()
RETURNS TRIGGER AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit')
     AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id
    FROM bons_depart_envois
    WHERE envoi_id = NEW.id
    LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_envois_bon_completion ON envois;
CREATE TRIGGER trg_envois_bon_completion
  AFTER UPDATE ON envois
  FOR EACH ROW EXECUTE FUNCTION trg_envois_bon_completion();

-- Trigger : envoi HG réceptionné
CREATE OR REPLACE FUNCTION trg_hgrappe_bon_completion()
RETURNS TRIGGER AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit')
     AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id
    FROM bons_depart_envois
    WHERE hg_envoi_id = NEW.id
    LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_hgrappe_bon_completion ON envois_hgrappe;
CREATE TRIGGER trg_hgrappe_bon_completion
  AFTER UPDATE ON envois_hgrappe
  FOR EACH ROW EXECUTE FUNCTION trg_hgrappe_bon_completion();
