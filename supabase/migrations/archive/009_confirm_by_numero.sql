-- Migration 009 : confirmation par numéro d'envoi + code de vérification

-- Le code de vérification = 6 premiers caractères du confirm_token UUID sans tirets, majuscules
-- Ex. token a3f9b2c1-... → code A3F9B2
-- Imprimé sur le F-G-74 ; impossible à deviner sans le document physique.

CREATE OR REPLACE FUNCTION get_envoi_hgrappe_by_numero(p_numero TEXT, p_verify_code TEXT)
RETURNS JSON AS $$
DECLARE
  v_e          envois_hgrappe%ROWTYPE;
  v_exp_name   TEXT;
  v_dest_name  TEXT;
  v_expected   TEXT;
BEGIN
  SELECT * INTO v_e FROM envois_hgrappe WHERE numero = upper(trim(p_numero));
  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found');
  END IF;
  v_expected := upper(substr(replace(v_e.confirm_token::text, '-', ''), 1, 6));
  IF upper(trim(p_verify_code)) != v_expected THEN
    RETURN json_build_object('error', 'wrong_code');
  END IF;
  SELECT name INTO v_exp_name  FROM laboratories  WHERE id = v_e.exp_labo_id;
  SELECT name INTO v_dest_name FROM external_labs WHERE id = v_e.dest_ext_lab_id;
  RETURN json_build_object(
    'numero',              v_e.numero,
    'token',               v_e.confirm_token,
    'exp',                 v_exp_name,
    'dest',                v_dest_name,
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
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Config publique pour la page de confirmation (lisible par anon)
CREATE OR REPLACE FUNCTION get_hg_confirm_cfg()
RETURNS JSON AS $$
DECLARE
  v_val TEXT;
BEGIN
  SELECT value::text INTO v_val FROM app_config WHERE key = 'hgrappe_confirm_by_numero';
  RETURN json_build_object(
    'confirm_by_numero', COALESCE(v_val NOT IN ('false','null','""'), TRUE)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_envoi_hgrappe_by_numero(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_hg_confirm_cfg()                    TO anon, authenticated;
