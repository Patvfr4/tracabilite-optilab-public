-- Migration 011 : adresse complète pour les laboratoires intra-grappe
ALTER TABLE laboratories
  ADD COLUMN IF NOT EXISTS adresse2  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS province  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pays      TEXT NOT NULL DEFAULT '';
