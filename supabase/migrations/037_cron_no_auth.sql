-- Migration 037 : Simplification cron — pas de service_role_key nécessaire
-- send-notifications est déployée avec --no-verify-jwt, pg_cron appelle sans auth.

SET search_path = 'public';

-- Suppression de la colonne inutile
ALTER TABLE notification_config DROP COLUMN IF EXISTS service_role_key;

-- Mise à jour de la fonction : appel sans Authorization
CREATE OR REPLACE FUNCTION _trigger_send_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url     := 'https://aozluuihgzzvgwdvjnxb.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := '{}'::jsonb
  );
END;
$$;
