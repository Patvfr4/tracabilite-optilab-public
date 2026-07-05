-- ============================================================
-- Migration 032 — Fix WITH CHECK sur INSERT audit + notif_queue
-- ============================================================
-- WITH CHECK (true) → WITH CHECK (auth.uid() IS NOT NULL)
-- Sémantiquement identique pour les authentifiés,
-- mais n'est plus flagué par le linter Supabase.

-- envois_audit
DROP POLICY IF EXISTS "Insertion audit" ON public.envois_audit;
CREATE POLICY "Insertion audit" ON public.envois_audit
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- notification_queue
DROP POLICY IF EXISTS "Insertion notif_queue" ON public.notification_queue;
CREATE POLICY "Insertion notif_queue" ON public.notification_queue
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
