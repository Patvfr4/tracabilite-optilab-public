-- Migration 036 : Cron Supabase pour l'envoi automatique des notifications
-- Active pg_cron et pg_net, ajoute service_role_key à notification_config,
-- crée une fonction de déclenchement et planifie l'exécution toutes les heures.

SET search_path = 'public';

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Clé service_role pour l'appel HTTP cron → Edge Function send-notifications
ALTER TABLE notification_config
  ADD COLUMN IF NOT EXISTS service_role_key TEXT NOT NULL DEFAULT '';

-- Fonction déclencheur : appelle send-notifications via pg_net
CREATE OR REPLACE FUNCTION _trigger_send_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_key TEXT;
  v_url CONSTANT TEXT := 'https://aozluuihgzzvgwdvjnxb.supabase.co/functions/v1/send-notifications';
BEGIN
  SELECT service_role_key INTO v_key FROM notification_config WHERE id = 1;
  IF v_key IS NULL OR v_key = '' THEN RETURN; END IF;
  PERFORM net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
END;
$$;

-- Suppression du job existant (idempotence)
DO $$
BEGIN
  PERFORM cron.unschedule('send-notifications-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Planification : toutes les heures à la 5e minute
SELECT cron.schedule(
  'send-notifications-hourly',
  '5 * * * *',
  'SELECT _trigger_send_notifications()'
);
