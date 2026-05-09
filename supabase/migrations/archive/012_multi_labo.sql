-- ============================================================
-- Migration 012 — Support multi-laboratoire par utilisateur
-- Ajouter labo_ids[], current_labo_ids(), mettre à jour les RLS
-- ============================================================

-- 1. Colonne labo_ids sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS labo_ids UUID[] DEFAULT '{}';

-- 2. Initialiser labo_ids depuis labo_id pour les profils existants
UPDATE profiles
   SET labo_ids = ARRAY[labo_id]
 WHERE labo_id IS NOT NULL
   AND (labo_ids IS NULL OR labo_ids = '{}');

-- 3. Trigger : synchroniser labo_ids à l'INSERT d'un nouveau profil
--    (l'Edge Function passe labo_id ; on garantit que labo_ids contient au moins ce labo)
CREATE OR REPLACE FUNCTION sync_labo_ids_on_insert()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.labo_id IS NOT NULL AND (NEW.labo_ids IS NULL OR NEW.labo_ids = '{}') THEN
    NEW.labo_ids := ARRAY[NEW.labo_id];
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_labo_ids ON profiles;
CREATE TRIGGER trg_profiles_labo_ids
  BEFORE INSERT ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_labo_ids_on_insert();

-- 4. Fonction : retourne tous les labo_ids de l'utilisateur courant
CREATE OR REPLACE FUNCTION current_labo_ids()
RETURNS UUID[] AS $$
  SELECT COALESCE(
    NULLIF(labo_ids, '{}'),
    CASE WHEN labo_id IS NOT NULL THEN ARRAY[labo_id] ELSE '{}' END
  )
  FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION current_labo_ids() TO authenticated;

-- 5. Mettre à jour les politiques RLS — envois
DROP POLICY IF EXISTS "Création envois"     ON envois;
DROP POLICY IF EXISTS "Mise à jour envois"  ON envois;

CREATE POLICY "Création envois"
  ON envois FOR INSERT TO authenticated
  WITH CHECK (
    exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  );

CREATE POLICY "Mise à jour envois"
  ON envois FOR UPDATE TO authenticated
  USING (
    dest_labo_id = ANY(current_labo_ids())
    OR exp_labo_id  = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  )
  WITH CHECK (true);

-- 6. Mettre à jour les politiques RLS — envois_hgrappe
DROP POLICY IF EXISTS "Création envois_hgrappe"    ON envois_hgrappe;
DROP POLICY IF EXISTS "Mise à jour envois_hgrappe" ON envois_hgrappe;

CREATE POLICY "Création envois_hgrappe"
  ON envois_hgrappe FOR INSERT TO authenticated
  WITH CHECK (
    exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  );

CREATE POLICY "Mise à jour envois_hgrappe"
  ON envois_hgrappe FOR UPDATE TO authenticated
  USING (
    exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  )
  WITH CHECK (true);

-- 7. Index GIN pour performances sur labo_ids
CREATE INDEX IF NOT EXISTS idx_profiles_labo_ids ON profiles USING GIN(labo_ids);
