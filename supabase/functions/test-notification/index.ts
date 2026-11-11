// Edge Function : test-notification
// Envoie un email de test à l'adresse fournie pour vérifier la configuration.
// Appelé depuis l'interface admin (bouton "Envoyer un test").
//
// Accès : jeton utilisateur valide + profil ADMIN ACTIF (sans changement de mot
// de passe en attente), contrôlés dans le code (_shared/autorisation.ts).
// Identifiants d'envoi : lus dans le Vault (get_app_secret), jamais dans
// Deno.env (_shared/secrets.ts, _shared/courriel.ts).

import { exigerDemandeur } from '../_shared/autorisation.ts';
import { clientAdmin } from '../_shared/clients.ts';
import { entetesCors, reponsePreliminaire } from '../_shared/cors.ts';
import { envoyerCourriel, type ConfigCourriel } from '../_shared/courriel.ts';
import { ErreurHttp, reponseErreur, reponseJson } from '../_shared/http.ts';
import { creerLecteurSecrets, ErreurSecret } from '../_shared/secrets.ts';

// Adresse simple, une seule, sans espace ni séparateur de liste.
const MOTIF_EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

function esc(s: unknown): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

Deno.serve(async (req: Request) => {
  const origine = req.headers.get('Origin');
  const CORS = entetesCors(origine);
  const json = (data: unknown, status = 200) => reponseJson(data, status, CORS);

  if (req.method === 'OPTIONS') return reponsePreliminaire(origine);
  if (req.method !== 'POST') return json({ error: 'Method Not Allowed' }, 405);

  try {
    const sb = clientAdmin();

    // ── Authentification obligatoire : JWT valide + admin actif (M-1) ────────
    await exigerDemandeur(req, sb, { roles: ['admin'] });

    let email = '';
    try {
      const b = await req.json();
      email = typeof b?.email === 'string' ? b.email.trim() : '';
    } catch (_) { /* corps absent ou invalide : traité comme adresse manquante */ }
    if (!email) throw new ErreurHttp(400, 'Adresse email manquante.');
    if (email.length > 254 || !MOTIF_EMAIL.test(email)) throw new ErreurHttp(400, 'Adresse email invalide.');

    const { data: cfg, error: cfgErr } = await sb.from('notification_config').select('*').eq('id', 1).maybeSingle();
    if (cfgErr) throw new Error(`lecture de notification_config (${cfgErr.code ?? '?'}) : ${cfgErr.message}`);
    if (!cfg) throw new ErreurHttp(404, 'Configuration des notifications introuvable.');

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
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Date</td><td style="font-size:13px;color:#111">${esc(now)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Fournisseur</td><td style="font-size:13px;color:#111">${esc(provider)}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#888;font-size:12px">Destinataire</td><td style="font-size:13px;font-family:monospace;color:#111">${esc(email)}</td></tr>
    </table>
    <p style="margin:20px 0 0;font-size:11px;color:#9CA3AF;border-top:1px solid #E5E7EB;padding-top:14px">Message généré automatiquement par OPTILAB — Ne pas répondre</p>
  </td></tr>
</table></td></tr></table>
</body></html>`;

    let status = 'sent';
    let errorMsg: string | null = null;

    try {
      await envoyerCourriel(
        cfg as ConfigCourriel,
        creerLecteurSecrets(sb),
        { a: email, sujet: subject, texte: body, html },
        'OPTILAB <onboarding@resend.dev>',
      );
    } catch (e: unknown) {
      status = 'error';
      // Lecture du Vault en échec : message générique (détail déjà journalisé).
      // Sinon, le message du fournisseur aide l'admin à corriger la configuration
      // ; il ne contient jamais la valeur d'un secret.
      errorMsg = e instanceof ErreurSecret
        ? 'Lecture des identifiants d\'envoi impossible (Vault).'
        : e instanceof Error ? e.message : String(e);
    }

    const { error: logErr } = await sb.from('notification_log').insert({
      batch_id: crypto.randomUUID(), type: 'test', to_email: email,
      subject, body_text: body, status, error_message: errorMsg,
      sent_at: new Date().toISOString(), queue_ids: [],
    });
    if (logErr) console.error('[test-notification] journalisation impossible', logErr.code ?? '', logErr.message);

    if (status === 'error') return json({ error: errorMsg }, 500);
    return json({ ok: true });
  } catch (err) {
    return reponseErreur('test-notification', err, CORS);
  }
});
