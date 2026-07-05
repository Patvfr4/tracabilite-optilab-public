-- Migration 044 : Cron de détection des envois en alarme
--
-- Ajoute deux nouveaux types dans notification_queue :
--   alarm_r  — envoi intra-grappe en transit > alarm_hours (seuil R)
--   hg_alarm — envoi hors-grappe sans confirmation > hgrappe_alarm_days
--
-- Le type 'alarm' (> alarm_days, "potentiellement perdu") est aussi détecté
-- ici pour centraliser la logique côté SQL (remplace la détection dans
-- l'Edge Function send-notifications, mais les deux coexistent sans doublon
-- grâce à la déduplication NOT EXISTS).

SET search_path = 'public';

-- ── 1. Élargir la contrainte CHECK de notification_queue ──────────────────────
ALTER TABLE notification_queue
  DROP CONSTRAINT IF EXISTS notification_queue_type_check;

ALTER TABLE notification_queue
  ADD CONSTRAINT notification_queue_type_check
  CHECK (type IN ('nc','lost','alarm','alarm_r','hg_nc','hg_alarm'));

-- ── 2. Fonction de détection ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION _detect_alarm_envois()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN

  -- ── Intra-grappe : Alarme R (retard > alarm_hours, pas encore Alarme P) ──
  INSERT INTO notification_queue
    (type, envoi_id, exp_labo_id, dest_labo_id, envoi_numero, departements, details)
  SELECT
    'alarm_r',
    sub.id,
    sub.exp_labo_id,
    sub.dest_labo_id,
    sub.numero,
    COALESCE(sub.departements, '{}'),
    jsonb_build_object(
      'ts_envoi',    sub.ts_envoi,
      'age_heures',  ROUND(sub.age_h::NUMERIC, 1),
      'seuil_heures', sub.alarm_hours
    )
  FROM (
    SELECT
      e.*,
      EXTRACT(EPOCH FROM (NOW() - e.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_hours' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_hours' LIMIT 1),
        18
      ) AS alarm_hours,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_days' LIMIT 1),
        5
      ) AS alarm_days
    FROM envois e
    WHERE e.statut = 'En transit'
      AND e.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.alarm_hours        -- dépasse le seuil R
    AND sub.age_h <  sub.alarm_days * 24    -- pas encore en alarme P (évite le doublon)
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_id = sub.id
        AND q.type IN ('alarm_r', 'alarm')
    );

  -- ── Intra-grappe : Alarme P (potentiellement perdu > alarm_days) ──────────
  INSERT INTO notification_queue
    (type, envoi_id, exp_labo_id, dest_labo_id, envoi_numero, departements, details)
  SELECT
    'alarm',
    sub.id,
    sub.exp_labo_id,
    sub.dest_labo_id,
    sub.numero,
    COALESCE(sub.departements, '{}'),
    jsonb_build_object(
      'ts_envoi',   sub.ts_envoi,
      'age_heures', ROUND(sub.age_h::NUMERIC, 1),
      'seuil_jours', sub.alarm_days
    )
  FROM (
    SELECT
      e.*,
      EXTRACT(EPOCH FROM (NOW() - e.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_days' LIMIT 1),
        5
      ) AS alarm_days
    FROM envois e
    WHERE e.statut = 'En transit'
      AND e.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.alarm_days * 24
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_id = sub.id AND q.type = 'alarm'
    );

  -- ── Hors-grappe : absence de confirmation > hgrappe_alarm_days ───────────
  INSERT INTO notification_queue
    (type, envoi_hg_id, exp_labo_id, envoi_numero, departements, details)
  SELECT
    'hg_alarm',
    sub.id,
    sub.exp_labo_id,
    sub.numero,
    '{}',
    jsonb_build_object(
      'ts_envoi',   sub.ts_envoi,
      'age_heures', ROUND(sub.age_h::NUMERIC, 1),
      'seuil_jours', sub.hg_days
    )
  FROM (
    SELECT
      h.*,
      EXTRACT(EPOCH FROM (NOW() - h.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = h.exp_labo_id
         WHERE gc.key = 'hgrappe_alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'hgrappe_alarm_days' LIMIT 1),
        3
      ) AS hg_days
    FROM envois_hgrappe h
    WHERE h.statut = 'En transit'
      AND h.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.hg_days * 24
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_hg_id = sub.id AND q.type = 'hg_alarm'
    );

END;
$$;

-- Restreindre l'accès (cohérence avec les autres fonctions internes)
REVOKE EXECUTE ON FUNCTION _detect_alarm_envois() FROM anon, authenticated;

-- ── 3. Planification pg_cron ─────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM cron.unschedule('detect-alarm-envois');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Toutes les 30 minutes (à H+10 et H+40 pour ne pas cumuler avec les autres crons)
SELECT cron.schedule(
  'detect-alarm-envois',
  '10,40 * * * *',
  'SELECT _detect_alarm_envois()'
);
