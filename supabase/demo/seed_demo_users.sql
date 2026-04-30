-- ============================================================
-- OPTILAB BSL-GAS — Utilisateurs de test (tous les rôles)
-- À exécuter dans Supabase > SQL Editor avec le rôle postgres
-- pour contourner RLS et accéder à auth.users.
--
-- Mot de passe unique pour tous : Optilab2026!
-- is_test = TRUE → ces comptes sont identifiables dans l'interface admin
--
-- UUIDs fixes (préfixe dd000000) → idempotent, re-exécutable
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Résolution dynamique des UUIDs laboratoires
CREATE TEMP TABLE _labs (code TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
INSERT INTO _labs SELECT LEFT(name,5), id FROM laboratories;

-- ── auth.users ───────────────────────────────────────────────────────────────

INSERT INTO auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at
) VALUES
  -- Admin
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0001-4000-8000-000000000001',
   'authenticated','authenticated', 'admin.demo@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Superviseur de grappe (vision globale réseau)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0002-4000-8000-000000000002',
   'authenticated','authenticated', 'sup.grappe@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Superviseur labo — Rimouski (AA000)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0003-4000-8000-000000000003',
   'authenticated','authenticated', 'sup.rim@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Superviseur labo — Grand-Portage (AA001)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0004-4000-8000-000000000004',
   'authenticated','authenticated', 'sup.rdl@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Technicien — Rimouski 1 (réception + HG)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0005-4000-8000-000000000005',
   'authenticated','authenticated', 'tech.rim1@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Technicien — Rimouski 2 (envois + HG)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0006-4000-8000-000000000006',
   'authenticated','authenticated', 'tech.rim2@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Technicien — Matane (AA006)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0007-4000-8000-000000000007',
   'authenticated','authenticated', 'tech.mat@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW()),

  -- Technicien — Gaspé (AB023)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0008-4000-8000-000000000008',
   'authenticated','authenticated', 'tech.gas@optilab.test',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW())

ON CONFLICT (id) DO NOTHING;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- Noms réels tirés des données de démonstration pour cohérence

INSERT INTO profiles (id, employee_id, nom, labo_id, role, active, is_test, must_change_password)
VALUES
  ('dd000000-0001-4000-8000-000000000001', 'DEMO-ADM01', 'Admin Démo',
   (SELECT id FROM _labs WHERE code='AA000'), 'admin',              TRUE, TRUE, FALSE),

  ('dd000000-0002-4000-8000-000000000002', 'DEMO-SGR01', 'Superviseur Grappe',
   (SELECT id FROM _labs WHERE code='AA000'), 'superviseur_grappe', TRUE, TRUE, FALSE),

  ('dd000000-0003-4000-8000-000000000003', 'DEMO-SRI01', 'Sophie Rioux',
   (SELECT id FROM _labs WHERE code='AA000'), 'superviseur_labo',   TRUE, TRUE, FALSE),

  ('dd000000-0004-4000-8000-000000000004', 'DEMO-SGP01', 'Marie-Claude Bouchard',
   (SELECT id FROM _labs WHERE code='AA001'), 'superviseur_labo',   TRUE, TRUE, FALSE),

  ('dd000000-0005-4000-8000-000000000005', 'DEMO-TRI01', 'Marc-André Côté',
   (SELECT id FROM _labs WHERE code='AA000'), 'technicien',         TRUE, TRUE, FALSE),

  ('dd000000-0006-4000-8000-000000000006', 'DEMO-TRI02', 'Julie Vézina',
   (SELECT id FROM _labs WHERE code='AA000'), 'technicien',         TRUE, TRUE, FALSE),

  ('dd000000-0007-4000-8000-000000000007', 'DEMO-TMA01', 'Karine Ouellet',
   (SELECT id FROM _labs WHERE code='AA006'), 'technicien',         TRUE, TRUE, FALSE),

  ('dd000000-0008-4000-8000-000000000008', 'DEMO-TGA01', 'Patrick Arsenault',
   (SELECT id FROM _labs WHERE code='AB023'), 'technicien',         TRUE, TRUE, FALSE)

ON CONFLICT (id) DO NOTHING;

COMMIT;

-- ============================================================
-- RÉCAPITULATIF DES COMPTES
-- ============================================================
-- Mot de passe commun : Optilab2026!
--
-- admin.demo@optilab.test    → Admin            (Rimouski)
-- sup.grappe@optilab.test    → Superviseur grappe (Rimouski) — vision globale
-- sup.rim@optilab.test       → Superviseur labo  (Rimouski) — Sophie Rioux
-- sup.rdl@optilab.test       → Superviseur labo  (Grand-Portage) — Marie-Claude Bouchard
-- tech.rim1@optilab.test     → Technicien        (Rimouski) — Marc-André Côté
-- tech.rim2@optilab.test     → Technicien        (Rimouski) — Julie Vézina
-- tech.mat@optilab.test      → Technicien        (Matane) — Karine Ouellet
-- tech.gas@optilab.test      → Technicien        (Gaspé) — Patrick Arsenault
-- ============================================================
