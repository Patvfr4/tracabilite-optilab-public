-- Migration 038 : Suppression de la fonction wrapper pg_cron
-- Le cron appelle directement l'Edge Function via le dashboard Supabase (type "Supabase Edge Function").

SET search_path = 'public';

DROP FUNCTION IF EXISTS _trigger_send_notifications();
