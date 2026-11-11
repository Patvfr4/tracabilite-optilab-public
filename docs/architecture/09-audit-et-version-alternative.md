# Audit complet & version alternative sans dépendance tierce

> Document d'audit produit sur la branche `audit-refonte-backend`.
> Portée : `public/` (frontend SPA), `supabase/` (schéma, migrations, edge functions), `docs/`.
> Deux volets : **(A) Audit + optimisations** de l'existant, **(B) Version alternative** auto-hébergée (Postgres classique + API custom + Auth.js) avec **deux propositions d'hébergement**.
>
> **Octobre 2026 : la partie B est abandonnée.** Le projet reste sur Supabase ; le prototype `alt/` a été retiré du dépôt. La partie B est conservée pour mémoire.
>
> **Novembre 2026 : chantier « secrets et durcissement ».** Statut des constats de l'audit de sécurité suivant, et des points restés ouverts ci-dessous (M-4, F-1…F-4) : voir la [partie D](#partie-d--chantier--secrets-et-durcissement--novembre-2026).

---

## Partie A — Audit de l'existant

### A.0 Verdict d'ensemble

L'application est **mûre, bien documentée et globalement bien sécurisée** (échappement XSS systématique, en-têtes HTTP exemplaires, login durci avec rate-limit + captcha, durcissement RLS progressif sur 20 migrations). La documentation `docs/architecture/` est d'une rigueur remarquable.

Mais l'audit fait ressortir **une faille critique d'élévation de privilèges vérifiée**, plusieurs failles élevées/moyennes autour de la RLS et des edge functions, et une dette structurelle (duplication intra/hors-grappe, état 100 % global) qui pèsera sur la maintenance. Aucune de ces failles n'est mentionnée dans le doc de sécurité — c'est le principal écart doc/code.

### A.1 Sécurité — classée par sévérité

> **Statut au 2026-07-25 (BETA 1.10.2)** : C-1, E-1, E-2, M-1, M-2, M-3, M-5 et l'incohérence XSS `kpi.js` sont **corrigés** (migration `046` + durcissement des edge functions + `schema.sql`). Restent ouverts : M-4 (réglages dashboard, hors dépôt) et F-1…F-4 (faibles).
>
> **Statut au 2026-11-10** : M-4 corrigé ; F-1…F-4 détaillés ci-dessous (un seul reste ouvert, la CSP `unsafe-inline`).

| # | Sévérité | Statut | Constat | Emplacement |
|---|---|---|---|---|
| **C-1** | 🔴 **Critique** | ✅ Corrigé | **Auto-promotion admin.** La policy UPDATE de `profiles` a un `WITH CHECK (… OR id = auth.uid())` sans restriction de colonne, aucun trigger `BEFORE UPDATE`, et `current_role_name()` lit le rôle dans la table. Un technicien peut `update({role:'admin'})` sur sa propre ligne → admin. Idem `labo_ids` → accès à tous les labos. **Exploitable avec la clé publique.** → trigger `protect_profile_columns` (mig. 046). | [schema.sql:1269-1273](../../supabase/schema.sql) |
| **E-1** | 🟠 Élevé | ✅ Corrigé | `manage-user` : la garde de rôle à la création ne visait que `superviseur_labo`. Un `superviseur_grappe` pouvait créer un compte `admin`. → contrôle hiérarchique généralisé. | [manage-user/index.ts](../../supabase/functions/manage-user/index.ts) |
| **E-2** | 🟠 Élevé | ✅ Corrigé | `envois_audit` en SELECT `USING(true)` : tout authentifié lisait `old_data`/`new_data` de **tous** les labos. → cloisonnement par labo (mig. 046). | [schema.sql:1284](../../supabase/schema.sql) |
| **M-1** | 🟡 Moyen | ✅ Corrigé | `test-notification` : aucune vérification d'auth. Relais d'email arbitraire. → JWT + rôle admin obligatoires. | [test-notification/index.ts](../../supabase/functions/test-notification/index.ts) |
| **M-2** | 🟡 Moyen | ✅ Corrigé | `send-notifications` (`--no-verify-jwt`) : endpoint public renvoyant les **adresses email** des destinataires. → réponse sans emails + secret partagé optionnel. | [send-notifications/index.ts](../../supabase/functions/send-notifications/index.ts) |
| **M-3** | 🟡 Moyen | ✅ Corrigé | `manage-user` : un `superviseur_labo` pouvait injecter `labo_ids:[autres labos]`. → validation des `labo_ids`. | [manage-user/index.ts](../../supabase/functions/manage-user/index.ts) |
| **M-4** | 🟡 Moyen | ✅ Corrigé (2026-11) | `config.toml` : `enable_signup=true` et `minimum_password_length=6`. → `[auth] enable_signup = false` (le fournisseur Email, `[auth.email] enable_signup`, reste activé : le couper bloquerait toute connexion), `minimum_password_length = 12` ; réglages de console équivalents dans la check-list de [01-supabase.md §7](../deploiement/01-supabase.md), à vérifier après chaque installation. | [config.toml](../../supabase/config.toml) |
| **M-5** | 🟡 Moyen | ✅ Corrigé | CORS `*` sur `manage-user`, `test-notification`. → allow-list alignée sur `auth-gate`. (`set-secret` reste `*` mais inerte/admin-only.) | edge functions |
| F-1…F-4 | ⚪ Faible | voir détail | Le regroupement couvrait trois sujets : | — |
| ↳ CSP | ⚪ Faible | ⏳ Ouvert | CSP `unsafe-inline` (mitigé par échappement selon le contexte de sortie). cdnjs a été retiré et les scripts tiers épinglés avec SRI (2026-11), mais `unsafe-inline` demeure : voir [04-securite.md §12](04-securite.md). | `public/_headers` |
| ↳ `service_role_key` | ⚪ Faible | ✅ Résolu (2026-11) | Colonne `service_role_key` ayant transité en base (rotation conseillée). → Les fonctions n'utilisent plus que les nouvelles clés (`SUPABASE_SECRET_KEYS`), les clés héritées sont désactivées et la base est reconstruite sur un nouveau projet : l'ancienne clé ne donne plus accès à rien une fois l'ancien projet supprimé. | `_shared/cles.ts` |
| ↳ comptes `is_test` | ⚪ Faible | ✅ Résolu (2026-11) | Comptes `is_test` à vérifier en prod. → Plus aucun mot de passe de démonstration dans le dépôt ni la documentation (mot de passe aléatoire par compte, affiché une fois) ; plus d'exemption de longueur côté serveur ; règle : jamais de seed de démonstration en production. Contrôle : `SELECT employee_id FROM profiles WHERE is_test` → 0 ligne en production. | `supabase/seed_demo_users.sql` |
| **N-1** | 🟡 Moyen | ✅ Corrigé | **Notifications hors-grappe en double.** Un trigger actif `trg_hgrappe_notif` existait en production **hors versionnement** (absent de `schema.sql`, des migrations et de l'archive) et insérait un `hg_nc` au passage du statut à « Problème » — alors que les **deux seuls** chemins qui posent ce statut (`confirm_envoi_hgrappe()` et la saisie de fax) l'insèrent déjà. Chaque non-conformité produisait donc **deux** lignes dans `notification_queue`, soit un événement compté deux fois dans le récapitulatif. → migration `049` supprime trigger et fonction. | `049` |
| **N-2** | 🟡 Moyen | ✅ Corrigé | **Base non reconstructible depuis le dépôt.** Corollaire du précédent : les migrations `033` et `043` référencent cette fonction jamais définie, si bien que rejouer les migrations sur une base vierge **échoue** — ce qui compromettait la reprise après sinistre et la création d'un environnement de développement. Découvert en exécutant réellement le bootstrap de la version alternative. Résolu par `049` ; les références orphelines restantes étaient neutralisées par `alt/db/bootstrap.sh` (retiré avec la version alternative). À noter : l'hypothèse initiale d'une migration `033` partiellement appliquée (donc de `REVOKE` manquants) a été **vérifiée et écartée**. | `033:64,177`, `043:42` |
| **N-3** | 🔴 **Élevé** | ✅ Corrigé | **Fonctions internes exécutables sans être connecté.** PostgreSQL accorde `EXECUTE` à **`PUBLIC`** par défaut, et `anon`/`authenticated` en héritent : les `REVOKE … FROM anon` des migrations `033`, `043`, `047` et `050` étaient donc **sans effet**. Preuve : `count_recent_login_failures` est la seule fonction non signalée par le linter, et la seule dont la migration `027` révoquait aussi `PUBLIC`. **Impact vérifié en test** : un appelant anonyme, muni de la seule clé publique, invoquait `/rest/v1/rpc/_purge_envois_audit` et **détruisait le journal d'audit** (5 lignes → 0). Étaient aussi exposées `_detect_alarm_envois` et `_trigger_send_notifications`. → migration `052` : révocation sur `PUBLIC` (hors fonctions d'extension, dont les défauts de colonnes dépendent) puis attribution explicite par rôle. Corrige au passage le `search_path` mutable de `_role_rank`. | `052` |

**Déjà bien fait** : `escapeHtml()` utilisé ~196×, en-têtes HTTP (CSP stricte, HSTS, frame-ancestors none), `auth-gate` (rate-limit 5/15 min + Turnstile + message générique anti-énumération + CORS allowlist), confirmation HG par token UUID 128 bits ou numéro+code rate-limité, `search_path` figé sur toutes les fonctions `SECURITY DEFINER`, aucun secret applicatif en dur dans le front.

### A.2 Backend / base de données

- **Modèle** : 23 tables, numérotation métier propre (séquences + triggers `peek_next_*`), contraintes d'intégrité soignées, soft-delete, bons index partiels/GIN. **Faiblesses** : ENUMs modélisés en CHECK texte partout (chaque évolution = DROP/ADD CONSTRAINT) ; **triple source d'appartenance labo** (`profiles.labo_id` + `labo_ids[]` + `user_lab_memberships`) gérée par un fallback en cascade dans `current_labo_ids()` — dette à unifier ; colonnes dénormalisées `*_par_nom` qui divergeront.
- **Index FK manquants** : `notification_queue(envoi_hg_id, exp_labo_id)` (sollicités par le cron 044), `envois(cree_par_id, annule_par_id)`, `envois_hgrappe(cree_par_id)`, `bons_depart(cree_par_id)`, `notification_log(labo_id)`.
- **RPC** : ~30 fonctions PL/pgSQL, dont **15 exposées au front** (11 authentifiées + 4 anon). Bien défensives mais **3 surcharges coexistantes** de `create_envoi_hsilp`/`create_envoi_hgrappe` (dette).
- **Code mort bugué** : la détection d'alarme de `send-notifications` lit la colonne `numero_liste` **supprimée en migration 016** → `SELECT` en échec silencieux. La logique a été redéplacée en SQL (`_detect_alarm_envois`, 044) mais le code mort subsiste.
- **Rétention** : `envois_audit` ≈ 438 Mo/an à 200 envois/j (~85 % du stockage), **dépasse la limite Free en < 1 an** et **n'a aucune purge** (contrairement aux tables de notifications/login). Ajouter un cron de purge ou partitionner par mois.

### A.3 Frontend

- **Architecture hybride** : `app.js` (script global, tout l'état en `var` sur `window`) + `main.js` (seul ES module, ré-expose ~250 fonctions sur `window` pour alimenter 193 `onclick=` inline). `state.js` n'est **pas un store** — juste des getters/setters vers `window.*`, sans réactivité. Migration inachevée assumée dans les commentaires.
- **Duplication massive** intra (`envois.js` 108K) ↔ hors-grappe (`hgrappe.js` 71K) : deux implémentations quasi parallèles du même domaine (paires `classeBadge`/`classeBadgeHG`, `loadHistPage`/`loadHGHistPage`…). L'algo de rendu groupé-par-date est **triplé** dans `envois.js` seul. Potentiel de plusieurs milliers de lignes économisées par factorisation.
- **XSS** : globalement **faible risque** (échappement systématique). Seule incohérence : `kpi.js:82-83` injecte `d.code`/`d.libelle` sans `escapeHtml`.
- **Gestion d'erreurs** : 5 blocs `catch(){}` **vides**, dont `loadEnvois` — une panne réseau au chargement de la liste principale est totalement silencieuse. Le wrapper `sbCall()` (détection session expirée) n'est utilisé que sur les mutations, pas les lectures.
- **Accessibilité** : lignes de tableau `<tr onclick>` sans `tabindex`/`role`/clavier → consultation d'un envoi **impossible sans souris**.

### A.4 Optimisations concrètes prioritaires

> **Statut au 2026-07-25 (BETA 1.10.2)** : les optimisations de priorité 1–2 sont **livrées** (borne `loadEnvois`, Realtime coalescé + filtré par labo, lazy-load Chart.js/ZXing, index SQL + purge `envois_audit` via `047`, fusion des compteurs via `048`) ainsi que la mutualisation du rendu groupé (`renderDayGroups`). Restent ouverts : le miroir complet intra/HG et le bundling.

| Priorité | Statut | Optimisation | Emplacement |
|---|---|---|---|
| 1 | ✅ Livré | **Borne `loadEnvois`** (`.limit(2000)`) — plus de chargement non plafonné | [envois.js](../../public/js/envois.js) |
| 1 | ✅ Livré | **Realtime coalescé + filtré** — debounce 300 ms des rafales, et pour un non-grappe on ignore les changements ne touchant pas son labo (plus de reload complet sur l'activité des autres labos) | [envois.js](../../public/js/envois.js) `subscribeRT` |
| 2 | ✅ Livré | **Lazy-load `chart.js` + `@zxing/library`** via `loadScriptOnce()` (chargés à la 1re ouverture KPI / 1er scan, plus au démarrage pour tous) | [utils.js](../../public/js/utils.js), [kpi.js](../../public/js/kpi.js), [bons-depart.js](../../public/js/bons-depart.js), [index.html](../../public/index.html) |
| 2 | ✅ Livré | **Index SQL manquants** + **purge `envois_audit`** (rétention 12 mois, cron mensuel) | migration `047` |
| 2 | ✅ Livré | **Fusion des compteurs** d'historique (3–4 `count exact` → 1 RPC agrégée `count(*) FILTER`) | migration `048`, [envois.js](../../public/js/envois.js), [hgrappe.js](../../public/js/hgrappe.js) |
| 3 | ✅ Déjà OK | ~~Bug bwip-js HG~~ — vérification : `print-hg.js` **appelle bien** `await _ensureBwip()` avant tout usage de `bwipjs` (le constat initial était erroné) | [print-hg.js:41](../../public/js/print-hg.js) |
| 3 | ◑ Partiel | **Factoriser** — le **triplet render-groupé** + son miroir HG (`renderDayGroups()`, [utils.js](../../public/js/utils.js)) et les **7 pagers** (`renderPager()`, [ui.js](../../public/js/ui.js)) sont mutualisés. Le **miroir complet intra/HG** (badges, chargement, mapping) reste ouvert — chantier volumineux à mener avec une phase de test dédiée. | envois.js / hgrappe.js / utils.js / ui.js |
| 3 | ⏸️ Écarté (décision) | **Bundling + fingerprinting** — `/js/` et `/css/` restent en `max-age=300` faute de versionnage (`/lib/*` et `/img/*` sont **déjà** en 30 jours). **Décision : ne pas introduire d'étape de build** dans un projet volontairement sans toolchain. Gain réel modeste (modules multiplexés en HTTP/2, revalidations 304 légères) ; le bénéfice principal serait la minification au premier chargement. À reconsidérer avec la version alternative (Partie B), qui disposera de toute façon d'un build. | _headers |

**Hors tableau A.4 — défauts relevés en A.3, également corrigés :**

| Statut | Correctif |
|---|---|
| ✅ | **Gestion d'erreurs** — les `catch(){}` vides de `loadEnvois` / `loadEnvoisHG` / `loadExtLabs` masquaient toute panne réseau (liste vide sans message). L'erreur est remontée et les données précédentes conservées. |
| ✅ | **Accessibilité clavier** — les lignes de tableau cliquables sont focusables (`tabindex`) et activables par Entrée/Espace, avec focus visible. La consultation d'un envoi ne nécessite plus la souris. |
| ✅ | **Pagination** — garde `\|\| 1` rendu opérant (priorité d'opérateurs) : plus de « Page 1 / 0 ». |
| ✅ | **XSS `kpi.js`** — libellés ICR échappés (cf. §A.1). |

**Vérification effectuée** : chargement réel de l'application (serveur statique local) confirmant que le graphe de modules se résout et que Chart.js / ZXing ne sont **plus** chargés au démarrage ; test d'équivalence automatisé prouvant que `renderDayGroups()` produit une sortie **identique** à l'algorithme dupliqué d'origine (3 modes + liste vide) ; test des cas limites de `renderPager()`.

**Correctifs sécurité à traiter immédiatement, indépendamment de toute refonte** : C-1 (trigger `BEFORE UPDATE` protégeant `role`/`labo_id`/`labo_ids`/`active`), E-1/E-2/M-1/M-2/M-3. Ce sont des correctifs de quelques lignes chacun sur l'application **actuelle**.

---

## Partie B — Version alternative auto-hébergée

> **Abandonnée (octobre 2026)** : le projet reste sur Supabase et le prototype `alt/` a été retiré du dépôt. Section conservée pour mémoire.

Objectif : **même application, mêmes fonctionnalités**, mais un backend autonome **sans service tiers** (ni Supabase, ni Resend, ni Cloudflare comme dépendances dures). Le front reste quasi identique ; c'est la couche d'accès aux données qui change.

### B.1 Ce que Supabase fournit aujourd'hui et par quoi le remplacer

| Brique Supabase | Rôle actuel | Remplacement auto-hébergé |
|---|---|---|
| **PostgreSQL managé** | Base de données | **PostgreSQL classique** (même moteur — migration quasi transparente) + extensions `pgcrypto`, `uuid-ossp` |
| **PostgREST** (`.from()`, `.rpc()`) | API REST auto-générée — 18 tables, 15 RPC | **API custom** Node/TypeScript (~48-55 endpoints) — Fastify ou Hono |
| **GoTrue (Auth)** | Login password, JWT, refresh, API admin | **Auth.js (NextAuth core) ou Lucia** + `bcrypt`/`argon2` — JWT maison |
| **RLS** (auth.uid/jwt) | Autorisation ligne par ligne | **Couche d'autorisation applicative** (middleware) reprenant la matrice de rôles + cloisonnement labo. *(Option : conserver la RLS en passant `set_config('request.jwt.claims')` par requête.)* |
| **Edge Functions** (5 Deno) | login-gate, gestion users, emails, test, secrets | **Routes de l'API custom** (login-gate, users) + **worker** (emails) |
| **Realtime** (1 canal, 2 tables) | Suivi live des envois | **WebSocket/SSE** alimenté par `LISTEN/NOTIFY` Postgres — ou polling |
| **pg_cron + pg_net** (2 jobs) | Envoi horaire + détection alarmes | **Cron système** (systemd timer / node-cron) appelant le worker |
| **Vault** | Coffre secrets (**déjà abandonné**, inerte) | Variables d'environnement / fichier `.env` chiffré / Docker secrets |
| **Storage** | — (**non utilisé**) | Rien à porter |
| **Resend** | Envoi email notifications | **SMTP direct** (Nodemailer) — le serveur mail de l'établissement (déjà supporté en option via denomailer) |
| **Cloudflare Turnstile** | Captcha login | **hCaptcha auto-hébergeable**, ou rate-limit seul, ou captcha maison léger |
| **Cloudflare Pages** | Hébergement statique + CDN | **Nginx/Caddy** servant `public/` (reverse proxy + TLS + en-têtes) |

**Points d'attention majeurs du portage** :
1. **L'autorisation est aujourd'hui dans la RLS** (basée sur `auth.uid()`). En sortant de GoTrue, toute la sécurité d'accès doit être réimplémentée en couche applicative — c'est le poste de travail #1 et le plus risqué (un bug = fuite silencieuse). *Recommandation : garder Postgres + la RLS existante et faire dialoguer l'API via un rôle qui pose `request.jwt.claims` — on réutilise ~40 policies déjà éprouvées au lieu de tout réécrire.*
2. **~30 fonctions PL/pgSQL** encapsulent la logique métier (numérotation HSILP/HG, annulation, bons de départ, KPI, confirmation HG). Elles peuvent **rester dans Postgres** et être appelées par l'API → gros gain, on ne réécrit pas la logique.
3. **Le front change peu** : remplacer le client `supabase-js` par un petit client `fetch` maison (mêmes signatures d'appel), réécrire le login et le canal Realtime. Le reste (`escapeHtml`, rendu, panels) est inchangé.

### B.2 Stack cible proposée

```
┌─────────────────────────────────────────────────────────┐
│  Navigateur — SPA (public/ inchangé à 90%)              │
│  client fetch maison  ·  WebSocket  ·  Turnstile→hCaptcha│
└───────────────┬─────────────────────────────────────────┘
                │ HTTPS
┌───────────────▼─────────────────────────────────────────┐
│  Reverse proxy : Caddy (TLS auto) ou Nginx              │
│  sert public/ (statique) + proxifie /api                 │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│  API Node/TypeScript (Fastify)                          │
│   • Auth.js/Lucia — JWT, refresh, bcrypt/argon2          │
│   • ~50 routes REST → appellent les RPC Postgres         │
│   • middleware d'autorisation (rôles + cloisonnement)    │
│   • WebSocket (LISTEN/NOTIFY)                            │
│  Worker planifié (node-cron / systemd timer)            │
│   • emails groupés (Nodemailer/SMTP) + détection alarmes │
└───────────────┬─────────────────────────────────────────┘
                │
┌───────────────▼─────────────────────────────────────────┐
│  PostgreSQL classique                                   │
│   schéma + ~30 fonctions PL/pgSQL conservés             │
│   RLS conservée (option recommandée)                     │
└─────────────────────────────────────────────────────────┘
```

**Alternative « tout Postgres, moins de code »** : réhéberger PostgREST + GoTrue en conteneurs (ils sont open-source et auto-hébergeables). On sort alors de Supabase *Cloud* sans réécrire l'API ni l'auth — mais on garde une dépendance à ces deux briques (que le cahier des charges veut éviter). À arbitrer selon l'objectif réel : « quitter le SaaS Supabase » (facile, conteneurs) vs « zéro dépendance à l'écosystème Supabase » (réécriture API + auth).

### B.3 Effort de portage (ordre de grandeur)

| Lot | Contenu | Charge indicative |
|---|---|---|
| Base | Dump/restore Postgres, conserver schéma + RPC + RLS | Faible (1-2 j) |
| API REST | ~50 endpoints wrappant tables + RPC | Élevé (le gros du travail) |
| Auth | Auth.js/Lucia, login-gate (rate-limit + captcha), refresh, changement mdp, API admin users | Moyen-élevé (sécurité critique) |
| Autorisation | Middleware rôles + cloisonnement labo (ou réutilisation RLS via `set_config`) | Moyen (risqué — tests dédiés) |
| Temps réel | WebSocket + LISTEN/NOTIFY (1 canal) | Faible |
| Worker email | Nodemailer/SMTP + templates HTML (déjà écrits) + cron + détection alarmes | Moyen |
| Front | Client fetch maison, login, Realtime, config par domaine | Moyen |
| Infra | Docker Compose, reverse proxy, sauvegardes, TLS | Moyen |

> Ce livrable **corrige aussi les failles au passage** : l'API custom impose l'auth sur toutes les routes (règle M-1/M-2), le middleware d'autorisation ferme C-1/E-1/E-2/M-3 par construction, et la purge d'audit devient un simple job du worker.

---

## Partie C — Deux propositions d'hébergement

Contexte déterminant : **données de santé** (échantillons biologiques, CISSS Bas-Saint-Laurent). Au Québec, la **Loi 25** encadre les renseignements personnels de santé ; l'hébergement doit rester sous contrôle et, idéalement, en territoire canadien. Ce critère prime sur le coût.

### Option 1 — VPS souverain (cloud canadien, auto-géré)

**Principe** : un VPS chez un hébergeur avec datacenter au Canada (ex. OVHcloud Beauharnois QC, ou équivalent), toute la stack en **Docker Compose** (Postgres + API + worker + Caddy).

| Critère | Évaluation |
|---|---|
| Souveraineté | ✅ Données au Canada, sous contrôle du projet |
| Coût | 💚 Faible — un VPS 4 vCPU / 8 Go suffit largement aux volumes (~73k envois/an) |
| Mise en œuvre | 🟢 Rapide — `docker compose up`, TLS auto via Caddy |
| Exploitation | 🟡 À la charge du projet : sauvegardes, mises à jour OS, monitoring, restauration |
| Réversibilité | ✅ Totale — tout est en conteneurs portables |
| Risque | 🟡 Le VPS est un point unique ; prévoir sauvegardes chiffrées hors-site + plan de restauration testé |

**Recommandé pour** : démarrage rapide, maîtrise des coûts, indépendance vis-à-vis de la DSI, gouvernance légère.

### Option 2 — Serveur interne / infrastructure de l'établissement (on-premise CISSS)

**Principe** : déploiement de la même stack Docker sur un serveur (ou VM) **hébergé dans l'infrastructure du CISSS**, derrière le réseau de l'établissement.

| Critère | Évaluation |
|---|---|
| Souveraineté | ✅✅ Maximale — les données ne quittent jamais le réseau de l'établissement |
| Coût | 💚 Marginal si l'infra existe déjà (pas de VPS à payer) |
| Conformité | ✅✅ Alignement direct avec les politiques TI du CISSS / Loi 25 |
| Mise en œuvre | 🔴 Plus lente — dépend de la DSI (provisionnement VM, ouverture de ports, TLS interne) |
| Exploitation | 🟢 Sauvegardes/monitoring assurés par la DSI (procédures existantes) |
| Accès externe | 🟡 La page publique de confirmation HG (labos externes) nécessite une exposition maîtrisée (reverse proxy en DMZ) — à cadrer avec la DSI |
| Dépendance | 🟡 Rythme et disponibilité liés à la DSI |

**Recommandé pour** : exigence de conformité maximale, infrastructure et équipe TI déjà en place, tolérance à un délai de mise en œuvre plus long.

### Comparatif de synthèse

| | Option 1 — VPS souverain | Option 2 — On-premise CISSS |
|---|---|---|
| **Contrôle des données** | Élevé (Canada) | Maximal (réseau interne) |
| **Coût récurrent** | Faible (VPS) | Marginal (infra existante) |
| **Rapidité de mise en route** | Rapide | Lente (DSI) |
| **Charge d'exploitation** | Sur le projet | Sur la DSI |
| **Exposition de la confirmation HG** | Native (public) | À cadrer (DMZ) |
| **Meilleur si…** | autonomie + rapidité | conformité + infra en place |

**Recommandation** : commencer sur **Option 1 (VPS souverain canadien)** pour valider la version alternative rapidement et à faible coût, avec un chemin de migration vers **Option 2 (on-premise)** une fois la DSI embarquée — les deux partagent le **même artefact Docker**, donc le passage de l'une à l'autre ne change pas l'application.

---

## Partie D — Chantier « secrets et durcissement » (novembre 2026)

> Audit de sécurité centré sur les secrets, l'authentification, la base, le client et la CI, suivi d'un chantier de correction. Décisions de l'utilisateur : la base est **reconstruite à neuf** depuis `supabase/schema.sql` (aucune migration de rattrapage) ; **tous les secrets applicatifs passent par le Vault** ; passage aux **nouvelles clés API** Supabase ; la MFA est **documentée** (options), pas implémentée ; le dépôt sera publié avec un historique neuf.
>
> Statuts : ✅ corrigé dans le dépôt · ⚙️ corrigé dans le dépôt, **action d'exploitation** à faire à l'installation · ◑ partiel · ⏳ ouvert · — sans objet. Détail des mesures : [04-securite.md](04-securite.md) ; procédures : [../deploiement/](../deploiement/).

### D.1 Authentification et comptes

| # | Sévérité | Statut | Constat | Traitement |
|---|---|---|---|---|
| EDGE-1, AUTH-1 | Élevée | ✅ | Un compte désactivé gardait ses pouvoirs dans les fonctions Edge (`profiles.active` non lu) et ses identifiants restaient valides | Autorisation commune (`_shared/autorisation.ts`) : profil **actif** exigé ; désactivation = bannissement Auth + révocation des sessions ; `active` modifiable par `manage-user` seulement |
| AUTH-2, CI-3 | Élevée | ⚙️ | Mot de passe commun des comptes de démonstration (dont un admin) écrit en clair dans le dépôt et la recette | Mot de passe aléatoire par compte, affiché une fois ; retiré de la documentation ; exemptions `is_test` supprimées côté serveur ; règle : aucun seed de démonstration en production. Le mot de passe historique reste compromis : l'ancien projet est remplacé |
| AUTH-3 | Moyenne | ✅ | Changement de mot de passe imposé appliqué seulement dans le navigateur | Fonctions d'autorité sans droit tant que le drapeau est levé ; `change_own_password` (API utilisateur : mot de passe identique refusé, session conservée) ; drapeau non modifiable par un utilisateur |
| AUTH-6 | Moyenne | ◑ | Politique de mot de passe faible (8 caractères côté client seulement) | 12 caractères partout (client, `manage-user`, console), 72 octets au plus ; complexité en console. Reste : changement volontaire sans ré-authentification |
| AUTH-8 | Moyenne | ⚙️ | Inscription publique probablement ouverte | `[auth] enable_signup = false` ; console : *Allow new users to sign up* désactivé (fournisseur Email laissé actif) |
| AUTH-9 | Moyenne | ◑ | Configuration Auth de production non versionnée ; `localhost` vise la production | Check-list de console ([01-supabase.md §7](../deploiement/01-supabase.md)) ; `config.js` en échec fermé. Reste : séparation dev/prod |
| AUTH-4 | Moyenne | ◑ | L'anti-force-brute repose sur le réglage CAPTCHA de la console | Consignes uniques et non contradictoires (jamais de clé de test ni de désactivation en production) ; détection des échecs conservée. Le réglage reste invérifiable depuis le dépôt |
| AUTH-5 | Moyenne | ⏳ | Aucune MFA, y compris pour les admins | Options comparées et recommandation (TOTP + exigence `aal2` serveur) : [04-securite.md §10](04-securite.md) |
| DOCS-8 | Moyenne | ◑ | Comptes tiers tenus par un seul compte personnel, aucune procédure de départ | Procédure de départ et règles (comptes nominatifs, MFA, ≥ 2 propriétaires) : [05-procedures-securite.md §3](../deploiement/05-procedures-securite.md). Reste : transfert du dépôt dans une organisation, second détenteur |

### D.2 Secrets et Vault

| # | Sévérité | Statut | Constat | Traitement |
|---|---|---|---|---|
| EDGE-3, AUTH-7, CRON-6 | Élevée / moyenne | ⚙️ | Fonctions sur les clés héritées `anon` / `service_role` (irrévocables une à une) ; clé `service_role` passée en clair en base | Nouvelles clés (`SUPABASE_SECRET_KEYS` / `SUPABASE_PUBLISHABLE_KEYS`), échec fermé, rotation sans coupure par nom de clé ; clés héritées à désactiver en console ; nouveau projet |
| VAULT-1 | Moyenne | ✅ | Reconstruite depuis `schema.sql`, la base aurait rouvert `get_app_secret` à `anon`/`authenticated` | Modèle de privilèges autonome (privilèges par défaut révoqués, `GRANT` explicites) ; listes exactes vérifiées en CI |
| VAULT-8, DOCS-5 | Moyenne | ⚙️ | Secrets stockés en clair en base par le passé, sans rotation tracée | Base et secrets neufs sur le nouveau projet ; registre des rotations ([05-procedures-securite.md §1.3](../deploiement/05-procedures-securite.md)). À faire : révoquer chez Resend / le fournisseur SMTP les anciennes clés |
| VAULT-3, CLIENT-1, DOCS-3 | Faible / moyenne | ✅ | Le client visait des colonnes supprimées ; la procédure documentée de saisie des clés échouait | Interface branchée sur les RPC du Vault ; `set-secret` supprimée ; documentation réécrite |
| VAULT-2 | Faible | ✅ | Rotation par `UPDATE` direct de `vault.secrets` | `vault.create_secret` / `vault.update_secret` uniquement |
| VAULT-4, EDGE-6 | Faible | ✅ | Deux sources (Vault puis environnement), repli silencieux, pas de suppression | Source unique, échec fermé, `delete_app_secret`, ressaisie après restauration documentée |
| VAULT-5 | Faible | ✅ | `app_secrets_audit` falsifiable par un admin | Policy d'insertion supprimée ; append-only pour tous les rôles de l'API |
| VAULT-6 | Faible | ✅ | Liste blanche ignorée en lecture, obsolète ; valeur peu validée | Liste blanche en lecture et écriture, sans `TURNSTILE_SECRET_KEY` ; valeur rognée, bornée, sans caractère de contrôle |
| VAULT-7, EDGE-5 | Faible | ✅ | Un admin pouvait récupérer `SMTP_PASS` en redirigeant `smtp_host` | `SMTP_PASS` effacé du Vault sur tout changement d'hôte, de port ou d'utilisateur |
| EDGE-4, EDGE-9 | Faible / info | — | `set-secret` : connexion PostgreSQL directe en `postgres`, CORS `*` | Fonction supprimée |
| GAP-2 | Faible | ✅ | Clé Resend sans portée imposée ; compte SMTP non cadré | *Sending access* restreinte au domaine, sous-domaine dédié recommandé ; compte de service SMTP ([03-resend.md](../deploiement/03-resend.md)) |
| DOCS-2, CI-6 | Moyenne / faible | ✅ | Inventaire des secrets contradictoire entre documents | Inventaire unique ([04-securite.md §5](04-securite.md)) ; `CLAUDE.md` aligné ; point ouvert du `CLAUDE.md` résolu |
| DOCS-4 | Moyenne | ✅ | Aucune procédure de rotation | Fiches par secret : [05-procedures-securite.md §1](../deploiement/05-procedures-securite.md) |
| DOCS-6 | Moyenne | ✅ | Aucune procédure d'incident ni lien avec la Loi 25 | [05-procedures-securite.md §2](../deploiement/05-procedures-securite.md) (préservation des traces, confinement, RPRP, registre, CAI) |

### D.3 Notifications et tâches planifiées

| # | Sévérité | Statut | Constat | Traitement |
|---|---|---|---|---|
| CRON-1, CRON-2, EDGE-7, DOCS-9 | Moyenne / faible | ✅ | Job d'envoi créé au tableau de bord, secret en clair dans `cron.job` et en double copie | Tâches versionnées dans `schema.sql` ; la commande n'appelle qu'une fonction qui lit le Vault ; `NOTIFY_TRIGGER_SECRET` généré par la base, source unique |
| CRON-4 | Faible | ✅ | Rotation du secret de déclenchement non outillée | `rotate_notify_trigger_secret()` (bouton « Régénérer »), sans coupure |
| CRON-3 | Moyenne | ✅ | Échec du déclenchement sans trace ni alerte | Alerte dans `notification_log` si la configuration manque ; chien de garde à 30 h |
| CRON-7 | Faible | ✅ | Commentaires et documentation contradictoires | Réécrits |
| CRON-5 | Faible | — | Historique : point de déclenchement ouvert quelques mois | Sans objet sur la base reconstruite |

### D.4 Base, confirmation hors-grappe, client

| # | Sévérité | Statut | Constat | Traitement |
|---|---|---|---|---|
| CLIENT-4 | Moyenne | ✅ | Code de vérification HG = préfixe du jeton ; bascule « par numéro » sans effet | `verify_code` indépendant (10 caractères, 50 bits) ; bascule appliquée côté serveur par grappe ; limite d'essais atomique |
| GAP-4 | Faible | ◑ | Jeton HG recopié dans l'audit, modifiable par UPDATE | Exclu de l'audit, immuable, fixé par le serveur. Reste : jeton stocké en clair, sans expiration |
| CLIENT-5 | Faible | ◑ | Jeton dans l'URL, jamais retiré | Retiré de l'URL à la lecture, `no-referrer`. Reste : pas d'expiration |
| CLIENT-2 | Moyenne | ✅ | Scripts tiers sans SRI, `chart.js@4` flottant | Versions exactes + SRI, copies locales, contrôle CI |
| CLIENT-3 | Moyenne | ◑ | CSP faible | cdnjs retiré ; `unsafe-inline` et `*.supabase.co` demeurent |
| CLIENT-6 | Faible | ✅ | `detectSessionInUrl` actif | Désactivé |
| CLIENT-7 | Faible | ✅ | Mots de passe laissés dans le DOM, `autocomplete` inadapté | Champs vidés après usage, attributs corrigés |
| CLIENT-8 | Faible | ◑ | `config.js` retombait sur la production pour un domaine inconnu | Échec fermé. Reste : séparation dev/prod |
| CLIENT-9 | Faible | ✅ | Le CHANGELOG servi publiquement détaillait la posture de sécurité | Entrées orientées utilisateurs ; détail technique dans `docs/` |

### D.5 Dépôt, CI et sauvegardes

| # | Sévérité | Statut | Constat | Traitement |
|---|---|---|---|---|
| CI-1, DOCS-1 | Élevée | ⚙️ | Le secret de sauvegarde visait un ancien projet : la production n'avait jamais été sauvegardée ; la documentation affirmait le contraire | Workflow refait (garde sur le projet attendu) ; documentation corrigée ; à activer après la reconstruction ([04-sauvegardes.md](../deploiement/04-sauvegardes.md)) |
| CI-2 | Élevée | ◑ | Aucune supervision de la sauvegarde | Dump validé (données réelles), issue d'alerte. Reste : un workflow désactivé n'alerte pas (supervision externe) |
| CI-4 | Moyenne | ⚙️ | Sauvegarde avec le rôle `postgres` | Rôle dédié `backup_reader` en lecture seule |
| CI-5 | Moyenne | ✅ | Dump non chiffré conservé 90 jours | Chiffré avec `age`, 30 jours, données de session exclues |
| EDGE-2 | Moyenne | ✅ | Dépendances des fonctions non épinglées (`esm.sh`) | `npm:` en version exacte, `deno.lock`, CI `check --frozen`, `lint`, `test` |
| EDGE-8, CI-7, AUTH-10 | Faible | ✅ | `.env`, clés privées, dumps non ignorés par Git | `.gitignore` complété |
| CI-8 | Faible | ✅ | Aucune détection de secrets | gitleaks : hook pre-commit + job CI sur tout l'historique |
| CI-9 | Faible | ⚙️ | Actions épinglées par étiquette, permissions non déclarées | SHA complet, permissions minimales, délais ; réglages GitHub à poser après fusion |
| CI-10, DOCS-10 | Faible | ⏳ | Anciens projets Supabase, domaines Render, fichiers de mémoire versionnés | `memory/` retiré du dépôt. À faire : supprimer les anciens projets après la bascule, décider du sort des entrées Render |
| GAP-1 | Moyenne | ⏳ | Branche `main` non protégée, déploiement automatique | Réglages recommandés ([../deploiement/README.md](../deploiement/README.md)) |
| GAP-3 | Moyenne | ◑ | Traçabilité de l'usage des secrets quasi nulle | Journaux d'audit append-only, alertes de surveillance. Reste : lectures du Vault non tracées, journaux de plateforme courts |
| DOCS-7 | Moyenne | ⏳ | Pas d'environnement de développement distinct | Recommandation : [05-procedures-securite.md §4](../deploiement/05-procedures-securite.md) |
| GAP-5 | Info | ◑ | Capture d'écran versionnée montrant un QR et un code | Règle documentée (aucune capture avec QR, code ou jeton) ; la capture historique `fg74.png` montre l'ancien format, sans valeur sur la nouvelle base |

**Corrigé en route** : le déclencheur de protection de `envois_hgrappe` lisait une colonne `dest_labo_id` absente de cette table, ce qui faisait échouer **toute** mise à jour d'un envoi hors-grappe par un utilisateur (bons de départ, écrans HG) ; `schema.sql` ne se chargeait pas dans le SQL Editor (`public.uuid_generate_v4()` introuvable sur Supabase) ; plusieurs données de référence avaient été perdues à la consolidation.

---

## Annexe — Chiffres clés de l'inventaire

- **Front** : 17 modules JS (~500K non bundlé), 193 `onclick` inline, 1 seul ES module (`main.js`).
- **Accès données** : ~112 appels `.from()` sur **18 tables**, ~12 `.rpc()` (15 RPC distinctes : 11 auth + 4 anon), 1 canal Realtime (2 tables), 1 `functions.invoke`, 2 `fetch` edge.
- **Backend** : 23 tables, ~30 fonctions PL/pgSQL, ~40 policies RLS, 5 edge functions Deno, 2 jobs cron.
- **Surface API custom à créer** : **~48-55 endpoints REST**.
- **Fonctionnalités Supabase réellement utilisées** : Auth password uniquement (pas d'OTP/OAuth/MFA), PostgREST, RLS, RPC, Edge Functions, Realtime, pg_cron/pg_net. **Non utilisés** : Storage, Vault (abandonné), magic link, SSO.

> **Note (2026-11)** : chiffres de l'inventaire initial. Depuis le chantier de la partie D, le **Vault est la source unique** des secrets applicatifs (il était alors inerte côté client), il reste **4** fonctions Edge (`set-secret` supprimée) et **7** tâches pg_cron, versionnées dans `schema.sql`.
