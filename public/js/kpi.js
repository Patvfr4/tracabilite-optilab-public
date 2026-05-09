import { state } from './state.js';
import { notifier } from './ui.js';

var _volumeChart = null;
var _activeDays  = 30;

export async function initDashboard(days) {
  _activeDays = days || _activeDays;
  _setPillActive(_activeDays);

  var widgets = document.getElementById('kpi-widgets');
  if (widgets) widgets.innerHTML = '<div class="kpi-loading">Chargement…</div>';

  try {
    var r = await state.sb.rpc('get_labo_kpis', { p_labo_id: state.activeLaboId, p_days: _activeDays });
    if (r.error) throw r.error;
    _renderWidgets(r.data.stats_globales);
    _renderChart(r.data.flux_quotidien);
  } catch (err) {
    if (widgets) widgets.innerHTML = '';
    notifier('kpierr', 'Impossible de charger les KPI : ' + (err.message || err), 'e');
  }
}

function _setPillActive(days) {
  document.querySelectorAll('.kpi-pill').forEach(function(btn) {
    btn.classList.toggle('active', +btn.dataset.days === days);
  });
}

var _ICONS = {
  box:   '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5l6-3 6 3v6l-6 3-6-3V5z"/><path d="M8 2v12M2 5l6 3 6-3"/></svg>',
  alert: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2L1 13h14L8 2z"/><path d="M8 6v3M8 10.5v.5"/></svg>',
  clock: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M8 4v4l2.5 2"/></svg>',
  check: '<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-4"/></svg>',
  empty: '<svg width="36" height="36" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><rect x="1" y="9" width="3" height="6" rx="1"/><rect x="6" y="5" width="3" height="10" rx="1"/><rect x="11" y="1" width="3" height="14" rx="1"/></svg>',
};

function _card(color, icon, label, value, sub, alert) {
  return '<div class="kpi-card kpi-card--' + color + '">'
    + '<div class="kpi-card-icon">' + _ICONS[icon] + '</div>'
    + '<div class="kpi-card-body">'
    + '<span class="kpi-label">' + label + '</span>'
    + '<span class="kpi-value' + (alert ? ' kpi-alert' : '') + '">' + value + '</span>'
    + '<span class="kpi-sub">' + sub + '</span>'
    + '</div></div>';
}

function _renderWidgets(stats) {
  var container = document.getElementById('kpi-widgets');
  if (!container || !stats) return;
  container.innerHTML =
    _card('blue',  'box',   'Volume total',      stats.total,              'Intra + Hors-grappe',           false) +
    _card('amber', 'alert', 'Non-conformités',   stats.nc_rate + '  %',     'Des envois sur la période',     stats.nc_rate > 5) +
    _card('teal',  'clock', 'Transit moyen',     stats.avg_transit + ' h', 'Envois intra-grappe reçus',     false) +
    _card('green', 'check', 'Hors-grappe',       stats.hg_total,           (stats.hg_total > 0 ? stats.hg_confirmed + ' / ' + stats.hg_total + ' confirmés' : 'Aucun envoi hors-grappe'), false);
}

function _cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function _renderChart(data) {
  var area = document.getElementById('kpi-chart-area');
  var ctx  = document.getElementById('chart-volumes');
  if (!area) return;

  if (_volumeChart) { _volumeChart.destroy(); _volumeChart = null; }

  if (!data || !data.length) {
    area.innerHTML = '<div class="kpi-empty"><span style="opacity:.3">' + _ICONS.empty + '</span><span>Aucune donnée sur la période</span></div>';
    return;
  }

  // Restore canvas if it was replaced by the empty state
  if (!document.getElementById('chart-volumes')) {
    area.innerHTML = '<canvas id="chart-volumes"></canvas>';
    ctx = document.getElementById('chart-volumes');
  }

  if (!window.Chart) return;

  var azure   = _cssVar('--brand-azure-deep') || '#2BAEDD';
  var t2      = _cssVar('--fg-muted')         || '#6E7C86';
  var gridCol = _cssVar('--neutral-200')       || '#DCE3E8';

  _volumeChart = new window.Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(function(d) {
        var dt = new Date(d.date + 'T12:00:00');
        return dt.toLocaleDateString('fr-CA', { month: 'short', day: 'numeric' });
      }),
      datasets: [{
        data: data.map(function(d) { return d.volume; }),
        backgroundColor: azure + '33',
        borderColor: azure,
        borderWidth: 2,
        borderRadius: 4,
        hoverBackgroundColor: azure + '88',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: _cssVar('--neutral-800') || '#1F2A33',
          titleFont: { size: 12 },
          bodyFont:  { size: 12 },
          padding: 10,
          cornerRadius: 6,
          callbacks: {
            label: function(c) {
              var v = c.parsed.y;
              return '  ' + v + ' envoi' + (v > 1 ? 's' : '');
            },
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid:   { color: gridCol },
          ticks:  { color: t2, font: { size: 11 }, maxRotation: 45 },
        },
        y: {
          border: { display: false },
          grid:   { color: gridCol },
          ticks:  { color: t2, font: { size: 11 }, stepSize: 1, precision: 0 },
          beginAtZero: true,
        },
      },
    },
  });
}
