-- ============================================================
-- Migration 045 — Durcissement du rôle Metabase : retrait de BYPASSRLS
-- ============================================================
-- Contexte : la migration 034 crée `metabase_ro` avec l'attribut BYPASSRLS, qui
-- court-circuite TOUTES les politiques RLS (présentes et futures). On le retire et
-- on le remplace par des politiques SELECT permissives explicites, ciblées sur le
-- rôle `metabase_ro`. La RLS reste ainsi active et auditable ; l'accès en lecture
-- de Metabase est préservé (mêmes lignes qu'avec BYPASSRLS).
--
-- Idempotent : ré-exécutable sans erreur. Sûr par défaut : une table créée
-- ultérieurement avec RLS restera invisible à `metabase_ro` tant qu'on ne lui
-- ajoute pas explicitement la politique (relancer ce bloc, ou ajouter la policy).

SET search_path = 'public';

DO $$
DECLARE
  t record;
BEGIN
  -- Le rôle peut ne pas exister (034 appliquée manuellement hors `db push`).
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_ro') THEN
    RAISE NOTICE 'Rôle metabase_ro absent — migration 034 non appliquée. 045 ignorée.';
    RETURN;
  END IF;

  -- 1. Retirer l'attribut de contournement de la RLS.
  ALTER ROLE metabase_ro NOBYPASSRLS;

  -- 2. Politique SELECT permissive explicite sur chaque table RLS du schéma public.
  --    (permissive → OR avec les politiques existantes ; ne s'applique qu'au rôle metabase_ro)
  FOR t IN
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = true
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS metabase_ro_read ON public.%I', t.tablename);
    EXECUTE format(
      'CREATE POLICY metabase_ro_read ON public.%I FOR SELECT TO metabase_ro USING (true)',
      t.tablename
    );
  END LOOP;
END $$;
