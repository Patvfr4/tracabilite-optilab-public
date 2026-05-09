-- ============================================================
-- Migration 016 : Numéros SILP multiples + identifiant interne
-- ============================================================
-- Remplace numero_liste (TEXT UNIQUE) par :
--   • numero        TEXT UNIQUE  — identifiant interne auto-généré (SILP-YYMMDD-NNNNN)
--   • numeros_silp  TEXT[]       — liste des numéros de listes de repérage physiques
-- ============================================================

-- 1. Séquence pour les numéros d'envoi internes
CREATE SEQUENCE IF NOT EXISTS envoi_seq START 1 INCREMENT 1;

-- 2. Nouvelles colonnes
ALTER TABLE envois
  ADD COLUMN IF NOT EXISTS numero       TEXT,
  ADD COLUMN IF NOT EXISTS numeros_silp TEXT[] NOT NULL DEFAULT '{}';

-- 3. Migration des données existantes
--    • Envois SILP  : copier numero_liste dans numeros_silp
--    • Envois HSILP : numeros_silp reste vide (pas de liste physique)
UPDATE envois
SET numeros_silp = ARRAY[numero_liste]
WHERE numero_liste IS NOT NULL
  AND numero_liste NOT LIKE 'HSILP%';

-- 4. Générer un numéro interne SILP-YYMMDD-NNNNN pour chaque envoi existant
--    Ordre chronologique pour conserver la cohérence des numéros de séquence
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT id, ts_envoi, numeros_silp
    FROM envois
    ORDER BY ts_envoi ASC, created_at ASC
  LOOP
    IF r.numeros_silp IS NULL OR array_length(r.numeros_silp, 1) IS NULL THEN
      UPDATE envois
      SET numero = 'HSILP-' || TO_CHAR(r.ts_envoi, 'YYMMDD') || '-' ||
                   LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0')
      WHERE id = r.id;
    ELSE
      UPDATE envois
      SET numero = 'SILP-' || TO_CHAR(r.ts_envoi, 'YYMMDD') || '-' ||
                   LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0')
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;

-- 5. Contraintes sur le nouveau champ numero
ALTER TABLE envois ALTER COLUMN numero SET NOT NULL;
ALTER TABLE envois ADD CONSTRAINT envois_numero_unique UNIQUE (numero);

-- 6. Trigger : auto-générer numero lors d'un INSERT
--    SILP-  si numeros_silp est non vide (envoi avec liste de repérage)
--    HSILP- si numeros_silp est vide     (envoi sans liste de repérage)
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

DROP TRIGGER IF EXISTS trg_envoi_numero ON envois;
CREATE TRIGGER trg_envoi_numero
  BEFORE INSERT ON envois
  FOR EACH ROW EXECUTE FUNCTION generate_envoi_numero();

-- 7. Index pour les recherches
CREATE INDEX IF NOT EXISTS idx_envois_numero       ON envois(numero);
CREATE INDEX IF NOT EXISTS idx_envois_numeros_silp ON envois USING GIN (numeros_silp);

-- 8. Mise à jour de peek_next_hsilp
--    Retourne maintenant un numéro HSILP-YYMMDD-NNNNN
CREATE OR REPLACE FUNCTION peek_next_hsilp()
RETURNS TEXT AS $$
  SELECT 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
         LPAD(CAST(
           CASE WHEN is_called THEN last_value + 1 ELSE last_value END
         AS TEXT), 5, '0')
  FROM envoi_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 9. Mise à jour de create_envoi_hsilp
--    • Retire toute référence à numero_liste / hsilp_seq
--    • Insère numeros_silp = '{}'  (envoi sans liste physique)
--    • Le trigger génère automatiquement le campo numero
--    • Retourne le numero SILP-... généré
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

-- 10. Suppression de l'ancienne colonne
--     (exécuter après validation des données migrées)
ALTER TABLE envois DROP CONSTRAINT IF EXISTS envois_numero_liste_key;
ALTER TABLE envois DROP COLUMN  IF EXISTS numero_liste;
