// Module partagé : envoi d'un courriel via Resend (API HTTP) ou SMTP.
// Utilisé par send-notifications (cron) et test-notification (bouton admin).
//
// Les identifiants (RESEND_API_KEY, SMTP_PASS) viennent du Vault par le
// lecteur de secrets fourni par l'appelant, jamais de Deno.env.
// L'hôte, le port et l'utilisateur SMTP viennent de notification_config ;
// la base efface SMTP_PASS du Vault dès que l'un d'eux change, pour qu'un admin
// ne puisse pas rediriger le mot de passe vers un serveur qu'il contrôle.
//
// Dépendance : denomailer, module deno.land/x à version exacte (immuable une
// fois publié, empreintes dans deno.lock). Seule dépendance distante restante
// hors npm ; elle n'est chargée que par ce module. Spécificateur complet écrit
// ici car le déploiement ne lit pas supabase/functions/deno.json (cf. clients.ts).

// deno-lint-ignore no-import-prefix -- voulu : le déploiement ignore deno.json.
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';
import type { LecteurSecrets } from './secrets.ts';

/** Colonnes de notification_config utiles à l'envoi. */
export interface ConfigCourriel {
  provider: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_user: string | null;
  smtp_from: string | null;
}

export interface Courriel {
  a: string;
  sujet: string;
  texte: string;
  html: string;
}

// URL figée : la clé Resend ne peut partir que vers Resend.
const URL_RESEND = 'https://api.resend.com/emails';

function tronquer(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max)}…` : texte;
}

/**
 * Envoie un courriel ; lève une Error lisible par un admin en cas d'échec
 * (message du fournisseur tronqué, jamais la valeur d'un secret).
 */
export async function envoyerCourriel(
  cfg: ConfigCourriel,
  lireSecret: LecteurSecrets,
  courriel: Courriel,
  expediteurParDefaut: string,
): Promise<void> {
  if (cfg.provider === 'resend') {
    const cle = await lireSecret('RESEND_API_KEY');
    if (!cle) throw new Error("RESEND_API_KEY non configurée (Configuration > Notifications dans l'UI admin).");
    const res = await fetch(URL_RESEND, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${cle}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: cfg.smtp_from || expediteurParDefaut,
        to: [courriel.a],
        subject: courriel.sujet,
        text: courriel.texte,
        html: courriel.html,
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status} : ${tronquer(await res.text(), 300)}`);
    await res.body?.cancel();
    return;
  }

  if (!cfg.smtp_host) throw new Error('Serveur SMTP non configuré.');
  const motDePasse = await lireSecret('SMTP_PASS');
  if (!motDePasse) {
    // Absent, ou effacé par la base après un changement d'hôte, de port ou
    // d'utilisateur SMTP : erreur de configuration, à ressaisir par un admin.
    throw new Error(
      "Mot de passe SMTP absent (il est effacé à chaque changement d'hôte, de port ou d'utilisateur SMTP) : "
        + "ressaisissez-le dans Configuration > Notifications de l'UI admin.",
    );
  }
  const client = new SMTPClient({
    connection: {
      hostname: cfg.smtp_host,
      port: cfg.smtp_port || 587,
      tls: cfg.smtp_port === 465,
      auth: { username: cfg.smtp_user ?? '', password: motDePasse },
    },
  });
  try {
    await client.send({
      from: cfg.smtp_from || cfg.smtp_user || '',
      to: courriel.a,
      subject: courriel.sujet,
      content: courriel.texte,
      html: courriel.html,
    });
  } finally {
    try { await client.close(); } catch (_) { /* connexion déjà fermée */ }
  }
}
