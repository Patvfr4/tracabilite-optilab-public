-- ============================================================
-- OPTILAB BSL-GAS — Utilisateurs de test (tous les rôles)
-- À exécuter dans Supabase > SQL Editor avec le rôle postgres
-- pour contourner RLS et accéder à auth.users / auth.identities.
--
-- Mot de passe unique pour tous : Optilab2026!
-- is_test = TRUE → ces comptes sont identifiables dans l'interface admin
--
-- UUIDs fixes (préfixe dd000000) → idempotent, re-exécutable
--
-- Format email : {employee_id.toLowerCase()}@optilab.internal
-- (correspond exactement à ce que l'app génère au login)
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
  is_super_admin, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, phone
) VALUES
  -- Admin
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0001-4000-8000-000000000001',
   'authenticated','authenticated', 'demo-adm01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Superviseur de grappe (vision globale réseau)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0002-4000-8000-000000000002',
   'authenticated','authenticated', 'demo-sgr01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Superviseur labo — Rimouski (AA000)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0003-4000-8000-000000000003',
   'authenticated','authenticated', 'demo-sri01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Superviseur labo — Grand-Portage (AA001)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0004-4000-8000-000000000004',
   'authenticated','authenticated', 'demo-sgp01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Technicien — Rimouski 1 (réception + HG)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0005-4000-8000-000000000005',
   'authenticated','authenticated', 'demo-tri01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Technicien — Rimouski 2 (envois + HG)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0006-4000-8000-000000000006',
   'authenticated','authenticated', 'demo-tri02@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Technicien — Matane (AA006)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0007-4000-8000-000000000007',
   'authenticated','authenticated', 'demo-tma01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', NULL),

  -- Technicien — Gaspé (AB023)
  ('00000000-0000-0000-0000-000000000000',
   'dd000000-0008-4000-8000-000000000008',
   'authenticated','authenticated', 'demo-tga01@optilab.internal',
   crypt('Optilab2026!', gen_salt('bf')), NOW(),
   '{"provider":"email","providers":["email"]}','{}',
   FALSE, NOW(), NOW(), '', '', '', '', '')

ON CONFLICT (id) DO NOTHING;

-- ── auth.identities ──────────────────────────────────────────────────────────
-- Requis par Supabase Auth pour que le login email/mot de passe fonctionne.
-- Sans ces entrées, l'authentification échoue même si auth.users est correct.

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider,
  last_sign_in_at, created_at, updated_at
) VALUES
  ('dd000000-0001-4000-8000-000000000001',
   'dd000000-0001-4000-8000-000000000001',
   'dd000000-0001-4000-8000-000000000001',
   '{"sub":"dd000000-0001-4000-8000-000000000001","email":"demo-adm01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0002-4000-8000-000000000002',
   'dd000000-0002-4000-8000-000000000002',
   'dd000000-0002-4000-8000-000000000002',
   '{"sub":"dd000000-0002-4000-8000-000000000002","email":"demo-sgr01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0003-4000-8000-000000000003',
   'dd000000-0003-4000-8000-000000000003',
   'dd000000-0003-4000-8000-000000000003',
   '{"sub":"dd000000-0003-4000-8000-000000000003","email":"demo-sri01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0004-4000-8000-000000000004',
   'dd000000-0004-4000-8000-000000000004',
   'dd000000-0004-4000-8000-000000000004',
   '{"sub":"dd000000-0004-4000-8000-000000000004","email":"demo-sgp01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0005-4000-8000-000000000005',
   'dd000000-0005-4000-8000-000000000005',
   'dd000000-0005-4000-8000-000000000005',
   '{"sub":"dd000000-0005-4000-8000-000000000005","email":"demo-tri01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0006-4000-8000-000000000006',
   'dd000000-0006-4000-8000-000000000006',
   'dd000000-0006-4000-8000-000000000006',
   '{"sub":"dd000000-0006-4000-8000-000000000006","email":"demo-tri02@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0007-4000-8000-000000000007',
   'dd000000-0007-4000-8000-000000000007',
   'dd000000-0007-4000-8000-000000000007',
   '{"sub":"dd000000-0007-4000-8000-000000000007","email":"demo-tma01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW()),

  ('dd000000-0008-4000-8000-000000000008',
   'dd000000-0008-4000-8000-000000000008',
   'dd000000-0008-4000-8000-000000000008',
   '{"sub":"dd000000-0008-4000-8000-000000000008","email":"demo-tga01@optilab.internal","email_verified":false,"phone_verified":false}',
   'email', NOW(), NOW(), NOW())

ON CONFLICT (provider_id, provider) DO NOTHING;

-- ── profiles ─────────────────────────────────────────────────────────────────

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
-- Se connecter avec le N° employé (pas l'email) dans l'interface.
--
-- N° employé    Rôle                  Laboratoire
-- DEMO-ADM01    Admin                 Rimouski (AA000)
-- DEMO-SGR01    Superviseur grappe    Rimouski (AA000) — vision globale réseau
-- DEMO-SRI01    Superviseur labo      Rimouski (AA000) — Sophie Rioux
-- DEMO-SGP01    Superviseur labo      Grand-Portage (AA001) — Marie-Claude Bouchard
-- DEMO-TRI01    Technicien            Rimouski (AA000) — Marc-André Côté
-- DEMO-TRI02    Technicien            Rimouski (AA000) — Julie Vézina
-- DEMO-TMA01    Technicien            Matane (AA006) — Karine Ouellet
-- DEMO-TGA01    Technicien            Gaspé (AB023) — Patrick Arsenault
-- ============================================================
