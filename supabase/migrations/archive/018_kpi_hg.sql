-- Migration 018 : Ajout données HG dans get_labo_kpis
-- Ajoute hg_total et hg_confirmed dans stats_globales

CREATE OR REPLACE FUNCTION get_labo_kpis(p_labo_id UUID, p_days INTEGER)
RETURNS JSON AS $$
DECLARE
  v_cutoff       TIMESTAMPTZ := NOW() - (p_days || ' days')::INTERVAL;
  v_intra_total  INTEGER;
  v_intra_nc     INTEGER;
  v_avg_transit  NUMERIC;
  v_hg_total     INTEGER;
  v_hg_nc        INTEGER;
  v_hg_confirmed INTEGER;
  v_total        INTEGER;
  v_nc_count     INTEGER;
  v_flux         JSON;
BEGIN
  IF current_role_name() NOT IN ('admin', 'superviseur_grappe') THEN
    RETURN json_build_object('error', 'forbidden');
  END IF;

  -- Envois intra-grappe expédiés par ce labo
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COALESCE(ROUND(
      AVG(EXTRACT(EPOCH FROM (ts_recep - ts_envoi)) / 3600.0)
      FILTER (WHERE statut = 'Reçu' AND ts_recep IS NOT NULL),
    1), 0)
  INTO v_intra_total, v_intra_nc, v_avg_transit
  FROM envois
  WHERE exp_labo_id = p_labo_id
    AND ts_envoi    >= v_cutoff;

  -- Envois hors-grappe expédiés par ce labo
  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE statut = 'Problème')::INTEGER,
    COUNT(*) FILTER (WHERE ts_confirm IS NOT NULL)::INTEGER
  INTO v_hg_total, v_hg_nc, v_hg_confirmed
  FROM envois_hgrappe
  WHERE exp_labo_id = p_labo_id
    AND ts_envoi    >= v_cutoff;

  v_total    := v_intra_total + v_hg_total;
  v_nc_count := v_intra_nc    + v_hg_nc;

  -- Flux quotidien : intra + HG fusionnés par date
  SELECT json_agg(d ORDER BY d.date)
  INTO v_flux
  FROM (
    SELECT date, SUM(volume)::INTEGER AS volume
    FROM (
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal', 'YYYY-MM-DD') AS date,
             COUNT(*) AS volume
      FROM   envois
      WHERE  exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff
      GROUP  BY 1
      UNION ALL
      SELECT TO_CHAR(ts_envoi AT TIME ZONE 'America/Montreal', 'YYYY-MM-DD') AS date,
             COUNT(*) AS volume
      FROM   envois_hgrappe
      WHERE  exp_labo_id = p_labo_id AND ts_envoi >= v_cutoff
      GROUP  BY 1
    ) raw
    GROUP  BY date
    ORDER  BY date
  ) d;

  RETURN json_build_object(
    'stats_globales', json_build_object(
      'total',        v_total,
      'nc_rate',      CASE WHEN v_total > 0
                           THEN ROUND((v_nc_count::NUMERIC / v_total) * 100, 1)
                           ELSE 0 END,
      'avg_transit',  v_avg_transit,
      'hg_total',     v_hg_total,
      'hg_confirmed', v_hg_confirmed
    ),
    'flux_quotidien', COALESCE(v_flux, '[]'::json)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_labo_kpis(UUID, INTEGER) TO authenticated;
