-- Révocation de EXECUTE sur les fonctions SECURITY DEFINER pour le rôle anon.
-- Les fonctions publiques légitimes (flux confirmation QR hors-grappe) sont exclues :
--   confirm_envoi_hgrappe, get_envoi_hgrappe_by_token, get_hg_confirm_cfg, get_envoi_hgrappe_by_numero

REVOKE EXECUTE ON FUNCTION public.add_envois_to_bon(uuid, uuid[], uuid[], jsonb)            FROM anon;
REVOKE EXECUTE ON FUNCTION public.annuler_envoi(uuid, text)                                  FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_bon_depart(uuid)                                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_bon_completion(uuid)                                 FROM anon;
REVOKE EXECUTE ON FUNCTION public.remove_envoi_from_bon(uuid)                               FROM anon;

REVOKE EXECUTE ON FUNCTION public.create_bon_depart(uuid, uuid, text, uuid[], uuid[], jsonb, jsonb) FROM anon;

-- create_envoi_hgrappe — 3 surcharges
REVOKE EXECUTE ON FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text)                    FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[])            FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hgrappe(text, uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean)   FROM anon;

-- create_envoi_hsilp — 3 surcharges
REVOKE EXECUTE ON FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text)                   FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[])           FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_envoi_hsilp(uuid, uuid, text, text, integer, text[], text, uuid, text, text, boolean, text, text[], boolean)  FROM anon;

REVOKE EXECUTE ON FUNCTION public.current_lab_role(uuid)           FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_labo_id()                FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_labo_ids()               FROM anon;
REVOKE EXECUTE ON FUNCTION public.current_role_name()              FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_app_secret_status(text)      FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_app_secrets_status()        FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_app_secret(text, text)       FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_icr_stats(uuid, integer)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_labo_kpis(uuid, integer)     FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_module_active(text, uuid)     FROM anon;

REVOKE EXECUTE ON FUNCTION public.peek_next_hgrappe()              FROM anon;
REVOKE EXECUTE ON FUNCTION public.peek_next_hsilp()                FROM anon;

-- Fonctions trigger — ne doivent jamais être appelées directement via l'API REST
REVOKE EXECUTE ON FUNCTION public.trg_bd_section_completion()      FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_envois_bon_completion()      FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_fn_hgrappe_notif()           FROM anon;
REVOKE EXECUTE ON FUNCTION public.trg_hgrappe_bon_completion()     FROM anon;
