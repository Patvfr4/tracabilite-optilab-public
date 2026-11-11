-- ============================================================
-- Vérifications post-restauration — invariants de sécurité du schéma
--
-- Exécuté par le workflow « CI » (job « restauration-schema ») après
-- chargement de supabase/ci/supabase_shim.sql puis supabase/schema.sql sur une
-- base vierge. Chaque bloc lève une exception explicite en cas d'échec ;
-- psql -v ON_ERROR_STOP=1 fait alors échouer le job.
--
-- Deux familles de contrôles :
--   · des invariants (RLS partout, search_path figé, rien pour PUBLIC…), qui
--     s'appliquent d'office à tout objet ajouté ;
--   · les droits des rôles de l'API, comparés à des listes EXACTES (blocs 6
--     à 8) : un droit en trop expose des données, un droit manquant casse
--     l'application en production alors que tout le reste passe. Ajouter une
--     fonction ou une table impose donc de l'inscrire ici ET dans le bloc
--     « Modèle de privilèges » de schema.sql : c'est voulu.
-- Le shim ayant reproduit les privilèges par défaut de Supabase (tout accordé
-- aux rôles de l'API), les droits vérifiés ici sont ceux qu'aurait un projet
-- Supabase réel. Le bloc 12 inclut les tests fonctionnels
-- (tests_fonctionnels.sql), joués dans une transaction annulée : ils
-- vérifient que les droits accordés suffisent aux appels réels du client.
-- ============================================================

\echo '── 1. Objets structurants présents ────────────────────────────────────'
DO $$
DECLARE
  v_manquantes TEXT;
BEGIN
  SELECT string_agg(t, ', ')
  INTO   v_manquantes
  FROM   unnest(ARRAY[
           'profiles', 'laboratories', 'external_labs', 'user_lab_memberships',
           'envois', 'envois_hgrappe', 'envois_audit', 'bons_depart',
           'notification_queue', 'notification_log', 'app_secrets_audit'
         ]) AS t
  WHERE  to_regclass('public.' || t) IS NULL;

  IF v_manquantes IS NOT NULL THEN
    RAISE EXCEPTION 'Tables absentes après restauration : %', v_manquantes;
  END IF;
END $$;

\echo '── 2. RLS activée sur toutes les tables de public ──────────────────────'
-- Une table sans RLS dans ce schéma est lisible par tout porteur de la clé
-- publique : c'est la classe de faille E-2 (envois_audit en SELECT USING(true)).
DO $$
DECLARE
  v_sans_rls TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ' ORDER BY c.relname)
  INTO   v_sans_rls
  FROM   pg_class c
  JOIN   pg_namespace n ON n.oid = c.relnamespace
  WHERE  n.nspname = 'public'
    AND  c.relkind = 'r'
    AND  NOT c.relrowsecurity;

  IF v_sans_rls IS NOT NULL THEN
    RAISE EXCEPTION 'Tables sans RLS : %', v_sans_rls;
  END IF;
END $$;

\echo '── 3. Aucune fonction de public exécutable par PUBLIC ──────────────────'
-- Régression N-3 : PostgreSQL accorde EXECUTE à PUBLIC par défaut, dont anon
-- hérite. C'est par là qu'un appelant anonyme muni de la seule clé publique
-- invoquait _purge_envois_audit() et vidait le journal d'audit. Ce contrôle
-- ne suffit pas à lui seul : sur Supabase, anon et authenticated reçoivent
-- aussi des octrois EXPLICITES par les privilèges par défaut (reproduits par
-- supabase_shim.sql), qu'un REVOKE ... FROM PUBLIC ne retire pas. Les blocs 6
-- à 9 vérifient donc les droits effectifs de chaque rôle de l'API.
-- Les fonctions appartenant à une extension sont exclues : leurs privilèges
-- par défaut portent des dépendances (cf. migration archivée 052).
DO $$
DECLARE
  v_exposees TEXT;
BEGIN
  SELECT string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
                    E'\n  ' ORDER BY p.proname)
  INTO   v_exposees
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  NOT EXISTS (
           SELECT 1 FROM pg_depend d
           WHERE d.objid = p.oid AND d.deptype = 'e'
         )
    AND  (
           p.proacl IS NULL  -- privilèges par défaut = EXECUTE à PUBLIC
           OR EXISTS (
                SELECT 1 FROM aclexplode(p.proacl) a
                WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
              )
         );

  IF v_exposees IS NOT NULL THEN
    RAISE EXCEPTION E'Fonctions exécutables par PUBLIC (régression N-3) :\n  %',
                    v_exposees;
  END IF;
END $$;

\echo '── 4. search_path figé sur les fonctions SECURITY DEFINER ──────────────'
-- Une fonction SECURITY DEFINER au search_path mutable est détournable en
-- faisant précéder les objets qu'elle référence par des homonymes.
DO $$
DECLARE
  v_mutables TEXT;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
  INTO   v_mutables
  FROM   pg_proc p
  JOIN   pg_namespace n ON n.oid = p.pronamespace
  WHERE  n.nspname = 'public'
    AND  p.prosecdef
    AND  NOT EXISTS (
           SELECT 1 FROM unnest(COALESCE(p.proconfig, ARRAY[]::text[])) cfg
           WHERE cfg LIKE 'search\_path=%'
         );

  IF v_mutables IS NOT NULL THEN
    RAISE EXCEPTION 'Fonctions SECURITY DEFINER sans search_path figé : %',
                    v_mutables;
  END IF;
END $$;

\echo '── 5. Volumetrie plancher (chargement complet du schema) ───────────────'
DO $$
DECLARE
  v_tables   INT;
  v_fonctions INT;
  v_policies INT;
BEGIN
  SELECT count(*) INTO v_tables
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r';

  SELECT count(*) INTO v_fonctions
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public';

  SELECT count(*) INTO v_policies FROM pg_policies WHERE schemaname = 'public';

  RAISE NOTICE 'Restauré : % tables, % fonctions, % policies',
               v_tables, v_fonctions, v_policies;

  IF v_tables < 20 OR v_fonctions < 45 OR v_policies < 40 THEN
    RAISE EXCEPTION 'Restauration partielle : % tables, % fonctions, % policies',
                    v_tables, v_fonctions, v_policies;
  END IF;
END $$;

\echo '── 6. Fonctions : liste EXACTE exécutable par chaque rôle de l''API ─────'
-- Droit EFFECTIF (has_function_privilege : octroi direct, par PUBLIC ou par
-- héritage). Une fonction en trop est joignable par l'API (pour anon, avec la
-- seule clé publiable) ; une fonction manquante casse l'application ou une
-- fonction Edge en production. Les deux font échouer ce bloc. Les listes
-- reprennent, groupe par groupe, la section « Modèle de privilèges » de
-- schema.sql.
DO $$
DECLARE
  -- Page publique /confirm (confirmation hors-grappe sans compte).
  c_confirm CONSTANT text[] := ARRAY[
    'public.confirm_envoi_hgrappe(uuid,boolean,text[],text,text,timestamp with time zone)',
    'public.get_envoi_hgrappe_by_numero(text,text)',
    'public.get_envoi_hgrappe_by_token(uuid)',
    'public.get_hg_confirm_cfg()'];
  -- Auxiliaires de la RLS et des déclencheurs SECURITY INVOKER.
  c_rls CONSTANT text[] := ARRAY[
    'public.current_role_name()',
    'public.current_labo_id()',
    'public.current_labo_ids()',
    'public.current_lab_role(uuid)',
    'public._role_rank(text)',
    'public.is_module_active(text,uuid)'];
  -- RPC métier du client (chacune contrôle le périmètre de l'appelant).
  c_metier CONSTANT text[] := ARRAY[
    'public.add_envois_to_bon(uuid,uuid[],uuid[],jsonb)',
    'public.annuler_envoi(uuid,text)',
    'public.cancel_bon_depart(uuid)',
    'public.create_bon_depart(uuid,uuid,text,uuid[],uuid[],jsonb,jsonb)',
    'public.create_envoi_hgrappe(text,uuid,uuid,text,text,integer,text[],text,uuid,text,text,boolean,text,text[],boolean)',
    'public.create_envoi_hsilp(uuid,uuid,text,text,integer,text[],text,uuid,text,text,boolean,text,text[],boolean)',
    'public.get_hg_hist_stats()',
    'public.get_hist_stats()',
    'public.get_icr_stats(uuid,integer)',
    'public.get_labo_kpis(uuid,integer)',
    'public.peek_next_hgrappe()',
    'public.peek_next_hsilp()',
    'public.queue_envoi_notification(text,uuid,uuid,jsonb)',
    'public.remove_envoi_from_bon(uuid)'];
  -- Gestion des secrets par l'interface (administrateur actif).
  c_secrets CONSTANT text[] := ARRAY[
    'public.set_app_secret(text,text)',
    'public.delete_app_secret(text)',
    'public.rotate_notify_trigger_secret()',
    'public.list_app_secrets_status()'];
  -- Appelées par les fonctions Edge avec la clé secrète.
  c_edge CONSTANT text[] := ARRAY[
    'public.get_app_secret(text)',
    'public.revoke_user_sessions(uuid)',
    'public.count_recent_login_failures(text)',
    'public.record_login_attempt(text,boolean)'];
  r          RECORD;
  v_txt      TEXT;
  v_erreurs  TEXT := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('anon',          c_confirm),
      ('authenticated', c_confirm || c_rls || c_metier || c_secrets),
      ('service_role',  c_rls || c_edge)
    ) AS t(role, attendues)
  LOOP
    SELECT string_agg(f, ', ' ORDER BY f) INTO v_txt
      FROM unnest(r.attendues) f
     WHERE to_regprocedure(f) IS NULL;
    IF v_txt IS NOT NULL THEN
      v_erreurs := v_erreurs || format(E'\n  %s : fonction(s) attendue(s) absente(s) du schéma : %s', r.role, v_txt);
      CONTINUE;
    END IF;

    SELECT string_agg(f, ', ' ORDER BY f) INTO v_txt
      FROM unnest(r.attendues) f
     WHERE NOT has_function_privilege(r.role, to_regprocedure(f), 'EXECUTE');
    IF v_txt IS NOT NULL THEN
      v_erreurs := v_erreurs || format(E'\n  %s : EXECUTE MANQUANT sur %s', r.role, v_txt);
    END IF;

    SELECT string_agg(p.oid::regprocedure::text, ', ' ORDER BY p.proname) INTO v_txt
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
       AND has_function_privilege(r.role, p.oid, 'EXECUTE')
       AND p.oid <> ALL (ARRAY(SELECT to_regprocedure(f)::oid FROM unnest(r.attendues) f));
    IF v_txt IS NOT NULL THEN
      v_erreurs := v_erreurs || format(E'\n  %s : EXECUTE EN TROP sur %s', r.role, v_txt);
    END IF;
  END LOOP;

  IF v_erreurs <> '' THEN
    RAISE EXCEPTION 'Droits d''exécution différents de la liste attendue :%', v_erreurs;
  END IF;
END $$;

\echo '── 7. Fonctions sensibles : rôles autorisés ───────────────────────────'
-- Redondant avec le bloc 6, mais lisible : l'intention pour chaque fonction
-- dont un droit de trop serait grave. Lecture des secrets et révocation de
-- sessions : service_role seul. Tâches planifiées et auxiliaires internes
-- (Vault, aléa, déclencheurs SECURITY DEFINER) : propriétaire seul.
DO $$
DECLARE
  r RECORD;
  v_erreurs TEXT := '';
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.get_app_secret(text)',                 false, false, true),
      ('public.revoke_user_sessions(uuid)',           false, false, true),
      ('public.record_login_attempt(text,boolean)',   false, false, true),
      ('public.count_recent_login_failures(text)',    false, false, true),
      ('public._detect_alarm_envois()',               false, false, false),
      ('public._purge_envois_audit()',                false, false, false),
      ('public._purge_notifications()',               false, false, false),
      ('public._trigger_send_notifications()',        false, false, false),
      ('public._surveiller_notifications()',          false, false, false),
      ('public._vault_ecrire(text,text)',             false, false, false),
      ('public._journaliser_secret(text,text)',       false, false, false),
      ('public._hex_aleatoire_32()',                  false, false, false),
      ('public._generer_verify_code()',               false, false, false),
      ('public._effacer_smtp_pass()',                 false, false, false),
      ('public._proteger_app_config()',               false, false, false),
      ('public._envois_hgrappe_capacites()',          false, false, false),
      ('public.trg_audit_envoi()',                    false, false, false),
      ('public.set_app_secret(text,text)',            false, true,  false),
      ('public.delete_app_secret(text)',              false, true,  false),
      ('public.rotate_notify_trigger_secret()',       false, true,  false),
      ('public.list_app_secrets_status()',            false, true,  false)
    ) AS t(fn, anon_ok, auth_ok, sr_ok)
  LOOP
    IF to_regprocedure(r.fn) IS NULL THEN
      v_erreurs := v_erreurs || E'\n  ' || r.fn || ' : absente';
      CONTINUE;
    END IF;
    IF has_function_privilege('anon', r.fn, 'EXECUTE') <> r.anon_ok
       OR has_function_privilege('authenticated', r.fn, 'EXECUTE') <> r.auth_ok
       OR has_function_privilege('service_role', r.fn, 'EXECUTE') <> r.sr_ok THEN
      v_erreurs := v_erreurs || format(E'\n  %s : anon=%s authenticated=%s service_role=%s (attendu %s/%s/%s)',
        r.fn,
        has_function_privilege('anon', r.fn, 'EXECUTE'),
        has_function_privilege('authenticated', r.fn, 'EXECUTE'),
        has_function_privilege('service_role', r.fn, 'EXECUTE'),
        r.anon_ok, r.auth_ok, r.sr_ok);
    END IF;
  END LOOP;

  IF v_erreurs <> '' THEN
    RAISE EXCEPTION 'Droits inattendus sur des fonctions sensibles :%', v_erreurs;
  END IF;
END $$;

\echo '── 8. Tables et séquences : droits EXACTS des rôles de l''API ──────────'
-- Matrice attendue, table par table et rôle par rôle, comparée aux droits
-- effectifs (has_table_privilege / has_sequence_privilege). Un écart dans un
-- sens comme dans l'autre fait échouer, de même qu'une table ou une séquence
-- absente de la matrice. Rappels : anon ne lit que app_config (écran de
-- connexion) ; jamais TRUNCATE, REFERENCES ni TRIGGER ; journaux d'audit en
-- lecture seule pour tous (append-only) ; authenticated n'écrit pas les
-- tables alimentées par le serveur ; USAGE sur envoi_seq pour l'INSERT direct
-- d'un envoi (generate_envoi_numero, SECURITY INVOKER, appelle nextval).
DO $$
DECLARE
  RIEN CONSTANT text[] := '{}';
  L    CONSTANT text[] := '{SELECT}';
  LM   CONSTANT text[] := '{SELECT,UPDATE}';
  LCM  CONSTANT text[] := '{SELECT,INSERT,UPDATE}';
  TOUT CONSTANT text[] := '{SELECT,INSERT,UPDATE,DELETE}';
  c_privs_table CONSTANT text[] := '{SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER}';
  c_privs_seq   CONSTANT text[] := '{USAGE,SELECT,UPDATE}';
  v_ecarts TEXT;
BEGIN
  WITH attendu (objet, anon, authenticated, service_role) AS (
    VALUES
      -- Tables
      ('app_config',                 L,    TOUT, TOUT),
      ('app_secrets_audit',          RIEN, L,    L),
      ('bons_depart',                RIEN, LCM,  TOUT),
      ('bons_depart_envois',         RIEN, L,    TOUT),
      ('bons_depart_sections',       RIEN, LM,   TOUT),
      ('envois',                     RIEN, LCM,  TOUT),
      ('envois_audit',               RIEN, L,    L),
      ('envois_hgrappe',             RIEN, LCM,  TOUT),
      ('external_labs',              RIEN, TOUT, TOUT),
      ('grappe_config',              RIEN, TOUT, TOUT),
      ('grappes',                    RIEN, TOUT, TOUT),
      ('hg_confirm_attempts',        RIEN, L,    TOUT),
      ('icr_codes',                  RIEN, TOUT, TOUT),
      ('laboratories',               RIEN, TOUT, TOUT),
      ('login_attempts',             RIEN, L,    TOUT),
      ('module_config',              RIEN, TOUT, TOUT),
      ('notification_config',        RIEN, LM,   TOUT),
      ('notification_emails',        RIEN, TOUT, TOUT),
      ('notification_log',           RIEN, L,    TOUT),
      ('notification_queue',         RIEN, L,    TOUT),
      ('profiles',                   RIEN, LM,   TOUT),
      ('user_lab_memberships',       RIEN, TOUT, TOUT),
      -- Séquences
      ('bd_seq',                     RIEN, RIEN,          '{USAGE,SELECT}'::text[]),
      ('envoi_seq',                  RIEN, '{USAGE}',     '{USAGE,SELECT}'),
      ('hgrappe_seq',                RIEN, RIEN,          '{USAGE,SELECT}'),
      ('notification_config_id_seq', RIEN, RIEN,          '{USAGE,SELECT}')
  ),
  attendu_par_role AS (
    SELECT a.objet, x.role, x.privs
      FROM attendu a
      CROSS JOIN LATERAL (VALUES ('anon', a.anon),
                                 ('authenticated', a.authenticated),
                                 ('service_role', a.service_role)) AS x(role, privs)
  ),
  reel AS (
    SELECT c.relname AS objet, r.role,
           CASE WHEN c.relkind = 'S'
                THEN ARRAY(SELECT p FROM unnest(c_privs_seq) p
                            WHERE has_sequence_privilege(r.role, c.oid, p))
                ELSE ARRAY(SELECT p FROM unnest(c_privs_table) p
                            WHERE has_table_privilege(r.role, c.oid, p))
           END AS privs
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      CROSS JOIN unnest(ARRAY['anon', 'authenticated', 'service_role']) AS r(role)
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
  )
  SELECT string_agg(
           CASE
             WHEN a.objet IS NULL THEN format('%s : absent de la matrice (droits réels de %s : %s)',
                                              re.objet, re.role, re.privs)
             WHEN re.objet IS NULL THEN format('%s : dans la matrice mais absent du schéma', a.objet)
             ELSE format('%s / %s : attendu %s, obtenu %s', a.objet, a.role, a.privs, re.privs)
           END,
           E'\n  ' ORDER BY COALESCE(a.objet, re.objet), COALESCE(a.role, re.role))
    INTO v_ecarts
    FROM attendu_par_role a
    FULL JOIN reel re ON re.objet = a.objet AND re.role = a.role
   WHERE a.objet IS NULL OR re.objet IS NULL
      OR NOT (a.privs @> re.privs AND re.privs @> a.privs);

  IF v_ecarts IS NOT NULL THEN
    RAISE EXCEPTION E'Droits de table ou de séquence différents de la matrice :\n  %', v_ecarts;
  END IF;
END $$;

\echo '── 9. Privilèges par défaut neutralisés ───────────────────────────────'
-- schema.sql doit retirer, pour le rôle qui crée les objets, les octrois par
-- défaut aux rôles de l'API (tables, séquences, fonctions de public) et
-- l'EXECUTE par défaut de PUBLIC sur les fonctions, sinon un objet ajouté plus
-- tard serait exposé dès sa création.
DO $$
DECLARE
  v_proprietaire oid := (SELECT proowner FROM pg_proc
                          WHERE oid = to_regprocedure('public.get_app_secret(text)'));
  v_ecarts TEXT;
BEGIN
  SELECT string_agg(DISTINCT format('%s/%s -> %s', COALESCE(NULLIF(d.defaclnamespace, 0)::regnamespace::text, '*'),
                                    d.defaclobjtype::text, a.grantee::regrole), ', ')
  INTO   v_ecarts
  FROM   pg_default_acl d
  CROSS  JOIN LATERAL aclexplode(d.defaclacl) a
  WHERE  d.defaclrole = v_proprietaire
    -- public et défauts globaux seulement : sur un vrai projet, Supabase garde ses
    -- propres droits par défaut dans le schéma storage, hors de notre périmètre.
    AND  d.defaclnamespace IN (0::oid, 'public'::regnamespace::oid)
    AND  a.grantee IN ('anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole);
  IF v_ecarts IS NOT NULL THEN
    RAISE EXCEPTION 'Privilèges par défaut encore accordés aux rôles de l''API : %', v_ecarts;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_default_acl d
                  WHERE d.defaclrole = v_proprietaire AND d.defaclnamespace = 0
                    AND d.defaclobjtype = 'f'
                    AND NOT EXISTS (SELECT 1 FROM aclexplode(d.defaclacl) a WHERE a.grantee = 0)) THEN
    RAISE EXCEPTION 'EXECUTE par défaut de PUBLIC sur les fonctions non révoqué';
  END IF;
END $$;

\echo '── 10. Aucune policy d''écriture sur les journaux d''audit ──────────────'
DO $$
DECLARE
  v_policies TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
  INTO   v_policies
  FROM   pg_policies
  WHERE  schemaname = 'public'
    AND  tablename IN ('envois_audit', 'app_secrets_audit')
    AND  cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL');
  IF v_policies IS NOT NULL THEN
    RAISE EXCEPTION 'Policies d''écriture sur un journal d''audit : %', v_policies;
  END IF;
END $$;

\echo '── 11. Aucune colonne de secret en clair dans public ──────────────────'
-- Les secrets applicatifs vivent dans le Vault (régression de la 028 :
-- resend_api_key et smtp_pass en TEXT). Seules exceptions : le NOM d'un secret
-- dans le journal, et le drapeau de changement de mot de passe.
DO $$
DECLARE
  v_colonnes TEXT;
BEGIN
  SELECT string_agg(table_name || '.' || column_name, ', ')
  INTO   v_colonnes
  FROM   information_schema.columns
  WHERE  table_schema = 'public'
    AND  column_name ~* '(api_?key|smtp_pass|service_role|secret|passw|jwt|private_key)'
    AND  (table_name, column_name) NOT IN (('app_secrets_audit', 'secret_name'),
                                          ('profiles', 'must_change_password'));
  IF v_colonnes IS NOT NULL THEN
    RAISE EXCEPTION 'Colonnes de secret en clair : %', v_colonnes;
  END IF;
END $$;

\echo '── 12. Tests fonctionnels (transaction annulée) ───────────────────────'
\ir tests_fonctionnels.sql

\echo '✅ Restauration vérifiée.'
