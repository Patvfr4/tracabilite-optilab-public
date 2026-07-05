-- ============================================================
-- Migration 034 — Rôle read-only pour Metabase
-- ============================================================
-- À appliquer une seule fois via psql, hors du flux `supabase db push`.
--
-- SÉCURITÉ — NE JAMAIS committer de mot de passe réel dans ce fichier.
--   Fournir le mot de passe au moment de l'exécution, ex. :
--     psql "$SUPABASE_DB_URL" -v mdp="$METABASE_RO_PASSWORD" -f 034_metabase_readonly_role.sql
--   puis stocker le secret hors dépôt (gestionnaire de secrets, config Metabase).
--   Rotation : ALTER ROLE metabase_ro PASSWORD '<nouveau_secret>';
--
-- BYPASSRLS — à réévaluer. Il permet à ce rôle de LIRE TOUTES les données de
--   tous les laboratoires (il contourne le cloisonnement RLS). Alternative plus
--   restrictive : conserver la RLS et ajouter des politiques SELECT permissives
--   explicites pour le rôle `metabase_ro` (voir docs/architecture/04-securite.md).

CREATE ROLE metabase_ro WITH
  LOGIN
  PASSWORD :'mdp'
  BYPASSRLS;

-- Connexion à la base
GRANT CONNECT ON DATABASE postgres TO metabase_ro;

-- Schéma public
GRANT USAGE ON SCHEMA public TO metabase_ro;

-- Toutes les tables et vues existantes
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_ro;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO metabase_ro;

-- Tables futures (automatique à la création)
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metabase_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO metabase_ro;
