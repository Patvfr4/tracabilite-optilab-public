-- ============================================================
-- OPTILAB BSL-GAS — Données initiales (état final)
-- À exécuter après schema.sql
-- ============================================================

-- ============================================================
-- LABORATOIRES — 16 sites du réseau BSL-GAS
-- ============================================================

INSERT INTO laboratories (name, adresse, ville, code_postal, telephone) VALUES
  ('AA000 - Hôpital régional de Rimouski',                  '150, avenue Rouleau',                          'Rimouski',                  'G5L 5T1', '418 724-3000'),
  ('AA001 - Centre hospitalier régional du Grand-Portage',  '75, rue Saint-Henri',                          'Rivière-du-Loup',           'G5R 2A4', '418 868-1000'),
  ('AA002 - Hôpital Notre-Dame-du-Lac',                     '58, rue de l''Église',                         'Témiscouata-sur-le-Lac',    'G0L 1X0', '418 899-6751'),
  ('AA003 - CLSC Pohénégamook',                             '1922, rue Saint-Vallier',                      'Pohénégamook',              'G0L 1J0', '418 859-2450'),
  ('AA004 - Hôpital Notre-Dame-de-Fatima',                  '1201, 6e avenue Pilote',                       'La Pocatière',              'G0R 1Z0', '418 856-7000'),
  ('AA005 - Hôpital d''Amqui',                              '135, avenue Gaétan-Archambault',               'Amqui',                     'G5J 2K5', '418 629-2211'),
  ('AA006 - Hôpital de Matane',                             '333, rue Thibault',                            'Matane',                    'G4W 2W5', '418 562-3135'),
  ('AA007 - CSSS de la Mitis',                              '800, avenue du Sanatorium',                    'Mont-Joli',                 'G5H 3L6', '418 775-7261'),
  ('AA008 - Centre hospitalier de Trois-Pistoles',          '550, rue Notre-Dame Est',                      'Trois-Pistoles',            'G0L 4K0', '418 851-1111'),
  ('AB020 - Hôpital de Maria',                              '419, boulevard Perron',                        'Maria',                     'G0C 1Y0', '418 759-3443'),
  ('AB021 - Hôpital de Chandler',                           '451, rue Monseigneur-Ross Est',                'Chandler',                  'G0C 1K0', '418 689-2261'),
  ('AB022 - Hôpital de Sainte-Anne-des-Monts',              '50, rue du Belvédère',                         'Sainte-Anne-des-Monts',     'G4V 1X4', '418 763-2261'),
  ('AB023 - Hôpital de Gaspé',                              '215, boulevard de York Ouest',                 'Gaspé',                     'G4X 2W2', '418 368-3301'),
  ('AB024 - CLSC de Paspébiac',                             '273, boulevard Gérard-D.-Levesque Ouest',      'Paspébiac',                 'G0C 2K0', '418 752-2572'),
  ('AB025 - CLSC de Murdochville',                          '600, avenue du Dr-William-May',                'Murdochville',              'G0E 1W0', '418 784-2572'),
  ('AB026 - CLSC de Grande-Vallée',                         '71, rue Saint-François-Xavier Est',            'Grande-Vallée',             'G0E 1K0', '418 393-2572')
ON CONFLICT (name) DO UPDATE SET
  adresse     = EXCLUDED.adresse,
  ville       = EXCLUDED.ville,
  code_postal = EXCLUDED.code_postal,
  telephone   = EXCLUDED.telephone;

-- ============================================================
-- CONFIGURATION DE L'APPLICATION
-- ============================================================

INSERT INTO app_config (key, value) VALUES
  ('app_name',     '"Traçabilité OPTILAB"'),
  ('app_subtitle', '"Application de suivi des envois"'),
  ('alarm_hours',  '18'),
  ('alarm_days',   '5'),
  ('temperatures', '[
    {"icon":"🌡","label":"Température pièce","mention":"Température ambiante"},
    {"icon":"❄","label":"Frigo (2–8°C)","mention":"Réfrigéré"},
    {"icon":"🧊","label":"Congelé (−20°C)","mention":"","ask_glace":true,"mention_glace_oui":"Congelé : Glace sèche comme réfrigérant","mention_glace_non":"Congelé : Sachet réfrigérant"}
  ]'),
  ('transporters', '["Livraison ML","Guépard","Commissionnaire interne","Taxi","Autre"]'),
  ('msg_login',    '""'),
  ('msg_home',     '""')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
