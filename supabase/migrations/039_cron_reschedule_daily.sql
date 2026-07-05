-- Migration 039 : Récapitulatif du lundi au vendredi à 7h55 heure de Montréal (11h55 UTC été / 12h55 UTC hiver)

SELECT cron.alter_job(
  job_id   := (SELECT jobid FROM cron.job WHERE jobname = 'send-notifications-hourly'),
  schedule := '55 11 * * 1-5'
);
