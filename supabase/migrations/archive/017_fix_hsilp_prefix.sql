-- ============================================================
-- Migration 017 : Correction préfixe HSILP
-- ============================================================
-- Correctif : les envois sans liste de repérage SILP (numeros_silp vide)
-- recevaient le préfixe SILP- au lieu de HSILP-.
-- Migration 016 avait été appliquée avant le correctif de préfixe.
-- 1. Corrige le trigger generate_envoi_numero
-- 2. Corrige peek_next_hsilp (affichage du numéro suivant)
-- 3. Renomme les envois existants mal préfixés (SILP- → HSILP-)
-- ============================================================

-- 1. Correction du trigger
CREATE OR REPLACE FUNCTION generate_envoi_numero()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    IF NEW.numeros_silp IS NULL OR array_length(NEW.numeros_silp, 1) IS NULL THEN
      NEW.numero := 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                    LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0');
    ELSE
      NEW.numero := 'SILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                    LPAD(CAST(nextval('envoi_seq') AS TEXT), 5, '0');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Correction de peek_next_hsilp
CREATE OR REPLACE FUNCTION peek_next_hsilp()
RETURNS TEXT AS $$
  SELECT 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
         LPAD(CAST(
           CASE WHEN is_called THEN last_value + 1 ELSE last_value END
         AS TEXT), 5, '0')
  FROM envoi_seq;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- 3. Renommer les envois existants dont le préfixe est SILP- mais numeros_silp est vide
--    Ces envois auraient dû recevoir le préfixe HSILP-
UPDATE envois
SET numero = 'HSILP-' || SUBSTRING(numero FROM 6)
WHERE numero LIKE 'SILP-%'
  AND (numeros_silp IS NULL OR array_length(numeros_silp, 1) IS NULL);
