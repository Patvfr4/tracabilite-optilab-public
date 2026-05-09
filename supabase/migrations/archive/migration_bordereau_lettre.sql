-- ============================================================
-- OPTILAB BSL-GAS — Migration : renommage format bordereau A4 → Lettre
-- Met à jour la valeur stockée dans app_config si elle existe
-- ============================================================

UPDATE app_config
SET
  value = jsonb_set(
    value,
    '{formats}',
    (
      SELECT jsonb_agg(
        CASE WHEN f->>'id' = 'bordereau'
          THEN f
            || jsonb_build_object('nom',  'Bordereau seul — Lettre')
            || jsonb_build_object('desc', 'Page lettre 8½ × 11 po : code-barres et tableau d''informations, sans étiquette d''expédition')
          ELSE f
        END
      )
      FROM jsonb_array_elements(value->'formats') f
    )
  ),
  updated_at = NOW()
WHERE key = 'bordereau_cfg'
  AND value ? 'formats'
  AND jsonb_array_length(value->'formats') > 0;
