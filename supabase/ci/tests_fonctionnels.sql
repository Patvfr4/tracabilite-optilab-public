-- ============================================================
-- Tests fonctionnels du contrat de sécurité de schema.sql
--
-- Inclus par verif_restauration.sql (\ir), donc exécutés par la CI après le
-- chargement de supabase_shim.sql puis de schema.sql. Tout se passe dans UNE
-- transaction annulée à la fin : la base n'est pas modifiée.
--
-- Chaque appel est fait sous le rôle que PostgREST utiliserait (SET LOCAL
-- ROLE anon / authenticated / service_role) avec les claims JWT
-- correspondants (request.jwt.claims). Un échec lève une exception ;
-- psql -v ON_ERROR_STOP=1 fait alors échouer le job.
--
-- Comptes de test (préfixe cc000000) :
--   …0001 admin actif            …0002 admin désactivé
--   …0003 admin, mot de passe à changer
--   …0004 technicien             …0005 superviseur_labo
--   …0006 technicien, mot de passe à changer
-- ============================================================

\set ON_ERROR_STOP 1
SET client_min_messages = warning;

BEGIN;

-- ── Données de test (en tant que propriétaire) ──────────────────────────────
INSERT INTO public.grappes (id, name, code)
VALUES ('cc000000-0000-4000-8000-0000000000a1', 'Grappe de test', 'TEST');
INSERT INTO public.laboratories (id, name, grappe_id) VALUES
  ('cc000000-0000-4000-8000-0000000000b1', 'ZZ999 - Labo de test', 'cc000000-0000-4000-8000-0000000000a1'),
  ('cc000000-0000-4000-8000-0000000000b2', 'ZZ998 - Labo destinataire de test', 'cc000000-0000-4000-8000-0000000000a1');
INSERT INTO public.external_labs (id, name)
VALUES ('cc000000-0000-4000-8000-0000000000c1', 'Labo externe de test');

INSERT INTO auth.users (id) VALUES
  ('cc000000-0000-4000-8000-000000000001'), ('cc000000-0000-4000-8000-000000000002'),
  ('cc000000-0000-4000-8000-000000000003'), ('cc000000-0000-4000-8000-000000000004'),
  ('cc000000-0000-4000-8000-000000000005'), ('cc000000-0000-4000-8000-000000000006');

INSERT INTO public.profiles (id, employee_id, nom, labo_id, role, active, must_change_password) VALUES
  ('cc000000-0000-4000-8000-000000000001', 'T-ADM1', 'Admin actif',      'cc000000-0000-4000-8000-0000000000b1', 'admin',            true,  false),
  ('cc000000-0000-4000-8000-000000000002', 'T-ADM2', 'Admin désactivé',  'cc000000-0000-4000-8000-0000000000b1', 'admin',            false, false),
  ('cc000000-0000-4000-8000-000000000003', 'T-ADM3', 'Admin MDP à changer', 'cc000000-0000-4000-8000-0000000000b1', 'admin',         true,  true),
  ('cc000000-0000-4000-8000-000000000004', 'T-TEC1', 'Technicien',       'cc000000-0000-4000-8000-0000000000b1', 'technicien',       true,  false),
  ('cc000000-0000-4000-8000-000000000005', 'T-SUP1', 'Superviseur labo', 'cc000000-0000-4000-8000-0000000000b1', 'superviseur_labo', true,  false),
  ('cc000000-0000-4000-8000-000000000006', 'T-TEC2', 'Technicien MDP à changer', 'cc000000-0000-4000-8000-0000000000b1', 'technicien', true, true);

-- Rôle local « responsable » : pour le compte valide …0005 (témoin positif de
-- current_lab_role), et pour les comptes …0002 et …0003, qui ne doivent pas
-- en profiter (désactivé, mot de passe à changer).
INSERT INTO public.user_lab_memberships (profile_id, labo_id, lab_role) VALUES
  ('cc000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-0000000000b1', 'responsable'),
  ('cc000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-0000000000b1', 'responsable'),
  ('cc000000-0000-4000-8000-000000000005', 'cc000000-0000-4000-8000-0000000000b1', 'responsable');

\echo '── T1. Garde-fou du shim : pas d''UPDATE direct sur vault.secrets ─────────'
DO $t$
BEGIN
  BEGIN
    UPDATE vault.secrets SET secret = 'x' WHERE name = 'NOTIFY_TRIGGER_SECRET';
    RAISE EXCEPTION 'ÉCHEC T1 : un UPDATE direct sur vault.secrets est passé';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'NOTIFY_TRIGGER_SECRET'
                    AND secret ~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'ÉCHEC T1 : NOTIFY_TRIGGER_SECRET absent ou mal formé après installation';
  END IF;
END $t$;

\echo '── T2. Admin actif : set / remplacer / lister / supprimer / régénérer ────'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
DECLARE
  v json;
BEGIN
  v := public.set_app_secret('RESEND_API_KEY', E'  re_valeur_initiale\r\n');
  IF v->>'action' IS DISTINCT FROM 'CREATE' OR (v->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC T2 création : %', v;
  END IF;
  -- Rotation : passe par vault.update_secret (un UPDATE direct échouerait).
  v := public.set_app_secret('RESEND_API_KEY', 're_valeur_remplacee');
  IF v->>'action' IS DISTINCT FROM 'UPDATE' THEN
    RAISE EXCEPTION 'ÉCHEC T2 rotation : %', v;
  END IF;
  IF (SELECT array_agg(k ORDER BY k) FROM json_object_keys(v) k) <> ARRAY['action', 'name', 'ok'] THEN
    RAISE EXCEPTION 'ÉCHEC T2 : forme de réponse inattendue %', v;
  END IF;

  v := public.set_app_secret('SMTP_PASS', 'mot de passe smtp');
  v := public.list_app_secrets_status();
  IF (SELECT array_agg(k ORDER BY k) FROM json_object_keys(v) k)
     <> ARRAY['NOTIFY_TRIGGER_SECRET', 'RESEND_API_KEY', 'SMTP_PASS'] THEN
    RAISE EXCEPTION 'ÉCHEC T2 liste : clés %', v;
  END IF;
  IF (v->'RESEND_API_KEY'->>'configured')::boolean IS NOT TRUE
     OR v->'RESEND_API_KEY'->>'last_action' <> 'UPDATE'
     OR v->'RESEND_API_KEY'->>'last_changed_by' <> 'Admin actif'
     OR (v->'NOTIFY_TRIGGER_SECRET'->>'configured')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC T2 liste : contenu %', v;
  END IF;
  IF v::text ~ 're_valeur' THEN
    RAISE EXCEPTION 'ÉCHEC T2 : une valeur de secret est renvoyée';
  END IF;

  v := public.delete_app_secret('RESEND_API_KEY');
  IF v->>'action' IS DISTINCT FROM 'DELETE' THEN
    RAISE EXCEPTION 'ÉCHEC T2 suppression : %', v;
  END IF;
  IF (public.list_app_secrets_status()->'RESEND_API_KEY'->>'configured')::boolean THEN
    RAISE EXCEPTION 'ÉCHEC T2 : RESEND_API_KEY toujours configuré après suppression';
  END IF;

  v := public.rotate_notify_trigger_secret();
  IF v->>'action' IS DISTINCT FROM 'UPDATE' OR v->>'name' <> 'NOTIFY_TRIGGER_SECRET'
     OR (SELECT array_agg(k ORDER BY k) FROM json_object_keys(v) k) <> ARRAY['action', 'name', 'ok'] THEN
    RAISE EXCEPTION 'ÉCHEC T2 régénération : %', v;
  END IF;

  -- Refus : nom réservé, nom inconnu, valeurs invalides.
  BEGIN
    PERFORM public.set_app_secret('NOTIFY_TRIGGER_SECRET', 'choisi par un humain');
    RAISE EXCEPTION 'ÉCHEC T2 : NOTIFY_TRIGGER_SECRET saisi par set_app_secret';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.delete_app_secret('NOTIFY_TRIGGER_SECRET');
    RAISE EXCEPTION 'ÉCHEC T2 : NOTIFY_TRIGGER_SECRET supprimé par delete_app_secret';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_app_secret('TURNSTILE_SECRET_KEY', 'x');
    RAISE EXCEPTION 'ÉCHEC T2 : nom hors liste blanche accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.set_app_secret('SMTP_PASS', E' \t\r\n ');
    RAISE EXCEPTION 'ÉCHEC T2 : valeur vide acceptée';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_app_secret('SMTP_PASS', E'abc\ndef');
    RAISE EXCEPTION 'ÉCHEC T2 : caractère de contrôle interne accepté';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.set_app_secret('SMTP_PASS', repeat('x', 4097));
    RAISE EXCEPTION 'ÉCHEC T2 : valeur de plus de 4096 caractères acceptée';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  -- Le journal d'audit n'accepte aucune écriture directe.
  BEGIN
    INSERT INTO public.app_secrets_audit (secret_name, action, changed_by_nom)
    VALUES ('RESEND_API_KEY', 'UPDATE', 'faux acteur');
    RAISE EXCEPTION 'ÉCHEC T2 : INSERT direct dans app_secrets_audit accepté';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  -- Valeur rognée des blancs de bordure, jamais écrite dans l'audit.
  IF (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'SMTP_PASS')
     IS DISTINCT FROM 'mot de passe smtp' THEN
    RAISE EXCEPTION 'ÉCHEC T2 : valeur SMTP_PASS inattendue dans le Vault';
  END IF;
  IF EXISTS (SELECT 1 FROM public.app_secrets_audit a
              WHERE to_jsonb(a)::text ~ 're_valeur|mot de passe smtp') THEN
    RAISE EXCEPTION 'ÉCHEC T2 : une valeur de secret figure dans app_secrets_audit';
  END IF;
  IF (SELECT count(*) FROM public.app_secrets_audit
       WHERE changed_by_id = 'cc000000-0000-4000-8000-000000000001') <> 5 THEN
    RAISE EXCEPTION 'ÉCHEC T2 : 5 lignes d''audit attendues pour l''admin';
  END IF;
END $t$;

\echo '── T3. Non-admin, admin désactivé, admin au mot de passe à changer : refus'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN PERFORM public.set_app_secret('SMTP_PASS', 'x'); RAISE EXCEPTION 'ÉCHEC T3 technicien set';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.delete_app_secret('SMTP_PASS'); RAISE EXCEPTION 'ÉCHEC T3 technicien delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.rotate_notify_trigger_secret(); RAISE EXCEPTION 'ÉCHEC T3 technicien rotate';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.list_app_secrets_status(); RAISE EXCEPTION 'ÉCHEC T3 technicien list';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000002","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN PERFORM public.set_app_secret('SMTP_PASS', 'x'); RAISE EXCEPTION 'ÉCHEC T3 admin désactivé set';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.rotate_notify_trigger_secret(); RAISE EXCEPTION 'ÉCHEC T3 admin désactivé rotate';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.list_app_secrets_status(); RAISE EXCEPTION 'ÉCHEC T3 admin désactivé list';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.current_role_name() <> '' THEN RAISE EXCEPTION 'ÉCHEC T3 : rôle d''un compte désactivé'; END IF;
  IF public.current_lab_role('cc000000-0000-4000-8000-0000000000b1') IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T3 : rôle local d''un compte désactivé';
  END IF;
END $t$;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000003","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN PERFORM public.set_app_secret('SMTP_PASS', 'x'); RAISE EXCEPTION 'ÉCHEC T3 admin MDP set';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.delete_app_secret('SMTP_PASS'); RAISE EXCEPTION 'ÉCHEC T3 admin MDP delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.list_app_secrets_status(); RAISE EXCEPTION 'ÉCHEC T3 admin MDP list';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF public.current_role_name() <> '' OR cardinality(public.current_labo_ids()) <> 0
     OR public.current_labo_id() IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T3 : droits d''un compte au mot de passe à changer';
  END IF;
  -- current_lab_role aussi (contrat §2), malgré l'appartenance « responsable ».
  IF public.current_lab_role('cc000000-0000-4000-8000-0000000000b1') IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T3 : rôle local d''un compte au mot de passe à changer';
  END IF;
  -- Mais il lit son propre profil (le client y lit le drapeau à la connexion).
  IF (SELECT count(*) FROM public.profiles) <> 1 THEN
    RAISE EXCEPTION 'ÉCHEC T3 : lecture de son propre profil impossible';
  END IF;
END $t$;
-- Témoin : le même rôle local est bien vu pour un compte valide.
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $t$
BEGIN
  IF public.current_lab_role('cc000000-0000-4000-8000-0000000000b1') IS DISTINCT FROM 'responsable' THEN
    RAISE EXCEPTION 'ÉCHEC T3 : rôle local d''un compte valide non reconnu';
  END IF;
END $t$;
RESET ROLE;

\echo '── T4. get_app_secret / revoke_user_sessions : service_role seulement ────'
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $t$
BEGIN
  BEGIN PERFORM public.get_app_secret('SMTP_PASS'); RAISE EXCEPTION 'ÉCHEC T4 : anon lit un secret';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
  END;
  BEGIN PERFORM public.revoke_user_sessions('cc000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'ÉCHEC T4 : anon révoque des sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.set_app_secret('SMTP_PASS', 'x'); RAISE EXCEPTION 'ÉCHEC T4 : anon écrit un secret';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN PERFORM public.get_app_secret('SMTP_PASS'); RAISE EXCEPTION 'ÉCHEC T4 : un admin lit un secret par l''API';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'permission denied%' THEN RAISE; END IF;
  END;
  BEGIN PERFORM public.revoke_user_sessions('cc000000-0000-4000-8000-000000000004'); RAISE EXCEPTION 'ÉCHEC T4 : authenticated révoque des sessions';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;

-- Défense en profondeur de get_app_secret : même si EXECUTE était accordé
-- par erreur à authenticated, la garde sur le rôle PostgREST
-- (current_setting('role')) refuse. Octroi temporaire, retiré aussitôt (et
-- de toute façon annulé avec la transaction).
GRANT EXECUTE ON FUNCTION public.get_app_secret(text) TO authenticated;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN
    PERFORM public.get_app_secret('SMTP_PASS');
    RAISE EXCEPTION 'ÉCHEC T4 : get_app_secret sans garde sur le rôle de l''appelant';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'Accès refusé.' THEN
      RAISE EXCEPTION 'ÉCHEC T4 : refus inattendu de get_app_secret (%)', SQLERRM;
    END IF;
  END;
END $t$;
RESET ROLE;
REVOKE EXECUTE ON FUNCTION public.get_app_secret(text) FROM authenticated;

INSERT INTO auth.sessions (id, user_id) VALUES
  ('cc000000-0000-4000-8000-0000000000e1', 'cc000000-0000-4000-8000-000000000004'),
  ('cc000000-0000-4000-8000-0000000000e2', 'cc000000-0000-4000-8000-000000000004'),
  ('cc000000-0000-4000-8000-0000000000e3', 'cc000000-0000-4000-8000-000000000005');
INSERT INTO auth.refresh_tokens (token, user_id, session_id) VALUES
  ('jeton-1', 'cc000000-0000-4000-8000-000000000004', 'cc000000-0000-4000-8000-0000000000e1'),
  ('jeton-2', 'cc000000-0000-4000-8000-000000000004', 'cc000000-0000-4000-8000-0000000000e2');

SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
DO $t$
BEGIN
  IF public.get_app_secret('SMTP_PASS') IS DISTINCT FROM 'mot de passe smtp'
     OR public.get_app_secret('NOTIFY_TRIGGER_SECRET') !~ '^[0-9a-f]{64}$'
     OR public.get_app_secret('RESEND_API_KEY') IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T4 : lecture service_role inattendue';
  END IF;
  BEGIN PERFORM public.get_app_secret('project_url'); RAISE EXCEPTION 'ÉCHEC T4 : nom hors liste blanche lu';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  PERFORM public.revoke_user_sessions('cc000000-0000-4000-8000-000000000004');
  -- Les tables d'audit restent en lecture seule, même pour service_role.
  BEGIN
    DELETE FROM public.app_secrets_audit;
    RAISE EXCEPTION 'ÉCHEC T4 : service_role efface app_secrets_audit';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- La fonction du cron n'est pas exécutable par l'API.
  BEGIN PERFORM public._trigger_send_notifications(); RAISE EXCEPTION 'ÉCHEC T4 : service_role déclenche le cron';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = 'cc000000-0000-4000-8000-000000000004')
     OR EXISTS (SELECT 1 FROM auth.refresh_tokens WHERE user_id = 'cc000000-0000-4000-8000-000000000004')
     OR NOT EXISTS (SELECT 1 FROM auth.sessions WHERE user_id = 'cc000000-0000-4000-8000-000000000005') THEN
    RAISE EXCEPTION 'ÉCHEC T4 : revoke_user_sessions n''a pas fermé exactement les sessions visées';
  END IF;
END $t$;

\echo '── T5. Changement d''hôte / port / utilisateur SMTP : SMTP_PASS effacé ───'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
BEGIN
  UPDATE public.notification_config SET smtp_from = 'labo@example.org', provider = 'smtp';
  IF (public.list_app_secrets_status()->'SMTP_PASS'->>'configured')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC T5 : SMTP_PASS effacé sans changement de destination';
  END IF;
  UPDATE public.notification_config SET smtp_host = 'smtp.attaquant.example';
  IF (public.list_app_secrets_status()->'SMTP_PASS'->>'configured')::boolean THEN
    RAISE EXCEPTION 'ÉCHEC T5 : SMTP_PASS conservé après changement de smtp_host';
  END IF;
  IF public.list_app_secrets_status()->'SMTP_PASS'->>'last_action' <> 'DELETE' THEN
    RAISE EXCEPTION 'ÉCHEC T5 : effacement non journalisé';
  END IF;
  PERFORM public.set_app_secret('SMTP_PASS', 'nouveau');
  UPDATE public.notification_config SET smtp_port = 465;
  IF (public.list_app_secrets_status()->'SMTP_PASS'->>'configured')::boolean THEN
    RAISE EXCEPTION 'ÉCHEC T5 : SMTP_PASS conservé après changement de smtp_port';
  END IF;
  PERFORM public.set_app_secret('SMTP_PASS', 'nouveau');
  UPDATE public.notification_config SET smtp_user = 'autre';
  IF (public.list_app_secrets_status()->'SMTP_PASS'->>'configured')::boolean THEN
    RAISE EXCEPTION 'ÉCHEC T5 : SMTP_PASS conservé après changement de smtp_user';
  END IF;

  -- L'URL appelée par le cron n'est pas réglable depuis l'application.
  BEGIN
    UPDATE public.app_config SET value = '"https://attaquant.example"' WHERE key = 'supabase_url';
    RAISE EXCEPTION 'ÉCHEC T5 : supabase_url modifiée par un admin applicatif';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.app_config (key, value) VALUES ('app_name', '"Test"')
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
END $t$;
RESET ROLE;

\echo '── T6. Code de vérification hors-grappe ───────────────────────────────'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $t$
DECLARE
  v json;
  r record;
BEGIN
  v := public.create_envoi_hgrappe('silp', 'cc000000-0000-4000-8000-0000000000b1',
         'cc000000-0000-4000-8000-0000000000c1', 'Frigo', 'Taxi', 3, ARRAY['123456789'],
         '', 'cc000000-0000-4000-8000-000000000004', 'Technicien', 'exempt', false);
  IF v->>'verify_code' !~ '^[A-HJ-NP-Z2-9]{10}$' OR v->>'token' IS NULL THEN
    RAISE EXCEPTION 'ÉCHEC T6 création : %', v;
  END IF;
  PERFORM set_config('test.numero', v->>'numero', true);
  PERFORM set_config('test.code', v->>'verify_code', true);
  PERFORM set_config('test.jeton', v->>'token', true);

  -- Un INSERT direct ne choisit pas ses capacités.
  INSERT INTO public.envois_hgrappe (numero, exp_labo_id, dest_ext_lab_id, temperature,
                                     transporteur, confirm_token, verify_code)
  VALUES ('HG-TEST-DIRECT', 'cc000000-0000-4000-8000-0000000000b1',
          'cc000000-0000-4000-8000-0000000000c1', 'Frigo', 'Taxi',
          '00000000-0000-4000-8000-000000000000', 'AAAAAAAAAA')
  RETURNING confirm_token, verify_code INTO r;
  IF r.confirm_token = '00000000-0000-4000-8000-000000000000' OR r.verify_code = 'AAAAAAAAAA' THEN
    RAISE EXCEPTION 'ÉCHEC T6 : capacités choisies par le client conservées';
  END IF;

  -- Un UPDATE ordinaire passe (régression : NEW.dest_labo_id) ; les capacités
  -- sont immuables.
  UPDATE public.envois_hgrappe SET statut = 'Aucune réponse reçue' WHERE numero = 'HG-TEST-DIRECT';
  IF NOT FOUND THEN RAISE EXCEPTION 'ÉCHEC T6 : UPDATE de statut sans effet'; END IF;
  BEGIN
    UPDATE public.envois_hgrappe SET verify_code = 'BBBBBBBBBB' WHERE numero = 'HG-TEST-DIRECT';
    RAISE EXCEPTION 'ÉCHEC T6 : verify_code modifié par un utilisateur';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE public.envois_hgrappe SET confirm_token = gen_random_uuid() WHERE numero = 'HG-TEST-DIRECT';
    RAISE EXCEPTION 'ÉCHEC T6 : confirm_token modifié par un utilisateur';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $t$
DECLARE
  v_num    text := current_setting('test.numero');
  v_code   text := current_setting('test.code');
  v_jeton  text := current_setting('test.jeton');
  v_prefixe text := upper(substr(replace(v_jeton, '-', ''), 1, 6));
  v json;
BEGIN
  IF (public.get_hg_confirm_cfg()->>'confirm_by_numero')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC T6 : confirmation par numéro annoncée désactivée';
  END IF;
  v := public.get_envoi_hgrappe_by_numero(v_num, v_code);
  IF v->>'token' IS DISTINCT FROM v_jeton THEN
    RAISE EXCEPTION 'ÉCHEC T6 : bon code refusé (%)', v;
  END IF;
  -- Saisie tolérante : minuscules, tirets, espaces.
  v := public.get_envoi_hgrappe_by_numero(lower(v_num),
         lower(substr(v_code, 1, 5)) || ' - ' || lower(substr(v_code, 6)));
  IF v->>'token' IS DISTINCT FROM v_jeton THEN
    RAISE EXCEPTION 'ÉCHEC T6 : saisie normalisée refusée (%)', v;
  END IF;
  -- L'ancien code (préfixe du jeton) n'ouvre plus rien.
  v := public.get_envoi_hgrappe_by_numero(v_num, v_prefixe);
  IF v->>'error' IS DISTINCT FROM 'wrong_code' OR v->>'token' IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T6 : préfixe du jeton accepté (%)', v;
  END IF;
  v := public.get_envoi_hgrappe_by_numero('HG-000000-99999', v_code);
  IF v->>'error' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'ÉCHEC T6 : numéro inconnu (%)', v;
  END IF;
  -- La confirmation par jeton fonctionne toujours.
  v := public.confirm_envoi_hgrappe(v_jeton::uuid, true, NULL, NULL, 'Réceptionnaire', NULL);
  IF (v->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'ÉCHEC T6 : confirmation par jeton (%)', v;
  END IF;
END $t$;
RESET ROLE;

-- Bascule désactivée pour la grappe du laboratoire expéditeur.
INSERT INTO public.grappe_config (grappe_id, key, value)
VALUES ('cc000000-0000-4000-8000-0000000000a1', 'hgrappe_confirm_by_numero', 'false');
SELECT set_config('test.autres_grappes',
                  (SELECT count(*) FROM public.grappes
                    WHERE id <> 'cc000000-0000-4000-8000-0000000000a1')::text, true) AS autres_grappes;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';
DO $t$
DECLARE
  v json;
BEGIN
  v := public.get_envoi_hgrappe_by_numero(current_setting('test.numero'), current_setting('test.code'));
  IF v->>'error' IS DISTINCT FROM 'disabled' OR v->>'token' IS NOT NULL THEN
    RAISE EXCEPTION 'ÉCHEC T6 : confirmation par numéro acceptée alors que désactivée (%)', v;
  END IF;
  IF current_setting('test.autres_grappes') = '0'
     AND (public.get_hg_confirm_cfg()->>'confirm_by_numero')::boolean THEN
    RAISE EXCEPTION 'ÉCHEC T6 : get_hg_confirm_cfg ignore la bascule de grappe';
  END IF;
END $t$;
RESET ROLE;

DO $t$
BEGIN
  IF EXISTS (SELECT 1 FROM public.envois_audit
              WHERE table_name = 'envois_hgrappe'
                AND (old_data ?| ARRAY['confirm_token', 'verify_code']
                  OR new_data ?| ARRAY['confirm_token', 'verify_code'])) THEN
    RAISE EXCEPTION 'ÉCHEC T6 : jeton ou code recopié dans envois_audit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.envois_audit WHERE table_name = 'envois_hgrappe') THEN
    RAISE EXCEPTION 'ÉCHEC T6 : aucune ligne d''audit pour envois_hgrappe';
  END IF;
  -- La limite de 5 essais n'est atomique que grâce au verrou consultatif par
  -- numéro (requêtes parallèles). Faute de test de concurrence possible ici,
  -- contrôle statique de sa présence.
  IF pg_get_functiondef('public.get_envoi_hgrappe_by_numero(text,text)'::regprocedure)
     !~ 'PERFORM pg_advisory_xact_lock\(' THEN
    RAISE EXCEPTION 'ÉCHEC T6 : get_envoi_hgrappe_by_numero sans pg_advisory_xact_lock';
  END IF;
END $t$;

\echo '── T7. profiles : drapeau, activation et identité gérés par le serveur ──'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000006","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN
    UPDATE public.profiles SET must_change_password = false
     WHERE id = 'cc000000-0000-4000-8000-000000000006';
    RAISE EXCEPTION 'ÉCHEC T7 : l''utilisateur a levé son propre drapeau';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- Le libre-service ordinaire reste permis.
  UPDATE public.profiles SET theme = 'sombre' WHERE id = 'cc000000-0000-4000-8000-000000000006';
  IF NOT FOUND THEN RAISE EXCEPTION 'ÉCHEC T7 : mise à jour du thème refusée'; END IF;
  -- Aucune donnée métier tant que le mot de passe n'est pas changé.
  IF EXISTS (SELECT 1 FROM public.envois_hgrappe) THEN
    RAISE EXCEPTION 'ÉCHEC T7 : un compte au mot de passe à changer lit des envois';
  END IF;
END $t$;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000005","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN
    UPDATE public.profiles SET must_change_password = false
     WHERE id = 'cc000000-0000-4000-8000-000000000006';
    RAISE EXCEPTION 'ÉCHEC T7 : un superviseur a levé le drapeau d''un subordonné';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  -- active : pas d'UPDATE direct, même par un gestionnaire. La désactivation
  -- passe par manage-user (bannissement GoTrue + révocation des sessions).
  BEGIN
    UPDATE public.profiles SET active = false
     WHERE id = 'cc000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'ÉCHEC T7 : un superviseur a désactivé un compte par UPDATE direct';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM NOT LIKE 'La désactivation passe par la gestion des comptes%' THEN RAISE; END IF;
  END;
  -- Le formulaire (envois.js, saveUser) renvoie active inchangé : permis.
  UPDATE public.profiles SET active = true, nom = 'Technicien (renommé)'
   WHERE id = 'cc000000-0000-4000-8000-000000000004';
  IF NOT FOUND THEN RAISE EXCEPTION 'ÉCHEC T7 : un superviseur ne renomme plus un compte de son laboratoire'; END IF;
  UPDATE public.profiles SET nom = 'Technicien' WHERE id = 'cc000000-0000-4000-8000-000000000004';
END $t$;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN
    UPDATE public.profiles SET active = false
     WHERE id = 'cc000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'ÉCHEC T7 : un admin a désactivé un compte par UPDATE direct';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
-- Un utilisateur ne change ni son nom ni son identifiant de connexion.
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $t$
BEGIN
  BEGIN
    UPDATE public.profiles SET nom = 'Admin Principal'
     WHERE id = 'cc000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'ÉCHEC T7 : un technicien a changé son propre nom';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Modification non autorisée%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.profiles SET employee_id = 'E-AUTRE'
     WHERE id = 'cc000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'ÉCHEC T7 : un technicien a changé son identifiant de connexion';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM NOT LIKE 'Modification non autorisée%' THEN RAISE; END IF;
  END;
  BEGIN
    UPDATE public.profiles SET active = false
     WHERE id = 'cc000000-0000-4000-8000-000000000004';
    RAISE EXCEPTION 'ÉCHEC T7 : un technicien s''est désactivé par UPDATE direct';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $t$;
RESET ROLE;
SET LOCAL ROLE service_role;
SET LOCAL request.jwt.claims = '{"role":"service_role"}';
UPDATE public.profiles SET must_change_password = false WHERE id = 'cc000000-0000-4000-8000-000000000006';
DO $t$
BEGIN
  -- Contexte de confiance (manage-user, clé secrète) : désactivation permise.
  UPDATE public.profiles SET active = false WHERE id = 'cc000000-0000-4000-8000-000000000004';
  IF (SELECT active FROM public.profiles WHERE id = 'cc000000-0000-4000-8000-000000000004') THEN
    RAISE EXCEPTION 'ÉCHEC T7 : service_role n''a pas pu désactiver le compte';
  END IF;
  UPDATE public.profiles SET active = true WHERE id = 'cc000000-0000-4000-8000-000000000004';
END $t$;
RESET ROLE;
DO $t$
BEGIN
  IF (SELECT must_change_password FROM public.profiles
       WHERE id = 'cc000000-0000-4000-8000-000000000006') THEN
    RAISE EXCEPTION 'ÉCHEC T7 : service_role n''a pas pu lever le drapeau';
  END IF;
  IF (SELECT nom || '/' || employee_id || '/' || active FROM public.profiles
       WHERE id = 'cc000000-0000-4000-8000-000000000004') <> 'Technicien/T-TEC1/true' THEN
    RAISE EXCEPTION 'ÉCHEC T7 : profil du technicien altéré';
  END IF;
END $t$;

\echo '── T8. Cron : déclencheur et chien de garde ───────────────────────────'
DO $t$
DECLARE
  v_nb int;
BEGIN
  UPDATE public.notification_config SET enabled = true;
  DELETE FROM public.notification_log WHERE type = 'surveillance';

  -- URL non configurée : alerte dans le journal, aucun appel.
  PERFORM public._trigger_send_notifications();
  IF NOT EXISTS (SELECT 1 FROM public.notification_log
                  WHERE type = 'surveillance' AND body_text ~ 'supabase_url') THEN
    RAISE EXCEPTION 'ÉCHEC T8 : URL manquante non signalée';
  END IF;

  -- Configuration complète : l'appel HTTP est tenté (pg_net absent en CI).
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    UPDATE public.app_config SET value = '"https://exemple.supabase.co"' WHERE key = 'supabase_url';
    BEGIN
      PERFORM public._trigger_send_notifications();
      RAISE EXCEPTION 'ÉCHEC T8 : appel pg_net non tenté';
    EXCEPTION WHEN invalid_schema_name OR undefined_function THEN NULL;
    END;
  END IF;

  -- Chien de garde : une alerte pour une notification en attente depuis 31 h.
  DELETE FROM public.notification_log WHERE type = 'surveillance';
  INSERT INTO public.notification_queue (type, envoi_numero, created_at)
  VALUES ('nc', 'TEST', now() - interval '31 hours');
  PERFORM public._surveiller_notifications();
  PERFORM public._surveiller_notifications();
  SELECT count(*) INTO v_nb FROM public.notification_log WHERE type = 'surveillance';
  IF v_nb <> 1 THEN
    RAISE EXCEPTION 'ÉCHEC T8 : % alerte(s) du chien de garde au lieu de 1', v_nb;
  END IF;
END $t$;

\echo '── T9. Parcours métier : les droits ACCORDÉS suffisent au client ─────────'
-- Les blocs 6 et 8 de verif_restauration.sql figent les listes de droits ;
-- ce test joue les appels réels du client (envois.js, hgrappe.js,
-- bons-depart.js, kpi.js) sous le rôle authenticated. Un GRANT oublié
-- (fonction, table, séquence) échoue ici avec « permission denied ».
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $t$
DECLARE
  c_b1    CONSTANT uuid := 'cc000000-0000-4000-8000-0000000000b1';
  c_b2    CONSTANT uuid := 'cc000000-0000-4000-8000-0000000000b2';
  c_ext   CONSTANT uuid := 'cc000000-0000-4000-8000-0000000000c1';
  c_tech  CONSTANT uuid := 'cc000000-0000-4000-8000-000000000004';
  v_intra  record;
  v_hsilp  text;
  v_hg     json;
  v_hg_id  uuid;
  v_bon_id uuid;
  v_lien   uuid;
  v        json;
  v_nb     bigint;
BEGIN
  -- Lectures de référence de l'écran principal.
  PERFORM 1 FROM public.laboratories;
  PERFORM 1 FROM public.grappes;
  PERFORM 1 FROM public.external_labs;
  PERFORM 1 FROM public.module_config;
  PERFORM 1 FROM public.app_config;
  PERFORM 1 FROM public.icr_codes;
  PERFORM 1 FROM public.user_lab_memberships;

  -- Envoi intra-grappe par INSERT direct (envois.js) : numéro généré par
  -- generate_envoi_numero (SECURITY INVOKER, nextval sur envoi_seq).
  INSERT INTO public.envois (numeros_silp, exp_labo_id, dest_labo_id, temperature, transporteur,
                             nb_echantillons, departements, statut, notes, cree_par_id,
                             cree_par_nom, ts_envoi, type_specimen, glace_seche)
  VALUES (ARRAY['123456789'], c_b1, c_b2, 'Frigo', 'Taxi', 4, ARRAY['BIOCHIMIE'], 'En attente',
          '', c_tech, 'Technicien', now(), 'exempt', false)
  RETURNING id, numero INTO v_intra;
  IF v_intra.numero !~ '^SILP-[0-9]{6}-[0-9]{5}$' THEN
    RAISE EXCEPTION 'ÉCHEC T9 : numéro d''envoi inattendu (%)', v_intra.numero;
  END IF;
  UPDATE public.envois SET notes = 'Note modifiée' WHERE id = v_intra.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'ÉCHEC T9 : modification d''un envoi refusée'; END IF;

  -- Envoi sans liste SILP et envoi hors-grappe, par leurs RPC.
  PERFORM public.peek_next_hsilp();
  PERFORM public.peek_next_hgrappe();
  v_hsilp := public.create_envoi_hsilp(c_b1, c_b2, 'Frigo', 'Taxi', 2, ARRAY['PATHOLOGIE'], '',
                                       c_tech, 'Technicien', 'exempt', false, 'En attente');
  IF v_hsilp !~ '^HSILP-' THEN RAISE EXCEPTION 'ÉCHEC T9 : create_envoi_hsilp (%)', v_hsilp; END IF;
  v_hg := public.create_envoi_hgrappe('silp', c_b1, c_ext, 'Frigo', 'Taxi', 3, ARRAY['987654321'], '',
                                      c_tech, 'Technicien', 'exempt', false, 'En attente');
  -- verify_code relu par le client (repli de hgrappe.js) : SELECT permis.
  SELECT id INTO v_hg_id FROM public.envois_hgrappe
   WHERE numero = v_hg->>'numero' AND verify_code = v_hg->>'verify_code';
  IF v_hg_id IS NULL THEN RAISE EXCEPTION 'ÉCHEC T9 : envoi HG ou verify_code illisible (%)', v_hg; END IF;

  -- Bon de départ : un envoi intra et un envoi hors-grappe.
  v := public.create_bon_depart(c_b1, c_tech, 'Technicien', ARRAY[v_intra.id], ARRAY[v_hg_id],
                                '{}'::jsonb, NULL);
  v_bon_id := (v->>'id')::uuid;
  IF (SELECT count(*) FROM public.bons_depart_envois WHERE bon_id = v_bon_id) <> 2
     OR (SELECT statut FROM public.envois WHERE id = v_intra.id) <> 'En transit'
     OR (SELECT statut FROM public.envois_hgrappe WHERE id = v_hg_id) <> 'En transit' THEN
    RAISE EXCEPTION 'ÉCHEC T9 : bon de départ incomplet (%)', v;
  END IF;
  PERFORM 1 FROM public.bons_depart_sections WHERE bon_id = v_bon_id;
  SELECT id INTO v_lien FROM public.bons_depart_envois WHERE bon_id = v_bon_id AND envoi_id = v_intra.id;
  v := public.remove_envoi_from_bon(v_lien);
  v := public.add_envois_to_bon(v_bon_id, ARRAY[v_intra.id], '{}'::uuid[], NULL);
  v := public.cancel_bon_depart(v_bon_id);
  IF (SELECT statut FROM public.bons_depart WHERE id = v_bon_id) <> 'annulé' THEN
    RAISE EXCEPTION 'ÉCHEC T9 : bon de départ non annulé';
  END IF;

  -- Annulation d'un envoi par son créateur, signalement d'une non-conformité.
  PERFORM public.annuler_envoi((SELECT id FROM public.envois WHERE numero = v_hsilp), 'Erreur de saisie');
  IF (SELECT statut FROM public.envois WHERE numero = v_hsilp) <> 'Annulé' THEN
    RAISE EXCEPTION 'ÉCHEC T9 : envoi non annulé';
  END IF;
  v := public.queue_envoi_notification('nc', v_intra.id);
  IF (v->>'ok')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'ÉCHEC T9 : signalement (%)', v; END IF;

  -- Statistiques (historique, ICR) ; les KPI de labo sont réservés.
  SELECT total INTO v_nb FROM public.get_hist_stats();
  IF v_nb < 1 THEN RAISE EXCEPTION 'ÉCHEC T9 : get_hist_stats ne voit pas les envois du labo'; END IF;
  SELECT total INTO v_nb FROM public.get_hg_hist_stats();
  IF v_nb < 1 THEN RAISE EXCEPTION 'ÉCHEC T9 : get_hg_hist_stats ne voit pas les envois HG'; END IF;
  PERFORM public.get_icr_stats(c_b1, 30);
  IF public.get_labo_kpis(c_b1, 30)->>'error' IS DISTINCT FROM 'forbidden' THEN
    RAISE EXCEPTION 'ÉCHEC T9 : KPI de laboratoire accessibles à un technicien';
  END IF;
  PERFORM public.is_module_active('bons_depart', c_b1);
END $t$;
-- Administrateur : KPI et journaux de supervision.
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000001","role":"authenticated"}';
DO $t$
BEGIN
  IF public.get_labo_kpis('cc000000-0000-4000-8000-0000000000b1', 30)->'stats_globales'->>'total' IS NULL THEN
    RAISE EXCEPTION 'ÉCHEC T9 : get_labo_kpis pour un admin';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.envois_audit)
     OR NOT EXISTS (SELECT 1 FROM public.notification_queue) THEN
    RAISE EXCEPTION 'ÉCHEC T9 : journaux de supervision illisibles pour un admin';
  END IF;
  PERFORM 1 FROM public.notification_log;
  PERFORM 1 FROM public.login_attempts;
  PERFORM 1 FROM public.hg_confirm_attempts;
  PERFORM 1 FROM public.app_secrets_audit;
  PERFORM 1 FROM public.notification_emails;
  UPDATE public.notification_config SET fallback_email = 'labo@example.org';
  IF NOT FOUND THEN RAISE EXCEPTION 'ÉCHEC T9 : configuration des notifications non modifiable'; END IF;
END $t$;
RESET ROLE;

\echo '── T10. Envoi intra-grappe : expéditeur et destinataire distincts ────────'
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cc000000-0000-4000-8000-000000000004","role":"authenticated"}';
DO $t$
DECLARE
  c_b1   CONSTANT uuid := 'cc000000-0000-4000-8000-0000000000b1';
  c_b2   CONSTANT uuid := 'cc000000-0000-4000-8000-0000000000b2';
  c_tech CONSTANT uuid := 'cc000000-0000-4000-8000-000000000004';
  v_id   uuid;
  v_refus boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.envois (numeros_silp, exp_labo_id, dest_labo_id, temperature, transporteur,
                               departements, statut, cree_par_id, cree_par_nom, ts_envoi, type_specimen)
    VALUES (ARRAY['111222333'], c_b1, c_b1, 'Frigo', 'Taxi', ARRAY['BIOCHIMIE'], 'En attente',
            c_tech, 'Technicien', now(), 'exempt');
    RAISE EXCEPTION 'ÉCHEC T10 : INSERT direct vers son propre laboratoire accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.create_envoi_hsilp(c_b1, c_b1, 'Frigo', 'Taxi', 1, ARRAY['BIOCHIMIE'], '',
                                      c_tech, 'Technicien', 'exempt', false, 'En attente');
    RAISE EXCEPTION 'ÉCHEC T10 : create_envoi_hsilp vers son propre laboratoire accepté';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  -- Une modification ne peut pas non plus ramener le destinataire sur l'expéditeur : le
  -- déclencheur qui fige expéditeur et destinataire la refuse avant la contrainte.
  SELECT id INTO v_id FROM public.envois WHERE exp_labo_id = c_b1 AND dest_labo_id = c_b2 LIMIT 1;
  IF v_id IS NULL THEN RAISE EXCEPTION 'ÉCHEC T10 : envoi témoin introuvable'; END IF;
  BEGIN
    UPDATE public.envois SET dest_labo_id = c_b1 WHERE id = v_id;
  EXCEPTION WHEN check_violation OR raise_exception THEN v_refus := true;
  END;
  IF NOT v_refus THEN RAISE EXCEPTION 'ÉCHEC T10 : modification vers le laboratoire expéditeur acceptée'; END IF;
END $t$;
RESET ROLE;

ROLLBACK;

\echo '✅ Tests fonctionnels réussis.'
