-- ============================================================
-- OPTILAB BSL-GAS — Migration : Bordereau amélioré
-- Exécuter dans Supabase SQL Editor après schema.sql
-- ============================================================

-- 1. Colonnes d'adresse sur les laboratoires
ALTER TABLE laboratories
  ADD COLUMN IF NOT EXISTS adresse     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS ville       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS code_postal TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS telephone   TEXT DEFAULT '';

-- 2. Type de spécimen et réfrigérant sur les envois
ALTER TABLE envois
  ADD COLUMN IF NOT EXISTS type_specimen TEXT    DEFAULT 'exempt',
  ADD COLUMN IF NOT EXISTS glace_seche   BOOLEAN DEFAULT false;

-- 3. Adresses des laboratoires du réseau BSL-GAS
UPDATE laboratories SET
  adresse='150, avenue Rouleau', ville='Rimouski', code_postal='G5L 5T1', telephone='418 724-3000'
  WHERE name LIKE '%Hôpital régional de Rimouski%';

UPDATE laboratories SET
  adresse='75, rue Saint-Henri', ville='Rivière-du-Loup', code_postal='G5R 2A4', telephone='418 868-1000'
  WHERE name LIKE '%Grand-Portage%';

UPDATE laboratories SET
  adresse='58, rue de l''Église', ville='Témiscouata-sur-le-Lac', code_postal='G0L 1X0', telephone='418 899-6751'
  WHERE name LIKE '%Notre-Dame-du-Lac%';

UPDATE laboratories SET
  adresse='1922, rue Saint-Vallier', ville='Pohénégamook', code_postal='G0L 1J0', telephone='418 859-2450'
  WHERE name LIKE '%Pohénégamook%';

UPDATE laboratories SET
  adresse='1201, 6e avenue Pilote', ville='La Pocatière', code_postal='G0R 1Z0', telephone='418 856-7000'
  WHERE name LIKE '%Notre-Dame-de-Fatima%';

UPDATE laboratories SET
  adresse='135, avenue Gaétan-Archambault', ville='Amqui', code_postal='G5J 2K5', telephone='418 629-2211'
  WHERE name LIKE '%Amqui%';

UPDATE laboratories SET
  adresse='333, rue Thibault', ville='Matane', code_postal='G4W 2W5', telephone='418 562-3135'
  WHERE name LIKE '%Matane%';

UPDATE laboratories SET
  adresse='800, avenue du Sanatorium', ville='Mont-Joli', code_postal='G5H 3L6', telephone='418 775-7261'
  WHERE name LIKE '%Mitis%';

UPDATE laboratories SET
  adresse='550, rue Notre-Dame Est', ville='Trois-Pistoles', code_postal='G0L 4K0', telephone='418 851-1111'
  WHERE name LIKE '%Trois-Pistoles%';

UPDATE laboratories SET
  adresse='419, boulevard Perron', ville='Maria', code_postal='G0C 1Y0', telephone='418 759-3443'
  WHERE name LIKE '%Maria%';

UPDATE laboratories SET
  adresse='451, rue Monseigneur-Ross Est', ville='Chandler', code_postal='G0C 1K0', telephone='418 689-2261'
  WHERE name LIKE '%Chandler%';

UPDATE laboratories SET
  adresse='50, rue du Belvédère', ville='Sainte-Anne-des-Monts', code_postal='G4V 1X4', telephone='418 763-2261'
  WHERE name LIKE '%Sainte-Anne-des-Monts%';

UPDATE laboratories SET
  adresse='215, boulevard de York Ouest', ville='Gaspé', code_postal='G4X 2W2', telephone='418 368-3301'
  WHERE name LIKE '%Gaspé%';

UPDATE laboratories SET
  adresse='273, boulevard Gérard-D.-Levesque Ouest', ville='Paspébiac', code_postal='G0C 2K0', telephone='418 752-2572'
  WHERE name LIKE '%Paspébiac%';

UPDATE laboratories SET
  adresse='600, avenue du Dr-William-May', ville='Murdochville', code_postal='G0E 1W0', telephone='418 784-2572'
  WHERE name LIKE '%Murdochville%';

UPDATE laboratories SET
  adresse='71, rue Saint-François-Xavier Est', ville='Grande-Vallée', code_postal='G0E 1K0', telephone='418 393-2572'
  WHERE name LIKE '%Grande-Vallée%';

-- 4. Réfrigérant par défaut par laboratoire (glace_seche | sachet | NULL = demander)
ALTER TABLE laboratories
  ADD COLUMN IF NOT EXISTS default_refrigerant TEXT DEFAULT NULL;

-- 5. Mise à jour de la config des températures avec mentions et glace sèche
UPDATE app_config
SET value = '[
  {"icon":"🌡","label":"Température pièce","mention":"Température ambiante"},
  {"icon":"❄","label":"Frigo (2–8°C)","mention":"Réfrigéré"},
  {"icon":"🧊","label":"Congelé (−20°C)","mention":"","ask_glace":true,"mention_glace_oui":"Congelé : Glace sèche comme réfrigérant","mention_glace_non":"Congelé : Sachet réfrigérant"}
]'::jsonb
WHERE key = 'temperatures';
