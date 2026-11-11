-- ============================================================
-- OPTILAB BSL-GAS — Utilisateurs de test (tous les rôles)
-- À exécuter dans Supabase > SQL Editor avec le rôle postgres
-- pour contourner RLS et accéder à auth.users / auth.identities.
-- Prérequis : schema.sql et seed.sql exécutés.
--
-- AUCUN mot de passe n'est écrit dans ce fichier. Chaque compte CRÉÉ par
-- cette exécution reçoit un mot de passe aléatoire (20 caractères tirés de
-- gen_random_uuid, cœur de PostgreSQL), affiché UNE SEULE FOIS dans le
-- résultat de la requête : le copier immédiatement et le transmettre hors
-- bande. Il n'est stocké que haché (bcrypt, via crypt()/gen_salt() de
-- pgcrypto, préinstallée par Supabase dans le schéma « extensions »).
--
-- Idempotent : un compte déjà présent (UUID fixe, préfixe dd000000) n'est ni
-- modifié ni affiché.
--
-- Régénérer le mot de passe d'un compte démo existant : de préférence par la
-- gestion des utilisateurs de l'application (réinitialisation, manage-user).
-- NE PAS supprimer le compte pour relancer ce script : les journaux d'audit
-- (envois_audit, app_secrets_audit), append-only, le référencent sans
-- cascade, et la suppression échoue dès sa première action journalisée. À
-- défaut, exécuter SEULE dans le SQL Editor la requête ci-dessous (décommentée,
-- UUID à adapter) : elle remplace le hachage et affiche UNE fois le nouveau
-- mot de passe.
--
--   WITH m AS (
--     SELECT u.id,
--            (SELECT string_agg(substr(x.b, g.i, 5), '-' ORDER BY g.i)
--               FROM (SELECT translate(encode(sha256(uuid_send(gen_random_uuid())
--                                             || uuid_send(gen_random_uuid())
--                                             || uuid_send(u.id)), 'base64'),
--                                      '+/', 'kQ') AS b) x,
--                    generate_series(1, 16, 5) AS g(i)) AS mot_de_passe
--       FROM auth.users u
--      WHERE u.id = 'dd000000-0005-4000-8000-000000000005'
--   ), maj AS (
--     UPDATE auth.users u
--        SET encrypted_password = crypt(m.mot_de_passe, gen_salt('bf')),
--            updated_at = now()
--       FROM m WHERE u.id = m.id
--     RETURNING u.id
--   )
--   SELECT m.mot_de_passe AS "Nouveau mot de passe (affiché une seule fois)"
--     FROM m JOIN maj USING (id);
--
-- is_test = TRUE → ces comptes sont identifiables dans l'interface admin.
-- Format email : {employee_id.toLowerCase()}@optilab.internal
-- (correspond exactement à ce que l'app génère au login)
-- ============================================================

-- Encodage du fichier : sans ceci, psql sous Windows (encodage client WIN1252
-- par défaut) rejette ou corrompt les caractères accentués.
SET client_encoding = 'UTF8';

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Une seule instruction : la création des comptes et l'affichage des mots de
-- passe sont atomiques, et la dernière instruction du script est celle dont le
-- SQL Editor affiche le résultat.
WITH comptes (id, employee_id, nom, code_labo, role) AS (
  VALUES
    ('dd000000-0001-4000-8000-000000000001'::uuid, 'DEMO-ADM01', 'Admin Démo',            'AA000', 'admin'),
    ('dd000000-0002-4000-8000-000000000002'::uuid, 'DEMO-SGR01', 'Superviseur Grappe',    'AA000', 'superviseur_grappe'),
    ('dd000000-0003-4000-8000-000000000003'::uuid, 'DEMO-SRI01', 'Sophie Rioux',          'AA000', 'superviseur_labo'),
    ('dd000000-0004-4000-8000-000000000004'::uuid, 'DEMO-SGP01', 'Marie-Claude Bouchard', 'AA001', 'superviseur_labo'),
    ('dd000000-0005-4000-8000-000000000005'::uuid, 'DEMO-TRI01', 'Marc-André Côté',       'AA000', 'technicien'),
    ('dd000000-0006-4000-8000-000000000006'::uuid, 'DEMO-TRI02', 'Julie Vézina',          'AA000', 'technicien'),
    ('dd000000-0007-4000-8000-000000000007'::uuid, 'DEMO-TMA01', 'Karine Ouellet',        'AA006', 'technicien'),
    ('dd000000-0008-4000-8000-000000000008'::uuid, 'DEMO-TGA01', 'Patrick Arsenault',     'AB023', 'technicien')
),
-- Comptes absents seulement. Mot de passe : 4 groupes de 5 caractères, soit
-- les 20 premiers caractères (120 bits) du base64 d'un SHA-256 de deux UUID v4,
-- « + » et « / » remplacés. Sous-requête LATERAL corrélée au compte : tirée
-- pour CHAQUE compte (une sous-requête non corrélée ne serait évaluée qu'une
-- fois, et tous les comptes auraient le même mot de passe). La CTE, référencée
-- plusieurs fois, est évaluée une seule fois : un seul mot de passe par compte.
nouveaux AS (
  SELECT c.*,
         lower(c.employee_id) || '@optilab.internal' AS email,
         m.mot_de_passe
    FROM comptes c
    CROSS JOIN LATERAL (
      SELECT string_agg(substr(x.b, g.i, 5), '-' ORDER BY g.i) AS mot_de_passe
        FROM (SELECT translate(encode(sha256(uuid_send(gen_random_uuid())
                                          || uuid_send(gen_random_uuid())
                                          || uuid_send(c.id)), 'base64'),
                               '+/', 'kQ') AS b) x,
             generate_series(1, 16, 5) AS g(i)
    ) m
   WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = c.id)
),
-- ── auth.users ───────────────────────────────────────────────────────────────
u AS (
  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    confirmation_token, recovery_token,
    email_change, email_change_token_new, phone
  )
  SELECT '00000000-0000-0000-0000-000000000000', n.id, 'authenticated', 'authenticated', n.email,
         crypt(n.mot_de_passe, gen_salt('bf')), now(),
         '{"provider":"email","providers":["email"]}', '{}',
         false, now(), now(), '', '', '', '', NULL
    FROM nouveaux n
  RETURNING id
),
-- ── auth.identities ──────────────────────────────────────────────────────────
-- Requis par Supabase Auth pour que le login email/mot de passe fonctionne.
-- Sans ces entrées, l'authentification échoue même si auth.users est correct.
i AS (
  INSERT INTO auth.identities (
    id, provider_id, user_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  SELECT n.id, n.id::text, n.id,
         jsonb_build_object('sub', n.id::text, 'email', n.email,
                            'email_verified', false, 'phone_verified', false),
         'email', now(), now(), now()
    FROM nouveaux n JOIN u ON u.id = n.id
  ON CONFLICT (provider_id, provider) DO NOTHING
),
-- ── profiles ─────────────────────────────────────────────────────────────────
p AS (
  INSERT INTO public.profiles (id, employee_id, nom, labo_id, role, active, is_test, must_change_password)
  SELECT n.id, n.employee_id, n.nom,
         (SELECT l.id FROM public.laboratories l WHERE left(l.name, 5) = n.code_labo),
         n.role, true, true, false
    FROM nouveaux n JOIN u ON u.id = n.id
  ON CONFLICT (id) DO NOTHING
)
SELECT n.employee_id  AS "N° employé",
       n.role         AS "Rôle",
       n.mot_de_passe AS "Mot de passe (affiché une seule fois)"
  FROM nouveaux n JOIN u ON u.id = n.id
 ORDER BY n.employee_id;

-- ============================================================
-- RÉCAPITULATIF DES COMPTES
-- ============================================================
-- Se connecter avec le N° employé (pas l'email) dans l'interface, et le mot
-- de passe affiché par l'exécution qui a créé le compte.
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
