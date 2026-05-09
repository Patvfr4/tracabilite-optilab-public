-- Migration 008 : ajout des champs d'adresse complète sur external_labs
ALTER TABLE external_labs
  ADD COLUMN IF NOT EXISTS adresse2    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_postal TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province    TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pays        TEXT NOT NULL DEFAULT '';
