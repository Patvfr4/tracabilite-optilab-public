-- Migration 010 : texte personnalisé par labo externe pour l'étiquette du bordereau
ALTER TABLE external_labs
  ADD COLUMN IF NOT EXISTS label_text TEXT NOT NULL DEFAULT '';
