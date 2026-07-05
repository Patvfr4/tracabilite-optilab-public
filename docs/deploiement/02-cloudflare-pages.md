# 02 — Cloudflare Pages (pas à pas)

Cette étape héberge le front statique (dossier `public/`) et le connecte au projet Supabase créé à l'étape [01](01-supabase.md).

L'application n'a **aucune étape de build** : les fichiers de `public/` sont servis tels quels. Le déploiement se fait automatiquement à chaque `push` sur la branche `main`.

---

## 1. Connecter le dépôt GitHub

1. Dans [dash.cloudflare.com](https://dash.cloudflare.com), allez dans **Workers & Pages → Create → Pages**.
2. **Connect to Git**, autorisez l'accès et sélectionnez le dépôt `optilab-envois`.

---

## 2. Régler le build

| Paramètre | Valeur |
|---|---|
| Production branch | `main` |
| Framework preset | **None** |
| Build command | *(laisser vide)* |
| Build output directory | **`public`** |
| Root directory | *(vide)* |
| Variables d'environnement | **aucune** (toute la config est dans `public/js/config.js`) |

Cliquez sur **Save and Deploy**. Un domaine `*.pages.dev` est attribué (ex. `optilab-envois.pages.dev`).

> Chaque `push` sur `main` redéclenche un déploiement de production. Les autres branches génèrent des *preview deployments* (utile pour tester avant merge).

---

## 3. Rôle de `public/_headers`

Cloudflare Pages applique automatiquement les en-têtes déclarés dans `public/_headers` :

- **Content-Security-Policy (CSP) stricte** : n'autorise que `self` + les origines nécessaires —
  - `script-src` : `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`, `challenges.cloudflare.com` (Turnstile) ;
  - `connect-src` : `https://*.supabase.co` et `wss://*.supabase.co` (API + Realtime), `challenges.cloudflare.com` ;
  - `frame-src` : `challenges.cloudflare.com` (widget Turnstile).
- **En-têtes de sécurité** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`.
- **Cache** :
  - `/lib/*`, `/img/*`, `/favicon.ico` → `max-age=2592000` (30 j, librairies/images stables) ;
  - `/js/*`, `/css/*` → `max-age=300, must-revalidate` (court, pour propager vite les correctifs) ;
  - `/`, `/index.html`, `/confirm/*` → `no-cache` (toujours frais).

> ⚠️ Si vous ajoutez un nouveau CDN ou une nouvelle origine réseau, il faut **mettre à jour la CSP** dans `public/_headers`, sinon le navigateur bloque la ressource. En particulier, si le domaine Supabase n'est pas en `*.supabase.co`, adaptez `connect-src`.

---

## 4. Rôle de `public/_redirects`

`public/_redirects` gère le routage SPA :

```
/confirm/*    /confirm/index.html    200
/*    /index.html    200
```

- `/confirm/*` → page de **confirmation publique** hors-grappe (`public/confirm/index.html`), accessible **sans authentification** via `/confirm?n=…&c=…`.
- `/*` → toute autre URL inconnue renvoie `index.html` avec un code **200** (pas de redirection visible), pour que le routage côté client fonctionne. Les fichiers statiques existants (`/js`, `/css`, `/img`, `/lib`) sont servis en priorité avant cette règle.

---

## 5. Configurer l'URL et la clé Supabase (`config.js`)

`public/js/config.js` est le **seul endroit** où l'URL et la clé Supabase sont déclarées. Il est chargé en premier et mappe `window.location.hostname` → configuration.

Ouvrez le fichier et vérifiez/ajoutez l'entrée correspondant à votre domaine de production :

```javascript
'optilab-envois.pages.dev': {
  supabaseUrl:      'https://aozluuihgzzvgwdvjnxb.supabase.co',
  supabaseKey:      'sb_publishable_rfGC5ZvnPDU8yktYtsI3Gw_7LfnuoLx',
  turnstileSiteKey: '0x4AAAAAADN_LomqoMjc1ZOI',
},
```

Le script injecte alors trois globales consommées par l'app :

```javascript
window.SUPABASE_URL        // supabaseUrl
window.SUPABASE_KEY        // supabaseKey (clé publishable)
window.EDGE_URL            // = supabaseUrl + '/functions/v1'
window.TURNSTILE_SITE_KEY  // turnstileSiteKey (ou '' si vide)
```

> ⚠️ Ne mettez ici **que** la clé `publishable`/`anon`. **Jamais** la clé `service_role` : ce fichier est servi publiquement.

Si le `hostname` n'est pas trouvé dans `CONFIGS`, le script retombe sur la **première entrée** de l'objet avec un `console.warn`.

---

## 6. Ajouter un nouveau domaine (multi-domaine)

Pour brancher un domaine supplémentaire (nouveau `*.pages.dev`, domaine personnalisé, ou même un autre projet Supabase) :

1. Ajoutez une entrée dans l'objet `CONFIGS` de `public/js/config.js`, clé = le `hostname` exact :

```javascript
'mon-domaine.example.com': {
  supabaseUrl:      'https://<ref>.supabase.co',
  supabaseKey:      'sb_publishable_…',
  turnstileSiteKey: '0x4AAAA…',   // ou '' pour désactiver le captcha
},
```

2. Commit + push → Cloudflare Pages redéploie automatiquement.
3. Si le domaine correspond à un **autre projet Supabase**, ce projet doit avoir reçu le schéma, les migrations, les Edge Functions et les crons (voir [01](01-supabase.md)).

> Les domaines déjà connus dans le code : `optilab-envois.pages.dev`, `tests-deploiement.optilab-envois.pages.dev` (dev), `optilab-envois.onrender.com`, `dev-optilab-envois.onrender.com`, `localhost`, `127.0.0.1`.

> ⚠️ **CORS de `auth-gate`.** L'Edge Function `auth-gate` restreint les origines autorisées (liste `ALLOWED_ORIGINS` dans `supabase/functions/auth-gate/index.ts`). Si vous ajoutez un **nouveau domaine de login**, ajoutez-le aussi à cette liste, puis redéployez : `supabase functions deploy auth-gate --no-verify-jwt`.

---

## 7. Configurer Cloudflare Turnstile (captcha)

Le captcha protège l'écran de connexion. Il fonctionne en deux parties : la **clé site** (publique, dans le front) et la **clé secret** (dans Supabase Auth).

### 7.1 Créer le widget

1. Dans Cloudflare : **Turnstile → Add site**.
2. **Domains** : ajoutez vos domaines (`optilab-envois.pages.dev`, domaine personnalisé, etc.).
3. Récupérez la **Site key** (`0x4AAAA…`) et la **Secret key**.

### 7.2 Fournir la clé site au front

La clé **site** n'est **pas** codée en dur dans `index.html`. Elle est fournie ainsi :

1. `public/js/config.js` → champ `turnstileSiteKey` de l'entrée du domaine → exposée en `window.TURNSTILE_SITE_KEY`.
2. `public/index.html` charge le script Turnstile en **rendu explicite** :
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
   ```
   avec un conteneur `<div id="login-turnstile">` et un stub `window.onloadTurnstileCallback` qui déclenche le rendu du widget une fois le module ES prêt (évite la *race condition*). Le widget est rendu dans ce conteneur en utilisant `window.TURNSTILE_SITE_KEY`.

Laisser `turnstileSiteKey: ''` (comme pour `localhost`) **désactive** le captcha sur ce domaine.

### 7.3 Fournir la clé secret à Supabase

Voir [01 — Supabase, §5](01-supabase.md#5-configurer-lauthentification) : la **Secret key** va dans **Authentication → Attack Protection → CAPTCHA protection**, provider `Turnstile`. C'est Supabase Auth qui valide le jeton envoyé par `auth-gate`.

> Les deux clés doivent provenir du **même** widget Turnstile, sinon la validation échoue et le login est refusé.

---

## 8. Vérifications

- Ouvrez `https://<votre-domaine>/` → l'écran de connexion s'affiche, le widget Turnstile apparaît (sur un domaine où `turnstileSiteKey` est renseignée).
- Ouvrez `https://<votre-domaine>/confirm?n=TEST&c=TEST` → la page de confirmation publique se charge.
- Connectez-vous avec le compte admin créé à l'étape 01.
- Console navigateur : aucun blocage CSP, aucun `console.warn('[config] Domaine non reconnu…')`.

---

*Dernière mise à jour : 2026-07-04 — BETA 1.10.0*
