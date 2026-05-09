-- ============================================================
-- Migration 020 — Notifications non-conformités HG
-- Ajoute l'insertion dans notification_queue lors d'une
-- confirmation non-conforme, via page publique ET via fax.
-- ============================================================

CREATE OR REPLACE FUNCTION confirm_envoi_hgrappe(
  p_token       UUID,
  p_conforme    BOOLEAN,
  p_nc_types    TEXT[],
  p_commentaire TEXT,
  p_recu_par    TEXT,
  p_ts_confirm  TIMESTAMPTZ
) RETURNS JSON AS $$
DECLARE
  v_id        UUID;
  v_statut    TEXT;
  v_exp_labo  UUID;
  v_numero    TEXT;
BEGIN
  SELECT id, exp_labo_id, numero
  INTO v_id, v_exp_labo, v_numero
  FROM envois_hgrappe
  WHERE confirm_token = p_token AND ts_confirm IS NULL;

  IF NOT FOUND THEN
    RETURN json_build_object('error', 'not_found_or_already_confirmed');
  END IF;

  v_statut := CASE WHEN p_conforme THEN 'Reçu' ELSE 'Problème' END;

  UPDATE envois_hgrappe SET
    statut              = v_statut,
    confirm_method      = 'online',
    confirm_conforme    = p_conforme,
    confirm_nc_types    = p_nc_types,
    confirm_commentaire = p_commentaire,
    confirm_recu_par    = p_recu_par,
    ts_confirm          = COALESCE(p_ts_confirm, NOW())
  WHERE id = v_id;

  -- Notification uniquement pour les non-conformités
  IF NOT p_conforme THEN
    INSERT INTO notification_queue (
      type, envoi_hg_id, exp_labo_id, envoi_numero, details
    ) VALUES (
      'hg_nc', v_id, v_exp_labo, v_numero,
      json_build_object(
        'nc_types',    p_nc_types,
        'commentaire', p_commentaire,
        'recu_par',    p_recu_par,
        'conforme',    false,
        'method',      'online'
      )
    );
  END IF;

  RETURN json_build_object('ok', true, 'statut', v_statut);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
