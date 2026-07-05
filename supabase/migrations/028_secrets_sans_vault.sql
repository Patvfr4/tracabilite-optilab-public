-- ============================================================
-- Migration 028 — Secrets dans notification_config (sans Vault)
-- ============================================================
-- Le Vault Supabase n'est pas accessible via PostgREST sur ce plan.
-- Les secrets sont stockés en TEXT dans notification_config, protégés
-- par RLS admin-only (seul le rôle 'admin' peut lire cette table).
-- ============================================================

ALTER TABLE notification_config
  ADD COLUMN IF NOT EXISTS resend_api_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS smtp_pass      TEXT NOT NULL DEFAULT '';
