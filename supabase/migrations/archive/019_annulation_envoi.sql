-- ============================================================
-- Migration 019 — Annulation logique d'un envoi intra-grappe
-- L'envoi reste en base (traçabilité) mais disparaît de l'app.
-- Seul le panel Recherche peut retrouver un envoi annulé.
-- ============================================================

-- 1. Colonnes
ALTER TABLE envois
  ADD COLUMN IF NOT EXISTS annule_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS annule_par_id  UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS annule_par_nom TEXT,
  ADD COLUMN IF NOT EXISTS annule_note    TEXT;

-- 1b. Étendre la contrainte statut pour inclure 'Annulé'
ALTER TABLE envois DROP CONSTRAINT IF EXISTS envois_statut_check;
ALTER TABLE envois ADD CONSTRAINT envois_statut_check
  CHECK (statut IN ('En attente','En transit','Reçu','Problème','Perdu','Annulé'));

-- 2. Index partiel (seuls les annulés sont indexés)
CREATE INDEX IF NOT EXISTS idx_envois_annule
  ON envois(annule_at) WHERE annule_at IS NOT NULL;

-- 3. Fonction d'annulation
CREATE OR REPLACE FUNCTION annuler_envoi(
  p_envoi_id UUID,
  p_note     TEXT
) RETURNS VOID AS $$
DECLARE
  v_statut   TEXT;
  v_exp_labo UUID;
  v_annule   TIMESTAMPTZ;
  v_in_bon   BOOLEAN;
  v_par_nom  TEXT;
BEGIN
  SELECT statut, exp_labo_id, annule_at
  INTO v_statut, v_exp_labo, v_annule
  FROM envois WHERE id = p_envoi_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envoi introuvable.';
  END IF;

  -- Accès : même règle que la modification
  IF NOT (v_exp_labo = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe','admin'))
  THEN
    RAISE EXCEPTION 'Accès refusé.';
  END IF;

  -- Déjà annulé
  IF v_annule IS NOT NULL THEN
    RAISE EXCEPTION 'Cet envoi est déjà annulé.';
  END IF;

  -- Statuts autorisés
  IF v_statut NOT IN ('En attente', 'En transit') THEN
    RAISE EXCEPTION 'Seuls les envois en attente ou en transit peuvent être annulés.';
  END IF;

  -- Bon de départ actif
  SELECT EXISTS (
    SELECT 1 FROM bons_depart_envois bde
    JOIN bons_depart bd ON bde.bon_id = bd.id
    WHERE bde.envoi_id = p_envoi_id
      AND bd.statut = 'actif'
  ) INTO v_in_bon;

  IF v_in_bon THEN
    RAISE EXCEPTION 'Cet envoi fait partie d''un bon de départ actif. Retirez-le du bon avant de l''annuler.';
  END IF;

  -- Motif obligatoire
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
    json_build_object('statut', 'Annulé', 'annule_at', NOW(), 'annule_note', TRIM(p_note)),
    ARRAY['statut','annule_at','annule_note'],
    auth.uid(), v_par_nom
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION annuler_envoi(UUID, TEXT) TO authenticated;

-- 4. Étendre la contrainte d'audit pour accepter 'ANNULATION'
ALTER TABLE envois_audit DROP CONSTRAINT IF EXISTS envois_audit_action_check;
ALTER TABLE envois_audit ADD CONSTRAINT envois_audit_action_check
  CHECK (action IN ('INSERT','UPDATE','DELETE','ANNULATION'));
