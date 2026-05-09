-- ============================================================
-- OPTILAB BSL-GAS — Migration : Utilisateurs test + audit
-- Exécuter dans Supabase SQL Editor
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_test     BOOLEAN       DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by  TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ   DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_by  TEXT          DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ   DEFAULT now(),
  ADD COLUMN IF NOT EXISTS theme       TEXT          DEFAULT NULL; -- 'light' | 'dark' | NULL (OS)
