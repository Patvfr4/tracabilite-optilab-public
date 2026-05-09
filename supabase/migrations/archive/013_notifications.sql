-- ============================================================
-- MIGRATION 013 — Notifications par mail
-- Tables : notification_config, notification_emails,
--          notification_queue, notification_log
-- ============================================================

-- ── notification_config (1 seule ligne de configuration) ──────────────────────

CREATE TABLE IF NOT EXISTS notification_config (
  id             SERIAL      PRIMARY KEY,
  enabled        BOOLEAN     NOT NULL DEFAULT FALSE,
  enabled_nc     BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_lost   BOOLEAN     NOT NULL DEFAULT TRUE,
  enabled_alarm  BOOLEAN     NOT NULL DEFAULT TRUE,
  provider       TEXT        NOT NULL DEFAULT 'resend'
                             CHECK (provider IN ('resend','smtp')),
  resend_api_key TEXT        NOT NULL DEFAULT '',
  smtp_host      TEXT        NOT NULL DEFAULT '',
  smtp_port      INTEGER     NOT NULL DEFAULT 587,
  smtp_user      TEXT        NOT NULL DEFAULT '',
  smtp_pass      TEXT        NOT NULL DEFAULT '',
  smtp_from      TEXT        NOT NULL DEFAULT '',
  batch_hour     INTEGER     NOT NULL DEFAULT 18
                             CHECK (batch_hour >= 0 AND batch_hour <= 23),
  fallback_email TEXT        NOT NULL DEFAULT '',
  updated_at     TIMESTAMPTZ          DEFAULT NOW()
);

INSERT INTO notification_config (enabled, enabled_nc, enabled_lost, enabled_alarm)
SELECT FALSE, TRUE, TRUE, TRUE
WHERE NOT EXISTS (SELECT 1 FROM notification_config);

-- ── notification_emails ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_emails (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  labo_id    UUID        NOT NULL REFERENCES laboratories(id) ON DELETE CASCADE,
  dept_id    TEXT                 DEFAULT NULL,
  email      TEXT        NOT NULL,
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ          DEFAULT NOW()
);

-- ── notification_queue ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_queue (
  id           UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  type         TEXT        NOT NULL CHECK (type IN ('nc','lost','alarm','hg_nc')),
  envoi_id     UUID        REFERENCES envois(id)         ON DELETE SET NULL,
  envoi_hg_id  UUID        REFERENCES envois_hgrappe(id) ON DELETE SET NULL,
  exp_labo_id  UUID        REFERENCES laboratories(id)   ON DELETE SET NULL,
  dest_labo_id UUID        REFERENCES laboratories(id)   ON DELETE SET NULL,
  envoi_numero TEXT        NOT NULL DEFAULT '',
  departements TEXT[]      NOT NULL DEFAULT '{}',
  details      JSONB       NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ          DEFAULT NOW(),
  sent_at      TIMESTAMPTZ          DEFAULT NULL,
  batch_id     UUID                 DEFAULT NULL
);

-- ── notification_log ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_log (
  id            UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  batch_id      UUID        NOT NULL,
  type          TEXT        NOT NULL DEFAULT '',
  to_email      TEXT        NOT NULL,
  labo_id       UUID        REFERENCES laboratories(id) ON DELETE SET NULL,
  dept_id       TEXT                 DEFAULT NULL,
  subject       TEXT        NOT NULL DEFAULT '',
  body_text     TEXT        NOT NULL DEFAULT '',
  status        TEXT        NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','error')),
  error_message TEXT                 DEFAULT NULL,
  sent_at       TIMESTAMPTZ          DEFAULT NOW(),
  queue_ids     UUID[]      NOT NULL DEFAULT '{}'
);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE notification_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_queue  ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log    ENABLE ROW LEVEL SECURITY;

-- notification_config
CREATE POLICY "Lecture notif_config"
  ON notification_config FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

CREATE POLICY "MAJ notif_config (admin)"
  ON notification_config FOR UPDATE TO authenticated
  USING    (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- notification_emails
CREATE POLICY "Lecture notif_emails"
  ON notification_emails FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

CREATE POLICY "Gestion notif_emails (admin)"
  ON notification_emails FOR ALL TO authenticated
  USING    (current_role_name() = 'admin')
  WITH CHECK (current_role_name() = 'admin');

-- notification_queue
CREATE POLICY "Insertion notif_queue"
  ON notification_queue FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Lecture notif_queue (admin)"
  ON notification_queue FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

-- notification_log
CREATE POLICY "Lecture notif_log (admin)"
  ON notification_log FOR SELECT TO authenticated
  USING (current_role_name() IN ('admin','superviseur_grappe'));

-- ── INDEX ─────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notif_queue_pending ON notification_queue(created_at) WHERE sent_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notif_queue_envoi   ON notification_queue(envoi_id);
CREATE INDEX IF NOT EXISTS idx_notif_emails_labo   ON notification_emails(labo_id, dept_id);
CREATE INDEX IF NOT EXISTS idx_notif_log_sent      ON notification_log(sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_log_batch     ON notification_log(batch_id);
