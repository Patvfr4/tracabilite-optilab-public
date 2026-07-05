-- ============================================================
-- Migration 031 — Sécurité : search_path + WITH CHECK RLS
-- ============================================================
-- Corrige deux classes de warnings du linter Supabase :
-- 1. search_path mutable sur toutes les fonctions public
-- 2. WITH CHECK (true) sur les policies UPDATE

-- ── 1. Fix search_path pour toutes les fonctions public ──────
-- Évite les attaques par injection de search_path.
DO $$
DECLARE
  func record;
BEGIN
  FOR func IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND (
        p.proconfig IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM unnest(p.proconfig) opt WHERE opt LIKE 'search_path=%'
        )
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER FUNCTION public.%I(%s) SET search_path = ''public''',
        func.proname, func.args
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipped public.%: %', func.proname, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- ── 2. Fix WITH CHECK pour les policies UPDATE ────────────────
-- WITH CHECK doit refléter USING pour empêcher un technicien
-- de réassigner une ligne à un autre labo via UPDATE.

-- bons_depart
DROP POLICY IF EXISTS "Mise à jour bons_depart" ON public.bons_depart;
CREATE POLICY "Mise à jour bons_depart" ON public.bons_depart
  FOR UPDATE TO authenticated
  USING (
    labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  )
  WITH CHECK (
    labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  );

-- bons_depart_sections
DROP POLICY IF EXISTS "Mise à jour bons_depart_sections" ON public.bons_depart_sections;
CREATE POLICY "Mise à jour bons_depart_sections" ON public.bons_depart_sections
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.bons_depart bd
      WHERE bd.id = bon_id
        AND (
          bd.labo_id = ANY(public.current_labo_ids())
          OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.bons_depart bd
      WHERE bd.id = bon_id
        AND (
          bd.labo_id = ANY(public.current_labo_ids())
          OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
        )
    )
  );

-- envois
DROP POLICY IF EXISTS "Mise à jour envois" ON public.envois;
CREATE POLICY "Mise à jour envois" ON public.envois
  FOR UPDATE TO authenticated
  USING (
    dest_labo_id = ANY(public.current_labo_ids())
    OR exp_labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  )
  WITH CHECK (
    dest_labo_id = ANY(public.current_labo_ids())
    OR exp_labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  );

-- envois_hgrappe
DROP POLICY IF EXISTS "Mise à jour envois_hgrappe" ON public.envois_hgrappe;
CREATE POLICY "Mise à jour envois_hgrappe" ON public.envois_hgrappe
  FOR UPDATE TO authenticated
  USING (
    exp_labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  )
  WITH CHECK (
    exp_labo_id = ANY(public.current_labo_ids())
    OR public.current_role_name() = ANY(ARRAY['superviseur_grappe','admin'])
  );

-- Note : envois_audit INSERT et notification_queue INSERT
-- avec WITH CHECK (true) sont intentionnels (append-only).
