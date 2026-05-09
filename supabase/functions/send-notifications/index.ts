// Edge Function : send-notifications
// Déclencheur HTTP — cron Supabase (pg_net) ou appel manuel
// Sécurisé par validation JWT Supabase (gateway) — déployer SANS --no-verify-jwt
//
// Étapes :
//   1. Vérifie la config (activé ?)
//   2. Détecte les envois en alarme non encore mis en queue
//   3. Lit tous les items en attente dans notification_queue
//   4. Groupe par adresse email destinataire
//   5. Envoie un email récapitulatif par destinataire (Resend ou SMTP)
//   6. Marque les items comme envoyés + écrit dans notification_log
//   7. Purge les données de plus de 90 jours

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const DEPT_LABELS: Record<string, string> = {
  BIOCHIMIE:     'Biochimie',
  HEMATOLOGIE:   'Hématologie/BDS',
  MICROBIOLOGIE: 'Microbiologie/Séro',
  PATHOLOGIE:    'Pathologie/Cyto',
};

const TYPE_LABELS: Record<string, string> = {
  nc:     'Non-conformité',
  lost:   'Envoi perdu',
  alarm:  'Envoi potentiellement perdu',
  hg_nc:  'Non-conformité Hors-grappe',
};

interface NotifConfig {
  enabled: boolean; enabled_nc: boolean; enabled_lost: boolean; enabled_alarm: boolean;
  provider: 'resend' | 'smtp';
  resend_api_key: string; smtp_host: string; smtp_port: number;
  smtp_user: string; smtp_pass: string; smtp_from: string;
  batch_hour: number; fallback_email: string;
}

interface QueueItem {
  id: string; type: string;
  envoi_id: string | null; envoi_hg_id: string | null;
  exp_labo_id: string | null; dest_labo_id: string | null;
  envoi_numero: string; departements: string[]; details: Record<string, unknown>;
  created_at: string;
}

interface EmailEntry { labo_id: string; dept_id: string | null; email: string; active: boolean; }

// ── Résolution des adresses email ─────────────────────────────────────────────

function resolveEmails(laboId: string, deptId: string | null, emails: EmailEntry[], fallback: string): string[] {
  // 1. Correspondance exacte lab + dept
  let found = emails.filter(e => e.labo_id === laboId && e.dept_id === deptId && e.active);
  if (found.length) return found.map(e => e.email);
  // 2. Fallback lab (dept_id NULL) si on cherchait un dept spécifique
  if (deptId !== null) {
    found = emails.filter(e => e.labo_id === laboId && e.dept_id === null && e.active);
    if (found.length) return found.map(e => e.email);
  }
  // 3. Fallback global
  return fallback ? [fallback] : [];
}

// ── Construction du corps de l'email ─────────────────────────────────────────

function buildEmailBody(
  items: QueueItem[],
  contexts: { laboName: string; deptId: string | null }[],
  labNames: Record<string, string>,
): string {
  const TZ = { timeZone: 'America/Montreal' };
  const now = new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', ...TZ });
  const uniqueCtx = [...new Map(contexts.map(c => [`${c.laboName}:${c.deptId}`, c])).values()];
  const ctxLines = uniqueCtx.map(c => {
    const dept = c.deptId ? (DEPT_LABELS[c.deptId] || c.deptId) : 'Tous départements';
    return `  • ${dept} — ${c.laboName}`;
  }).join('\n');

  const lines: string[] = [
    'OPTILAB — Rapport de notifications automatiques',
    '═══════════════════════════════════════════════',
    '',
    `Date       : ${now}`,
    `Événements : ${items.length}`,
    '',
    'Vous recevez ce rapport en tant que responsable pour :',
    ctxLines,
    '',
  ];

  for (const item of items) {
    lines.push('──────────────────────────────────────────────');
    lines.push(`[${(TYPE_LABELS[item.type] || item.type).toUpperCase()}]  N° ${item.envoi_numero || '—'}`);
    if (item.exp_labo_id)  lines.push(`Expéditeur   : ${labNames[item.exp_labo_id]  || item.exp_labo_id}`);
    if (item.dest_labo_id) lines.push(`Destinataire : ${labNames[item.dest_labo_id] || item.dest_labo_id}`);
    if (item.departements?.length) {
      const deptLabels = item.departements.map(d => DEPT_LABELS[d] || d).join(', ');
      lines.push(`Département  : ${deptLabels}`);
    }
    const det = item.details as Record<string, unknown>;
    if (det?.obs)       lines.push(`Observation  : ${det.obs}`);
    if (Array.isArray(det?.nc_types) && det.nc_types.length)
      lines.push(`Types NC     : ${(det.nc_types as string[]).join(', ')}`);
    if (det?.ts_envoi)  lines.push(`Envoyé le    : ${new Date(det.ts_envoi as string).toLocaleString('fr-CA', TZ)}`);
    lines.push(`Signalé le   : ${new Date(item.created_at).toLocaleString('fr-CA', TZ)}`);
    lines.push('');
  }

  lines.push('══════════════════════════════════════════════');
  lines.push('Ce message a été généré automatiquement par OPTILAB.');
  lines.push('Ne pas répondre à cet email.');
  return lines.join('\n');
}

// ── Template HTML email ───────────────────────────────────────────────────────

const TYPE_COLOR: Record<string, string> = {
  nc: '#DC2626', lost: '#DC2626', alarm: '#D97706', hg_nc: '#DC2626',
};
const TYPE_BG: Record<string, string> = {
  nc: '#FEF2F2', lost: '#FEF2F2', alarm: '#FFFBEB', hg_nc: '#FEF2F2',
};

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildEmailHtml(
  items: QueueItem[],
  contexts: { laboName: string; deptId: string | null }[],
  labNames: Record<string, string>,
): string {
  const TZ = { timeZone: 'America/Montreal' };
  const now = new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', ...TZ });
  const uniqueCtx = [...new Map(contexts.map(c => [`${c.laboName}:${c.deptId}`, c])).values()];

  const ctxPills = uniqueCtx.map(c => {
    const dept = c.deptId ? (DEPT_LABELS[c.deptId] || c.deptId) : 'Tous départements';
    return `<span style="display:inline-block;background:#E0EEF7;color:#0F4C75;border-radius:4px;padding:3px 10px;font-size:12px;margin:2px 4px 2px 0">${esc(dept)} — ${esc(c.laboName)}</span>`;
  }).join('');

  const itemsHtml = items.map(item => {
    const det = item.details as Record<string, unknown>;
    const color = TYPE_COLOR[item.type] || '#555';
    const bg    = TYPE_BG[item.type]    || '#F9F9F9';
    const label = (TYPE_LABELS[item.type] || item.type).toUpperCase();
    const deptLabel = item.departements?.length
      ? item.departements.map((d: string) => DEPT_LABELS[d] || d).join(', ') : '';

    const rows: string[] = [];
    const row = (k: string, v: string) =>
      `<tr><td style="padding:5px 12px 5px 0;color:#666;font-size:12px;white-space:nowrap;vertical-align:top">${esc(k)}</td><td style="padding:5px 0;font-size:13px;color:#111">${v}</td></tr>`;

    if (item.exp_labo_id)  rows.push(row('Expéditeur',   esc(labNames[item.exp_labo_id]  || item.exp_labo_id)));
    if (item.dest_labo_id) rows.push(row('Destinataire', esc(labNames[item.dest_labo_id] || item.dest_labo_id)));
    if (deptLabel)         rows.push(row('Département',  esc(deptLabel)));
    if (det?.obs)          rows.push(row('Observation',  `<span style="color:#B91C1C">${esc(det.obs)}</span>`));
    if (Array.isArray(det?.nc_types) && (det.nc_types as string[]).length)
                           rows.push(row('Types NC',     esc((det.nc_types as string[]).join(', '))));
    if (det?.ts_envoi)     rows.push(row('Envoyé le',    esc(new Date(det.ts_envoi as string).toLocaleString('fr-CA', TZ))));
                           rows.push(row('Signalé le',   esc(new Date(item.created_at).toLocaleString('fr-CA', TZ))));

    return `
    <div style="border:1px solid #E5E7EB;border-left:4px solid ${color};border-radius:6px;margin-bottom:12px;overflow:hidden">
      <div style="background:${bg};padding:10px 14px;display:flex;align-items:center;gap:10px">
        <span style="background:${color};color:#fff;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:700;letter-spacing:.05em;margin-right:8px">${esc(label)}</span>
        <span style="font-weight:600;font-size:14px;color:#111;font-family:monospace">N° ${esc(item.envoi_numero || '—')}</span>
      </div>
      <div style="padding:10px 14px">
        <table style="border-collapse:collapse;width:100%">${rows.join('')}</table>
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">

  <!-- En-tête -->
  <tr><td style="background:#0F2A3D;border-radius:8px 8px 0 0;padding:24px 28px">
    <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.02em">OPTILAB</div>
    <div style="color:rgba(255,255,255,.6);font-size:12px;margin-top:3px">Rapport de notifications automatiques</div>
  </td></tr>

  <!-- Corps -->
  <tr><td style="background:#fff;padding:24px 28px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid #E5E7EB">
      <span style="font-size:13px;color:#555">📅 ${esc(now)}</span>
      <span style="background:#0F2A3D;color:#fff;border-radius:20px;padding:3px 12px;font-size:12px;font-weight:600">${items.length} événement${items.length > 1 ? 's' : ''}</span>
    </div>

    <div style="margin-bottom:20px">
      <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:8px">Vous recevez ce rapport pour</div>
      <div>${ctxPills}</div>
    </div>

    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;margin-bottom:10px">Événements</div>
    ${itemsHtml}
  </td></tr>

  <!-- Pied de page -->
  <tr><td style="background:#F9FAFB;border-radius:0 0 8px 8px;padding:14px 28px;border-top:1px solid #E5E7EB">
    <p style="margin:0;font-size:11px;color:#9CA3AF;text-align:center">Message généré automatiquement par OPTILAB — Ne pas répondre</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

// ── Envoi email via Resend ou SMTP ────────────────────────────────────────────

async function sendEmail(cfg: NotifConfig, to: string, subject: string, text: string, html: string): Promise<void> {
  if (cfg.provider === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: cfg.smtp_from || 'OPTILAB <noreply@optilab.local>', to: [to], subject, text, html }),
    });
    if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  } else {
    const client = new SMTPClient({
      connection: {
        hostname: cfg.smtp_host,
        port: cfg.smtp_port || 587,
        tls: cfg.smtp_port === 465,
        auth: { username: cfg.smtp_user, password: cfg.smtp_pass },
      },
    });
    await client.send({ from: cfg.smtp_from || cfg.smtp_user, to, subject, content: text, html });
    await client.close();
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

Deno.serve(async (_req: Request) => {
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const batchId = crypto.randomUUID();
  const results: { email: string; status: string; error?: string }[] = [];

  // 1. Chargement de la configuration
  const { data: cfg } = await sb.from('notification_config').select('*').eq('id', 1).single();
  if (!cfg?.enabled) {
    return new Response(JSON.stringify({ ok: true, skipped: 'disabled' }), { headers: { 'Content-Type': 'application/json' } });
  }
  const notifCfg = cfg as NotifConfig;

  // 2. Détection des envois en alarme "potentiellement perdu" non encore en queue
  if (notifCfg.enabled_alarm) {
    const { data: appCfg } = await sb.from('app_config').select('value').eq('key', 'alarm_days').single();
    const alarmDays = Number(appCfg?.value) || 5;
    const cutoff = new Date(Date.now() - alarmDays * 24 * 3600 * 1000).toISOString();

    const { data: alarmEnvois } = await sb.from('envois')
      .select('id,numero_liste,exp_labo_id,dest_labo_id,departements,ts_envoi')
      .eq('statut', 'En transit')
      .lt('ts_envoi', cutoff);

    if (alarmEnvois?.length) {
      const ids = alarmEnvois.map((e: { id: string }) => e.id);
      const { data: alreadyQueued } = await sb.from('notification_queue').select('envoi_id').eq('type', 'alarm').in('envoi_id', ids);
      const queuedIds = new Set((alreadyQueued || []).map((q: { envoi_id: string }) => q.envoi_id));
      const toInsert = alarmEnvois
        .filter((e: { id: string }) => !queuedIds.has(e.id))
        .map((e: { id: string; numero_liste: string; exp_labo_id: string; dest_labo_id: string; departements: string[]; ts_envoi: string }) => ({
          type: 'alarm', envoi_id: e.id,
          exp_labo_id: e.exp_labo_id, dest_labo_id: e.dest_labo_id,
          envoi_numero: e.numero_liste, departements: e.departements || [],
          details: { ts_envoi: e.ts_envoi },
        }));
      if (toInsert.length) await sb.from('notification_queue').insert(toInsert);
    }
  }

  // 3. Lecture des items en attente selon les types activés
  const typeFilter: string[] = [];
  if (notifCfg.enabled_nc)    { typeFilter.push('nc'); typeFilter.push('hg_nc'); }
  if (notifCfg.enabled_lost)  typeFilter.push('lost');
  if (notifCfg.enabled_alarm) typeFilter.push('alarm');
  if (!typeFilter.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const { data: pending } = await sb.from('notification_queue').select('*').is('sent_at', null).in('type', typeFilter);
  if (!pending?.length) return new Response(JSON.stringify({ ok: true, sent: 0 }), { headers: { 'Content-Type': 'application/json' } });

  const items = pending as QueueItem[];

  // 4. Chargement des emails configurés et des noms de labos
  const { data: emailsCfg } = await sb.from('notification_emails').select('*').eq('active', true);
  const emails = (emailsCfg || []) as EmailEntry[];

  const laboIds = [...new Set(items.flatMap(q => [q.exp_labo_id, q.dest_labo_id].filter(Boolean) as string[]))];
  const { data: labsData } = await sb.from('laboratories').select('id,name').in('id', laboIds);
  const labNames: Record<string, string> = {};
  for (const l of labsData || []) labNames[(l as { id: string; name: string }).id] = (l as { id: string; name: string }).name;

  // 5. Groupement par adresse email
  const emailGroups = new Map<string, { itemMap: Map<string, QueueItem>; contexts: { laboName: string; deptId: string | null }[] }>();

  for (const item of items) {
    const labos = [item.exp_labo_id, item.dest_labo_id].filter(Boolean) as string[];
    for (const laboId of labos) {
      const depts = item.departements?.length ? item.departements : [null as unknown as string];
      for (const deptId of depts) {
        const resolved = resolveEmails(laboId, deptId ?? null, emails, notifCfg.fallback_email);
        for (const email of resolved) {
          if (!emailGroups.has(email)) emailGroups.set(email, { itemMap: new Map(), contexts: [] });
          const grp = emailGroups.get(email)!;
          if (!grp.itemMap.has(item.id)) grp.itemMap.set(item.id, item);
          grp.contexts.push({ laboName: labNames[laboId] || laboId, deptId: deptId ?? null });
        }
      }
    }
  }

  // 6. Envoi d'un email récapitulatif par destinataire
  const sentItemIds = new Set<string>();

  for (const [email, grp] of emailGroups) {
    const grpItems = [...grp.itemMap.values()];
    const subject = `[OPTILAB] Rapport de notifications — ${grpItems.length} événement(s)`;
    const body = buildEmailBody(grpItems, grp.contexts, labNames);
    const html  = buildEmailHtml(grpItems, grp.contexts, labNames);
    const distinctTypes = [...new Set(grpItems.map(i => i.type))].join(',');

    let status = 'sent';
    let errorMsg: string | null = null;
    try {
      await sendEmail(notifCfg, email, subject, body, html);
      for (const id of grp.itemMap.keys()) sentItemIds.add(id);
    } catch (e: unknown) {
      status = 'error';
      errorMsg = e instanceof Error ? e.message : String(e);
    }

    await sb.from('notification_log').insert({
      batch_id: batchId, type: distinctTypes, to_email: email,
      subject, body_text: body, status, error_message: errorMsg,
      sent_at: new Date().toISOString(),
      queue_ids: grpItems.map(i => i.id),
    });
    results.push({ email, status, ...(errorMsg ? { error: errorMsg } : {}) });
  }

  // 7. Marque les items traités + purge à 90 jours
  if (sentItemIds.size) {
    await sb.from('notification_queue').update({ sent_at: new Date().toISOString(), batch_id: batchId }).in('id', [...sentItemIds]);
  }
  const purge = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString();
  await sb.from('notification_queue').delete().not('sent_at', 'is', null).lt('sent_at', purge);
  await sb.from('notification_log').delete().lt('sent_at', purge);

  return new Response(
    JSON.stringify({ ok: true, batchId, sent: sentItemIds.size, emails: results.length, results }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
