-- ============================================================
-- OPTILAB BSL-GAS — Migration Audit
-- Table d'audit générique pour toute l'application
-- ============================================================

CREATE TABLE IF NOT EXISTS envois_audit (
  id             UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  table_name     TEXT        NOT NULL,
  record_id      UUID        NOT NULL,
  action         TEXT        NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data       JSONB,
  new_data       JSONB,
  changed_fields TEXT[]      DEFAULT '{}',
  changed_by_id  UUID        REFERENCES auth.users(id),
  changed_by_nom TEXT        NOT NULL DEFAULT '',
  changed_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_record    ON envois_audit(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_changed   ON envois_audit(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_by        ON envois_audit(changed_by_id);

ALTER TABLE envois_audit ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié peut insérer une entrée d'audit
CREATE POLICY "Insertion audit"
  ON envois_audit FOR INSERT TO authenticated
  WITH CHECK (true);

-- Tous les utilisateurs authentifiés peuvent lire les entrées d'audit
CREATE POLICY "Lecture audit"
  ON envois_audit FOR SELECT TO authenticated
  USING (true);
