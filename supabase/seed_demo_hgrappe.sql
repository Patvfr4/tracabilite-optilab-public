-- ============================================================
-- OPTILAB BSL-GAS — Données démo : Hors-grappe
-- Laboratoires externes + ~56 envois hors-grappe (fév–avr 2026)
-- Expéditeur unique : AA000 Rimouski → centre serveur
--
-- Prérequis : schema.sql, seed.sql exécutés
-- Exécuter avec le rôle postgres pour contourner RLS
-- Idempotent : ON CONFLICT ... DO NOTHING / DO UPDATE
-- ============================================================
--
-- UUIDs laboratoires internes (seed.sql) :
--   d8341619  AA000 Rimouski          ← expéditeur unique ici
--
-- UUIDs laboratoires externes (préfixe ee000001) :
--   ee000001-0001  HEJ
--   ee000001-0002  CHUL
--   ee000001-0003  HDQ
--   ee000001-0004  CHUS-Fleurimont
--   ee000001-0005  CHUM
--
-- Transporteur : 'Livraison ML' pour tous (courrier commercial)
-- Numéros SILP  : 9 chiffres aléatoires
-- RSOSI         : Recherche de sang oculte dans les selles (source hsilp)
-- ============================================================

BEGIN;

-- Résolution dynamique des UUIDs laboratoires
CREATE TEMP TABLE _labs (code TEXT PRIMARY KEY, id UUID) ON COMMIT DROP;
INSERT INTO _labs SELECT LEFT(name,5), id FROM laboratories;

-- ── Réinitialiser la séquence après injection manuelle ───────────────────────
-- À ajuster si des envois HG ont déjà été créés via l'application.
SELECT setval('hgrappe_seq', 56);

-- ============================================================
-- LABORATOIRES EXTERNES
-- ============================================================

INSERT INTO external_labs (
  id, name, adresse, adresse2, ville, code_postal,
  province, pays, telephone, label_text, active
) VALUES
  ('ee000001-0001-4001-8001-000000000001',
   'Hôpital de l''Enfant-Jésus (HEJ)',
   '1401, 18e rue', '', 'Québec', 'G1J 1Z4', 'QC', 'CA',
   '(418) 649-5931', 'Hôpital de l''Enfant-Jésus', TRUE),

  ('ee000001-0002-4001-8001-000000000002',
   'Centre hospitalier de l''Université Laval (CHUL)',
   '2705, boulevard Laurier', '', 'Québec', 'G1V 4G2', 'QC', 'CA',
   '(418) 654-2282', 'Centre hospitalier de l''Université Laval', TRUE),

  ('ee000001-0003-4001-8001-000000000003',
   'Hôtel-Dieu de Québec (HDQ)',
   '11, côte du Palais', '', 'Québec', 'G1R 2J6', 'QC', 'CA',
   '(418) 691-5042', 'Hôtel-Dieu de Québec', TRUE),

  ('ee000001-0004-4001-8001-000000000004',
   'CIUSSS de l''Estrie-CHUS, Site Fleurimont',
   '3001, 12e avenue Nord', '', 'Sherbrooke', 'J1H 5N4', 'QC', 'CA',
   '(819) 346-1110', 'CIUSSS de l''Estrie-CHUS — Site Fleurimont', TRUE),

  ('ee000001-0005-4001-8001-000000000005',
   'Centre hospitalier de l''Université de Montréal (CHUM)',
   '1051, rue Sanguinet', '', 'Montréal', 'H2X 3E4', 'QC', 'CA',
   '(514) 890-8000', 'Centre hospitalier de l''Université de Montréal', TRUE)

ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  adresse     = EXCLUDED.adresse,
  ville       = EXCLUDED.ville,
  code_postal = EXCLUDED.code_postal,
  telephone   = EXCLUDED.telephone,
  label_text  = EXCLUDED.label_text;

-- ============================================================
-- ENVOIS HORS-GRAPPE
-- Colonnes : numero, source, exp_labo_id, dest_ext_lab_id,
--            temperature, transporteur, nb_echantillons, numeros_silp,
--            statut, notes, cree_par_nom, type_specimen, glace_seche,
--            confirm_method, confirm_conforme, confirm_nc_types,
--            confirm_commentaire, confirm_recu_par, ts_confirm, ts_envoi
-- ============================================================

INSERT INTO envois_hgrappe (
  numero, source,
  exp_labo_id, dest_ext_lab_id,
  temperature, transporteur,
  nb_echantillons, numeros_silp,
  statut, notes, cree_par_nom, type_specimen, glace_seche,
  confirm_method, confirm_conforme, confirm_nc_types,
  confirm_commentaire, confirm_recu_par, ts_confirm,
  ts_envoi
) VALUES

-- ════════════════════════════════════════════════════════════════
-- FÉVRIER 2026 — 15 envois, tous Reçu (mix online / fax)
-- ════════════════════════════════════════════════════════════════

-- 1 — HEJ (mar 3)
('HG-260203-00001','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',12,ARRAY['487293641','923847561'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-04T10:15:00+00:00','2026-02-03T07:00:00+00:00'),

-- 2 — CHUL (mer 4)
('HG-260204-00002','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['184729364','592837461'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-02-05T09:00:00+00:00','2026-02-04T07:00:00+00:00'),

-- 3 — HEJ (jeu 5)
('HG-260205-00003','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['736482910'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-06T10:30:00+00:00','2026-02-05T07:00:00+00:00'),

-- 4 — HDQ (jeu 6)
('HG-260206-00004','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['847291638'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-02-07T09:00:00+00:00','2026-02-06T07:00:00+00:00'),

-- 5 — HEJ (lun 10)
('HG-260210-00005','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',11,ARRAY['293847165','617483920'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-11T10:00:00+00:00','2026-02-10T07:00:00+00:00'),

-- 6 — CHUL (congelé, mar 11) — glace sèche
('HG-260211-00006','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Congelé (−20°C)','Livraison ML',4,ARRAY['483920175'],
 'Reçu','Protéines spécialisées — glace sèche','Marc-André Côté','exempt',TRUE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-02-12T09:30:00+00:00','2026-02-11T07:00:00+00:00'),

-- 7 — CHUS-Fleurimont (RSOSI, mer 12)
('HG-260212-00007','hsilp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0004-4001-8001-000000000004',
 'Température pièce','Livraison ML',36,ARRAY[]::TEXT[],
 'Reçu','RSOSI — lot fév S1','Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Laboratoire Fleurimont',
 '2026-02-13T09:00:00+00:00','2026-02-12T07:00:00+00:00'),

-- 8 — HEJ (jeu 13)
('HG-260213-00008','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',8,ARRAY['728394651','192837465'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-14T09:00:00+00:00','2026-02-13T07:00:00+00:00'),

-- 9 — HDQ (lun 17)
('HG-260217-00009','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['374829165'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-02-18T09:30:00+00:00','2026-02-17T07:00:00+00:00'),

-- 10 — HEJ (mar 18)
('HG-260218-00010','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',13,ARRAY['829374651','456728391'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-19T10:15:00+00:00','2026-02-18T07:00:00+00:00'),

-- 11 — CHUM (mer 19) — analyses spécialisées
('HG-260219-00011','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0005-4001-8001-000000000005',
 'Frigo (2–8°C)','Livraison ML',3,ARRAY['673829145'],
 'Reçu','Analyses immunologie spécialisée','Marc-André Côté','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUM',
 '2026-02-20T10:00:00+00:00','2026-02-19T07:00:00+00:00'),

-- 12 — CHUL (jeu 20)
('HG-260220-00012','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',8,ARRAY['912837465','534871629'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-02-21T09:00:00+00:00','2026-02-20T07:00:00+00:00'),

-- 13 — HEJ (lun 24)
('HG-260224-00013','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',10,ARRAY['167438291'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-25T10:30:00+00:00','2026-02-24T07:00:00+00:00'),

-- 14 — HDQ (mar 25)
('HG-260225-00014','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['438291674','821936475'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-02-26T09:30:00+00:00','2026-02-25T07:00:00+00:00'),

-- 15 — HEJ (mer 26)
('HG-260226-00015','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['374628195','693847215'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-02-27T09:00:00+00:00','2026-02-26T07:00:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- MARS 2026 — 19 envois : 2 Problème, reste Reçu
-- ════════════════════════════════════════════════════════════════

-- 16 — HEJ (mar 3)
('HG-260303-00016','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',11,ARRAY['274893615'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-04T10:15:00+00:00','2026-03-03T07:00:00+00:00'),

-- 17 — CHUL (mer 4)
('HG-260304-00017','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['518293746','847362915'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-03-05T09:00:00+00:00','2026-03-04T07:00:00+00:00'),

-- 18 — HEJ — PROBLÈME : 3 tubes manquants (jeu 5)
('HG-260305-00018','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',14,ARRAY['392746185','614837295'],
 'Problème',NULL,'Marc-André Côté','exempt',FALSE,
 'online',FALSE,ARRAY['Tubes manquants','Emballage endommagé'],
 '3 tubes manquants à la réception — bon de prélèvement non fourni','Isabelle Marchand',
 '2026-03-06T10:00:00+00:00','2026-03-05T07:00:00+00:00'),

-- 19 — HDQ (ven 6)
('HG-260306-00019','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['763829145'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-03-07T09:30:00+00:00','2026-03-06T07:00:00+00:00'),

-- 20 — CHUS-Fleurimont (RSOSI, lun 9)
('HG-260309-00020','hsilp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0004-4001-8001-000000000004',
 'Température pièce','Livraison ML',42,ARRAY[]::TEXT[],
 'Reçu','RSOSI — lot mars S1','Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Laboratoire Fleurimont',
 '2026-03-10T09:00:00+00:00','2026-03-09T07:00:00+00:00'),

-- 21 — HEJ (lun 10)
('HG-260310-00021','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',12,ARRAY['528374916','741836295'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-11T10:30:00+00:00','2026-03-10T07:00:00+00:00'),

-- 22 — CHUL (congelé, mar 11) — glace sèche
('HG-260311-00022','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Congelé (−20°C)','Livraison ML',5,ARRAY['836274915'],
 'Reçu','Protéines spécialisées — glace sèche','Marc-André Côté','exempt',TRUE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-03-12T09:00:00+00:00','2026-03-11T07:00:00+00:00'),

-- 23 — HDQ (jeu 12)
('HG-260312-00023','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['192746385','374829651'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-03-13T09:00:00+00:00','2026-03-12T07:00:00+00:00'),

-- 24 — HEJ (ven 13)
('HG-260313-00024','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',10,ARRAY['584729163'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-14T10:15:00+00:00','2026-03-13T07:00:00+00:00'),

-- 25 — CHUM (mar 17) — endocrinologie
('HG-260317-00025','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0005-4001-8001-000000000005',
 'Frigo (2–8°C)','Livraison ML',4,ARRAY['392748163'],
 'Reçu','Analyses endocrinologie spécialisée','Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUM',
 '2026-03-18T10:00:00+00:00','2026-03-17T07:00:00+00:00'),

-- 26 — HEJ (mer 18)
('HG-260318-00026','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',11,ARRAY['647293815','829374615'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-19T09:00:00+00:00','2026-03-18T07:00:00+00:00'),

-- 27 — CHUL (jeu 19)
('HG-260319-00027','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',8,ARRAY['472839165','538291746'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-03-20T09:30:00+00:00','2026-03-19T07:00:00+00:00'),

-- 28 — HDQ (ven 20)
('HG-260320-00028','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['183947265'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-03-21T09:00:00+00:00','2026-03-20T07:00:00+00:00'),

-- 29 — CHUS-Fleurimont (RSOSI) — PROBLÈME : délai dépassé (lun 23)
('HG-260323-00029','hsilp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0004-4001-8001-000000000004',
 'Température pièce','Livraison ML',31,ARRAY[]::TEXT[],
 'Problème','RSOSI — lot mars S2','Marc-André Côté','exempt',FALSE,
 'online',FALSE,ARRAY['Délai dépassé'],
 'Échantillons reçus après délai de stabilité (>72h) — résultats non valides',
 'Laboratoire Fleurimont',
 '2026-03-25T09:00:00+00:00','2026-03-23T07:00:00+00:00'),

-- 30 — HEJ (mar 24)
('HG-260324-00030','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',13,ARRAY['726394851','184937265'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-25T10:30:00+00:00','2026-03-24T07:00:00+00:00'),

-- 31 — CHUL (mer 25)
('HG-260325-00031','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['592836471'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-03-26T09:30:00+00:00','2026-03-25T07:00:00+00:00'),

-- 32 — HEJ (jeu 26)
('HG-260326-00032','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['364729185','847293615'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-03-27T09:00:00+00:00','2026-03-26T07:00:00+00:00'),

-- 33 — HDQ (ven 27)
('HG-260327-00033','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['274836915'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-03-28T09:00:00+00:00','2026-03-27T07:00:00+00:00'),

-- 34 — HEJ (mar 31)
('HG-260331-00034','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',10,ARRAY['538274916'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-01T10:00:00+00:00','2026-03-31T07:00:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- AVRIL 2026 sem 1–3 — tous Reçu
-- ════════════════════════════════════════════════════════════════

-- 35 — HEJ (mer 1)
('HG-260401-00035','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',12,ARRAY['837294651','462839175'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-02T10:15:00+00:00','2026-04-01T07:00:00+00:00'),

-- 36 — CHUL (jeu 2)
('HG-260402-00036','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['193847265'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-04-03T09:00:00+00:00','2026-04-02T07:00:00+00:00'),

-- 37 — HDQ (ven 3)
('HG-260403-00037','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['728364915','354829167'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-04-04T09:30:00+00:00','2026-04-03T07:00:00+00:00'),

-- 38 — CHUS-Fleurimont (RSOSI, lun 6)
('HG-260406-00038','hsilp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0004-4001-8001-000000000004',
 'Température pièce','Livraison ML',39,ARRAY[]::TEXT[],
 'Reçu','RSOSI — lot avr S1','Marc-André Côté','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Laboratoire Fleurimont',
 '2026-04-07T09:00:00+00:00','2026-04-06T07:00:00+00:00'),

-- 39 — HEJ (mar 7)
('HG-260407-00039','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',14,ARRAY['639274815','817436295'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-08T10:30:00+00:00','2026-04-07T07:00:00+00:00'),

-- 40 — HEJ (mer 8)
('HG-260408-00040','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['274836519'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-09T09:00:00+00:00','2026-04-08T07:00:00+00:00'),

-- 41 — CHUL (jeu 9)
('HG-260409-00041','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',8,ARRAY['438197265','592736481'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-04-10T09:30:00+00:00','2026-04-09T07:00:00+00:00'),

-- 42 — HDQ (ven 10)
('HG-260410-00042','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['163742895'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-04-11T09:00:00+00:00','2026-04-10T07:00:00+00:00'),

-- 43 — CHUM (congelé, lun 14) — RQMO / génomique
('HG-260414-00043','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0005-4001-8001-000000000005',
 'Congelé (−20°C)','Livraison ML',3,ARRAY['827394165'],
 'Reçu','Analyses génomiques — RQMO','Marc-André Côté','exempt',TRUE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUM',
 '2026-04-15T10:00:00+00:00','2026-04-14T07:00:00+00:00'),

-- 44 — HEJ (lun 14)
('HG-260414-00044','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',11,ARRAY['364829175','584271936'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-15T10:30:00+00:00','2026-04-14T07:00:00+00:00'),

-- 45 — CHUL (mar 15)
('HG-260415-00045','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['294738165'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception CHUL',
 '2026-04-16T09:30:00+00:00','2026-04-15T07:00:00+00:00'),

-- 46 — HEJ (mer 16)
('HG-260416-00046','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',13,ARRAY['748293615','512837946'],
 'Reçu',NULL,'Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-17T09:00:00+00:00','2026-04-16T07:00:00+00:00'),

-- 47 — HDQ (jeu 17)
('HG-260417-00047','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',6,ARRAY['391748265'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Réception HDQ',
 '2026-04-18T09:30:00+00:00','2026-04-17T07:00:00+00:00'),


-- ════════════════════════════════════════════════════════════════
-- AVRIL — semaine du 20 : mix Reçu / Aucune réponse / En transit
-- ════════════════════════════════════════════════════════════════

-- 48 — CHUS-Fleurimont (RSOSI, lun 20)
('HG-260420-00048','hsilp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0004-4001-8001-000000000004',
 'Température pièce','Livraison ML',44,ARRAY[]::TEXT[],
 'Reçu','RSOSI — lot avr S2','Marc-André Côté','exempt',FALSE,
 'fax',TRUE,ARRAY[]::TEXT[],'','Laboratoire Fleurimont',
 '2026-04-22T09:00:00+00:00','2026-04-20T07:00:00+00:00'),

-- 49 — HEJ (lun 21)
('HG-260421-00049','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',10,ARRAY['638294715'],
 'Reçu',NULL,'Sophie Rioux','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-22T10:15:00+00:00','2026-04-21T07:00:00+00:00'),

-- 50 — CHUL (mer 22) — Aucune réponse reçue
('HG-260422-00050','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',8,ARRAY['274916385','583924716'],
 'Aucune réponse reçue',NULL,'Marc-André Côté','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-22T07:00:00+00:00'),

-- 51 — HEJ (mer 22)
('HG-260422-00051','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',12,ARRAY['748362915','193847562'],
 'Reçu',NULL,'Julie Vézina','exempt',FALSE,
 'online',TRUE,ARRAY[]::TEXT[],'','Isabelle Marchand',
 '2026-04-23T10:30:00+00:00','2026-04-22T07:00:00+00:00'),

-- 52 — HDQ (jeu 23) — Aucune réponse reçue
('HG-260423-00052','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0003-4001-8001-000000000003',
 'Frigo (2–8°C)','Livraison ML',5,ARRAY['627384915'],
 'Aucune réponse reçue',NULL,'Sophie Rioux','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-23T07:00:00+00:00'),

-- 53 — CHUL (ven 25) — Aucune réponse reçue
('HG-260425-00053','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['394827165'],
 'Aucune réponse reçue',NULL,'Marc-André Côté','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-25T07:00:00+00:00'),

-- ════════════════════════════════════════════════════════════════
-- AVRIL — 28-30 : En transit (envois récents)
-- ════════════════════════════════════════════════════════════════

-- 54 — HEJ (lun 28)
('HG-260428-00054','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',11,ARRAY['728463915','519382746'],
 'En transit',NULL,'Sophie Rioux','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-28T07:00:00+00:00'),

-- 55 — CHUL (mar 29)
('HG-260429-00055','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0002-4001-8001-000000000002',
 'Frigo (2–8°C)','Livraison ML',7,ARRAY['836274915'],
 'En transit',NULL,'Julie Vézina','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-29T07:00:00+00:00'),

-- 56 — HEJ (mer 30 — aujourd'hui)
('HG-260430-00056','silp',
 (SELECT id FROM _labs WHERE code='AA000'),'ee000001-0001-4001-8001-000000000001',
 'Frigo (2–8°C)','Livraison ML',9,ARRAY['452938176','173948265'],
 'En transit',NULL,'Sophie Rioux','exempt',FALSE,
 NULL,NULL,ARRAY[]::TEXT[],'','',NULL,
 '2026-04-30T07:00:00+00:00')

ON CONFLICT (numero) DO NOTHING;

COMMIT;
