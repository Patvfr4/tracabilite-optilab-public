-- ============================================================
-- OPTILAB BSL-GAS — Schéma complet de base de données
-- Version CONSOLIDÉE : schéma 001→024 + migrations 025→060 (reportées ici,
-- puis retirées du dépôt) + chantier « secrets et durcissement ».
-- Base générée le 2026-10-11 par application des migrations puis pg_dump ;
-- maintenue À LA MAIN depuis : ce fichier est l'UNIQUE source de vérité de la
-- base, il n'y a plus de migration de rattrapage.
-- À exécuter d'un bloc dans Supabase SQL Editor (rôle postgres, PG17) sur un
-- projet vierge.
--
-- Prérequis fournis par Supabase : schémas auth / vault, rôles anon /
-- authenticated / service_role. Extensions pg_cron et pg_net : à activer dans
-- la console (Database → Extensions ; pg_net s'y installe dans le schéma
-- « extensions ») AVANT d'exécuter ce fichier. Sans elles, tout le schéma se
-- charge, mais la planification (bloc « Tâches planifiées » en fin de fichier)
-- est sautée avec un avertissement ; ce bloc est rejouable seul. La dernière
-- instruction affiche l'état de l'installation (extensions, tâches, secret,
-- URL) et l'étape suivante : la lire après chaque exécution.
--
-- Blocs maintenus à la main (pg_dump ne les produit pas, ou pas à cet endroit) :
--   · ci-dessous : privilèges par défaut (rien d'implicite pour les rôles API) ;
--   · section « Modèle de privilèges » : révocation globale puis GRANT
--     explicites, fonctions ET tables ;
--   · fin de fichier : publication Realtime, données de référence, secret de
--     déclenchement du cron, tâches planifiées, état de l'installation.
--
-- Aléa : uniquement gen_random_uuid() (cœur de PostgreSQL ≥ 13, tiré de
-- pg_strong_random). Aucune dépendance à uuid-ossp ni à pgcrypto, que Supabase
-- installe dans le schéma « extensions » et qu'une référence public.* ne
-- trouverait pas.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault CASCADE;

-- ── Privilèges par défaut ────────────────────────────────────────────────────
-- Sur Supabase, selon l'âge du projet et le réglage « Automatically expose new
-- tables », tout objet créé par postgres dans public est accordé d'office à
-- anon, authenticated et service_role (doc « Securing your API › Default
-- privileges »), et toute fonction est exécutable par PUBLIC (défaut de
-- PostgreSQL). Un « REVOKE ... FROM PUBLIC » ne retire pas ces octrois-là.
-- On les supprime AVANT de créer le moindre objet : chaque droit de ce fichier
-- est ainsi accordé explicitement, quel que soit le projet cible.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.11
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--



--
-- Name: _allowed_secret_names(); Type: FUNCTION; Schema: public; Owner: -
--

-- Liste blanche des secrets applicatifs du Vault. Elle borne l'écriture
-- (set_app_secret, delete_app_secret), l'état (list_app_secrets_status) ET
-- la lecture (get_app_secret) : aucune autre entrée du Vault n'est joignable
-- par ces RPC. Elle ne borne QUE les RPC : sur Supabase, l'extension
-- supabase_vault accorde aussi à service_role des droits directs sur le schéma
-- vault (lecture de vault.decrypted_secrets, create_secret, update_secret),
-- que postgres ne peut pas révoquer. Ils ne sont joignables que par SQL, pas
-- par PostgREST, tant que « vault » n'est pas ajouté aux schémas exposés de
-- la Data API (ne jamais l'y ajouter).
-- NOTIFY_TRIGGER_SECRET y figure pour être LU (send-notifications) et
-- affiché, mais il n'est jamais saisi : rotate_notify_trigger_secret le
-- génère côté serveur. TURNSTILE_SECRET_KEY a été retiré : la clé secrète
-- Turnstile est un réglage Auth de la plateforme, rien ne la lisait ici.
CREATE FUNCTION public._allowed_secret_names() RETURNS text[]
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT ARRAY[
    'RESEND_API_KEY',
    'SMTP_PASS',
    'NOTIFY_TRIGGER_SECRET'
  ];
$$;


--
-- Name: _hex_aleatoire_32(); Type: FUNCTION; Schema: public; Owner: -
--

-- 32 octets aléatoires en hexadécimal (64 caractères). Source d'aléa : trois
-- UUID v4 de gen_random_uuid() (cœur de PostgreSQL, pg_strong_random), soit
-- 366 bits, condensés par sha256() (cœur, PG ≥ 11) en 256 bits. Fonctionne à
-- l'identique sur Supabase, en CI et en local, sans pgcrypto.
CREATE FUNCTION public._hex_aleatoire_32() RETURNS text
    LANGUAGE sql VOLATILE
    SET search_path TO 'pg_catalog'
    AS $$
  SELECT encode(sha256(uuid_send(gen_random_uuid())
                    || uuid_send(gen_random_uuid())
                    || uuid_send(gen_random_uuid())), 'hex');
$$;


--
-- Name: _generer_verify_code(); Type: FUNCTION; Schema: public; Owner: -
--

-- Code de vérification hors-grappe imprimé sur le F-G-74 : 10 caractères tirés
-- d'un alphabet de 32 symboles sans caractères ambigus (ni I, ni O, ni 0, ni 1),
-- soit 50 bits d'aléa. Chaque symbole prend les 5 bits de poids faible d'un
-- octet d'un UUID v4 (gen_random_uuid, pg_strong_random). Les octets 6 et 8,
-- qui portent la version et la variante de l'UUID, sont écartés : les dix
-- octets retenus ont leurs 5 bits bas entièrement aléatoires. 32 divise 256,
-- donc le tirage est uniforme.
CREATE FUNCTION public._generer_verify_code() RETURNS text
    LANGUAGE plpgsql VOLATILE
    SET search_path TO 'pg_catalog'
    AS $$
DECLARE
  c_alphabet CONSTANT text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_octets   bytea := uuid_send(gen_random_uuid());
  v_code     text  := '';
  v_i        int;
BEGIN
  FOREACH v_i IN ARRAY ARRAY[0, 1, 2, 3, 4, 5, 9, 10, 11, 12] LOOP
    v_code := v_code || substr(c_alphabet, (get_byte(v_octets, v_i) & 31) + 1, 1);
  END LOOP;
  RETURN v_code;
END;
$$;


--
-- Name: _vault_ecrire(text, text); Type: FUNCTION; Schema: public; Owner: -
--

-- Écrit un secret du Vault par son API documentée : vault.create_secret à la
-- création, vault.update_secret à la rotation. Jamais d'UPDATE direct sur
-- vault.secrets : depuis supabase_vault 0.3 il n'y a plus de déclencheur de
-- chiffrement et postgres n'a pas le droit UPDATE sur la table (la rotation
-- échouait ; là où l'UPDATE passerait, la valeur serait écrite en clair).
-- Renvoie 'CREATE' ou 'UPDATE'. Réservée au propriétaire : appelée seulement
-- par les fonctions SECURITY DEFINER ci-dessous et par le bloc d'installation.
CREATE FUNCTION public._vault_ecrire(p_name text, p_value text) RETURNS text
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = p_name;
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, p_name, 'OPTILAB — secret applicatif');
    RETURN 'CREATE';
  END IF;
  PERFORM vault.update_secret(v_id, p_value);
  RETURN 'UPDATE';
END;
$$;


--
-- Name: _journaliser_secret(text, text); Type: FUNCTION; Schema: public; Owner: -
--

-- Ligne d'audit d'un changement de secret, JAMAIS la valeur. L'acteur vient de
-- la session (auth.uid()), pas d'un paramètre : il ne peut pas être emprunté.
-- Sans session utilisateur (installation, déclencheur appelé par
-- service_role), l'acteur est « système ». Horodatage clock_timestamp() et non
-- now() : deux changements d'une même transaction (par exemple effacement de
-- SMTP_PASS puis nouvelle saisie) restent ordonnés pour « dernière action ».
CREATE FUNCTION public._journaliser_secret(p_name text, p_action text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO app_secrets_audit (secret_name, action, changed_by_id, changed_by_nom, changed_at)
  VALUES (
    p_name, p_action, auth.uid(),
    COALESCE((SELECT nom FROM profiles WHERE id = auth.uid()),
             CASE WHEN auth.uid() IS NULL THEN 'système' ELSE '' END),
    clock_timestamp()
  );
END;
$$;


--
-- Name: _compute_codes_icr(boolean, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._compute_codes_icr(p_glace_seche boolean, p_hors_corridor boolean) RETURNS text[]
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(ARRAY(
    SELECT c.code FROM icr_codes c
    WHERE c.actif = TRUE AND (
      (c.code = '70008' AND p_glace_seche    = TRUE)
      OR
      (c.code = '70009' AND p_hors_corridor  = TRUE)
    )
    ORDER BY c.ordre
  ), '{}');
$$;


--
-- Name: _detect_alarm_envois(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._detect_alarm_envois() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN

  -- ── Intra-grappe : Alarme R (retard > alarm_hours, pas encore Alarme P) ──
  INSERT INTO notification_queue
    (type, envoi_id, exp_labo_id, dest_labo_id, envoi_numero, departements, details)
  SELECT
    'alarm_r',
    sub.id,
    sub.exp_labo_id,
    sub.dest_labo_id,
    sub.numero,
    COALESCE(sub.departements, '{}'),
    jsonb_build_object(
      'ts_envoi',    sub.ts_envoi,
      'age_heures',  ROUND(sub.age_h::NUMERIC, 1),
      'seuil_heures', sub.alarm_hours
    )
  FROM (
    SELECT
      e.*,
      EXTRACT(EPOCH FROM (NOW() - e.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_hours' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_hours' LIMIT 1),
        18
      ) AS alarm_hours,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_days' LIMIT 1),
        5
      ) AS alarm_days
    FROM envois e
    WHERE e.statut = 'En transit'
      AND e.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.alarm_hours        -- dépasse le seuil R
    AND sub.age_h <  sub.alarm_days * 24    -- pas encore en alarme P (évite le doublon)
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_id = sub.id
        AND q.type IN ('alarm_r', 'alarm')
    );

  -- ── Intra-grappe : Alarme P (potentiellement perdu > alarm_days) ──────────
  INSERT INTO notification_queue
    (type, envoi_id, exp_labo_id, dest_labo_id, envoi_numero, departements, details)
  SELECT
    'alarm',
    sub.id,
    sub.exp_labo_id,
    sub.dest_labo_id,
    sub.numero,
    COALESCE(sub.departements, '{}'),
    jsonb_build_object(
      'ts_envoi',   sub.ts_envoi,
      'age_heures', ROUND(sub.age_h::NUMERIC, 1),
      'seuil_jours', sub.alarm_days
    )
  FROM (
    SELECT
      e.*,
      EXTRACT(EPOCH FROM (NOW() - e.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = e.exp_labo_id
         WHERE gc.key = 'alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'alarm_days' LIMIT 1),
        5
      ) AS alarm_days
    FROM envois e
    WHERE e.statut = 'En transit'
      AND e.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.alarm_days * 24
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_id = sub.id AND q.type = 'alarm'
    );

  -- ── Hors-grappe : absence de confirmation > hgrappe_alarm_days ───────────
  INSERT INTO notification_queue
    (type, envoi_hg_id, exp_labo_id, envoi_numero, departements, details)
  SELECT
    'hg_alarm',
    sub.id,
    sub.exp_labo_id,
    sub.numero,
    '{}',
    jsonb_build_object(
      'ts_envoi',   sub.ts_envoi,
      'age_heures', ROUND(sub.age_h::NUMERIC, 1),
      'seuil_jours', sub.hg_days
    )
  FROM (
    SELECT
      h.*,
      EXTRACT(EPOCH FROM (NOW() - h.ts_envoi)) / 3600 AS age_h,
      COALESCE(
        (SELECT (gc.value#>>'{}')::INTEGER
         FROM grappe_config gc
         JOIN laboratories l ON l.grappe_id = gc.grappe_id AND l.id = h.exp_labo_id
         WHERE gc.key = 'hgrappe_alarm_days' LIMIT 1),
        (SELECT (ac.value#>>'{}')::INTEGER FROM app_config ac WHERE ac.key = 'hgrappe_alarm_days' LIMIT 1),
        3
      ) AS hg_days
    FROM envois_hgrappe h
    WHERE h.statut = 'En transit'
      AND h.ts_envoi IS NOT NULL
  ) sub
  WHERE sub.age_h >= sub.hg_days * 24
    AND NOT EXISTS (
      SELECT 1 FROM notification_queue q
      WHERE q.envoi_hg_id = sub.id AND q.type = 'hg_alarm'
    );

END;
$$;


--
-- Name: _purge_envois_audit(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._purge_envois_audit() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  DELETE FROM envois_audit WHERE changed_at < now() - interval '12 months';
$$;


--
-- Name: _role_rank(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public._role_rank(p_role text) RETURNS integer
    LANGUAGE sql IMMUTABLE
    SET search_path TO 'public'
    AS $$
  SELECT CASE p_role
    WHEN 'admin'              THEN 4
    WHEN 'superviseur_grappe' THEN 3
    WHEN 'superviseur_labo'   THEN 2
    WHEN 'technicien'         THEN 1
    ELSE 0
  END;
$$;


--
-- Name: add_envois_to_bon(uuid, uuid[], uuid[], jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.add_envois_to_bon(p_bon_id uuid, p_envoi_ids uuid[], p_hg_envoi_ids uuid[], p_transporteur_map jsonb DEFAULT NULL::jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_labo_id UUID;
BEGIN
  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = p_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF cardinality(p_envoi_ids) = 0 AND cardinality(p_hg_envoi_ids) = 0 THEN
    RAISE EXCEPTION 'Aucun envoi sélectionné';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
             WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
  OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
             WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
  THEN RAISE EXCEPTION 'Impossible d''ajouter : au moins un envoi du bon a été réceptionné.'; END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible d''ajouter : la date de prise en charge a été renseignée.';
  END IF;
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != v_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente.'; END IF;

  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
  END IF;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type) SELECT p_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;
  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type) SELECT p_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT p_bon_id, t.tr, ''
  FROM (
    SELECT transporteur AS tr FROM envois WHERE id = ANY(p_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('ok', true);
END;
$$;


--
-- Name: annuler_envoi(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.annuler_envoi(p_envoi_id uuid, p_note text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_statut    TEXT;
  v_exp_labo  UUID;
  v_annule    TIMESTAMPTZ;
  v_createur  UUID;
  v_in_bon    BOOLEAN;
  v_par_nom   TEXT;
BEGIN
  SELECT statut, exp_labo_id, annule_at, cree_par_id
  INTO v_statut, v_exp_labo, v_annule, v_createur
  FROM envois WHERE id = p_envoi_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Envoi introuvable.'; END IF;

  IF NOT (v_exp_labo = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe','admin'))
  THEN RAISE EXCEPTION 'Accès refusé.'; END IF;

  IF NOT (
    auth.uid() = v_createur
    OR current_lab_role(v_exp_labo) = 'responsable'
    OR current_role_name() IN ('superviseur_grappe','admin','superviseur_labo')
  ) THEN
    RAISE EXCEPTION 'Seul le créateur de l''envoi ou un responsable de laboratoire peut l''annuler.';
  END IF;

  IF v_annule IS NOT NULL THEN RAISE EXCEPTION 'Cet envoi est déjà annulé.'; END IF;

  IF v_statut NOT IN ('En attente','En transit') THEN
    RAISE EXCEPTION 'Seuls les envois en attente ou en transit peuvent être annulés.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM bons_depart_envois bde
    JOIN bons_depart bd ON bde.bon_id = bd.id
    WHERE bde.envoi_id = p_envoi_id AND bd.statut = 'actif'
  ) INTO v_in_bon;

  IF v_in_bon THEN
    RAISE EXCEPTION 'Cet envoi fait partie d''un bon de départ actif. Retirez-le du bon avant de l''annuler.';
  END IF;

  IF p_note IS NULL OR TRIM(p_note) = '' THEN
    RAISE EXCEPTION 'Un commentaire est requis pour annuler un envoi.';
  END IF;

  SELECT nom INTO v_par_nom FROM profiles WHERE id = auth.uid();

  UPDATE envois SET
    statut         = 'Annulé',
    annule_at      = NOW(),
    annule_par_id  = auth.uid(),
    annule_par_nom = v_par_nom,
    annule_note    = TRIM(p_note)
  WHERE id = p_envoi_id;

  INSERT INTO envois_audit (
    table_name, record_id, action,
    old_data, new_data, changed_fields,
    changed_by_id, changed_by_nom
  ) VALUES (
    'envois', p_envoi_id, 'ANNULATION',
    json_build_object('statut', v_statut, 'annule_at', NULL),
    json_build_object('statut','Annulé','annule_at',NOW(),'annule_note',TRIM(p_note)),
    ARRAY['statut','annule_at','annule_note'],
    auth.uid(), v_par_nom
  );
END;
$$;


--
-- Name: cancel_bon_depart(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancel_bon_depart(p_bon_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_labo_id UUID;
BEGIN
  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = p_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou déjà annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
             WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
  OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
             WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
  THEN RAISE EXCEPTION 'Impossible d''annuler : au moins un envoi a été réceptionné.'; END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible d''annuler : la date de prise en charge a été renseignée.';
  END IF;

  UPDATE envois SET statut = 'En attente', ts_envoi = created_at
  WHERE id IN (SELECT envoi_id FROM bons_depart_envois WHERE bon_id = p_bon_id AND type = 'intra');
  UPDATE envois_hgrappe SET statut = 'En attente', ts_envoi = created_at
  WHERE id IN (SELECT hg_envoi_id FROM bons_depart_envois WHERE bon_id = p_bon_id AND type = 'hg');
  UPDATE bons_depart SET statut = 'annulé' WHERE id = p_bon_id;
  RETURN json_build_object('ok', true);
END;
$$;


--
-- Name: check_bon_completion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.check_bon_completion(p_bon_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  UPDATE bons_depart SET statut = 'récupéré'
  WHERE id = p_bon_id AND statut = 'actif'
    AND (
      EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = p_bon_id AND date_prise_en_charge IS NOT NULL)
      OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois e ON bde.envoi_id = e.id
                 WHERE bde.bon_id = p_bon_id AND e.statut NOT IN ('En attente','En transit'))
      OR EXISTS (SELECT 1 FROM bons_depart_envois bde JOIN envois_hgrappe he ON bde.hg_envoi_id = he.id
                 WHERE bde.bon_id = p_bon_id AND he.statut NOT IN ('En attente','En transit'))
    );
END;
$$;


--
-- Name: confirm_envoi_hgrappe(uuid, boolean, text[], text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.confirm_envoi_hgrappe(p_token uuid, p_conforme boolean, p_nc_types text[], p_commentaire text, p_recu_par text, p_ts_confirm timestamp with time zone) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_id       UUID;
  v_statut   TEXT;
  v_exp_labo UUID;
  v_numero   TEXT;
BEGIN
  v_statut := CASE WHEN p_conforme THEN 'Reçu' ELSE 'Problème' END;

  -- Lecture, garde d'usage unique et ecriture en UNE seule instruction.
  -- L'ancien code etait un check-then-act : un SELECT ... INTO non verrouillant
  -- puis un UPDATE ... WHERE id = v_id qui ne reaffirmait PAS ts_confirm IS
  -- NULL. Sous READ COMMITTED la verification n'etait donc pas atomique avec
  -- l'ecriture, et des appelants concurrents porteurs d'un meme jeton
  -- franchissaient tous l'unique branche de rejet. Ici le second ecrivain
  -- reevalue le predicat apres liberation du verrou de ligne, trouve
  -- ts_confirm non NULL, et ne touche aucune ligne.
  UPDATE envois_hgrappe SET
    statut              = v_statut,
    confirm_method      = 'online',
    confirm_conforme    = p_conforme,
    confirm_nc_types    = p_nc_types,
    confirm_commentaire = p_commentaire,
    confirm_recu_par    = p_recu_par,
    ts_confirm          = COALESCE(p_ts_confirm, NOW())
  WHERE confirm_token = p_token
    AND ts_confirm IS NULL
  RETURNING id, exp_labo_id, numero
    INTO v_id, v_exp_labo, v_numero;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found_or_already_confirmed');
  END IF;

  IF NOT p_conforme THEN
    INSERT INTO notification_queue (
      type, envoi_hg_id, exp_labo_id, envoi_numero, details
    ) VALUES (
      'hg_nc', v_id, v_exp_labo, v_numero,
      json_build_object(
        'nc_types', p_nc_types, 'commentaire', p_commentaire,
        'recu_par', p_recu_par, 'conforme', false, 'method', 'online'
      )
    );
  END IF;

  RETURN json_build_object('ok', true, 'statut', v_statut);
END;
$$;


--
-- Name: count_recent_login_failures(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.count_recent_login_failures(p_employee_id text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_count        INTEGER;
  v_retry_after  INTEGER;
  v_window_start TIMESTAMPTZ;
  v_clean        TEXT;
BEGIN
  v_clean := LOWER(TRIM(COALESCE(p_employee_id, '')));
  IF v_clean = '' THEN
    RETURN json_build_object('count', 0, 'retry_after_seconds', 0);
  END IF;

  v_window_start := NOW() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_count
  FROM login_attempts
  WHERE LOWER(employee_id) = v_clean
    AND success = FALSE
    AND attempted_at > v_window_start;

  IF v_count < 5 THEN
    RETURN json_build_object('count', v_count, 'retry_after_seconds', 0);
  END IF;

  SELECT EXTRACT(EPOCH FROM (MIN(attempted_at) + INTERVAL '15 minutes' - NOW()))::INTEGER
    INTO v_retry_after
  FROM login_attempts
  WHERE LOWER(employee_id) = v_clean
    AND success = FALSE
    AND attempted_at > v_window_start;

  RETURN json_build_object('count', v_count, 'retry_after_seconds', GREATEST(v_retry_after, 1));
END;
$$;


--
-- Name: create_bon_depart(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.create_bon_depart(p_labo_id uuid, p_cree_par_id uuid, p_cree_par_nom text, p_envoi_ids uuid[], p_hg_envoi_ids uuid[], p_bon_connaissements jsonb, p_transporteur_map jsonb DEFAULT NULL::jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_num TEXT; v_bon_id UUID;
BEGIN
  IF NOT (p_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF cardinality(p_envoi_ids) = 0 AND cardinality(p_hg_envoi_ids) = 0 THEN
    RAISE EXCEPTION 'Aucun envoi sélectionné';
  END IF;
  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (statut != 'En attente' OR exp_labo_id != p_labo_id)
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG ne sont pas en attente ou n''appartiennent pas à ce laboratoire.'; END IF;

  IF p_transporteur_map IS NOT NULL THEN
    IF cardinality(p_envoi_ids) > 0 THEN
      UPDATE envois SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
    IF cardinality(p_hg_envoi_ids) > 0 THEN
      UPDATE envois_hgrappe SET transporteur = p_transporteur_map->>(id::text)
      WHERE id = ANY(p_hg_envoi_ids) AND p_transporteur_map->>(id::text) IS NOT NULL AND p_transporteur_map->>(id::text) != '';
    END IF;
  END IF;

  IF cardinality(p_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois WHERE id = ANY(p_envoi_ids) AND (transporteur IS NULL OR transporteur = '')
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois n''ont pas de transporteur assigné.'; END IF;
  IF cardinality(p_hg_envoi_ids) > 0 AND EXISTS (
    SELECT 1 FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND (transporteur IS NULL OR transporteur = '')
  ) THEN RAISE EXCEPTION 'Un ou plusieurs envois HG n''ont pas de transporteur assigné.'; END IF;

  v_num := 'BD-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(CAST(nextval('bd_seq') AS TEXT), 4, '0');
  INSERT INTO bons_depart (numero, labo_id, cree_par_id, cree_par_nom)
  VALUES (v_num, p_labo_id, p_cree_par_id, p_cree_par_nom) RETURNING id INTO v_bon_id;

  IF cardinality(p_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, envoi_id, type) SELECT v_bon_id, unnest(p_envoi_ids), 'intra';
    UPDATE envois SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_envoi_ids);
  END IF;
  IF cardinality(p_hg_envoi_ids) > 0 THEN
    INSERT INTO bons_depart_envois (bon_id, hg_envoi_id, type) SELECT v_bon_id, unnest(p_hg_envoi_ids), 'hg';
    UPDATE envois_hgrappe SET statut = 'En transit', ts_envoi = NOW() WHERE id = ANY(p_hg_envoi_ids);
  END IF;

  INSERT INTO bons_depart_sections (bon_id, transporteur, bon_connaissement)
  SELECT DISTINCT v_bon_id, t.tr, COALESCE(p_bon_connaissements->>(t.tr), '')
  FROM (
    SELECT transporteur AS tr FROM envois WHERE id = ANY(p_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
    UNION
    SELECT transporteur AS tr FROM envois_hgrappe WHERE id = ANY(p_hg_envoi_ids) AND transporteur IS NOT NULL AND transporteur != ''
  ) t
  ON CONFLICT (bon_id, transporteur) DO NOTHING;

  RETURN json_build_object('numero', v_num, 'id', v_bon_id);
END;
$$;


--
-- Name: create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

-- Seule version conservée : les surcharges à 13 et 14 paramètres (sans
-- hors_corridor ni codes_icr), qu'aucun client n'appelait plus, ont été
-- supprimées (nettoyage du linter). Renvoie aussi le code de vérification
-- généré par le serveur (verify_code), imprimé sur le F-G-74.
CREATE FUNCTION public.create_envoi_hgrappe(p_source text, p_exp_labo_id uuid, p_dest_ext_lab_id uuid, p_temperature text, p_transporteur text, p_nb_echantillons integer, p_numeros_silp text[], p_notes text, p_cree_par_id uuid, p_cree_par_nom text, p_type_specimen text, p_glace_seche boolean, p_statut text DEFAULT 'En transit'::text, p_echantillons_depart text[] DEFAULT '{}'::text[], p_hors_corridor boolean DEFAULT false) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_num TEXT; v_token UUID; v_code TEXT;
BEGIN
  IF NOT (
    p_exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi hors-grappe pour ce laboratoire.';
  END IF;
  v_num := 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
           LPAD(CAST(nextval('hgrappe_seq') AS TEXT), 5, '0');
  INSERT INTO envois_hgrappe (
    numero, source, exp_labo_id, dest_ext_lab_id, temperature, transporteur,
    nb_echantillons, numeros_silp, statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche,
    echantillons_depart,
    hors_corridor, codes_icr
  ) VALUES (
    v_num, p_source, p_exp_labo_id, p_dest_ext_lab_id, p_temperature, p_transporteur,
    p_nb_echantillons, p_numeros_silp, p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche,
    p_echantillons_depart,
    p_hors_corridor, _compute_codes_icr(p_glace_seche, p_hors_corridor)
  ) RETURNING confirm_token, verify_code INTO v_token, v_code;
  RETURN json_build_object('numero', v_num, 'token', v_token::text, 'verify_code', v_code);
END;
$$;


--
-- Name: create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean); Type: FUNCTION; Schema: public; Owner: -
--

-- Seule version conservée (les surcharges à 12 et 13 paramètres, sans
-- hors_corridor ni codes_icr, ont été supprimées : aucun client ne les appelait).
CREATE FUNCTION public.create_envoi_hsilp(p_exp_labo_id uuid, p_dest_labo_id uuid, p_temperature text, p_transporteur text, p_nb_echantillons integer, p_departements text[], p_notes text, p_cree_par_id uuid, p_cree_par_nom text, p_type_specimen text, p_glace_seche boolean, p_statut text DEFAULT 'En transit'::text, p_echantillons_depart text[] DEFAULT '{}'::text[], p_hors_corridor boolean DEFAULT false) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_num TEXT;
BEGIN
  IF NOT (
    p_exp_labo_id = ANY(current_labo_ids())
    OR current_role_name() IN ('superviseur_grappe', 'admin')
  ) THEN
    RAISE EXCEPTION 'Accès refusé : vous ne pouvez pas créer un envoi pour ce laboratoire.';
  END IF;

  INSERT INTO envois (
    exp_labo_id, dest_labo_id,
    temperature, transporteur, nb_echantillons, departements,
    statut, notes, cree_par_id, cree_par_nom,
    ts_envoi, type_specimen, glace_seche, numeros_silp,
    echantillons_depart,
    hors_corridor, codes_icr
  ) VALUES (
    p_exp_labo_id, p_dest_labo_id,
    p_temperature, p_transporteur, p_nb_echantillons, p_departements,
    p_statut, p_notes, p_cree_par_id, p_cree_par_nom,
    NOW(), p_type_specimen, p_glace_seche, '{}',
    p_echantillons_depart,
    p_hors_corridor, _compute_codes_icr(p_glace_seche, p_hors_corridor)
  ) RETURNING numero INTO v_num;

  RETURN v_num;
END;
$$;


--
-- Name: current_lab_role(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_lab_role(p_labo_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    -- Un compte desactive, ou qui doit encore changer son mot de passe
    -- temporaire, n'a plus de role local.
    WHEN NOT EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND active AND must_change_password IS NOT TRUE
    ) THEN NULL
    WHEN current_role_name() IN ('admin','superviseur_grappe') THEN 'responsable'
    ELSE (SELECT lab_role FROM user_lab_memberships
          WHERE profile_id = auth.uid() AND labo_id = p_labo_id)
  END;
$$;


--
-- Name: current_labo_id(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_labo_id() RETURNS uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- NULL reste « aucun laboratoire » ; un compte desactive, ou en attente de
  -- changement de mot de passe, n'en expose plus.
  SELECT labo_id FROM profiles
   WHERE id = auth.uid() AND active AND must_change_password IS NOT TRUE;
$$;


--
-- Name: current_labo_ids(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_labo_ids() RETURNS uuid[]
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT CASE
    -- Un compte desactive renvoie un ensemble VIDE. Sans ceci, un technicien
    -- desactive gardait ses appartenances par la branche ELSE et continuait
    -- donc de lire et d'ecrire les envois de son laboratoire. Meme regle tant
    -- que le mot de passe temporaire n'a pas ete change.
    WHEN NOT EXISTS (
      SELECT 1 FROM profiles
       WHERE id = auth.uid() AND active AND must_change_password IS NOT TRUE
    ) THEN '{}'::uuid[]
    WHEN current_role_name() IN ('admin','superviseur_grappe')
    THEN ARRAY(SELECT id FROM laboratories WHERE active = true)
    ELSE
      COALESCE(
        NULLIF(ARRAY(SELECT labo_id FROM user_lab_memberships WHERE profile_id = auth.uid()), '{}'),
        COALESCE(
          NULLIF((SELECT labo_ids FROM profiles WHERE id = auth.uid()), '{}'),
          ARRAY(SELECT labo_id FROM profiles WHERE id = auth.uid() AND labo_id IS NOT NULL)
        )
      )
  END;
$$;


--
-- Name: current_role_name(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.current_role_name() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- Ne renvoie JAMAIS NULL : '' pour une session sans ligne profiles OU dont le
  -- compte est desactive. Corrige ici plutot que sur les 16 sites de garde :
  -- c'est le seul point par lequel passent tous les gardes et toutes les
  -- policies, donc aucun site ne peut etre oublie et tout garde futur herite de
  -- la propriete. '' n'egale aucun role, donc un garde ecrit en permis nie
  -- refuse desormais au lieu de ne rien faire -- NOT (FALSE OR NULL) vaut NULL,
  -- et IF NULL THEN n'execute pas sa branche. _role_rank('') vaut 0.
  --
  -- « Aucun droit » aussi tant que must_change_password est vrai : le
  -- changement impose du mot de passe temporaire est une entree
  -- d'autorisation appliquee par le SERVEUR, pas par le navigateur. La lecture
  -- de son propre profil reste possible (policy « Lecture profil (soi-meme) »,
  -- id = auth.uid(), independante de cette fonction) : c'est ce qui permet au
  -- client de lire le drapeau a la connexion et d'afficher l'ecran dedie.
  SELECT COALESCE(
    (SELECT role FROM profiles
      WHERE id = auth.uid() AND active AND must_change_password IS NOT TRUE),
    ''
  );
$$;


--
-- Name: generate_envoi_numero(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_envoi_numero() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.numero IS NULL THEN
    NEW.numero := CASE WHEN NEW.numeros_silp IS NULL
                         OR array_length(NEW.numeros_silp, 1) IS NULL
                       THEN 'HSILP-' ELSE 'SILP-' END
               || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
                  LPAD(CAST(nextval('envoi_seq'::regclass) AS TEXT), 5, '0');
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: get_app_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

-- Lecture en clair d'un secret applicatif, pour les fonctions Edge seulement.
-- Accès : EXECUTE accordé au SEUL service_role (clé secrète Supabase, rôle
-- service_role côté PostgREST) ; révoqué explicitement à PUBLIC, anon et
-- authenticated (section « Modèle de privilèges »). Deux gardes en défense en
-- profondeur, au cas où ces droits seraient un jour élargis par erreur :
--   · nom hors liste blanche → refus (on ne lit pas n'importe quelle entrée du
--     Vault, par exemple celles d'un autre usage) ;
--   · appel par PostgREST sous anon ou authenticated → refus. Le paramètre
--     « role » est posé par PostgREST (SET ROLE) et n'est pas modifié par
--     SECURITY DEFINER, contrairement à current_user.
-- Renvoie NULL si le secret n'est pas configuré.
CREATE FUNCTION public.get_app_secret(p_name text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_secret TEXT;
BEGIN
  IF current_setting('role', true) IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Accès refusé.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR NOT (p_name = ANY(_allowed_secret_names())) THEN
    RAISE EXCEPTION 'Nom de secret non autorisé.' USING ERRCODE = '42501';
  END IF;

  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = p_name;
  RETURN v_secret;
END;
$$;


--
-- Name: get_envoi_hgrappe_by_numero(text, text); Type: FUNCTION; Schema: public; Owner: -
--

-- Confirmation hors-grappe par « numéro + code » (page publique /confirm,
-- appelée par anon). Le code comparé est verify_code : 10 caractères, 50 bits
-- d'aléa, générés par le serveur à l'insertion et INDÉPENDANTS du jeton. L'ancien
-- code était le préfixe de 6 caractères hexadécimaux du jeton (24 bits) et
-- s'échangeait contre le jeton complet : il n'est plus accepté.
-- Refusé ('disabled') si la confirmation par numéro est désactivée pour la
-- grappe du laboratoire expéditeur : la bascule de l'administration est
-- désormais appliquée par le serveur, pas seulement masquée à l'impression.
-- Le jeton complet reste renvoyé en cas de succès : la page en a besoin pour
-- confirm_envoi_hgrappe.
CREATE FUNCTION public.get_envoi_hgrappe_by_numero(p_numero text, p_verify_code text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_e                envois_hgrappe%ROWTYPE;
  v_exp_name         TEXT;
  v_dest_name        TEXT;
  v_dest_parent_name TEXT;
  v_code_saisi       TEXT;
  v_numero_clean     TEXT;
  v_fail_count       INTEGER;
  v_retry_after      INTEGER;
  v_window_start     TIMESTAMPTZ;
BEGIN
  v_numero_clean := UPPER(TRIM(COALESCE(p_numero, '')));
  IF v_numero_clean = '' THEN
    RETURN json_build_object('error', 'not_found');
  END IF;

  -- Sérialise les tentatives sur un même numéro : sans ce verrou, des requêtes
  -- parallèles lisaient toutes le même compteur avant qu'aucune n'écrive, et
  -- testaient plus de 5 codes par fenêtre.
  PERFORM pg_advisory_xact_lock(hashtext('hg_confirm:' || v_numero_clean));

  -- ── Rate-limit : 5 échecs / 15 min par numéro ──────────────────────────────
  v_window_start := NOW() - INTERVAL '15 minutes';

  SELECT COUNT(*) INTO v_fail_count
  FROM hg_confirm_attempts
  WHERE numero = v_numero_clean
    AND attempted_at > v_window_start;

  IF v_fail_count >= 5 THEN
    SELECT EXTRACT(EPOCH FROM (
      MIN(attempted_at) + INTERVAL '15 minutes' - NOW()
    ))::INTEGER
    INTO v_retry_after
    FROM hg_confirm_attempts
    WHERE numero = v_numero_clean
      AND attempted_at > v_window_start;

    RETURN json_build_object(
      'error',               'too_many_attempts',
      'retry_after_seconds', GREATEST(v_retry_after, 1)
    );
  END IF;

  -- ── Logique de lookup ──────────────────────────────────────────────────────
  SELECT * INTO v_e FROM envois_hgrappe WHERE numero = v_numero_clean;
  IF NOT FOUND THEN
    INSERT INTO hg_confirm_attempts (numero, reason) VALUES (v_numero_clean, 'not_found');
    RETURN json_build_object('error', 'not_found');
  END IF;

  -- Bascule « confirmation par numéro » de la grappe du laboratoire expéditeur.
  IF NOT _hg_confirm_par_numero_actif(
           (SELECT grappe_id FROM laboratories WHERE id = v_e.exp_labo_id)) THEN
    RETURN json_build_object('error', 'disabled');
  END IF;

  -- Saisie normalisée : majuscules, sans espaces ni tirets (le code peut être
  -- imprimé par groupes). Comparaison au seul verify_code.
  v_code_saisi := regexp_replace(upper(COALESCE(p_verify_code, '')), '[^A-Z0-9]', '', 'g');
  IF v_code_saisi IS DISTINCT FROM v_e.verify_code THEN
    INSERT INTO hg_confirm_attempts (numero, reason) VALUES (v_numero_clean, 'wrong_code');
    RETURN json_build_object('error', 'wrong_code');
  END IF;

  -- ── Succès — Auto-purge opportuniste des entrées > 24 h ────────────────────
  DELETE FROM hg_confirm_attempts WHERE attempted_at < NOW() - INTERVAL '24 hours';

  -- ── Réponse normale ────────────────────────────────────────────────────────
  SELECT name INTO v_exp_name FROM laboratories WHERE id = v_e.exp_labo_id;
  SELECT el.name, el2.name INTO v_dest_name, v_dest_parent_name
    FROM external_labs el LEFT JOIN external_labs el2 ON el2.id = el.parent_id
    WHERE el.id = v_e.dest_ext_lab_id;

  RETURN json_build_object(
    'numero',              v_e.numero,
    'token',               v_e.confirm_token,
    'exp',                 v_exp_name,
    'dest',                v_dest_name,
    'dest_parent',         v_dest_parent_name,
    'temperature',         v_e.temperature,
    'transporteur',        v_e.transporteur,
    'nb_echantillons',     v_e.nb_echantillons,
    'ts_envoi',            v_e.ts_envoi,
    'statut',              v_e.statut,
    'already_confirmed',   v_e.ts_confirm IS NOT NULL,
    'confirm_conforme',    v_e.confirm_conforme,
    'confirm_nc_types',    v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire,
    'ts_confirm',          v_e.ts_confirm,
    'confirm_recu_par',    v_e.confirm_recu_par,
    'confirm_method',      v_e.confirm_method
  );
END;
$$;


--
-- Name: get_envoi_hgrappe_by_token(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_envoi_hgrappe_by_token(p_token uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_e                envois_hgrappe%ROWTYPE;
  v_exp_name         TEXT;
  v_dest_name        TEXT;
  v_dest_parent_name TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE confirm_token = p_token;
  IF NOT FOUND THEN RETURN json_build_object('error', 'not_found'); END IF;
  SELECT name INTO v_exp_name FROM laboratories WHERE id = v_e.exp_labo_id;
  SELECT el.name, el2.name INTO v_dest_name, v_dest_parent_name
    FROM external_labs el LEFT JOIN external_labs el2 ON el2.id = el.parent_id
    WHERE el.id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero', v_e.numero, 'exp', v_exp_name, 'dest', v_dest_name,
    'dest_parent', v_dest_parent_name, 'temperature', v_e.temperature,
    'transporteur', v_e.transporteur, 'nb_echantillons', v_e.nb_echantillons,
    'ts_envoi', v_e.ts_envoi, 'statut', v_e.statut,
    'already_confirmed', v_e.ts_confirm IS NOT NULL,
    'confirm_conforme', v_e.confirm_conforme, 'confirm_nc_types', v_e.confirm_nc_types,
    'confirm_commentaire', v_e.confirm_commentaire, 'ts_confirm', v_e.ts_confirm,
    'confirm_recu_par', v_e.confirm_recu_par, 'confirm_method', v_e.confirm_method
  );
END;
$$;


--
-- Name: get_hg_confirm_cfg(); Type: FUNCTION; Schema: public; Owner: -
--

-- Configuration publique de la page /confirm. La bascule s'enregistre par
-- grappe (grappe_config, écran d'administration) ; l'ancienne version lisait la
-- clé historique de app_config, figée depuis la migration 024. Sans contexte de
-- grappe avant la saisie, le formulaire « numéro + code » est proposé dès
-- qu'une grappe active l'autorise ; get_envoi_hgrappe_by_numero tranche
-- ensuite pour la grappe de l'envoi.
CREATE FUNCTION public.get_hg_confirm_cfg() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN json_build_object(
    'confirm_by_numero',
    CASE WHEN EXISTS (SELECT 1 FROM grappes WHERE active IS NOT FALSE)
         THEN EXISTS (SELECT 1 FROM grappes g
                       WHERE g.active IS NOT FALSE
                         AND _hg_confirm_par_numero_actif(g.id))
         ELSE _hg_confirm_par_numero_actif(NULL)
    END
  );
END;
$$;


--
-- Name: _hg_confirm_par_numero_actif(uuid); Type: FUNCTION; Schema: public; Owner: -
--

-- Valeur de la bascule « confirmation par numéro » pour une grappe : clé de
-- grappe_config, à défaut la clé historique de app_config, à défaut activée
-- (comportement par défaut du produit, identique au client). Seules les
-- valeurs false / "false" la désactivent.
CREATE FUNCTION public._hg_confirm_par_numero_actif(p_grappe_id uuid) RETURNS boolean
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT value FROM grappe_config
      WHERE grappe_id = p_grappe_id AND key = 'hgrappe_confirm_by_numero'),
    (SELECT value FROM app_config WHERE key = 'hgrappe_confirm_by_numero'),
    'true'::jsonb
  ) NOT IN ('false'::jsonb, '"false"'::jsonb);
$$;


--
-- Name: get_hg_hist_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hg_hist_stats() RETURNS TABLE(total bigint, mois bigint, en_transit bigint, confirmes bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    count(*),
    count(*) FILTER (
      WHERE ts_envoi >= date_trunc('month', now() AT TIME ZONE 'America/Montreal') AT TIME ZONE 'America/Montreal'
    ),
    count(*) FILTER (WHERE statut = 'En transit'),
    count(*) FILTER (WHERE ts_confirm IS NOT NULL)
  FROM envois_hgrappe;
$$;


--
-- Name: get_hist_stats(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_hist_stats() RETURNS TABLE(total bigint, mois bigint, en_transit bigint)
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  SELECT
    count(*),
    count(*) FILTER (
      WHERE ts_envoi >= date_trunc('month', now() AT TIME ZONE 'America/Montreal') AT TIME ZONE 'America/Montreal'
    ),
    count(*) FILTER (WHERE statut = 'En transit')
  FROM envois
  WHERE annule_at IS NULL;
$$;


--
-- Name: get_icr_stats(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_icr_stats(p_labo_id uuid, p_days integer DEFAULT 30) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN (
    SELECT jsonb_agg(jsonb_build_object(
      'code',       ic.code,
      'libelle',    ic.libelle,
      'nb_intra',   (
        SELECT COUNT(*) FROM envois
        WHERE exp_labo_id = p_labo_id
          AND ts_envoi >= NOW() - (p_days || ' days')::INTERVAL
          AND codes_icr @> ARRAY[ic.code]
      ),
      'nb_hgrappe', (
        SELECT COUNT(*) FROM envois_hgrappe
        WHERE exp_labo_id = p_labo_id
          AND ts_envoi >= NOW() - (p_days || ' days')::INTERVAL
          AND codes_icr @> ARRAY[ic.code]
      )
    ) ORDER BY ic.ordre)
    FROM icr_codes ic WHERE ic.actif = TRUE
  );
END;
$$;


--
-- Name: get_labo_kpis(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_labo_kpis(p_labo_id uuid, p_days integer) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cutoff       TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_intra_total  INTEGER; v_intra_nc INTEGER; v_avg_transit NUMERIC;
  v_hg_total     INTEGER; v_hg_nc INTEGER; v_hg_confirmed INTEGER;
  v_total        INTEGER; v_nc_count INTEGER; v_flux JSON;
BEGIN
  IF current_role_name() NOT IN ('admin','superviseur_grappe') THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  SELECT COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COALESCE(ROUND(AVG(EXTRACT(EPOCH FROM (ts_recep - ts_envoi)) / 3600.0)
      FILTER (WHERE statut = 'Reçu' AND ts_recep IS NOT NULL), 1), 0)
  INTO v_intra_total, v_intra_nc, v_avg_transit
  FROM envois WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff;

  SELECT COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COUNT(*) FILTER (WHERE ts_confirm IS NOT NULL)::INTEGER
  INTO v_hg_total, v_hg_nc, v_hg_confirmed
  FROM envois_hgrappe WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff;

  v_total    := v_intra_total + v_hg_total;
  v_nc_count := v_intra_nc    + v_hg_nc;

  SELECT json_agg(d ORDER BY d.date) INTO v_flux
  FROM (
    SELECT date, SUM(volume)::INTEGER AS volume FROM (
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal','YYYY-MM-DD') AS date, COUNT(*) AS volume
      FROM envois WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff GROUP BY 1
      UNION ALL
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal','YYYY-MM-DD') AS date, COUNT(*) AS volume
      FROM envois_hgrappe WHERE exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff GROUP BY 1
    ) raw GROUP BY date ORDER BY date
  ) d;

  RETURN json_build_object(
    'stats_globales', json_build_object(
      'total', v_total,
      'nc_rate', CASE WHEN v_total > 0 THEN ROUND((v_nc_count::NUMERIC / v_total)*100,1) ELSE 0 END,
      'avg_transit', v_avg_transit,
      'hg_total', v_hg_total,
      'hg_confirmed', v_hg_confirmed
    ),
    'flux_quotidien', COALESCE(v_flux, '[]'::json)
  );
END;
$$;


--
-- Name: is_module_active(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.is_module_active(p_module text, p_labo_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT COALESCE(
    (SELECT active FROM module_config WHERE module = p_module AND labo_id = p_labo_id),
    false
  );
$$;


--
-- Name: list_app_secrets_status(); Type: FUNCTION; Schema: public; Owner: -
--

-- État de tous les secrets de la liste blanche, indexé par nom :
-- { "RESEND_API_KEY": {configured, updated_at, last_changed_by,
--   last_changed_at, last_action}, … }. Jamais de valeur. Admin actif seulement.
CREATE FUNCTION public.list_app_secrets_status() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_result JSON;
BEGIN
  IF current_role_name() <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.' USING ERRCODE = '42501';
  END IF;

  SELECT json_object_agg(k.name, json_build_object(
    'configured',       s.id IS NOT NULL,
    'updated_at',       s.updated_at,
    'last_changed_by',  a.changed_by_nom,
    'last_changed_at',  a.changed_at,
    'last_action',      a.action
  ))
  INTO v_result
  FROM (
    SELECT unnest(_allowed_secret_names()) AS name
  ) k
  LEFT JOIN vault.secrets s ON s.name = k.name
  LEFT JOIN LATERAL (
    SELECT action, changed_by_nom, changed_at
    FROM app_secrets_audit
    WHERE secret_name = k.name
    ORDER BY changed_at DESC LIMIT 1
  ) a ON TRUE;

  RETURN COALESCE(v_result, '{}'::JSON);
END;
$$;


--
-- Name: peek_next_hgrappe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.peek_next_hgrappe() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 'HG-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
    LPAD(CAST(
      CASE WHEN is_called THEN last_value + 1 ELSE last_value END
    AS TEXT), 5, '0')
  FROM hgrappe_seq;
$$;


--
-- Name: peek_next_hsilp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.peek_next_hsilp() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT 'HSILP-' || TO_CHAR(NOW(), 'YYMMDD') || '-' ||
         LPAD(CAST(
           CASE WHEN is_called THEN last_value + 1 ELSE last_value END
         AS TEXT), 5, '0')
  FROM envoi_seq;
$$;


--
-- Name: _purge_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

-- La purge a 90 jours des notifications etait couplee au chemin de succes de
-- l'envoi de courriels : desactiver les notifications, ou une execution sans
-- rien a envoyer, sautait silencieusement la retention. Celle-ci ne depend
-- d'aucune autre fonctionnalite et ne filtre PAS sur sent_at, car une ligne
-- jamais envoyee doit elle aussi etre recuperee.
CREATE FUNCTION public._purge_notifications() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  WITH a AS (
    DELETE FROM notification_queue WHERE created_at < now() - interval '90 days'
  )
  DELETE FROM notification_log WHERE sent_at < now() - interval '90 days';
$$;


--
-- Name: protect_envoi_columns(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrepartie serveur manquante des declencheurs BEFORE INSERT. La securite au
-- niveau ligne decide QUELLES LIGNES un principal touche ; elle ne peut pas
-- restreindre QUELLES COLONNES il reecrit. « Mise a jour envois » autorise la
-- ligne entiere via une disjonction sur exp_labo_id / dest_labo_id : satisfaire
-- le predicat par une colonne licenciait donc la reecriture de l'autre, et donc
-- la reassignation de la tenancy de la ligne.
CREATE FUNCTION public.protect_envoi_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF (NEW.exp_labo_id IS DISTINCT FROM OLD.exp_labo_id
      OR NEW.dest_labo_id IS DISTINCT FROM OLD.dest_labo_id)
     AND current_role_name() NOT IN ('admin', 'superviseur_grappe') THEN
    RAISE EXCEPTION 'Le laboratoire expediteur ou destinataire d''un envoi ne peut pas etre modifie.';
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    RAISE EXCEPTION 'Le numero d''un envoi est genere par le serveur et ne peut pas etre modifie.';
  END IF;
  IF NEW.cree_par_id IS DISTINCT FROM OLD.cree_par_id
     OR NEW.cree_par_nom IS DISTINCT FROM OLD.cree_par_nom THEN
    RAISE EXCEPTION 'L''auteur d''un envoi ne peut pas etre modifie.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: protect_envoi_hgrappe_columns(); Type: FUNCTION; Schema: public; Owner: -
--

-- Contrepartie de protect_envoi_columns pour envois_hgrappe. Celle-là était
-- aussi attachée à envois_hgrappe, mais elle lit NEW.dest_labo_id, colonne qui
-- n'existe pas dans cette table : TOUT UPDATE fait par un utilisateur connecté
-- (fermeture « Aucune réponse reçue », confirmation par fax, édition,
-- create_bon_depart) échouait avec « record "new" has no field
-- "dest_labo_id" ». Fonction propre à la table, qui protège en plus les deux
-- capacités de confirmation anonyme : le jeton et le code de vérification ne
-- sont fixés que par le serveur.
CREATE FUNCTION public.protect_envoi_hgrappe_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.exp_labo_id IS DISTINCT FROM OLD.exp_labo_id
     AND current_role_name() NOT IN ('admin', 'superviseur_grappe') THEN
    RAISE EXCEPTION 'Le laboratoire expediteur d''un envoi ne peut pas etre modifie.';
  END IF;

  IF NEW.numero IS DISTINCT FROM OLD.numero THEN
    RAISE EXCEPTION 'Le numero d''un envoi est genere par le serveur et ne peut pas etre modifie.';
  END IF;
  IF NEW.cree_par_id IS DISTINCT FROM OLD.cree_par_id
     OR NEW.cree_par_nom IS DISTINCT FROM OLD.cree_par_nom THEN
    RAISE EXCEPTION 'L''auteur d''un envoi ne peut pas etre modifie.';
  END IF;
  IF NEW.confirm_token IS DISTINCT FROM OLD.confirm_token
     OR NEW.verify_code IS DISTINCT FROM OLD.verify_code THEN
    RAISE EXCEPTION 'Le jeton et le code de confirmation sont generes par le serveur et ne peuvent pas etre modifies.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: _envois_hgrappe_capacites(); Type: FUNCTION; Schema: public; Owner: -
--

-- BEFORE INSERT sur envois_hgrappe : le code de vérification est généré par le
-- serveur, et un utilisateur connecté ne choisit jamais ses capacités (un
-- INSERT direct, permis par la policy « Création envois_hgrappe », pouvait fixer
-- un jeton prévisible). Les contextes de confiance (service_role, DBA,
-- données de démonstration) gardent une valeur fournie, mais reçoivent un code
-- généré s'ils n'en donnent pas. SECURITY DEFINER : _generer_verify_code n'est
-- exécutable par aucun rôle de l'API.
CREATE FUNCTION public._envois_hgrappe_capacites() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL OR NEW.verify_code IS NULL THEN
    NEW.verify_code := _generer_verify_code();
  END IF;
  IF auth.uid() IS NOT NULL OR NEW.confirm_token IS NULL THEN
    NEW.confirm_token := gen_random_uuid();
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: queue_envoi_notification(text, uuid, uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

-- La policy « Insertion notif_queue » ne validait QUE « etre connecte ». Comme
-- le dispatcher n'a aucune notion de qui a produit une ligne et se fie aux
-- champs du corps, un technicien pouvait faire envoyer un rapport au nom
-- d'OptiLab, avec le contenu de son choix, aux destinataires d'un AUTRE
-- laboratoire. La file n'est donc plus alimentable par un INSERT direct : cette
-- RPC derive le laboratoire DE LA LIGNE D'ENVOI, jamais des parametres.
CREATE FUNCTION public.queue_envoi_notification(p_type text, p_envoi_id uuid DEFAULT NULL::uuid, p_envoi_hg_id uuid DEFAULT NULL::uuid, p_details jsonb DEFAULT '{}'::jsonb) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_exp   UUID;
  v_dest  UUID;
  v_num   TEXT;
  v_deps  TEXT[] := '{}';
  v_labos UUID[] := current_labo_ids();
  v_role  TEXT   := current_role_name();
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentification requise.';
  END IF;

  -- Types autorises depuis un client : les deux que le produit declare
  -- reellement. Les types d'alarme sont produits par le detecteur cote serveur
  -- et ne doivent pas pouvoir etre injectes.
  IF p_type NOT IN ('nc', 'lost', 'hg_nc') THEN
    RAISE EXCEPTION 'Type de notification non autorise : %', p_type;
  END IF;

  IF (p_envoi_id IS NULL) = (p_envoi_hg_id IS NULL) THEN
    RAISE EXCEPTION 'Un envoi intra-grappe OU hors-grappe doit etre designe.';
  END IF;

  IF p_envoi_id IS NOT NULL THEN
    SELECT exp_labo_id, dest_labo_id, numero, departements
      INTO v_exp, v_dest, v_num, v_deps
      FROM envois WHERE id = p_envoi_id;
  ELSE
    SELECT exp_labo_id, NULL::uuid, numero, '{}'::text[]
      INTO v_exp, v_dest, v_num, v_deps
      FROM envois_hgrappe WHERE id = p_envoi_hg_id;
  END IF;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Envoi introuvable.';
  END IF;

  -- L'appelant doit etre concerne par cet envoi, exactement comme pour le lire.
  IF v_role NOT IN ('admin', 'superviseur_grappe')
     AND NOT (v_exp = ANY(v_labos) OR (v_dest IS NOT NULL AND v_dest = ANY(v_labos))) THEN
    RAISE EXCEPTION 'Droits insuffisants sur cet envoi.';
  END IF;

  INSERT INTO notification_queue (
    type, envoi_id, envoi_hg_id, exp_labo_id, dest_labo_id,
    envoi_numero, departements, details
  ) VALUES (
    p_type, p_envoi_id, p_envoi_hg_id, v_exp, v_dest,
    COALESCE(v_num, ''), COALESCE(v_deps, '{}'), COALESCE(p_details, '{}'::jsonb)
  );

  RETURN json_build_object('ok', true);
END;
$$;


--
-- Name: trg_audit_envoi(); Type: FUNCTION; Schema: public; Owner: -
--

-- Des 7 chemins qui changent l'etat d'un envoi, 1 seul journalisait -- et il le
-- faisait par une SECONDE requete HTTP, apres validation de la premiere, dont
-- le resultat n'etait jamais examine. Ce declencheur ecrit la ligne dans la
-- MEME transaction, avec un acteur derive de auth.uid() : omettre la trace
-- devient impossible pour le principal qui modifie.
--
-- Les capacites de confirmation anonyme (confirm_token, verify_code) ne sont
-- PAS recopiees dans les instantanes : le journal est conserve 12 mois et ne
-- doit pas en faire des copies durables. Leur changement eventuel reste
-- trace par le nom de champ (changed_fields), sans la valeur.
CREATE FUNCTION public.trg_audit_envoi() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  c_masques CONSTANT TEXT[] := ARRAY['confirm_token', 'verify_code'];
  v_nom  TEXT;
  v_old  JSONB := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END;
  v_new  JSONB := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END;
  v_flds TEXT[] := '{}';
BEGIN
  SELECT nom INTO v_nom FROM profiles WHERE id = auth.uid();

  IF TG_OP = 'UPDATE' THEN
    -- updated_at est exclu : sinon chaque ecriture sans effet reel produirait
    -- une ligne de journal.
    SELECT COALESCE(array_agg(k ORDER BY k), '{}')
      INTO v_flds
      FROM jsonb_object_keys(v_new) AS k
     WHERE v_new -> k IS DISTINCT FROM v_old -> k
       AND k <> 'updated_at';
    IF v_flds = '{}' THEN
      RETURN NULL;
    END IF;
  END IF;

  -- Champs calcules sur les instantanes complets, puis capacites retirees
  -- (retirer une cle absente, cas de la table envois, est sans effet).
  v_old := v_old - c_masques;
  v_new := v_new - c_masques;

  INSERT INTO envois_audit (
    table_name, record_id, action, old_data, new_data,
    changed_fields, changed_by_id, changed_by_nom
  ) VALUES (
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    TG_OP,
    v_old, v_new, v_flds,
    auth.uid(), COALESCE(v_nom, '')
  );

  RETURN NULL;
END;
$$;


--
-- Name: protect_profile_columns(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.protect_profile_columns() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  actor       TEXT   := current_role_name();
  actor_rank  INT    := _role_rank(current_role_name());
  actor_labos UUID[] := current_labo_ids();
  sensitive   BOOLEAN;
BEGIN
  -- Contextes de confiance (service_role via Edge Functions, pg_cron, DBA en
  -- psql direct) : aucun auth.uid() → pas de restriction. Un utilisateur
  -- authentifié malveillant a TOUJOURS un auth.uid(), donc la protection
  -- s'applique intégralement à lui.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- must_change_password n'est modifiable par AUCUN utilisateur authentifié,
  -- pas même un gestionnaire : le drapeau n'est levé qu'après un vrai
  -- changement de mot de passe, par manage-user (action change_own_password,
  -- service_role), et posé par manage-user à la création ou à la
  -- réinitialisation. Sinon l'employé pouvait sauter l'étape, ou le
  -- gestionnaire qui a choisi le mot de passe temporaire effacer le drapeau
  -- et garder l'accès sous l'identité de l'employé.
  IF NEW.must_change_password IS DISTINCT FROM OLD.must_change_password THEN
    RAISE EXCEPTION 'Le changement de mot de passe obligatoire est géré par le serveur.'
      USING ERRCODE = '42501';
  END IF;

  -- Même règle pour active : la désactivation ne vaut que si le compte est
  -- aussi banni dans GoTrue et ses sessions révoquées, ce que fait
  -- manage-user (action toggle_active, service_role). Un UPDATE direct, même
  -- par un gestionnaire, ne faisait que la moitié du travail (jetons déjà
  -- émis et refresh tokens toujours valables côté Auth).
  IF NEW.active IS DISTINCT FROM OLD.active THEN
    RAISE EXCEPTION 'La désactivation passe par la gestion des comptes (manage-user).'
      USING ERRCODE = '42501';
  END IF;

  -- employee_id est l'identifiant de connexion et nom l'identité affichée
  -- (journaux, bordereaux) : un utilisateur ne les change pas lui-même, sinon
  -- un technicien pouvait se renommer « Admin Principal ».
  sensitive :=
       NEW.role        IS DISTINCT FROM OLD.role
    OR NEW.labo_id     IS DISTINCT FROM OLD.labo_id
    OR NEW.labo_ids    IS DISTINCT FROM OLD.labo_ids
    OR NEW.is_test     IS DISTINCT FROM OLD.is_test
    OR NEW.employee_id IS DISTINCT FROM OLD.employee_id
    OR NEW.nom         IS DISTINCT FROM OLD.nom;

  -- Modifications libres en self-service (thème, tour_progress…).
  IF NOT sensitive THEN
    RETURN NEW;
  END IF;

  -- Toute modification d'une colonne sensible est réservée aux gestionnaires.
  IF actor_rank < 2 THEN
    RAISE EXCEPTION 'Modification non autorisée des attributs de compte (rôle, laboratoire, identifiant, nom).';
  END IF;

  -- Interdiction d'agir sur un compte de rang supérieur au sien, ou d'attribuer
  -- un rôle supérieur au sien (bloque l'auto-promotion et la promotion croisée).
  IF _role_rank(OLD.role) > actor_rank OR _role_rank(NEW.role) > actor_rank THEN
    RAISE EXCEPTION 'Droits insuffisants pour attribuer ou modifier ce rôle.';
  END IF;

  -- Rang EGAL : refuse, sauf pour un admin ou sur son propre compte. Aligne ce
  -- chemin sur manage-user/checkManagePermission (targetRank >= requesterRank),
  -- qui refusait deja le rang egal la ou ce declencheur ne bloquait que le rang
  -- strictement superieur. L'exception admin est necessaire : sans elle aucun
  -- administrateur ne pourrait plus jamais etre desactive.
  IF actor <> 'admin' AND NEW.id <> auth.uid()
     AND (_role_rank(OLD.role) = actor_rank OR _role_rank(NEW.role) = actor_rank) THEN
    RAISE EXCEPTION 'Droits insuffisants : compte de rang egal au votre.';
  END IF;

  -- Seul un administrateur peut gérer un compte administrateur (source ou cible).
  IF (OLD.role = 'admin' OR NEW.role = 'admin') AND actor <> 'admin' THEN
    RAISE EXCEPTION 'Seul un administrateur peut gérer un compte administrateur.';
  END IF;

  -- Un superviseur_labo est cantonné à ses propres laboratoires (source et cible).
  IF actor = 'superviseur_labo' THEN
    IF OLD.labo_id IS NOT NULL AND NOT (OLD.labo_id = ANY(actor_labos)) THEN
      RAISE EXCEPTION 'Droits insuffisants sur le laboratoire de ce compte.';
    END IF;
    IF NEW.labo_id IS NOT NULL AND NOT (NEW.labo_id = ANY(actor_labos)) THEN
      RAISE EXCEPTION 'Attribution à un laboratoire non autorisé.';
    END IF;
    IF NEW.labo_ids IS NOT NULL AND EXISTS (
      SELECT 1 FROM unnest(NEW.labo_ids) x WHERE NOT (x = ANY(actor_labos))
    ) THEN
      RAISE EXCEPTION 'Attribution à un laboratoire non autorisé.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: record_login_attempt(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.record_login_attempt(p_employee_id text, p_success boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_clean TEXT;
BEGIN
  v_clean := LOWER(TRIM(COALESCE(p_employee_id, '')));
  IF v_clean = '' THEN RETURN; END IF;

  INSERT INTO login_attempts (employee_id, success)
  VALUES (v_clean, COALESCE(p_success, FALSE));

  -- Une authentification réussie solde les échecs récents de cet identifiant :
  -- le détenteur légitime a prouvé son identité, les échecs accumulés par un
  -- tiers n'ont donc plus à lui être imputés. Sans ceci, le compteur restait
  -- débité après un succès et le blocage survivait à la preuve d'identité.
  IF COALESCE(p_success, FALSE) THEN
    DELETE FROM login_attempts
     WHERE LOWER(employee_id) = v_clean
       AND success = FALSE
       AND attempted_at > NOW() - INTERVAL '15 minutes';
  END IF;

  -- Auto-purge opportuniste des entrées > 7 jours
  DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL '7 days';
END;
$$;


--
-- Name: remove_envoi_from_bon(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.remove_envoi_from_bon(p_link_id uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_bon_id UUID; v_envoi_id UUID; v_hg_envoi_id UUID; v_type TEXT; v_labo_id UUID;
BEGIN
  SELECT bon_id, envoi_id, hg_envoi_id, type
  INTO v_bon_id, v_envoi_id, v_hg_envoi_id, v_type
  FROM bons_depart_envois WHERE id = p_link_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Liaison introuvable.'; END IF;

  SELECT labo_id INTO v_labo_id FROM bons_depart WHERE id = v_bon_id AND statut = 'actif';
  IF NOT FOUND THEN RAISE EXCEPTION 'Bon de départ introuvable ou annulé.'; END IF;
  IF NOT (v_labo_id = ANY(current_labo_ids()) OR current_role_name() IN ('superviseur_grappe','admin')) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;
  IF EXISTS (SELECT 1 FROM bons_depart_sections WHERE bon_id = v_bon_id AND date_prise_en_charge IS NOT NULL) THEN
    RAISE EXCEPTION 'Impossible de retirer un envoi : la date de prise en charge a été renseignée.';
  END IF;
  IF v_type = 'intra' THEN
    IF EXISTS (SELECT 1 FROM envois WHERE id = v_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
    UPDATE envois SET statut = 'En attente', ts_envoi = created_at WHERE id = v_envoi_id;
  ELSE
    IF EXISTS (SELECT 1 FROM envois_hgrappe WHERE id = v_hg_envoi_id AND statut NOT IN ('En attente','En transit')) THEN
      RAISE EXCEPTION 'Impossible de retirer cet envoi : il a déjà été réceptionné.';
    END IF;
    UPDATE envois_hgrappe SET statut = 'En attente', ts_envoi = created_at WHERE id = v_hg_envoi_id;
  END IF;

  DELETE FROM bons_depart_envois WHERE id = p_link_id;
  RETURN json_build_object('ok', true);
END;
$$;


--
-- Name: set_app_secret(text, text); Type: FUNCTION; Schema: public; Owner: -
--

-- Saisie ou remplacement d'un secret applicatif par un administrateur actif,
-- depuis l'interface (Configuration › Notifications), via PostgREST.
-- NOTIFY_TRIGGER_SECRET est exclu : il est généré par le serveur
-- (rotate_notify_trigger_secret) et ne doit jamais passer par un humain.
-- La valeur est débarrassée des blancs de bordure (un retour à la ligne collé
-- avec la clé) ; tout caractère de contrôle restant est refusé, car il
-- casserait l'en-tête HTTP construit par la fonction Edge, dont le message
-- d'erreur recopierait alors la valeur dans notification_log.
-- Écriture par l'API du Vault (_vault_ecrire), audit sans la valeur.
CREATE FUNCTION public.set_app_secret(p_name text, p_value text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_valeur TEXT;
  v_action TEXT;
BEGIN
  IF current_role_name() <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR NOT (p_name = ANY(_allowed_secret_names()))
     OR p_name = 'NOTIFY_TRIGGER_SECRET' THEN
    RAISE EXCEPTION 'Nom de secret non autorisé.' USING ERRCODE = '42501';
  END IF;

  v_valeur := btrim(COALESCE(p_value, ''), E' \t\r\n');
  IF v_valeur = '' THEN
    RAISE EXCEPTION 'Valeur de secret requise.' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_valeur) > 4096 THEN
    RAISE EXCEPTION 'Valeur de secret trop longue (4096 caractères au plus).' USING ERRCODE = '22023';
  END IF;
  IF v_valeur ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'La valeur contient un caractère de contrôle.' USING ERRCODE = '22023';
  END IF;

  v_action := _vault_ecrire(p_name, v_valeur);
  PERFORM _journaliser_secret(p_name, v_action);

  RETURN json_build_object('ok', true, 'name', p_name, 'action', v_action);
END;
$$;


--
-- Name: delete_app_secret(text); Type: FUNCTION; Schema: public; Owner: -
--

-- Suppression d'un secret applicatif par un administrateur actif (révocation
-- côté application). DELETE sur vault.secrets : méthode documentée par
-- Supabase, permise à postgres. Idempotente : un secret absent n'est pas une
-- erreur, mais seule une suppression effective est journalisée.
CREATE FUNCTION public.delete_app_secret(p_name text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF current_role_name() <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.' USING ERRCODE = '42501';
  END IF;
  IF p_name IS NULL OR NOT (p_name = ANY(_allowed_secret_names()))
     OR p_name = 'NOTIFY_TRIGGER_SECRET' THEN
    RAISE EXCEPTION 'Nom de secret non autorisé.' USING ERRCODE = '42501';
  END IF;

  DELETE FROM vault.secrets WHERE name = p_name;
  IF FOUND THEN
    PERFORM _journaliser_secret(p_name, 'DELETE');
  END IF;

  RETURN json_build_object('ok', true, 'name', p_name, 'action', 'DELETE');
END;
$$;


--
-- Name: rotate_notify_trigger_secret(); Type: FUNCTION; Schema: public; Owner: -
--

-- Régénère le secret partagé entre le cron et send-notifications : 32 octets
-- aléatoires (hex) tirés par le serveur, créés ou remplacés dans le Vault.
-- Aucun humain ne voit la valeur (elle n'est jamais renvoyée). Les deux côtés
-- la lisent dans le Vault au moment de l'appel : la rotation est une seule
-- opération, sans recopie. Admin actif seulement ; audit sans la valeur.
CREATE FUNCTION public.rotate_notify_trigger_secret() RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_action TEXT;
BEGIN
  IF current_role_name() <> 'admin' THEN
    RAISE EXCEPTION 'Accès refusé : administrateur uniquement.' USING ERRCODE = '42501';
  END IF;

  v_action := _vault_ecrire('NOTIFY_TRIGGER_SECRET', _hex_aleatoire_32());
  PERFORM _journaliser_secret('NOTIFY_TRIGGER_SECRET', v_action);

  RETURN json_build_object('ok', true, 'name', 'NOTIFY_TRIGGER_SECRET', 'action', v_action);
END;
$$;


--
-- Name: revoke_user_sessions(uuid); Type: FUNCTION; Schema: public; Owner: -
--

-- Ferme toutes les sessions d'un compte (désactivation par manage-user) :
-- suppression dans auth.sessions, les refresh tokens suivent par la clé
-- étrangère ON DELETE CASCADE de GoTrue. Les jetons d'accès déjà émis restent
-- valides jusqu'à leur expiration ; la RLS les neutralise (compte inactif =
-- aucun droit) et le bannissement GoTrue posé par manage-user bloque
-- getUser() et le rafraîchissement. Réservée à service_role.
CREATE FUNCTION public.revoke_user_sessions(p_user_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Identifiant de compte requis.' USING ERRCODE = '22023';
  END IF;
  DELETE FROM auth.sessions WHERE user_id = p_user_id;
END;
$$;


--
-- Name: _effacer_smtp_pass(); Type: FUNCTION; Schema: public; Owner: -
--

-- AFTER UPDATE sur notification_config : si l'hôte, le port ou l'utilisateur
-- SMTP change, le mot de passe SMTP est supprimé du Vault (et journalisé).
-- Sinon un administrateur pouvait pointer smtp_host vers son propre serveur
-- et recevoir SMTP_PASS en clair au prochain envoi (« Envoyer un test » ou
-- cron) : le secret est lié à sa destination, il faut le ressaisir.
-- SECURITY DEFINER : l'UPDATE vient d'un admin (authenticated), qui n'a aucun
-- droit sur le Vault.
CREATE FUNCTION public._effacer_smtp_pass() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  DELETE FROM vault.secrets WHERE name = 'SMTP_PASS';
  IF FOUND THEN
    PERFORM _journaliser_secret('SMTP_PASS', 'DELETE');
  END IF;
  RETURN NULL;
END;
$$;


--
-- Name: _proteger_app_config(); Type: FUNCTION; Schema: public; Owner: -
--

-- BEFORE INSERT/UPDATE/DELETE sur app_config : la clé « supabase_url » (URL de
-- base appelée par le cron avec le secret de déclenchement) n'est modifiable
-- que dans un contexte de confiance (SQL Editor, service_role). Un
-- administrateur applicatif qui la redirigerait vers son serveur recevrait
-- l'en-tête x-trigger-secret.
CREATE FUNCTION public._proteger_app_config() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND ((TG_OP <> 'INSERT' AND OLD.key = 'supabase_url')
       OR (TG_OP <> 'DELETE' AND NEW.key = 'supabase_url')) THEN
    RAISE EXCEPTION 'La clé supabase_url se règle hors de l''application (SQL Editor).'
      USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;


--
-- Name: _trigger_send_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

-- Déclenche l'envoi des récapitulatifs : appelée par pg_cron (job
-- « send-notifications »), jamais par l'API (aucun rôle API n'a EXECUTE). La
-- commande du job ne contient que l'appel de cette fonction : aucun secret
-- dans cron.job ni dans cron.job_run_details. L'URL de base est lue dans
-- app_config (clé supabase_url) et le secret dans le Vault, au moment de
-- l'exécution ; la valeur ne transite que par la file pg_net (non journalisée).
-- Si la configuration est incomplète alors que les notifications sont
-- activées, une alerte est écrite dans notification_log (journal visible par
-- l'administrateur) au lieu d'un appel voué au refus.
CREATE FUNCTION public._trigger_send_notifications() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_url    TEXT;
  v_secret TEXT;
  v_motif  TEXT;
BEGIN
  SELECT rtrim(btrim(value #>> '{}'), '/') INTO v_url
    FROM app_config WHERE key = 'supabase_url';
  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'NOTIFY_TRIGGER_SECRET';

  IF COALESCE(v_url, '') !~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?$' THEN
    v_motif := 'URL du projet absente ou invalide (app_config.supabase_url, attendu https://<ref>.supabase.co).';
  ELSIF COALESCE(v_secret, '') = '' THEN
    v_motif := 'Secret NOTIFY_TRIGGER_SECRET absent du Vault (rotate_notify_trigger_secret).';
  END IF;

  IF v_motif IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM notification_config WHERE enabled) THEN
      INSERT INTO notification_log (batch_id, type, to_email, subject, body_text, status, error_message)
      VALUES (gen_random_uuid(), 'surveillance', '(alerte interne)',
              'Envoi des notifications non déclenché', v_motif, 'error', v_motif);
    END IF;
    RAISE WARNING 'send-notifications non déclenché : %', v_motif;
    RETURN;
  END IF;

  PERFORM net.http_post(
    url                  := v_url || '/functions/v1/send-notifications',
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json',
                                               'x-trigger-secret', v_secret),
    timeout_milliseconds := 30000
  );
END;
$$;


--
-- Name: _surveiller_notifications(); Type: FUNCTION; Schema: public; Owner: -
--

-- Chien de garde (pg_cron, jours ouvrables 14 h UTC) : si des notifications de
-- types activés attendent depuis plus de 30 h alors que l'envoi est activé,
-- quelle que soit la cause (job absent ou en échec, secret désynchronisé,
-- fonction Edge refusant l'appel, fournisseur en panne, destinataire non
-- résolu), une alerte est écrite dans notification_log, le journal que
-- l'administrateur consulte dans Configuration › Notifications. Le courriel
-- étant justement le canal en panne, l'alerte ne passe pas par lui. Une alerte
-- au plus par 20 h.
CREATE FUNCTION public._surveiller_notifications() RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  v_cfg      notification_config%ROWTYPE;
  v_types    TEXT[] := '{}';
  v_nb       INTEGER;
  v_ancienne TIMESTAMPTZ;
  v_texte    TEXT;
BEGIN
  SELECT * INTO v_cfg FROM notification_config ORDER BY id LIMIT 1;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN;
  END IF;

  IF v_cfg.enabled_nc    THEN v_types := v_types || ARRAY['nc', 'hg_nc']; END IF;
  IF v_cfg.enabled_lost  THEN v_types := v_types || ARRAY['lost']; END IF;
  IF v_cfg.enabled_alarm THEN v_types := v_types || ARRAY['alarm', 'alarm_r', 'hg_alarm']; END IF;

  SELECT count(*), min(created_at) INTO v_nb, v_ancienne
    FROM notification_queue
   WHERE sent_at IS NULL
     AND type = ANY(v_types)
     AND created_at < now() - interval '30 hours';

  IF v_nb = 0 THEN
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM notification_log
              WHERE type = 'surveillance' AND sent_at > now() - interval '20 hours') THEN
    RETURN;
  END IF;

  v_texte := format('%s notification(s) en attente depuis plus de 30 h (la plus ancienne : %s). '
                 || 'Vérifier le job pg_cron « send-notifications », le secret NOTIFY_TRIGGER_SECRET, '
                 || 'la fonction Edge send-notifications et le fournisseur de courriel.',
                    v_nb, to_char(v_ancienne AT TIME ZONE 'America/Montreal', 'YYYY-MM-DD HH24:MI'));
  INSERT INTO notification_log (batch_id, type, to_email, subject, body_text, status, error_message)
  VALUES (gen_random_uuid(), 'surveillance', '(alerte interne)',
          'Alerte : notifications non envoyées', v_texte, 'error', v_texte);
END;
$$;


--
-- Name: sync_labo_ids_on_insert(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_labo_ids_on_insert() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.labo_id IS NOT NULL AND (NEW.labo_ids IS NULL OR NEW.labo_ids = '{}') THEN
    NEW.labo_ids := ARRAY[NEW.labo_id];
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_bd_section_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_bd_section_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.date_prise_en_charge IS NOT NULL THEN PERFORM check_bon_completion(NEW.bon_id); END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_envois_bon_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_envois_bon_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit') AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id FROM bons_depart_envois WHERE envoi_id = NEW.id LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: trg_hgrappe_bon_completion(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.trg_hgrappe_bon_completion() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE v_bon_id UUID;
BEGIN
  IF NEW.statut NOT IN ('En attente','En transit') AND OLD.statut IN ('En attente','En transit') THEN
    SELECT bon_id INTO v_bon_id FROM bons_depart_envois WHERE hg_envoi_id = NEW.id LIMIT 1;
    IF FOUND THEN PERFORM check_bon_completion(v_bon_id); END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: update_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_config (
    key text NOT NULL,
    value jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: app_secrets_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_secrets_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    secret_name text NOT NULL,
    action text NOT NULL,
    changed_by_id uuid,
    changed_by_nom text DEFAULT ''::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT app_secrets_audit_action_check CHECK ((action = ANY (ARRAY['CREATE'::text, 'UPDATE'::text, 'DELETE'::text])))
);


--
-- Name: bd_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.bd_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: bons_depart; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bons_depart (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    labo_id uuid NOT NULL,
    cree_par_id uuid NOT NULL,
    cree_par_nom text DEFAULT ''::text NOT NULL,
    statut text DEFAULT 'actif'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT bons_depart_statut_check CHECK ((statut = ANY (ARRAY['actif'::text, 'récupéré'::text, 'annulé'::text])))
);


--
-- Name: bons_depart_envois; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bons_depart_envois (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bon_id uuid NOT NULL,
    envoi_id uuid,
    hg_envoi_id uuid,
    type text NOT NULL,
    CONSTRAINT bde_one_type CHECK ((((type = 'intra'::text) AND (envoi_id IS NOT NULL) AND (hg_envoi_id IS NULL)) OR ((type = 'hg'::text) AND (hg_envoi_id IS NOT NULL) AND (envoi_id IS NULL)))),
    CONSTRAINT bons_depart_envois_type_check CHECK ((type = ANY (ARRAY['intra'::text, 'hg'::text])))
);


--
-- Name: bons_depart_sections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bons_depart_sections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bon_id uuid NOT NULL,
    transporteur text NOT NULL,
    bon_connaissement text DEFAULT ''::text NOT NULL,
    date_prise_en_charge timestamp with time zone,
    nom_transporteur_reel text DEFAULT ''::text NOT NULL
);


--
-- Name: envoi_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.envoi_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: envois; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envois (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text,
    numeros_silp text[] DEFAULT '{}'::text[] NOT NULL,
    exp_labo_id uuid NOT NULL,
    dest_labo_id uuid NOT NULL,
    temperature text NOT NULL,
    transporteur text DEFAULT ''::text,
    nb_echantillons integer,
    departements text[] DEFAULT '{}'::text[],
    statut text DEFAULT 'En transit'::text NOT NULL,
    notes text DEFAULT ''::text,
    cree_par_id uuid,
    cree_par_nom text DEFAULT ''::text,
    recep_par_nom text DEFAULT ''::text,
    recep_obs text DEFAULT ''::text,
    type_specimen text DEFAULT 'exempt'::text,
    glace_seche boolean DEFAULT false,
    ts_envoi timestamp with time zone DEFAULT now() NOT NULL,
    ts_recep timestamp with time zone,
    annule_at timestamp with time zone,
    annule_par_id uuid,
    annule_par_nom text,
    annule_note text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    echantillons_depart text[] DEFAULT '{}'::text[] NOT NULL,
    echantillons_reception text[] DEFAULT '{}'::text[] NOT NULL,
    hors_corridor boolean DEFAULT false NOT NULL,
    codes_icr text[] DEFAULT '{}'::text[] NOT NULL,
    CONSTRAINT envois_statut_check CHECK ((statut = ANY (ARRAY['En attente'::text, 'En transit'::text, 'Reçu'::text, 'Problème'::text, 'Perdu'::text, 'Annulé'::text]))),
    -- Un envoi intra-grappe part toujours vers un AUTRE laboratoire (INSERT
    -- direct, create_envoi_hsilp et modifications compris).
    CONSTRAINT envois_exp_dest_distincts CHECK ((exp_labo_id <> dest_labo_id))
);


--
-- Name: envois_audit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envois_audit (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    table_name text NOT NULL,
    record_id uuid NOT NULL,
    action text NOT NULL,
    old_data jsonb,
    new_data jsonb,
    changed_fields text[] DEFAULT '{}'::text[],
    changed_by_id uuid,
    changed_by_nom text DEFAULT ''::text NOT NULL,
    changed_at timestamp with time zone DEFAULT now(),
    CONSTRAINT envois_audit_action_check CHECK ((action = ANY (ARRAY['INSERT'::text, 'UPDATE'::text, 'DELETE'::text, 'ANNULATION'::text])))
);


--
-- Name: envois_hgrappe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.envois_hgrappe (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    source text DEFAULT 'silp'::text NOT NULL,
    exp_labo_id uuid NOT NULL,
    dest_ext_lab_id uuid NOT NULL,
    temperature text NOT NULL,
    transporteur text NOT NULL,
    nb_echantillons integer,
    numeros_silp text[] DEFAULT '{}'::text[],
    statut text DEFAULT 'En transit'::text NOT NULL,
    notes text DEFAULT ''::text,
    cree_par_id uuid,
    cree_par_nom text DEFAULT ''::text,
    type_specimen text DEFAULT 'exempt'::text,
    glace_seche boolean DEFAULT false,
    confirm_token uuid DEFAULT gen_random_uuid() NOT NULL,
    confirm_method text,
    confirm_conforme boolean,
    confirm_nc_types text[] DEFAULT '{}'::text[],
    confirm_commentaire text DEFAULT ''::text,
    confirm_recu_par text DEFAULT ''::text,
    ts_confirm timestamp with time zone,
    ts_envoi timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    echantillons_depart text[] DEFAULT '{}'::text[] NOT NULL,
    hors_corridor boolean DEFAULT false NOT NULL,
    codes_icr text[] DEFAULT '{}'::text[] NOT NULL,
    -- Code de vérification imprimé sur le F-G-74 (confirmation « numéro +
    -- code »). Généré par le déclencheur _envois_hgrappe_capacites, jamais
    -- dérivé du jeton. Stocké en clair comme confirm_token (réimpression),
    -- protégé par la RLS et exclu du journal d'audit.
    verify_code text NOT NULL,
    CONSTRAINT envois_hgrappe_verify_code_check CHECK ((verify_code ~ '^[A-HJ-NP-Z2-9]{10}$'::text)),
    CONSTRAINT envois_hgrappe_confirm_method_check CHECK ((confirm_method = ANY (ARRAY['online'::text, 'fax'::text]))),
    CONSTRAINT envois_hgrappe_source_check CHECK ((source = ANY (ARRAY['silp'::text, 'hsilp'::text]))),
    CONSTRAINT envois_hgrappe_statut_check CHECK ((statut = ANY (ARRAY['En attente'::text, 'En transit'::text, 'Reçu'::text, 'Problème'::text, 'Aucune réponse reçue'::text])))
);


--
-- Name: external_labs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.external_labs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    parent_id uuid,
    adresse text DEFAULT ''::text,
    adresse2 text DEFAULT ''::text NOT NULL,
    ville text DEFAULT ''::text,
    code_postal text DEFAULT ''::text NOT NULL,
    province text DEFAULT ''::text NOT NULL,
    pays text DEFAULT ''::text NOT NULL,
    telephone text DEFAULT ''::text,
    label_text text DEFAULT ''::text NOT NULL,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: grappe_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grappe_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    grappe_id uuid NOT NULL,
    key text NOT NULL,
    value jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: grappes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.grappes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    code text,
    active boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: hg_confirm_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hg_confirm_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    numero text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    reason text NOT NULL,
    CONSTRAINT hg_confirm_attempts_reason_check CHECK ((reason = ANY (ARRAY['wrong_code'::text, 'not_found'::text])))
);


--
-- Name: hgrappe_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hgrappe_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: icr_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icr_codes (
    code text NOT NULL,
    libelle text NOT NULL,
    actif boolean DEFAULT true NOT NULL,
    ordre integer DEFAULT 0 NOT NULL
);


--
-- Name: laboratories; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.laboratories (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    active boolean DEFAULT true,
    adresse text DEFAULT ''::text,
    adresse2 text DEFAULT ''::text NOT NULL,
    ville text DEFAULT ''::text,
    code_postal text DEFAULT ''::text,
    province text DEFAULT ''::text NOT NULL,
    pays text DEFAULT ''::text NOT NULL,
    telephone text DEFAULT ''::text,
    default_refrigerant text,
    fax_bio_hema text DEFAULT ''::text,
    fax_micro text DEFAULT ''::text,
    fax_patho text DEFAULT ''::text,
    fax_general text DEFAULT ''::text,
    grappe_id uuid,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    employee_id text NOT NULL,
    attempted_at timestamp with time zone DEFAULT now() NOT NULL,
    success boolean DEFAULT false NOT NULL
);


--
-- Name: module_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.module_config (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    module text NOT NULL,
    labo_id uuid,
    active boolean DEFAULT false NOT NULL,
    config jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_config (
    id integer NOT NULL,
    enabled boolean DEFAULT false NOT NULL,
    enabled_nc boolean DEFAULT true NOT NULL,
    enabled_lost boolean DEFAULT true NOT NULL,
    enabled_alarm boolean DEFAULT true NOT NULL,
    provider text DEFAULT 'resend'::text NOT NULL,
    smtp_host text DEFAULT ''::text NOT NULL,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_user text DEFAULT ''::text NOT NULL,
    smtp_from text DEFAULT ''::text NOT NULL,
    batch_hour integer DEFAULT 18 NOT NULL,
    fallback_email text DEFAULT ''::text NOT NULL,
    updated_at timestamp with time zone DEFAULT now(),
    CONSTRAINT notification_config_batch_hour_check CHECK (((batch_hour >= 0) AND (batch_hour <= 23))),
    CONSTRAINT notification_config_provider_check CHECK ((provider = ANY (ARRAY['resend'::text, 'smtp'::text])))
);


--
-- Name: notification_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_config_id_seq OWNED BY public.notification_config.id;


--
-- Name: notification_emails; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_emails (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    labo_id uuid NOT NULL,
    dept_id text,
    email text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: notification_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    batch_id uuid NOT NULL,
    type text DEFAULT ''::text NOT NULL,
    to_email text NOT NULL,
    labo_id uuid,
    dept_id text,
    subject text DEFAULT ''::text NOT NULL,
    body_text text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'sent'::text NOT NULL,
    error_message text,
    sent_at timestamp with time zone DEFAULT now(),
    queue_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    CONSTRAINT notification_log_status_check CHECK ((status = ANY (ARRAY['sent'::text, 'error'::text])))
);


--
-- Name: notification_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    type text NOT NULL,
    envoi_id uuid,
    envoi_hg_id uuid,
    exp_labo_id uuid,
    dest_labo_id uuid,
    envoi_numero text DEFAULT ''::text NOT NULL,
    departements text[] DEFAULT '{}'::text[] NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    sent_at timestamp with time zone,
    batch_id uuid,
    CONSTRAINT notification_queue_type_check CHECK ((type = ANY (ARRAY['nc'::text, 'lost'::text, 'alarm'::text, 'alarm_r'::text, 'hg_nc'::text, 'hg_alarm'::text])))
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    employee_id text NOT NULL,
    nom text NOT NULL,
    labo_id uuid,
    labo_ids uuid[] DEFAULT '{}'::uuid[],
    role text DEFAULT 'technicien'::text NOT NULL,
    active boolean DEFAULT true,
    must_change_password boolean DEFAULT false,
    is_test boolean DEFAULT false,
    created_by text DEFAULT ''::text,
    updated_by text DEFAULT ''::text,
    theme text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    tour_progress jsonb,
    CONSTRAINT profiles_role_check CHECK ((role = ANY (ARRAY['technicien'::text, 'superviseur_labo'::text, 'superviseur_grappe'::text, 'admin'::text])))
);


--
-- Name: user_lab_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_lab_memberships (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profile_id uuid NOT NULL,
    labo_id uuid NOT NULL,
    lab_role text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT user_lab_memberships_lab_role_check CHECK ((lab_role = ANY (ARRAY['technicien'::text, 'responsable'::text])))
);


--
-- Name: notification_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config ALTER COLUMN id SET DEFAULT nextval('public.notification_config_id_seq'::regclass);


--
-- Name: app_config app_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_config
    ADD CONSTRAINT app_config_pkey PRIMARY KEY (key);


--
-- Name: app_secrets_audit app_secrets_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_secrets_audit
    ADD CONSTRAINT app_secrets_audit_pkey PRIMARY KEY (id);


--
-- Name: bons_depart_envois bons_depart_envois_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_envois
    ADD CONSTRAINT bons_depart_envois_pkey PRIMARY KEY (id);


--
-- Name: bons_depart bons_depart_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart
    ADD CONSTRAINT bons_depart_numero_key UNIQUE (numero);


--
-- Name: bons_depart bons_depart_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart
    ADD CONSTRAINT bons_depart_pkey PRIMARY KEY (id);


--
-- Name: bons_depart_sections bons_depart_sections_bon_id_transporteur_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_sections
    ADD CONSTRAINT bons_depart_sections_bon_id_transporteur_key UNIQUE (bon_id, transporteur);


--
-- Name: bons_depart_sections bons_depart_sections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_sections
    ADD CONSTRAINT bons_depart_sections_pkey PRIMARY KEY (id);


--
-- Name: envois_audit envois_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_audit
    ADD CONSTRAINT envois_audit_pkey PRIMARY KEY (id);


--
-- Name: envois_hgrappe envois_hgrappe_confirm_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_confirm_token_key UNIQUE (confirm_token);


--
-- Name: envois_hgrappe envois_hgrappe_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_numero_key UNIQUE (numero);


--
-- Name: envois_hgrappe envois_hgrappe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_pkey PRIMARY KEY (id);


--
-- Name: envois envois_numero_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_numero_key UNIQUE (numero);


--
-- Name: envois envois_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_pkey PRIMARY KEY (id);


--
-- Name: external_labs external_labs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_labs
    ADD CONSTRAINT external_labs_pkey PRIMARY KEY (id);


--
-- Name: grappe_config grappe_config_grappe_id_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grappe_config
    ADD CONSTRAINT grappe_config_grappe_id_key_key UNIQUE (grappe_id, key);


--
-- Name: grappe_config grappe_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grappe_config
    ADD CONSTRAINT grappe_config_pkey PRIMARY KEY (id);


--
-- Name: grappes grappes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grappes
    ADD CONSTRAINT grappes_pkey PRIMARY KEY (id);


--
-- Name: hg_confirm_attempts hg_confirm_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hg_confirm_attempts
    ADD CONSTRAINT hg_confirm_attempts_pkey PRIMARY KEY (id);


--
-- Name: icr_codes icr_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icr_codes
    ADD CONSTRAINT icr_codes_pkey PRIMARY KEY (code);


--
-- Name: laboratories laboratories_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laboratories
    ADD CONSTRAINT laboratories_name_key UNIQUE (name);


--
-- Name: laboratories laboratories_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laboratories
    ADD CONSTRAINT laboratories_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: module_config module_config_module_labo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_config
    ADD CONSTRAINT module_config_module_labo_id_key UNIQUE (module, labo_id);


--
-- Name: module_config module_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_config
    ADD CONSTRAINT module_config_pkey PRIMARY KEY (id);


--
-- Name: notification_config notification_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_config
    ADD CONSTRAINT notification_config_pkey PRIMARY KEY (id);


--
-- Name: notification_emails notification_emails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_pkey PRIMARY KEY (id);


--
-- Name: notification_log notification_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_pkey PRIMARY KEY (id);


--
-- Name: notification_queue notification_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_employee_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_employee_id_key UNIQUE (employee_id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_lab_memberships user_lab_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lab_memberships
    ADD CONSTRAINT user_lab_memberships_pkey PRIMARY KEY (id);


--
-- Name: user_lab_memberships user_lab_memberships_profile_id_labo_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lab_memberships
    ADD CONSTRAINT user_lab_memberships_profile_id_labo_id_key UNIQUE (profile_id, labo_id);


--
-- Name: idx_app_secrets_audit_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_app_secrets_audit_name ON public.app_secrets_audit USING btree (secret_name, changed_at DESC);


--
-- Name: idx_app_secrets_audit_changed_by; Type: INDEX; Schema: public; Owner: -
--

-- Clé étrangère vers auth.users (linter « unindexed_foreign_keys »). Les index
-- simples sur envois.numero, envois_hgrappe.numero et envois_hgrappe.confirm_token
-- ont été retirés : la contrainte UNIQUE de chaque colonne en fournit déjà un.
-- De même, idx_hg_confirm_attempts doublait idx_hg_confirm_attempts_numero_ts.
CREATE INDEX idx_app_secrets_audit_changed_by ON public.app_secrets_audit USING btree (changed_by_id);


--
-- Name: idx_audit_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_by ON public.envois_audit USING btree (changed_by_id);


--
-- Name: idx_audit_changed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_changed ON public.envois_audit USING btree (changed_at DESC);


--
-- Name: idx_audit_record; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_record ON public.envois_audit USING btree (table_name, record_id);


--
-- Name: idx_bd_envois_bon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bd_envois_bon ON public.bons_depart_envois USING btree (bon_id);


--
-- Name: idx_bd_envois_envoi_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bd_envois_envoi_id ON public.bons_depart_envois USING btree (envoi_id) WHERE (envoi_id IS NOT NULL);


--
-- Name: idx_bd_envois_hg_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bd_envois_hg_id ON public.bons_depart_envois USING btree (hg_envoi_id) WHERE (hg_envoi_id IS NOT NULL);


--
-- Name: idx_bd_sections_bon; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bd_sections_bon ON public.bons_depart_sections USING btree (bon_id);


--
-- Name: idx_bons_depart_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bons_depart_created ON public.bons_depart USING btree (created_at DESC);


--
-- Name: idx_bons_depart_cree_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bons_depart_cree_par ON public.bons_depart USING btree (cree_par_id);


--
-- Name: idx_bons_depart_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bons_depart_labo ON public.bons_depart USING btree (labo_id);


--
-- Name: idx_bons_depart_statut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bons_depart_statut ON public.bons_depart USING btree (statut);


--
-- Name: idx_envois_annule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_annule ON public.envois USING btree (annule_at) WHERE (annule_at IS NOT NULL);


--
-- Name: idx_envois_annule_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_annule_par ON public.envois USING btree (annule_par_id) WHERE (annule_par_id IS NOT NULL);


--
-- Name: idx_envois_codes_icr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_codes_icr ON public.envois USING gin (codes_icr);


--
-- Name: idx_envois_cree_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_cree_par ON public.envois USING btree (cree_par_id);


--
-- Name: idx_envois_dest_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_dest_labo ON public.envois USING btree (dest_labo_id);


--
-- Name: idx_envois_echantillons_depart; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_echantillons_depart ON public.envois USING gin (echantillons_depart);


--
-- Name: idx_envois_echantillons_reception; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_echantillons_reception ON public.envois USING gin (echantillons_reception);


--
-- Name: idx_envois_exp_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_exp_labo ON public.envois USING btree (exp_labo_id);


--
-- Name: idx_envois_hgrappe_codes_icr; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_hgrappe_codes_icr ON public.envois_hgrappe USING gin (codes_icr);


--
-- Name: idx_envois_hgrappe_cree_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_hgrappe_cree_par ON public.envois_hgrappe USING btree (cree_par_id);


--
-- Name: idx_envois_hgrappe_echantillons_depart; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_hgrappe_echantillons_depart ON public.envois_hgrappe USING gin (echantillons_depart);


--
-- Name: idx_envois_numeros_silp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_numeros_silp ON public.envois USING gin (numeros_silp);


--
-- Name: idx_envois_statut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_statut ON public.envois USING btree (statut);


--
-- Name: idx_envois_ts_envoi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_envois_ts_envoi ON public.envois USING btree (ts_envoi DESC);


--
-- Name: idx_ext_labs_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_labs_name ON public.external_labs USING btree (name);


--
-- Name: idx_ext_labs_par; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ext_labs_par ON public.external_labs USING btree (parent_id);


--
-- Name: idx_grappe_config_grappe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_grappe_config_grappe ON public.grappe_config USING btree (grappe_id);


--
-- Name: idx_hg_confirm_attempts_numero_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hg_confirm_attempts_numero_ts ON public.hg_confirm_attempts USING btree (numero, attempted_at DESC);


--
-- Name: idx_hgrappe_dest; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hgrappe_dest ON public.envois_hgrappe USING btree (dest_ext_lab_id);


--
-- Name: idx_hgrappe_exp; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hgrappe_exp ON public.envois_hgrappe USING btree (exp_labo_id);


--
-- Name: idx_hgrappe_statut; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hgrappe_statut ON public.envois_hgrappe USING btree (statut);


--
-- Name: idx_hgrappe_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hgrappe_ts ON public.envois_hgrappe USING btree (ts_envoi DESC);


--
-- Name: idx_labs_grappe; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_labs_grappe ON public.laboratories USING btree (grappe_id);


--
-- Name: idx_login_attempts_emp_ts; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_login_attempts_emp_ts ON public.login_attempts USING btree (employee_id, attempted_at DESC);


--
-- Name: idx_module_config_labo; Type: INDEX; Schema: public; Owner: -
--

-- Clé étrangère vers laboratories : l'index de la contrainte UNIQUE (module,
-- labo_id) ne la couvre pas, labo_id n'y étant pas en tête. L'ancien index
-- idx_module_config_module_labo, identique à cette contrainte, a été retiré, de
-- même que idx_profiles_emp_id (identique à profiles_employee_id_key).
CREATE INDEX idx_module_config_labo ON public.module_config USING btree (labo_id);


--
-- Name: idx_notif_emails_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_emails_labo ON public.notification_emails USING btree (labo_id, dept_id);


--
-- Name: idx_notif_log_batch; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_log_batch ON public.notification_log USING btree (batch_id);


--
-- Name: idx_notif_log_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_log_labo ON public.notification_log USING btree (labo_id) WHERE (labo_id IS NOT NULL);


--
-- Name: idx_notif_log_sent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_log_sent ON public.notification_log USING btree (sent_at DESC);


--
-- Name: idx_notif_queue_dest_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_queue_dest_labo ON public.notification_queue USING btree (dest_labo_id) WHERE (dest_labo_id IS NOT NULL);


--
-- Name: idx_notif_queue_envoi; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_queue_envoi ON public.notification_queue USING btree (envoi_id);


--
-- Name: idx_notif_queue_envoi_hg; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_queue_envoi_hg ON public.notification_queue USING btree (envoi_hg_id) WHERE (envoi_hg_id IS NOT NULL);


--
-- Name: idx_notif_queue_exp_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_queue_exp_labo ON public.notification_queue USING btree (exp_labo_id) WHERE (exp_labo_id IS NOT NULL);


--
-- Name: idx_notif_queue_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notif_queue_pending ON public.notification_queue USING btree (created_at) WHERE (sent_at IS NULL);


--
-- Name: idx_profiles_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_labo ON public.profiles USING btree (labo_id);


--
-- Name: idx_profiles_labo_ids; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_profiles_labo_ids ON public.profiles USING gin (labo_ids);


--
-- Name: idx_ulm_labo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ulm_labo ON public.user_lab_memberships USING btree (labo_id);


--
-- Name: idx_ulm_profile; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ulm_profile ON public.user_lab_memberships USING btree (profile_id);


--
-- Name: bons_depart_sections trg_bd_sections_after_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_bd_sections_after_update AFTER UPDATE ON public.bons_depart_sections FOR EACH ROW EXECUTE FUNCTION public.trg_bd_section_completion();


--
-- Name: envois trg_envoi_numero; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envoi_numero BEFORE INSERT ON public.envois FOR EACH ROW EXECUTE FUNCTION public.generate_envoi_numero();


--
-- Name: envois trg_envois_bon_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_bon_completion AFTER UPDATE ON public.envois FOR EACH ROW EXECUTE FUNCTION public.trg_envois_bon_completion();


--
-- Name: envois_hgrappe trg_envois_hgrappe_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_hgrappe_updated BEFORE UPDATE ON public.envois_hgrappe FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: envois trg_envois_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_updated BEFORE UPDATE ON public.envois FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: envois_hgrappe trg_hgrappe_bon_completion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_hgrappe_bon_completion AFTER UPDATE ON public.envois_hgrappe FOR EACH ROW EXECUTE FUNCTION public.trg_hgrappe_bon_completion();


--
-- Name: profiles trg_profiles_labo_ids; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_labo_ids BEFORE INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.sync_labo_ids_on_insert();


--
-- Name: profiles trg_profiles_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_protect BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.protect_profile_columns();


--
-- Name: profiles trg_profiles_updated; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


--
-- Name: envois trg_envois_protect_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_protect_columns BEFORE UPDATE ON public.envois FOR EACH ROW EXECUTE FUNCTION public.protect_envoi_columns();


--
-- Name: envois_hgrappe trg_envois_hgrappe_protect_columns; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_hgrappe_protect_columns BEFORE UPDATE ON public.envois_hgrappe FOR EACH ROW EXECUTE FUNCTION public.protect_envoi_hgrappe_columns();


--
-- Name: envois_hgrappe trg_envois_hgrappe_capacites; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_hgrappe_capacites BEFORE INSERT ON public.envois_hgrappe FOR EACH ROW EXECUTE FUNCTION public._envois_hgrappe_capacites();


--
-- Name: notification_config trg_notification_config_smtp; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_notification_config_smtp AFTER UPDATE ON public.notification_config FOR EACH ROW WHEN (((old.smtp_host IS DISTINCT FROM new.smtp_host) OR (old.smtp_port IS DISTINCT FROM new.smtp_port) OR (old.smtp_user IS DISTINCT FROM new.smtp_user))) EXECUTE FUNCTION public._effacer_smtp_pass();


--
-- Name: app_config trg_app_config_protect; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_app_config_protect BEFORE INSERT OR DELETE OR UPDATE ON public.app_config FOR EACH ROW EXECUTE FUNCTION public._proteger_app_config();


--
-- Name: envois trg_envois_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_audit AFTER INSERT OR UPDATE OR DELETE ON public.envois FOR EACH ROW EXECUTE FUNCTION public.trg_audit_envoi();


--
-- Name: envois_hgrappe trg_envois_hgrappe_audit; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_envois_hgrappe_audit AFTER INSERT OR UPDATE OR DELETE ON public.envois_hgrappe FOR EACH ROW EXECUTE FUNCTION public.trg_audit_envoi();


--
-- Name: app_secrets_audit app_secrets_audit_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_secrets_audit
    ADD CONSTRAINT app_secrets_audit_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES auth.users(id);


--
-- Name: bons_depart bons_depart_cree_par_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart
    ADD CONSTRAINT bons_depart_cree_par_id_fkey FOREIGN KEY (cree_par_id) REFERENCES public.profiles(id);


--
-- Name: bons_depart_envois bons_depart_envois_bon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_envois
    ADD CONSTRAINT bons_depart_envois_bon_id_fkey FOREIGN KEY (bon_id) REFERENCES public.bons_depart(id) ON DELETE CASCADE;


--
-- Name: bons_depart_envois bons_depart_envois_envoi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_envois
    ADD CONSTRAINT bons_depart_envois_envoi_id_fkey FOREIGN KEY (envoi_id) REFERENCES public.envois(id);


--
-- Name: bons_depart_envois bons_depart_envois_hg_envoi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_envois
    ADD CONSTRAINT bons_depart_envois_hg_envoi_id_fkey FOREIGN KEY (hg_envoi_id) REFERENCES public.envois_hgrappe(id);


--
-- Name: bons_depart bons_depart_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart
    ADD CONSTRAINT bons_depart_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id);


--
-- Name: bons_depart_sections bons_depart_sections_bon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bons_depart_sections
    ADD CONSTRAINT bons_depart_sections_bon_id_fkey FOREIGN KEY (bon_id) REFERENCES public.bons_depart(id) ON DELETE CASCADE;


--
-- Name: envois envois_annule_par_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_annule_par_id_fkey FOREIGN KEY (annule_par_id) REFERENCES public.profiles(id);


--
-- Name: envois_audit envois_audit_changed_by_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_audit
    ADD CONSTRAINT envois_audit_changed_by_id_fkey FOREIGN KEY (changed_by_id) REFERENCES auth.users(id);


--
-- Name: envois envois_cree_par_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_cree_par_id_fkey FOREIGN KEY (cree_par_id) REFERENCES public.profiles(id);


--
-- Name: envois envois_dest_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_dest_labo_id_fkey FOREIGN KEY (dest_labo_id) REFERENCES public.laboratories(id);


--
-- Name: envois envois_exp_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois
    ADD CONSTRAINT envois_exp_labo_id_fkey FOREIGN KEY (exp_labo_id) REFERENCES public.laboratories(id);


--
-- Name: envois_hgrappe envois_hgrappe_cree_par_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_cree_par_id_fkey FOREIGN KEY (cree_par_id) REFERENCES public.profiles(id);


--
-- Name: envois_hgrappe envois_hgrappe_dest_ext_lab_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_dest_ext_lab_id_fkey FOREIGN KEY (dest_ext_lab_id) REFERENCES public.external_labs(id);


--
-- Name: envois_hgrappe envois_hgrappe_exp_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.envois_hgrappe
    ADD CONSTRAINT envois_hgrappe_exp_labo_id_fkey FOREIGN KEY (exp_labo_id) REFERENCES public.laboratories(id);


--
-- Name: external_labs external_labs_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.external_labs
    ADD CONSTRAINT external_labs_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.external_labs(id) ON DELETE SET NULL;


--
-- Name: grappe_config grappe_config_grappe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.grappe_config
    ADD CONSTRAINT grappe_config_grappe_id_fkey FOREIGN KEY (grappe_id) REFERENCES public.grappes(id) ON DELETE CASCADE;


--
-- Name: laboratories laboratories_grappe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.laboratories
    ADD CONSTRAINT laboratories_grappe_id_fkey FOREIGN KEY (grappe_id) REFERENCES public.grappes(id);


--
-- Name: module_config module_config_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.module_config
    ADD CONSTRAINT module_config_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id) ON DELETE CASCADE;


--
-- Name: notification_emails notification_emails_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_emails
    ADD CONSTRAINT notification_emails_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id) ON DELETE CASCADE;


--
-- Name: notification_log notification_log_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_log
    ADD CONSTRAINT notification_log_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id) ON DELETE SET NULL;


--
-- Name: notification_queue notification_queue_dest_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_dest_labo_id_fkey FOREIGN KEY (dest_labo_id) REFERENCES public.laboratories(id) ON DELETE SET NULL;


--
-- Name: notification_queue notification_queue_envoi_hg_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_envoi_hg_id_fkey FOREIGN KEY (envoi_hg_id) REFERENCES public.envois_hgrappe(id) ON DELETE SET NULL;


--
-- Name: notification_queue notification_queue_envoi_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_envoi_id_fkey FOREIGN KEY (envoi_id) REFERENCES public.envois(id) ON DELETE SET NULL;


--
-- Name: notification_queue notification_queue_exp_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_queue
    ADD CONSTRAINT notification_queue_exp_labo_id_fkey FOREIGN KEY (exp_labo_id) REFERENCES public.laboratories(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: profiles profiles_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id);


--
-- Name: user_lab_memberships user_lab_memberships_labo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lab_memberships
    ADD CONSTRAINT user_lab_memberships_labo_id_fkey FOREIGN KEY (labo_id) REFERENCES public.laboratories(id) ON DELETE CASCADE;


--
-- Name: user_lab_memberships user_lab_memberships_profile_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_lab_memberships
    ADD CONSTRAINT user_lab_memberships_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


--
-- Name: bons_depart Création bons_depart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Création bons_depart" ON public.bons_depart FOR INSERT TO authenticated WITH CHECK (((labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: envois Création envois; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Création envois" ON public.envois FOR INSERT TO authenticated WITH CHECK (((exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: envois_hgrappe Création envois_hgrappe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Création envois_hgrappe" ON public.envois_hgrappe FOR INSERT TO authenticated WITH CHECK (((exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: module_config Ecriture module_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Ecriture module_config" ON public.module_config TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text]))) WITH CHECK ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: app_config Gestion config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion config" ON public.app_config TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: external_labs Gestion external_labs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion external_labs" ON public.external_labs TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: grappe_config Gestion grappe_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion grappe_config" ON public.grappe_config TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text]))) WITH CHECK ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: grappes Gestion grappes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion grappes" ON public.grappes TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text]))) WITH CHECK ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: laboratories Gestion labos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion labos" ON public.laboratories TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: user_lab_memberships Gestion memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion memberships" ON public.user_lab_memberships TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text]))) WITH CHECK ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: notification_emails Gestion notif_emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Gestion notif_emails" ON public.notification_emails TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));






--
-- Name: profiles Insertion profils (service role); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Insertion profils (service role)" ON public.profiles FOR INSERT TO service_role WITH CHECK (true);


--
-- Name: envois_audit Lecture audit; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture audit" ON public.envois_audit FOR SELECT TO authenticated USING (((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])) OR ((table_name = 'envois'::text) AND (EXISTS ( SELECT 1
   FROM public.envois e
  WHERE ((e.id = envois_audit.record_id) AND ((e.exp_labo_id = ANY (public.current_labo_ids())) OR (e.dest_labo_id = ANY (public.current_labo_ids()))))))) OR ((table_name = 'envois_hgrappe'::text) AND (EXISTS ( SELECT 1
   FROM public.envois_hgrappe h
  WHERE ((h.id = envois_audit.record_id) AND (h.exp_labo_id = ANY (public.current_labo_ids()))))))));


--
-- Name: app_secrets_audit Lecture audit secrets (admin); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture audit secrets (admin)" ON public.app_secrets_audit FOR SELECT TO authenticated USING ((public.current_role_name() = 'admin'::text));


--
-- Name: bons_depart Lecture bons_depart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture bons_depart" ON public.bons_depart FOR SELECT TO authenticated USING (((labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: bons_depart_envois Lecture bons_depart_envois; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture bons_depart_envois" ON public.bons_depart_envois FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bons_depart bd
  WHERE ((bd.id = bons_depart_envois.bon_id) AND ((bd.labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))))));


--
-- Name: bons_depart_sections Lecture bons_depart_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture bons_depart_sections" ON public.bons_depart_sections FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bons_depart bd
  WHERE ((bd.id = bons_depart_sections.bon_id) AND ((bd.labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))))));


--
-- Name: app_config Lecture config (anon); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture config (anon)" ON public.app_config FOR SELECT TO anon USING (true);


--
-- Name: app_config Lecture config (auth); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture config (auth)" ON public.app_config FOR SELECT TO authenticated USING (true);


--
-- Name: envois Lecture envois; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture envois" ON public.envois FOR SELECT TO authenticated USING (((exp_labo_id = ANY (public.current_labo_ids())) OR (dest_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: envois_hgrappe Lecture envois_hgrappe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture envois_hgrappe" ON public.envois_hgrappe FOR SELECT TO authenticated USING (((exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: external_labs Lecture external_labs; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture external_labs" ON public.external_labs FOR SELECT TO authenticated USING (true);


--
-- Name: grappe_config Lecture grappe_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture grappe_config" ON public.grappe_config FOR SELECT TO authenticated USING (true);


--
-- Name: grappes Lecture grappes; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture grappes" ON public.grappes FOR SELECT TO authenticated USING (true);


--
-- Name: hg_confirm_attempts Lecture hg_confirm_attempts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture hg_confirm_attempts" ON public.hg_confirm_attempts FOR SELECT TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: laboratories Lecture labos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture labos" ON public.laboratories FOR SELECT TO authenticated USING (true);


--
-- Name: login_attempts Lecture login_attempts (admin/grappe); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture login_attempts (admin/grappe)" ON public.login_attempts FOR SELECT TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: user_lab_memberships Lecture memberships; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture memberships" ON public.user_lab_memberships FOR SELECT TO authenticated USING (((profile_id = ( SELECT auth.uid() AS uid)) OR (public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text, 'superviseur_labo'::text]))));


--
-- Name: module_config Lecture module_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture module_config" ON public.module_config FOR SELECT TO authenticated USING (true);


--
-- Name: notification_config Lecture notif_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture notif_config" ON public.notification_config FOR SELECT TO authenticated USING ((public.current_role_name() = 'admin'::text));


--
-- Name: notification_emails Lecture notif_emails; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture notif_emails" ON public.notification_emails FOR SELECT TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: notification_log Lecture notif_log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture notif_log" ON public.notification_log FOR SELECT TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: notification_queue Lecture notif_queue; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture notif_queue" ON public.notification_queue FOR SELECT TO authenticated USING ((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text])));


--
-- Name: profiles Lecture profil (soi-même); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture profil (soi-même)" ON public.profiles FOR SELECT TO authenticated USING ((id = ( SELECT auth.uid() AS uid)));


--
-- Name: profiles Lecture profils (superviseurs); Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Lecture profils (superviseurs)" ON public.profiles FOR SELECT TO authenticated USING (((public.current_role_name() = 'admin'::text) OR (public.current_role_name() = 'superviseur_grappe'::text) OR ((public.current_role_name() = 'superviseur_labo'::text) AND (labo_id = public.current_labo_id()))));


--
-- Name: notification_config MAJ notif_config; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "MAJ notif_config" ON public.notification_config FOR UPDATE TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: bons_depart Mise à jour bons_depart; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mise à jour bons_depart" ON public.bons_depart FOR UPDATE TO authenticated USING (((labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))) WITH CHECK (((labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: bons_depart_sections Mise à jour bons_depart_sections; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mise à jour bons_depart_sections" ON public.bons_depart_sections FOR UPDATE TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.bons_depart bd
  WHERE ((bd.id = bons_depart_sections.bon_id) AND ((bd.labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM public.bons_depart bd
  WHERE ((bd.id = bons_depart_sections.bon_id) AND ((bd.labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))))));


--
-- Name: envois Mise à jour envois; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mise à jour envois" ON public.envois FOR UPDATE TO authenticated USING (((dest_labo_id = ANY (public.current_labo_ids())) OR (exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))) WITH CHECK (((dest_labo_id = ANY (public.current_labo_ids())) OR (exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: envois_hgrappe Mise à jour envois_hgrappe; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mise à jour envois_hgrappe" ON public.envois_hgrappe FOR UPDATE TO authenticated USING (((exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text])))) WITH CHECK (((exp_labo_id = ANY (public.current_labo_ids())) OR (public.current_role_name() = ANY (ARRAY['superviseur_grappe'::text, 'admin'::text]))));


--
-- Name: profiles Modification profils; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Modification profils" ON public.profiles FOR UPDATE TO authenticated USING (((id = ( SELECT auth.uid() AS uid)) OR (public.current_role_name() = 'admin'::text) OR ((public.current_role_name() = 'superviseur_grappe'::text) AND (role <> 'admin'::text)) OR ((public.current_role_name() = 'superviseur_labo'::text) AND (labo_id = public.current_labo_id()) AND (role <> 'admin'::text)))) WITH CHECK (((public.current_role_name() = ANY (ARRAY['admin'::text, 'superviseur_grappe'::text, 'superviseur_labo'::text])) OR (id = ( SELECT auth.uid() AS uid))));


--
-- Name: app_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

--
-- Name: app_secrets_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.app_secrets_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: bons_depart; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bons_depart ENABLE ROW LEVEL SECURITY;

--
-- Name: bons_depart_envois; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bons_depart_envois ENABLE ROW LEVEL SECURITY;

--
-- Name: bons_depart_sections; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bons_depart_sections ENABLE ROW LEVEL SECURITY;

--
-- Name: envois; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envois ENABLE ROW LEVEL SECURITY;

--
-- Name: envois_audit; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envois_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: envois_hgrappe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.envois_hgrappe ENABLE ROW LEVEL SECURITY;

--
-- Name: external_labs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.external_labs ENABLE ROW LEVEL SECURITY;

--
-- Name: grappe_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grappe_config ENABLE ROW LEVEL SECURITY;

--
-- Name: grappes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.grappes ENABLE ROW LEVEL SECURITY;

--
-- Name: hg_confirm_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hg_confirm_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: icr_codes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.icr_codes ENABLE ROW LEVEL SECURITY;

--
-- Name: icr_codes icr_codes_insert; Type: POLICY; Schema: public; Owner: -
--

-- L'ancienne policy icr_codes_admin (FOR ALL, sans clause TO) s'appliquait
-- aussi à anon et doublait icr_codes_read en lecture. Remplacée par trois
-- policies d'écriture réservées à authenticated (admin), et la lecture est
-- elle aussi réservée à authenticated : seule l'application connectée lit les
-- codes ICR. _compute_codes_icr (SECURITY INVOKER) n'a pas besoin de ce droit
-- pour l'appelant : elle n'est appelée que par des fonctions SECURITY DEFINER
-- (create_envoi_hgrappe, create_envoi_hsilp), qui lisent la table sous leur
-- propriétaire.
CREATE POLICY icr_codes_insert ON public.icr_codes FOR INSERT TO authenticated WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: icr_codes icr_codes_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY icr_codes_update ON public.icr_codes FOR UPDATE TO authenticated USING ((public.current_role_name() = 'admin'::text)) WITH CHECK ((public.current_role_name() = 'admin'::text));


--
-- Name: icr_codes icr_codes_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY icr_codes_delete ON public.icr_codes FOR DELETE TO authenticated USING ((public.current_role_name() = 'admin'::text));


--
-- Name: icr_codes icr_codes_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY icr_codes_read ON public.icr_codes FOR SELECT TO authenticated USING (true);


--
-- Name: laboratories; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.laboratories ENABLE ROW LEVEL SECURITY;

--
-- Name: login_attempts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

--
-- Name: module_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.module_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_config; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_config ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_emails; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_emails ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_lab_memberships; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_lab_memberships ENABLE ROW LEVEL SECURITY;

--
-- ============================================================
-- Modèle de privilèges — BLOC MAINTENU À LA MAIN
-- ============================================================
-- Rien n'est accordé implicitement (privilèges par défaut révoqués en tête de
-- fichier). On révoque d'abord TOUT aux rôles de l'API sur les objets du
-- schéma public, puis on accorde explicitement, rôle par rôle, le strict
-- nécessaire. Les GRANT décident quelles opérations PostgREST peut tenter ;
-- la RLS filtre ensuite les lignes, et chaque fonction SECURITY DEFINER
-- contrôle elle-même son appelant.
--
-- Convention : toute fonction ou table ajoutée s'inscrit ICI. Un objet oublié
-- n'est accessible à personne (échec visible), jamais à tout le monde. Les
-- invariants sont vérifiés en CI (supabase/ci/verif_restauration.sql).

-- ── 1. Révocation globale ───────────────────────────────────────────────────
-- Fonctions : toutes celles du schéma public, sauf celles d'une extension
-- (leurs privilèges relèvent de l'extension). Le format %s d'un regprocedure
-- est qualifié par le schéma (search_path vide).
DO $revocation$
DECLARE
  v_fn regprocedure;
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d
                        WHERE d.classid = 'pg_proc'::regclass
                          AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_fn);
  END LOOP;
END
$revocation$;

REVOKE ALL ON ALL TABLES    IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── 2. Fonctions exécutables par anon : la page publique /confirm ──────────
-- Les SEULES fonctions joignables sans compte (clé publiable) : confirmation
-- de réception hors-grappe par jeton, ou par « numéro + code ».
GRANT EXECUTE ON FUNCTION public.get_hg_confirm_cfg() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_envoi_hgrappe_by_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_envoi_hgrappe_by_numero(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_envoi_hgrappe(uuid, boolean, text[], text, text, timestamp with time zone) TO anon, authenticated;

-- ── 3. Fonctions exécutables par authenticated ─────────────────────────────
-- Auxiliaires de la RLS et des déclencheurs SECURITY INVOKER
-- (protect_profile_columns, protect_envoi_*) : aussi pour service_role, dont
-- les écritures sur profiles traversent protect_profile_columns.
GRANT EXECUTE ON FUNCTION public.current_role_name() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_labo_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_labo_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_lab_role(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._role_rank(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_module_active(text, uuid) TO authenticated, service_role;

-- RPC métier : chacune vérifie le périmètre (laboratoires, rôle) de l'appelant.
GRANT EXECUTE ON FUNCTION public.add_envois_to_bon(uuid, uuid[], uuid[], jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annuler_envoi(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_bon_depart(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_bon_depart(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hg_hist_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hist_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_icr_stats(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_labo_kpis(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_next_hgrappe() TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_next_hsilp() TO authenticated;
GRANT EXECUTE ON FUNCTION public.queue_envoi_notification(text, uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_envoi_from_bon(uuid) TO authenticated;

-- Secrets applicatifs : chaque fonction exige un administrateur ACTIF
-- (current_role_name() = 'admin'), sans changement de mot de passe en attente.
-- Aucune ne renvoie de valeur.
GRANT EXECUTE ON FUNCTION public.set_app_secret(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_app_secret(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_notify_trigger_secret() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_app_secrets_status() TO authenticated;

-- ── 4. Fonctions exécutables par service_role seul (fonctions Edge) ────────
-- Exactement celles qu'appellent les fonctions Edge : get_app_secret
-- (_shared/secrets.ts), revoke_user_sessions (manage-user),
-- count_recent_login_failures et record_login_attempt (auth-gate).
GRANT EXECUTE ON FUNCTION public.get_app_secret(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_recent_login_failures(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_login_attempt(text, boolean) TO service_role;

-- ── 5. Fonctions réservées au propriétaire (aucun GRANT) ───────────────────
-- Déclencheurs (protect_*, trg_*, sync_labo_ids_on_insert, update_updated_at,
-- generate_envoi_numero, _envois_hgrappe_capacites, _effacer_smtp_pass,
-- _proteger_app_config), auxiliaires internes (_allowed_secret_names,
-- _compute_codes_icr, check_bon_completion, _hex_aleatoire_32,
-- _generer_verify_code, _hg_confirm_par_numero_actif, _vault_ecrire,
-- _journaliser_secret) et tâches planifiées (_trigger_send_notifications,
-- _surveiller_notifications, _detect_alarm_envois, _purge_envois_audit,
-- _purge_notifications) : appelés par le serveur seulement. Les tâches
-- planifiées tournent sous le propriétaire (pg_cron) ; une exécution manuelle
-- se fait dans le SQL Editor, sous postgres.
--
-- Toute modification de ces listes doit être reportée dans les listes exactes
-- de supabase/ci/verif_restauration.sql (blocs 6 à 8) : la CI échoue sur un
-- droit en trop comme sur un droit manquant.

-- ── 6. Tables et séquences ─────────────────────────────────────────────────
-- anon : la seule configuration d'affichage, lue par l'écran de connexion
-- (nom de l'application, messages). Aucune autre table.
GRANT SELECT ON public.app_config TO anon;

-- authenticated : les opérations couvertes par une policy ; la RLS filtre.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.app_config, public.external_labs, public.grappe_config, public.grappes,
  public.icr_codes, public.laboratories, public.module_config,
  public.notification_emails, public.user_lab_memberships
  TO authenticated;
GRANT SELECT, INSERT, UPDATE ON
  public.bons_depart, public.envois, public.envois_hgrappe
  TO authenticated;
GRANT SELECT, UPDATE ON
  public.bons_depart_sections, public.notification_config, public.profiles
  TO authenticated;
-- Journaux et tables alimentées par le serveur : lecture seule. Les journaux
-- d'audit ne sont écrits que par les fonctions SECURITY DEFINER (append-only).
GRANT SELECT ON
  public.app_secrets_audit, public.bons_depart_envois, public.envois_audit,
  public.hg_confirm_attempts, public.login_attempts, public.notification_log,
  public.notification_queue
  TO authenticated;
-- Numérotation des envois créés par INSERT direct (generate_envoi_numero,
-- SECURITY INVOKER, appelle nextval).
GRANT USAGE ON SEQUENCE public.envoi_seq TO authenticated;

-- service_role (fonctions Edge, BYPASSRLS sur Supabase) : lecture et écriture
-- des données, sans TRUNCATE ni droits de structure ; lecture seule des
-- journaux d'audit, qui restent append-only pour tout rôle de l'API.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
REVOKE INSERT, UPDATE, DELETE ON public.app_secrets_audit, public.envois_audit FROM service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;


--
-- PostgreSQL database dump complete
--



--

--
-- Realtime : publication des tables suivies par le frontend
--
-- Publication Realtime restreinte (cf. migration 058).
--
-- Ces instructions sont hors de ce que le pg_dump restitue : elles sont
-- maintenues a la main et sont la seule trace, dans le depot, de la frontiere
-- de replication. Elles sont donc ecrites de facon IDEMPOTENTE : « ADD TABLE »
-- leve une erreur si la table est deja membre, ce qui rendait ce bloc
-- inexecutable deux fois -- sur une base ou la publication a deja des membres,
-- ou qu'une bascule faite en console a modifiee. Le reste de schema.sql, lui,
-- est un pg_dump a base de CREATE non gardes : il n'est pas rejouable et ne
-- pretend pas l'etre, la procedure de deploiement l'appliquant a un projet
-- VIERGE (docs/deploiement/01-supabase.md:62). Ce bloc est simplement le seul
-- du fichier qu'on peut raisonnablement vouloir rejouer seul.
--
-- profiles et app_config ne sont PLUS publiees : aucune liaison
-- postgres_changes de l'arbre ne les ecoute. Les deux tables restantes sont
-- reduites aux colonnes que le declencheur de rechargement consulte
-- (public/js/envois.js:893-898) -- ce qui retire du flux confirm_token, la
-- capacite porteuse du flux de confirmation anonyme. La cle primaire doit
-- figurer dans la liste : c'est l'identite de replica par defaut.
DO $pub$
DECLARE
  v_tbl TEXT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;

  FOR v_tbl IN
    SELECT format('%I.%I', schemaname, tablename)
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
  LOOP
    EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %s', v_tbl);
  END LOOP;

  ALTER PUBLICATION supabase_realtime ADD TABLE public.envois (id, exp_labo_id, dest_labo_id);
  ALTER PUBLICATION supabase_realtime ADD TABLE public.envois_hgrappe (id, exp_labo_id);
END
$pub$;

--
-- Données de référence (bloc maintenu à la main)
--
-- Codes ICR.
INSERT INTO public.icr_codes (code, libelle, actif, ordre) VALUES
  ('70008', 'Glace sèche', true, 1),
  ('70009', 'Envoi urgent en dehors des routes normales', true, 2)
ON CONFLICT (code) DO NOTHING;

-- Configuration des notifications : une seule ligne (id = 1, lue par les
-- fonctions Edge), désactivée par défaut. Créée par la migration 013 ; perdue
-- par la consolidation, faute de quoi l'écran de configuration n'avait rien à
-- mettre à jour.
INSERT INTO public.notification_config (enabled, enabled_nc, enabled_lost, enabled_alarm)
SELECT false, true, true, true
WHERE NOT EXISTS (SELECT 1 FROM public.notification_config);

-- URL de base du projet, appelée par le cron (_trigger_send_notifications) :
-- livrée VIDE. À renseigner une fois dans le SQL Editor, jamais depuis
-- l'application (déclencheur _proteger_app_config) :
--   UPDATE public.app_config SET value = to_jsonb('https://<ref>.supabase.co'::text)
--    WHERE key = 'supabase_url';
INSERT INTO public.app_config (key, value) VALUES ('supabase_url', '""'::jsonb)
ON CONFLICT (key) DO NOTHING;

--
-- Secret de déclenchement du cron (bloc maintenu à la main, rejouable)
--
-- NOTIFY_TRIGGER_SECRET est généré dans la base à l'installation s'il est
-- absent : aucun humain ne le saisit ni ne le voit. Le cron le lit dans le
-- Vault (_trigger_send_notifications), send-notifications aussi (via
-- get_app_secret). Rotation : rotate_notify_trigger_secret() depuis
-- l'interface d'administration.
DO $notify$
BEGIN
  IF to_regclass('vault.secrets') IS NULL THEN
    RAISE WARNING 'Vault absent : NOTIFY_TRIGGER_SECRET non créé.';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'NOTIFY_TRIGGER_SECRET') THEN
    PERFORM public._journaliser_secret('NOTIFY_TRIGGER_SECRET',
              public._vault_ecrire('NOTIFY_TRIGGER_SECRET', public._hex_aleatoire_32()));
  END IF;
END
$notify$;

--
-- Tâches planifiées (bloc maintenu à la main, rejouable seul)
--
-- Gardé : ne planifie rien si pg_cron ou pg_net manque (instance locale, CI).
-- Sur Supabase, activer les deux extensions dans la console (Database →
-- Extensions) puis rejouer ce bloc s'il a été sauté. cron.schedule remplace un
-- job de même nom : le bloc est idempotent. Aucune commande ne contient de
-- secret : le job d'envoi n'appelle qu'une fonction, qui lit le Vault au
-- moment de l'exécution. Horaires en UTC.
DO $cron$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE WARNING 'pg_cron ou pg_net absent : tâches planifiées NON créées. Activer les extensions puis rejouer ce bloc.';
    RETURN;
  END IF;

  -- Anciens noms (job créé au dashboard, avec l'en-tête secret en clair dans
  -- sa commande) : retirés.
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'send-notifications-hourly';

  -- Récapitulatif des notifications : jours ouvrables, 11 h 55 UTC
  -- (7 h 55 à Montréal en heure avancée).
  PERFORM cron.schedule('send-notifications', '55 11 * * 1-5',
                        $c$SELECT public._trigger_send_notifications();$c$);
  -- Détection des alarmes (retard, potentiellement perdu, hors-grappe sans
  -- confirmation) : toutes les 30 minutes, à H+10 et H+40.
  PERFORM cron.schedule('detect-alarm-envois', '10,40 * * * *',
                        $c$SELECT public._detect_alarm_envois();$c$);
  -- Rétention.
  PERFORM cron.schedule('purge-envois-audit', '17 3 * * *',
                        $c$SELECT public._purge_envois_audit();$c$);
  PERFORM cron.schedule('purge-notifications', '32 3 * * *',
                        $c$SELECT public._purge_notifications();$c$);
  PERFORM cron.schedule('purge-historique-cron', '47 3 * * *',
                        $c$DELETE FROM cron.job_run_details WHERE end_time < now() - interval '30 days';$c$);
  -- Tentatives de confirmation hors-grappe : get_envoi_hgrappe_by_numero ne
  -- les purge qu'en cas de succès ; des essais anonymes sur des numéros
  -- inexistants feraient sinon grossir la table sans borne. 24 h suffisent à
  -- la limite de 5 essais par 15 minutes.
  PERFORM cron.schedule('purge-hg-confirm-attempts', '52 3 * * *',
                        $c$DELETE FROM public.hg_confirm_attempts WHERE attempted_at < now() - interval '24 hours';$c$);
  -- Chien de garde : notifications en attente depuis plus de 30 h.
  PERFORM cron.schedule('surveillance-notifications', '0 14 * * 1-5',
                        $c$SELECT public._surveiller_notifications();$c$);
END
$cron$;

--
-- État de l'installation (bloc maintenu à la main, DERNIÈRE instruction)
--
-- Le SQL Editor affiche surtout le résultat de la dernière instruction : un
-- avertissement du bloc précédent (extensions absentes, donc AUCUNE tâche
-- planifiée, chien de garde compris) passerait inaperçu. Cette ligne d'état
-- le rend visible, avec l'étape suivante à faire. Le bloc (DO puis SELECT)
-- se rejoue seul à tout moment pour contrôler une installation. Le nombre de
-- tâches est lu dans un
-- bloc DO (le schéma cron n'existe pas toujours) et transmis par un paramètre
-- de session, sans créer d'objet.
DO $etat$
DECLARE
  v_taches INT := 0;
  v_secret BOOLEAN := false;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    EXECUTE $q$SELECT count(*) FROM cron.job
                WHERE jobname = ANY ($1) AND active$q$
      INTO v_taches
      USING ARRAY['send-notifications', 'detect-alarm-envois', 'purge-envois-audit',
                  'purge-notifications', 'purge-historique-cron',
                  'purge-hg-confirm-attempts', 'surveillance-notifications'];
  END IF;
  IF to_regclass('vault.secrets') IS NOT NULL THEN
    EXECUTE $q$SELECT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'NOTIFY_TRIGGER_SECRET')$q$
      INTO v_secret;
  END IF;
  PERFORM set_config('optilab.etat_taches', v_taches::text, false);
  PERFORM set_config('optilab.etat_secret', v_secret::text, false);
END
$etat$;

SELECT e.extensions_ok,
       e.taches_planifiees || ' / 7' AS taches_planifiees,
       e.secret_ok,
       e.supabase_url_ok,
       CASE
         WHEN NOT e.extensions_ok
           THEN 'Activer pg_cron et pg_net (Database → Extensions), puis rejouer le bloc « Tâches planifiées » et cette requête.'
         WHEN e.taches_planifiees < 7
           THEN 'Rejouer le bloc « Tâches planifiées » (fin de schema.sql).'
         WHEN NOT e.secret_ok
           THEN 'Rejouer le bloc « Secret de déclenchement du cron ».'
         WHEN NOT e.supabase_url_ok
           THEN 'Renseigner app_config.supabase_url (UPDATE donné dans le bloc « Données de référence »).'
         ELSE 'Installation complète.'
       END AS prochaine_etape
  FROM (SELECT (SELECT count(*) FROM pg_catalog.pg_extension
                 WHERE extname IN ('pg_cron', 'pg_net')) = 2                AS extensions_ok,
               COALESCE(NULLIF(pg_catalog.current_setting('optilab.etat_taches', true), ''), '0')::int
                                                                            AS taches_planifiees,
               COALESCE(NULLIF(pg_catalog.current_setting('optilab.etat_secret', true), ''), 'false')::boolean
                                                                            AS secret_ok,
               COALESCE((SELECT value #>> '{}' FROM public.app_config
                          WHERE key = 'supabase_url'), '') <> ''            AS supabase_url_ok) e;
