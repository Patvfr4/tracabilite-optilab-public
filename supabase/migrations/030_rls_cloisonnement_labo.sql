-- ============================================================
-- Migration 030 — Cloisonnement RLS par laboratoire
-- ============================================================
-- Les SELECT policies de envois, envois_hgrappe,
-- bons_depart_sections et bons_depart_envois étaient USING (true)
-- (tout technicien authentifié voyait tous les envois de tous les labos).
-- Correction : restreindre à l'appartenance labo de l'utilisateur.
-- current_labo_ids() et current_role_name() existent depuis la migration initiale.
-- ============================================================

-- ── envois ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lecture envois" ON envois;
CREATE POLICY "Lecture envois" ON envois FOR SELECT TO authenticated
  USING (
    exp_labo_id  = ANY(current_labo_ids())
    OR dest_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  );

-- ── envois_hgrappe ───────────────────────────────────────────────────────────
-- Pas de dest_labo_id (destination externe) : seul l'expéditeur est un labo grappe.
DROP POLICY IF EXISTS "Lecture envois_hgrappe" ON envois_hgrappe;
CREATE POLICY "Lecture envois_hgrappe" ON envois_hgrappe FOR SELECT TO authenticated
  USING (
    exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  );

-- ── bons_depart_sections ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lecture bons_depart_sections" ON bons_depart_sections;
CREATE POLICY "Lecture bons_depart_sections" ON bons_depart_sections FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bons_depart bd
      WHERE bd.id = bon_id
        AND (
          bd.labo_id = ANY(current_labo_ids())
          OR current_role_name() IN ('superviseur_grappe', 'admin')
        )
    )
  );

-- ── bons_depart_envois ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Lecture bons_depart_envois" ON bons_depart_envois;
CREATE POLICY "Lecture bons_depart_envois" ON bons_depart_envois FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM bons_depart bd
      WHERE bd.id = bon_id
        AND (
          bd.labo_id = ANY(current_labo_ids())
          OR current_role_name() IN ('superviseur_grappe', 'admin')
        )
    )
  );
