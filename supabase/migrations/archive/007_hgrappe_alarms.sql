-- ============================================================
-- OPTILAB BSL-GAS — Migration 007 : Alarmes Hors-grappe
-- Ajoute le statut "Aucune réponse reçue" à envois_hgrappe
-- ============================================================

-- Mise à jour de la contrainte CHECK pour inclure le nouveau statut
ALTER TABLE envois_hgrappe
  DROP CONSTRAINT IF EXISTS envois_hgrappe_statut_check;

ALTER TABLE envois_hgrappe
  ADD CONSTRAINT envois_hgrappe_statut_check
  CHECK (statut IN ('En transit','Reçu','Problème','Aucune réponse reçue'));
