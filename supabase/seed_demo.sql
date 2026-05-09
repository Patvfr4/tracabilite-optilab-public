-- ============================================================
-- Données de démonstration — OPTILAB BSL-GAS
-- AA000 Hôpital régional de Rimouski = centre serveur
--
-- Prérequis : laboratoires et app_config déjà présents en base.
-- Ce script insère uniquement des envois.
--
-- Exécuter dans Supabase > SQL Editor avec le rôle "postgres"
-- pour contourner les politiques RLS.
-- Idempotent : ON CONFLICT (numero_liste) DO NOTHING.
--
-- Numérotation :
--   SILP  → 9 chiffres aléatoires (envois avec liste SILP, tout dept sauf Patho seul)
--   HSILP → format séquentiel      (envois sans liste SILP, Pathologie uniquement)
-- ============================================================

BEGIN;

-- Résolution dynamique des UUIDs laboratoires (portabilité inter-instances Supabase)
CREATE TEMP TABLE _labs (code TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
INSERT INTO _labs SELECT LEFT(name,5), id FROM laboratories;

-- Réserve les numéros HSILP00001–HSILP00010 insérés manuellement ci-dessous.
-- Le prochain numéro auto-généré sera HSILP00011.
SELECT setval('hsilp_seq', 10);

INSERT INTO envois (
  numero_liste,
  exp_labo_id, dest_labo_id,
  temperature, transporteur,
  nb_echantillons, departements,
  statut, notes,
  cree_par_nom, recep_par_nom, recep_obs,
  ts_envoi, ts_recep
) VALUES


-- ════════════════════════════════════════════════════════════════
-- FÉVRIER 2026 — historique complet (tous Reçu sauf 2 Problème)
-- ════════════════════════════════════════════════════════════════

-- Grand-Portage (site La Pocatière) → Rimouski
('847392015',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',24,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-02-03T12:30:00+00:00','2026-02-03T16:45:00+00:00'),

-- Grand-Portage (site Rivière-du-Loup) → Rimouski
('293748561',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',18,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-02-03T11:00:00+00:00','2026-02-03T15:30:00+00:00'),

-- Matane → Rimouski
('758201934',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',15,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-02-04T12:00:00+00:00','2026-02-04T17:30:00+00:00'),

-- Hôpital de Gaspé → Rimouski (congelé, longue distance ~10h de route)
('612839475',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',30,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-02-05T11:30:00+00:00','2026-02-05T22:00:00+00:00'),

-- La Mitis → Rimouski
('394827163',
 (SELECT id FROM _labs WHERE code='AA007'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',11,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Isabelle Gagné','Sophie Rioux',NULL,
 '2026-02-05T12:00:00+00:00','2026-02-05T16:30:00+00:00'),

-- Chandler → Rimouski
('827394651',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',22,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Élise Bérubé','Marc-André Côté',NULL,
 '2026-02-06T11:00:00+00:00','2026-02-06T22:30:00+00:00'),

-- Trois-Pistoles → Rimouski
('563819274',
 (SELECT id FROM _labs WHERE code='AA008'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',9,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Caroline Beaulieu','Sophie Rioux',NULL,
 '2026-02-09T12:00:00+00:00','2026-02-09T15:30:00+00:00'),

-- Amqui → Rimouski
('491827356',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',19,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-02-10T12:00:00+00:00','2026-02-10T18:00:00+00:00'),

-- Notre-Dame-du-Lac → Rimouski
('738264019',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',8,ARRAY['MICROBIOLOGIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-02-11T12:30:00+00:00','2026-02-11T19:00:00+00:00'),

-- Hôpital de Maria → Rimouski
('284739156',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',25,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Reçu',NULL,
 'Geneviève Thibault','Marc-André Côté',NULL,
 '2026-02-11T11:00:00+00:00','2026-02-11T22:00:00+00:00'),

-- Grand-Portage (site RDL) → Rimouski
('916384725',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',21,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-02-12T12:00:00+00:00','2026-02-12T16:30:00+00:00'),

-- Notre-Dame-de-Fatima → Rimouski
('473829164',
 (SELECT id FROM _labs WHERE code='AA004'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',13,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Véronique Morin','Sophie Rioux',NULL,
 '2026-02-12T11:30:00+00:00','2026-02-12T15:45:00+00:00'),

-- Sainte-Anne-des-Monts → Rimouski
('628394715',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',14,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Mireille Cloutier','Marc-André Côté',NULL,
 '2026-02-13T11:00:00+00:00','2026-02-13T21:45:00+00:00'),

-- Matane → Rimouski
('394728165',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',20,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-02-17T12:00:00+00:00','2026-02-17T17:00:00+00:00'),

-- Hôpital de Gaspé → Rimouski — PROBLÈME : 2 tubes brisés
('817362495',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',28,ARRAY['PATHOLOGIE','BIOCHIMIE'],
 'Problème','Vérifier état des échantillons à l''arrivée',
 'Patrick Arsenault','Marc-André Côté',
 '2 tubes brisés lors du transport — résultats non exploitables (tubes #14 et #22)',
 '2026-02-18T11:30:00+00:00','2026-02-18T22:15:00+00:00'),

-- Amqui → Rimouski
('539274861',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',17,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-02-19T12:00:00+00:00','2026-02-19T18:30:00+00:00'),

-- Rimouski → Grand-Portage (retour résultats analyses spécialisées)
('274916385',
 (SELECT id FROM _labs WHERE code='AA000'),(SELECT id FROM _labs WHERE code='AA001'),
 'Température pièce','Commissionnaire interne',5,ARRAY['BIOCHIMIE'],
 'Reçu','Résultats d''analyses spécialisées — retour lame histologie',
 'Marc-André Côté','Marie-Claude Bouchard',NULL,
 '2026-02-20T14:00:00+00:00','2026-02-20T18:00:00+00:00'),

-- Notre-Dame-du-Lac → Rimouski
('648372915',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',11,ARRAY['MICROBIOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-02-25T12:30:00+00:00','2026-02-25T20:00:00+00:00'),

-- Chandler → Rimouski — PROBLÈME : boîte ouverte à l'arrivée
('391847265',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',20,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Problème',NULL,
 'Élise Bérubé','Marc-André Côté',
 'Boîte de transport ouverte à l''arrivée — températures non conformes sur 5 échantillons',
 '2026-02-26T11:00:00+00:00','2026-02-26T22:00:00+00:00'),

-- CLSC de Paspébiac → Rimouski
('748263951',
 (SELECT id FROM _labs WHERE code='AB024'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Francis Landry','Marc-André Côté',NULL,
 '2026-02-26T10:00:00+00:00','2026-02-26T22:30:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- MARS 2026 — 1 Perdu + 1 Problème + reste Reçu
-- ════════════════════════════════════════════════════════════════

('826394175',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',23,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-03-03T12:30:00+00:00','2026-03-03T17:00:00+00:00'),

('473628195',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',19,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-03-03T11:30:00+00:00','2026-03-03T15:45:00+00:00'),

('915827364',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',17,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-03-04T12:00:00+00:00','2026-03-04T17:30:00+00:00'),

('283946175',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',32,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-03-05T11:30:00+00:00','2026-03-05T22:30:00+00:00'),

('647382951',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',26,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Geneviève Thibault','Marc-André Côté',NULL,
 '2026-03-06T11:00:00+00:00','2026-03-06T21:45:00+00:00'),

-- La Mitis → Rimouski
('391827465',
 (SELECT id FROM _labs WHERE code='AA007'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',10,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Isabelle Gagné','Sophie Rioux',NULL,
 '2026-03-09T12:00:00+00:00','2026-03-09T16:30:00+00:00'),

('825739416',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',14,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-03-10T12:30:00+00:00','2026-03-10T17:00:00+00:00'),

('473916285',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',18,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-03-10T11:00:00+00:00','2026-03-10T17:15:00+00:00'),

-- Trois-Pistoles → Rimouski
('619284735',
 (SELECT id FROM _labs WHERE code='AA008'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',8,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Caroline Beaulieu','Sophie Rioux',NULL,
 '2026-03-11T11:30:00+00:00','2026-03-11T15:00:00+00:00'),

('382974651',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',20,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-03-11T11:00:00+00:00','2026-03-11T16:00:00+00:00'),

('748293165',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',9,ARRAY['MICROBIOLOGIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-03-12T12:30:00+00:00','2026-03-12T20:00:00+00:00'),

('915362847',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',15,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Mireille Cloutier','Marc-André Côté',NULL,
 '2026-03-13T11:00:00+00:00','2026-03-13T22:45:00+00:00'),

-- Chandler → Rimouski — PERDU (remis au chauffeur, jamais arrivé)
('263817495',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',22,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Perdu','Remis au chauffeur en fin de journée — aucun accusé de réception',
 'Élise Bérubé','Marc-André Côté',
 'Déclaré perdu par Marc-André Côté',
 '2026-03-17T22:00:00+00:00','2026-03-22T14:30:00+00:00'),

('481739265',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Taxi',13,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-03-18T12:00:00+00:00','2026-03-18T18:00:00+00:00'),

('739264185',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',29,ARRAY['PATHOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-03-19T11:30:00+00:00','2026-03-19T22:45:00+00:00'),

('826391475',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',21,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-03-19T12:30:00+00:00','2026-03-19T17:30:00+00:00'),

-- Rimouski → Hôpital de Maria (envoi contrôles qualité)
('493728156',
 (SELECT id FROM _labs WHERE code='AA000'),(SELECT id FROM _labs WHERE code='AB020'),
 'Frigo (2–8°C)','Livraison ML',3,ARRAY['BIOCHIMIE'],
 'Reçu','Contrôles qualité externes Q1',
 'Sophie Rioux','Geneviève Thibault',NULL,
 '2026-03-20T14:00:00+00:00','2026-03-20T22:30:00+00:00'),

-- Hôpital de Maria → Rimouski — PROBLÈME : température de chaîne brisée
('617293845',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',27,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Problème',NULL,
 'Geneviève Thibault','Marc-André Côté',
 'Température interne non conforme à l''arrivée (−8°C relevé, −20°C attendu) — échantillons pathologie à renouveler',
 '2026-03-24T11:00:00+00:00','2026-03-24T22:15:00+00:00'),

('384917265',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',16,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-03-25T11:00:00+00:00','2026-03-25T18:45:00+00:00'),

('729384156',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',22,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-03-25T11:00:00+00:00','2026-03-25T16:15:00+00:00'),

('816247935',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',19,ARRAY['HEMATOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-03-26T12:30:00+00:00','2026-03-26T17:15:00+00:00'),

('493627185',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',12,ARRAY['MICROBIOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-03-26T12:30:00+00:00','2026-03-26T21:00:00+00:00'),

-- CLSC de Murdochville → Rimouski
('271839465',
 (SELECT id FROM _labs WHERE code='AB025'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Daniel Ross','Marc-André Côté',NULL,
 '2026-03-27T10:00:00+00:00','2026-03-28T00:30:00+00:00'),

('637284951',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',18,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-03-31T12:00:00+00:00','2026-03-31T17:30:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- AVRIL 2026 — semaines 1 à 3 (réceptionnés)
-- ════════════════════════════════════════════════════════════════

('819364275',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',24,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-04-01T11:30:00+00:00','2026-04-01T16:00:00+00:00'),

('472916385',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',17,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-04-01T10:30:00+00:00','2026-04-01T14:45:00+00:00'),

('638291745',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',31,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-04-02T10:00:00+00:00','2026-04-02T21:30:00+00:00'),

('391724865',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',23,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Élise Bérubé','Marc-André Côté',NULL,
 '2026-04-02T10:00:00+00:00','2026-04-02T21:00:00+00:00'),

('847261935',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',16,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Mireille Cloutier','Marc-André Côté',NULL,
 '2026-04-03T10:00:00+00:00','2026-04-03T20:30:00+00:00'),

-- CLSC de Grande-Vallée → Rimouski
('293847561',
 (SELECT id FROM _labs WHERE code='AB026'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Joël Cyr','Marc-André Côté',NULL,
 '2026-04-03T10:00:00+00:00','2026-04-03T23:00:00+00:00'),

('716384295',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',20,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-04-07T11:00:00+00:00','2026-04-07T16:30:00+00:00'),

('483927165',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',22,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-04-07T11:30:00+00:00','2026-04-07T16:00:00+00:00'),

('629183475',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',18,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-04-08T11:00:00+00:00','2026-04-08T17:15:00+00:00'),

('381946275',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',25,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Geneviève Thibault','Marc-André Côté',NULL,
 '2026-04-08T10:00:00+00:00','2026-04-08T21:15:00+00:00'),

('749283615',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',19,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-04-09T10:30:00+00:00','2026-04-09T15:00:00+00:00'),

('382746951',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',10,ARRAY['MICROBIOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-04-09T11:30:00+00:00','2026-04-09T19:30:00+00:00'),

-- Rimouski → Hôpital de Gaspé (retour échantillons génomiques)
('647391285',
 (SELECT id FROM _labs WHERE code='AA000'),(SELECT id FROM _labs WHERE code='AB023'),
 'Congelé (−20°C)','Livraison ML',6,ARRAY['BIOCHIMIE'],
 'Reçu','Retour d''échantillons conservés — analyses génomiques complétées',
 'Marc-André Côté','Patrick Arsenault',NULL,
 '2026-04-10T13:00:00+00:00','2026-04-11T00:00:00+00:00'),

-- La Mitis → Rimouski
('819473625',
 (SELECT id FROM _labs WHERE code='AA007'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',12,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Isabelle Gagné','Sophie Rioux',NULL,
 '2026-04-10T11:30:00+00:00','2026-04-10T15:30:00+00:00'),

('294738156',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',21,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-04-14T11:30:00+00:00','2026-04-14T16:15:00+00:00'),

('736284951',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',18,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-04-14T10:30:00+00:00','2026-04-14T15:30:00+00:00'),

('481936275',
 (SELECT id FROM _labs WHERE code='AA008'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',9,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Caroline Beaulieu','Sophie Rioux',NULL,
 '2026-04-14T11:00:00+00:00','2026-04-14T14:30:00+00:00'),

('927364185',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',15,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-04-15T11:00:00+00:00','2026-04-15T16:45:00+00:00'),

('364891725',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',28,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-04-15T10:00:00+00:00','2026-04-15T21:45:00+00:00'),

('739215864',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',21,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Élise Bérubé','Marc-André Côté',NULL,
 '2026-04-16T10:00:00+00:00','2026-04-16T21:30:00+00:00'),

('481627395',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',17,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-04-16T11:00:00+00:00','2026-04-16T17:30:00+00:00'),

-- Hôpital de Maria → Rimouski — PERDU (déclaré après 5 jours sans réception)
('726394815',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',24,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'Perdu','Départ confirmé par l''expéditeur — livraison ML non présentée',
 'Geneviève Thibault','Marc-André Côté',
 'Déclaré perdu par Marc-André Côté',
 '2026-04-17T10:00:00+00:00','2026-04-22T10:00:00+00:00'),

('394817265',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',14,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'Reçu',NULL,
 'Mireille Cloutier','Marc-André Côté',NULL,
 '2026-04-17T10:00:00+00:00','2026-04-17T21:00:00+00:00'),

-- NDF → Rimouski
('817364925',
 (SELECT id FROM _labs WHERE code='AA004'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',11,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Véronique Morin','Sophie Rioux',NULL,
 '2026-04-17T11:30:00+00:00','2026-04-17T16:00:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- SEMAINE DU 22 AVRIL 2026 (réceptionnés + en cours)
-- ════════════════════════════════════════════════════════════════

-- Reçus lundi 22
('263847159',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',11,ARRAY['MICROBIOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-04-22T11:30:00+00:00','2026-04-22T19:30:00+00:00'),

('492738165',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',23,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-04-22T11:30:00+00:00','2026-04-22T16:00:00+00:00'),

('837624195',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',20,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-04-22T10:30:00+00:00','2026-04-22T15:15:00+00:00'),

-- Reçu mardi 23
('173849265',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',22,ARRAY['HEMATOLOGIE','BIOCHIMIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-04-23T11:30:00+00:00','2026-04-23T16:00:00+00:00'),

-- Reçus mercredi 24
('649371825',
 (SELECT id FROM _labs WHERE code='AA005'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',16,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'Reçu',NULL,
 'Sylvain Dionne','Sophie Rioux',NULL,
 '2026-04-24T11:00:00+00:00','2026-04-24T17:30:00+00:00'),

('382916475',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',18,ARRAY['BIOCHIMIE'],
 'Reçu',NULL,
 'Jean-François Pelletier','Sophie Rioux',NULL,
 '2026-04-25T10:30:00+00:00','2026-04-25T15:15:00+00:00'),

-- ── En transit — ALARME P (>5 jours) ─────────────────────────
-- Hôpital de Gaspé → Rimouski : en transit depuis 8 jours
-- Chauffeur injoignable depuis J+2 → alarme P déclenchée
('749261385',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',27,ARRAY['BIOCHIMIE','PATHOLOGIE'],
 'En transit','Livraison ML — coordonnées chauffeur non joignables depuis J+2',
 'Patrick Arsenault',NULL,NULL,
 '2026-04-18T10:00:00+00:00',NULL),

-- ── En transit — ALARME R (>18h) ─────────────────────────────
-- Matane : en transit depuis ~52h (envoi jeu 24)
('293748165',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',19,ARRAY['BIOCHIMIE'],
 'En transit',NULL,
 'Karine Ouellet',NULL,NULL,
 '2026-04-24T11:00:00+00:00',NULL),

-- Chandler : en transit depuis ~40h (envoi ven 25)
('816394725',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Guépard',20,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'En transit',NULL,
 'Élise Bérubé',NULL,NULL,
 '2026-04-25T10:00:00+00:00',NULL),

-- Sainte-Anne-des-Monts : en transit depuis ~40h (envoi ven 25)
('374928165',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',13,ARRAY['BIOCHIMIE','MICROBIOLOGIE'],
 'En transit',NULL,
 'Mireille Cloutier',NULL,NULL,
 '2026-04-25T10:00:00+00:00',NULL),

-- Grand-Portage (site RDL) : en transit depuis ~25h (envoi sam 25)
('629184735',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',17,ARRAY['BIOCHIMIE'],
 'En transit',NULL,
 'Jean-François Pelletier',NULL,NULL,
 '2026-04-25T10:00:00+00:00',NULL),

-- ── En transit récent (aujourd'hui dim 26) — aucune alarme ───
-- Hôpital de Maria → Rimouski
('483726195',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',25,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'En transit',NULL,
 'Geneviève Thibault',NULL,NULL,
 '2026-04-26T10:00:00+00:00',NULL),

-- Grand-Portage (site La Pocatière) → Rimouski
('917384625',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',21,ARRAY['BIOCHIMIE','HEMATOLOGIE'],
 'En transit',NULL,
 'Marie-Claude Bouchard',NULL,NULL,
 '2026-04-26T11:30:00+00:00',NULL),

-- ── En transit — départ imminent (pas encore en route) ───────────────────────────
-- Notre-Dame-du-Lac : attente du taxi
('364917825',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',9,ARRAY['MICROBIOLOGIE'],
 'En transit','Attente du taxi — départ prévu 14h00',
 'Andrée Lévesque',NULL,NULL,
 '2026-04-26T12:30:00+00:00',NULL),

-- Matane : report au lundi (chauffeur non disponible le dimanche)
('729183465',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Taxi',15,ARRAY['BIOCHIMIE'],
 'En transit','Chauffeur non disponible — report lundi matin',
 'Karine Ouellet',NULL,NULL,
 '2026-04-26T12:00:00+00:00',NULL),


-- ════════════════════════════════════════════════════════════════
-- ENVOIS HSILP — PATHOLOGIE exclusivement
-- Numérotation séquentielle HSILP00001–HSILP00010
-- (pièces chirurgicales, biopsies, cytologies)
-- ════════════════════════════════════════════════════════════════

-- Février 2026
('HSILP00001',
 (SELECT id FROM _labs WHERE code='AA001'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Commissionnaire interne',8,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Marie-Claude Bouchard','Sophie Rioux',NULL,
 '2026-02-05T11:30:00+00:00','2026-02-05T16:00:00+00:00'),

('HSILP00002',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Taxi',5,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Karine Ouellet','Sophie Rioux',NULL,
 '2026-02-12T11:00:00+00:00','2026-02-12T17:30:00+00:00'),

-- Mars 2026
('HSILP00003',
 (SELECT id FROM _labs WHERE code='AB023'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',12,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Patrick Arsenault','Marc-André Côté',NULL,
 '2026-03-10T10:00:00+00:00','2026-03-10T22:00:00+00:00'),

('HSILP00004',
 (SELECT id FROM _labs WHERE code='AB020'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Geneviève Thibault','Marc-André Côté',NULL,
 '2026-03-18T10:00:00+00:00','2026-03-18T21:15:00+00:00'),

-- Avril 2026 — réceptionnés
('HSILP00005',
 (SELECT id FROM _labs WHERE code='AB021'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Guépard',9,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Élise Bérubé','Marc-André Côté',NULL,
 '2026-04-07T10:00:00+00:00','2026-04-07T21:30:00+00:00'),

('HSILP00006',
 (SELECT id FROM _labs WHERE code='AB022'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Livraison ML',11,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Mireille Cloutier','Marc-André Côté',NULL,
 '2026-04-14T10:00:00+00:00','2026-04-14T21:45:00+00:00'),

-- Problème — conditionnement non conforme à la réception
('HSILP00007',
 (SELECT id FROM _labs WHERE code='AB026'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Livraison ML',4,ARRAY['PATHOLOGIE'],
 'Problème','Conteneur non hermétique — pièces reçues hors température réglementaire',
 'Joël Cyr','Marc-André Côté',
 'Conditionnement non conforme — signalement pathologiste de garde',
 '2026-04-17T10:00:00+00:00','2026-04-17T21:00:00+00:00'),

('HSILP00008',
 (SELECT id FROM _labs WHERE code='AA002'),(SELECT id FROM _labs WHERE code='AA000'),
 'Frigo (2–8°C)','Taxi',7,ARRAY['PATHOLOGIE'],
 'Reçu',NULL,
 'Andrée Lévesque','Sophie Rioux',NULL,
 '2026-04-22T11:30:00+00:00','2026-04-22T19:30:00+00:00'),

-- En transit (alarme R — >18h)
('HSILP00009',
 (SELECT id FROM _labs WHERE code='AA007'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Guépard',8,ARRAY['PATHOLOGIE'],
 'En transit',NULL,
 'Isabelle Gagné',NULL,NULL,
 '2026-04-24T11:30:00+00:00',NULL),

-- En transit — départ imminent
('HSILP00010',
 (SELECT id FROM _labs WHERE code='AA006'),(SELECT id FROM _labs WHERE code='AA000'),
 'Congelé (−20°C)','Taxi',6,ARRAY['PATHOLOGIE'],
 'En transit','Attente confirmation transporteur — biopsies post-opératoires urgentes',
 'Karine Ouellet',NULL,NULL,
 '2026-04-26T13:00:00+00:00',NULL)

ON CONFLICT (numero_liste) DO NOTHING;

COMMIT;
