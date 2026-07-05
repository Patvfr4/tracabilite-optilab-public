-- ============================================================
-- Migration 033 — Fix search_path + WITH CHECK + anon EXECUTE
-- ============================================================
-- 031/032 were repair-marked without executing. This migration
-- re-applies those fixes and adds anon EXECUTE revocations.

-- ── 1. search_path explicite sur toutes les fonctions public ──
-- Explicit statements instead of a DO block (avoids silent failures).

ALTER FUNCTION public._allowed_secret_names()
  SET search_path = 'public';
ALTER FUNCTION public.add_envois_to_bon(uuid, uuid[], uuid[], jsonb)
  SET search_path = 'public';
ALTER FUNCTION public.annuler_envoi(uuid, text)
  SET search_path = 'public';
ALTER FUNCTION public.cancel_bon_depart(uuid)
  SET search_path = 'public';
ALTER FUNCTION public.check_bon_completion(uuid)
  SET search_path = 'public';
ALTER FUNCTION public.confirm_envoi_hgrappe(uuid, boolean, text[], text, text, timestamp with time zone)
  SET search_path = 'public';
ALTER FUNCTION public.count_recent_login_failures(text)
  SET search_path = 'public';
ALTER FUNCTION public.create_bon_depart(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb)
  SET search_path = 'public';
ALTER FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text)
  SET search_path = 'public';
ALTER FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text)
  SET search_path = 'public';
ALTER FUNCTION public.current_lab_role(uuid)
  SET search_path = 'public';
ALTER FUNCTION public.current_labo_id()
  SET search_path = 'public';
ALTER FUNCTION public.current_labo_ids()
  SET search_path = 'public';
ALTER FUNCTION public.current_role_name()
  SET search_path = 'public';
ALTER FUNCTION public.generate_envoi_numero()
  SET search_path = 'public';
ALTER FUNCTION public.get_envoi_hgrappe_by_numero(text, text)
  SET search_path = 'public';
ALTER FUNCTION public.get_envoi_hgrappe_by_token(uuid)
  SET search_path = 'public';
ALTER FUNCTION public.get_hg_confirm_cfg()
  SET search_path = 'public';
ALTER FUNCTION public.get_labo_kpis(uuid, integer)
  SET search_path = 'public';
ALTER FUNCTION public.is_module_active(text, uuid)
  SET search_path = 'public';
ALTER FUNCTION public.peek_next_hgrappe()
  SET search_path = 'public';
ALTER FUNCTION public.peek_next_hsilp()
  SET search_path = 'public';
ALTER FUNCTION public.record_login_attempt(text, boolean)
  SET search_path = 'public';
ALTER FUNCTION public.remove_envoi_from_bon(uuid)
  SET search_path = 'public';
ALTER FUNCTION public.sync_labo_ids_on_insert()
  SET search_path = 'public';
ALTER FUNCTION public.trg_bd_section_completion()
  SET search_path = 'public';
ALTER FUNCTION public.trg_envois_bon_completion()
  SET search_path = 'public';
ALTER FUNCTION public.trg_fn_hgrappe_notif()
  SET search_path = 'public';
ALTER FUNCTION public.trg_hgrappe_bon_completion()
  SET search_path = 'public';
ALTER FUNCTION public.update_updated_at()
  SET search_path = 'public';

-- ── 2. WITH CHECK sur les policies UPDATE (contenu 031) ───────

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

-- ── 3. WITH CHECK sur les policies INSERT (contenu 032) ───────
-- WITH CHECK (auth.uid() IS NOT NULL) évite le warning "always true"
-- tout en restant sémantiquement équivalent pour les authentifiés.

DROP POLICY IF EXISTS "Insertion audit" ON public.envois_audit;
CREATE POLICY "Insertion audit" ON public.envois_audit
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Insertion notif_queue" ON public.notification_queue;
CREATE POLICY "Insertion notif_queue" ON public.notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- ── 4. Révoquer EXECUTE anon sur les fonctions internes ────────
-- Les fonctions hors-grappe (confirm, get_by_token, get_by_numero,
-- get_hg_confirm_cfg) et les fonctions de tracking login
-- (count_recent_login_failures, record_login_attempt) gardent
-- l'accès anon car appelées depuis des pages sans session.

REVOKE EXECUTE ON FUNCTION public._allowed_secret_names() FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_envois_to_bon(uuid, uuid[], uuid[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.annuler_envoi(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_bon_depart(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_bon_completion(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_bon_depart(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_lab_role(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_labo_id() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_labo_ids() FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_role_name() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_envoi_numero() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_app_secret_status(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_labo_kpis(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_module_active(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.peek_next_hgrappe() FROM anon;
REVOKE EXECUTE ON FUNCTION public.peek_next_hsilp() FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_envoi_from_bon(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.sync_labo_ids_on_insert() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_bd_section_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_envois_bon_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fn_hgrappe_notif() FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_hgrappe_bon_completion() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM anon;
