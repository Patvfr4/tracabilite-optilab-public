-- ============================================================
-- Migration 024 — Grappes + configuration par grappe
-- Crée la table grappes, rattache les laboratoires,
-- et migre les paramètres actuels vers grappe_config.
-- ============================================================

-- 1. Table grappes
CREATE TABLE IF NOT EXISTS grappes (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  name       TEXT        NOT NULL,
  code       TEXT,
  active     BOOLEAN     DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Table grappe_config (miroir de app_config, scoped par grappe)
CREATE TABLE IF NOT EXISTS grappe_config (
  id         UUID        DEFAULT uuid_generate_v4() PRIMARY KEY,
  grappe_id  UUID        NOT NULL REFERENCES grappes(id) ON DELETE CASCADE,
  key        TEXT        NOT NULL,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(grappe_id, key)
);

-- 3. Colonne grappe_id sur laboratories
ALTER TABLE laboratories ADD COLUMN IF NOT EXISTS grappe_id UUID REFERENCES grappes(id);

-- 4. RLS
ALTER TABLE grappes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE grappe_config ENABLE ROW LEVEL SECURITY;

-- Lecture : tout utilisateur authentifié peut lire
CREATE POLICY "Lecture grappes"
  ON grappes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Lecture grappe_config"
  ON grappe_config FOR SELECT TO authenticated USING (true);

-- Écriture : admin et superviseur grappe
CREATE POLICY "Gestion grappes"
  ON grappes FOR ALL TO authenticated
  USING    (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

CREATE POLICY "Gestion grappe_config"
  ON grappe_config FOR ALL TO authenticated
  USING    (current_role_name() IN ('admin','superviseur_grappe'))
  WITH CHECK (current_role_name() IN ('admin','superviseur_grappe'));

-- 5. Insérer la première grappe : BSL-GAS
INSERT INTO grappes (id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Grappe 1 — Bas-Saint-Laurent / Gaspésie', 'BSL-GAS')
ON CONFLICT (id) DO NOTHING;

-- 6. Rattacher tous les laboratoires existants à cette grappe
UPDATE laboratories
  SET grappe_id = '00000000-0000-0000-0000-000000000001'
  WHERE grappe_id IS NULL;

-- 7. Migrer les paramètres grappe depuis app_config
-- alarm_hours
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'alarm_hours', value
FROM app_config WHERE key = 'alarm_hours'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- alarm_days
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'alarm_days', value
FROM app_config WHERE key = 'alarm_days'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- transporters
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'transporters', value
FROM app_config WHERE key = 'transporters'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- hgrappe_alarm_days
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'hgrappe_alarm_days', value
FROM app_config WHERE key = 'hgrappe_alarm_days'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- hgrappe_auto_close_days
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'hgrappe_auto_close_days', value
FROM app_config WHERE key = 'hgrappe_auto_close_days'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- hgrappe_confirm_by_numero
INSERT INTO grappe_config (grappe_id, key, value)
SELECT '00000000-0000-0000-0000-000000000001', 'hgrappe_confirm_by_numero', value
FROM app_config WHERE key = 'hgrappe_confirm_by_numero'
ON CONFLICT (grappe_id, key) DO UPDATE SET value = EXCLUDED.value;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_grappe_config_grappe ON grappe_config(grappe_id);
CREATE INDEX IF NOT EXISTS idx_labs_grappe          ON laboratories(grappe_id);
