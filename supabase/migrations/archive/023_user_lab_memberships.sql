-- ============================================================
-- Migration 023 — Autorisations par laboratoire
-- Table user_lab_memberships : rôle par labo par utilisateur.
-- Remplace l'approche profiles.labo_ids pour le contrôle d'accès.
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS user_lab_memberships (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  profile_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  labo_id    UUID        NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  lab_role   TEXT        NOT NULL CHECK (lab_role IN ('technicien','responsable')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(profile_id, labo_id)
);

-- 2. RLS
ALTER TABLE user_lab_memberships ENABLE ROW LEVEL SECURITY;

-- Lecture : chaque user voit ses propres memberships ; admins/superviseurs voient tout
CREATE POLICY "Lecture memberships"
  ON user_lab_memberships FOR SELECT TO authenticated
  USING (
    profile_id = auth.uid()
    OR current_role_name() IN ('admin','superviseur_grappe','superviseur_labo')
  );

-- Écriture : admins et superviseurs grappe uniquement
CREATE POLICY "Gestion memberships"
  ON user_lab_memberships FOR ALL TO authenticated
  USING    (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- 3. Mise à jour de current_labo_ids()
--    Pour admin/superviseur_grappe : tous les labos actifs.
--    Pour les autres : labos issus de user_lab_memberships.
--    Fallback sur labo_ids/labo_id si aucun membership (transition).
CREATE OR REPLACE FUNCTION current_labo_ids()
RETURNS UUID[] LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN current_role_name() IN ('admin','superviseur_grappe')
    THEN ARRAY(SELECT id FROM laboratories WHERE active = true)
    ELSE
      COALESCE(
        NULLIF(ARRAY(SELECT labo_id FROM user_lab_memberships WHERE profile_id = auth.uid()), '{}'),
        -- Fallback legacy (avant migration)
        COALESCE(
          NULLIF((SELECT labo_ids FROM profiles WHERE id = auth.uid()), '{}'),
          ARRAY(SELECT labo_id FROM profiles WHERE id = auth.uid() AND labo_id IS NOT NULL)
        )
      )
  END;
$$;

-- 4. Nouvelle fonction current_lab_role(labo_id)
--    Retourne le rôle du user courant dans un labo donné.
--    admin/superviseur_grappe → 'responsable' implicitement.
CREATE OR REPLACE FUNCTION current_lab_role(p_labo_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT CASE
    WHEN current_role_name() IN ('admin','superviseur_grappe') THEN 'responsable'
    ELSE (SELECT lab_role FROM user_lab_memberships
          WHERE profile_id = auth.uid() AND labo_id = p_labo_id)
  END;
$$;

-- 5. Mise à jour de annuler_envoi() — seuls créateur, responsable, ou superviseur/admin
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envoi introuvable.';
  END IF;

  -- Accès : doit avoir accès au labo (via current_labo_ids)
  IF NOT (v_exp_labo = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe','admin'))
  THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  -- Permission métier : créateur, responsable du labo, ou superviseur/admin
  IF NOT (
    auth.uid() = v_createur
    OR current_lab_role(v_exp_labo) = 'responsable'
    OR current_role_name() IN ('superviseur_grappe','admin','superviseur_labo')
  ) THEN
    RAISE EXCEPTION 'Seul le créateur de l''envoi ou un responsable de laboratoire peut l''annuler.';
  END IF;

  IF v_annule IS NOT NULL THEN
    RAISE EXCEPTION 'Cet envoi est déjà annulé.';
  END IF;

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

-- 6. Migration des utilisateurs existants
--    Chaque user non-admin/superviseur_grappe → membership technicien pour ses labos actuels
INSERT INTO user_lab_memberships (profile_id, labo_id, lab_role)
SELECT p.id, lab_id, 'technicien'
FROM profiles p,
  LATERAL (
    SELECT unnest(
      COALESCE(
        NULLIF(p.labo_ids, '{}'),
        CASE WHEN p.labo_id IS NOT NULL THEN ARRAY[p.labo_id] ELSE '{}' END
      )
    ) AS lab_id
  ) labs
WHERE p.role NOT IN ('admin','superviseur_grappe')
  AND labs.lab_id IS NOT NULL
ON CONFLICT (profile_id, labo_id) DO NOTHING;

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_ulm_profile ON user_lab_memberships(profile_id);
CREATE INDEX IF NOT EXISTS idx_ulm_labo    ON user_lab_memberships(labo_id);

-- 8. Grants
GRANT EXECUTE ON FUNCTION current_lab_role(UUID)         TO authenticated;
GRANT EXECUTE ON FUNCTION annuler_envoi(UUID, TEXT)       TO authenticated;
