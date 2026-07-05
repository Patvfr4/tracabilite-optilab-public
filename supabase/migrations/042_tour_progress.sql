-- Migration 042 : colonne pour le parcours de formation guidé
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_progress JSONB DEFAULT NULL;
