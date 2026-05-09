-- ============================================================
-- Migration 022 — Hors-grappe migré vers module_config
-- Cohérence avec la migration 021 (BD déjà dans module_config).
-- ============================================================

-- Migrer les données existantes depuis app_config
INSERT INTO module_config (module, labo_id, active)
SELECT 'hgrappe', lab_id::UUID, true
FROM (
  SELECT jsonb_array_elements_text(value) AS lab_id
  FROM app_config
  WHERE key = 'hgrappe_enabled_labs'
) sub
ON CONFLICT (module, labo_id) DO UPDATE SET active = EXCLUDED.active;
