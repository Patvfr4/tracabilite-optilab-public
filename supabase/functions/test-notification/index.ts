// Edge Function : test-notification
// Envoie un email de test à l'adresse fournie pour vérifier la configuration.
// Appelé depuis l'interface admin (bouton "Envoyer un test").

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  let email = '';
  try { const b = await req.json(); email = (b.email || '').trim(); } catch (_) { /* ignore */ }
  if (!email) return json({ error: 'Adresse email manquante.' }, 400);

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: cfg } = await sb.from('notification_config').select('*').eq('id', 1).single();
  if (!cfg) return json({ error: 'Configuration introuvable. Exécutez d\'abord la migration 013.' }, 404);

  const now = new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short', timeZone: 'America/Montreal' });
  const subject = '[OPTILAB] Email de test';
  const provider = cfg.provider === 'resend' ? 'Resend' : `SMTP (${cfg.smtp_host})`;
  const body = `OPTILAB — Email de test\n${'═'.repeat(38)}\n\nDate : ${now}\n\nCeci est un email de test envoyé depuis l'interface de configuration OPTILAB.\nSi vous recevez ce message, la configuration est correcte.\n\nFournisseur : ${provider}\n\n${'═'.repeat(38)}\nMessage généré automatiquement — Ne pas répondre.`;
  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px">
<tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:#0F2A3D;border-radius:8px 8px 0 0;padding:24px 28px">
    <div style="color:#fff;font-size:20px;font-weight:700">OPTILAB</div>
    <div style="color:rgba(255,255,255,.6);font-size:12px;margin-top:3px">Email de test</div>
  </td></tr>
  <tr><td style="background:#fff;padding:28px;border-radius:0 0 8px 8px">
    <div style="background:#F0FDF4;border:1px solid #BBF7D0;border-left:4px solid #16A34A;border-radius:6px;padding:16px 20px;margin-bottom:20px">
      <div style="color:#15803D;font-weight:700;font-size:14px;margin-bottom:4px">✓ Configuration valide</div>
      <div style="color:#166534;font-size:13px">Vous recevez ce message, l'envoi d'emails est correctement configuré.</div>
    </div>
    <table style="border-collapse:collapse;width:100%">
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Date</td><td style="font-size:13px;color:#111">${now}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Fournisseur</td><td style="font-size:13px;color:#111">${provider}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Destinataire</td><td style="font-size:13px;font-family:monospace;color:#111">${email}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:14px">Message généré automatiquement par OPTILAB — Ne pas répondre</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

  let status = 'sent';
  let errorMsg: string | null = null;

  try {
    if (cfg.provider === 'resend') {
      if (!cfg.resend_api_key) throw new Error('Clé API Resend non configurée.');
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${cfg.resend_api_key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: cfg.smtp_from || 'OPTILAB <onboarding@resend.dev>', to: [email], subject, text: body, html }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
    } else {
      if (!cfg.smtp_host) throw new Error('Serveur SMTP non configuré.');
      const client = new SMTPClient({
        connection: {
          hostname: cfg.smtp_host,
          port: cfg.smtp_port || 587,
          tls: cfg.smtp_port === 465,
          auth: { username: cfg.smtp_user, password: cfg.smtp_pass },
        },
      });
      await client.send({ from: cfg.smtp_from || cfg.smtp_user, to: email, subject, content: body, html });
      await client.close();
    }
  } catch (e: unknown) {
    status = 'error';
    errorMsg = e instanceof Error ? e.message : String(e);
  }

  await sb.from('notification_log').insert({
    batch_id: crypto.randomUUID(), type: 'test', to_email: email,
    subject, body_text: body, status, error_message: errorMsg,
    sent_at: new Date().toISOString(), queue_ids: [],
  });

  if (status === 'error') return json({ error: errorMsg }, 500);
  return json({ ok: true });
});
