# 02 — Cloudflare Pages (pas à pas)

Cette étape héberge le front statique (dossier `public/`) et le connecte au projet Supabase créé à l'étape [01](01-supabase.md).

L'application n'a **aucune étape de build** : les fichiers de `public/` sont servis tels quels. Le déploiement se fait automatiquement à chaque `push` sur la branche `main`.

---

## 1. Connecter le dépôt GitHub

1. Dans [dash.cloudflare.com](https://dash.cloudflare.com), allez dans **Workers & Pages → Create → Pages**.
2. **Connect to Git**, autorisez l'accès **au seul dépôt** `optilab-envois` et sélectionnez-le.

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

> Chaque `push` sur `main` redéclenche un déploiement de production. Les autres branches génèrent des *preview deployments*. Leurs adresses ne figurent pas dans `config.js` : l'application y affiche un message bloquant et ne se connecte à rien (échec fermé, §5). Pour les fermer au public, activer *Settings › General › Enable access policy* (Cloudflare Access) et limiter les branches de préversion (*Builds › Branch control*).

---

## 3. Rôle de `public/_headers`

Cloudflare Pages applique automatiquement les en-têtes déclarés dans `public/_headers` :

- **Content-Security-Policy** : n'autorise que `self` + les origines nécessaires —
  - `script-src` : `'self'`, `'unsafe-inline'`, `cdn.jsdelivr.net` (supabase-js, Chart.js, ZXing, tous en version exacte avec empreinte SRI), `challenges.cloudflare.com` (Turnstile). **cdnjs n'est plus autorisé** : jsPDF et AutoTable sont des copies locales (`/lib/`) ;
  - `connect-src` : `https://*.supabase.co` et `wss://*.supabase.co` (API + Realtime), `challenges.cloudflare.com` ;
  - `frame-src` : `challenges.cloudflare.com` (widget Turnstile).

  Elle n'est **pas stricte** tant que `'unsafe-inline'` demeure (voir `../architecture/04-securite.md` §12).
- **En-têtes de sécurité** : `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy` (caméra autorisée pour la page elle-même, pour le scan des bons de départ ; micro, géolocalisation, paiement et USB refusés).
- **Cache** :
  - `/lib/*`, `/img/*`, `/favicon.ico` → `max-age=2592000` (30 j ; les librairies locales sont versionnées par chemin, `public/lib/<nom>/<version>/`) ;
  - `/js/*`, `/css/*` → `max-age=300, must-revalidate` (court, pour propager vite les correctifs) ;
  - `/`, `/index.html`, `/confirm/*` → `no-cache` (toujours frais).

> ⚠️ Toute nouvelle librairie distante doit avoir une **version exacte** et une **empreinte SRI** (`integrity` + `crossorigin`), ou être copiée dans `public/lib/<nom>/<version>/` ; le job CI « client » le vérifie. Si une nouvelle origine est nécessaire, mettez aussi à jour la CSP de `public/_headers`. `connect-src *.supabase.co` est à resserrer sur l'hôte exact du projet une fois la reconstruction faite.

---

## 4. Rôle de `public/_redirects`

`public/_redirects` gère le routage SPA :

```
/confirm/*    /confirm/index.html    200
/*    /index.html    200
```

- `/confirm/*` → page de **confirmation publique** hors-grappe (`public/confirm/index.html`), accessible **sans authentification**. Elle accepte un lien avec jeton (retiré de l'URL dès sa lecture) ou la saisie du N° d'envoi et du **code de vérification de 10 caractères** imprimé sur le F-G-74 ; `?n=` préremplit seulement le numéro.
- `/*` → toute autre URL inconnue renvoie `index.html` avec un code **200**, pour que le routage côté client fonctionne. Les fichiers statiques existants (`/js`, `/css`, `/img`, `/lib`) sont servis en priorité avant cette règle.

---

## 5. Configurer l'URL et la clé Supabase (`config.js`)

`public/js/config.js` est le **seul endroit** où l'URL et la clé publiable Supabase sont déclarées. Il est chargé en premier et mappe `window.location.hostname` → configuration.

Après la création (ou la reconstruction) du projet, mettez à jour l'entrée de chaque domaine de production :

```javascript
'optilab-envois.pages.dev': {
  supabaseUrl:      'https://<ref>.supabase.co',
  supabaseKey:      'sb_publishable_<clé publiable>',
  turnstileSiteKey: '<sitekey Turnstile>',
},
```

Le script injecte alors quatre globales consommées par l'app :

```javascript
window.SUPABASE_URL        // supabaseUrl
window.SUPABASE_KEY        // supabaseKey (clé publiable)
window.EDGE_URL            // = supabaseUrl + '/functions/v1'
window.TURNSTILE_SITE_KEY  // turnstileSiteKey
```

> ⚠️ Ne mettez ici **que** la clé **publiable** (`sb_publishable_…`). **Jamais** une clé secrète (`sb_secret_…`) ni la clé secrète Turnstile : ce fichier est servi publiquement. La documentation n'en contient que des gabarits `<…>`.

> `config.js`, la CSP `connect-src` (`public/_headers`) et `app_config.supabase_url` (SQL Editor, [01](01-supabase.md) §5) doivent viser **le même projet**.

**Domaine inconnu : échec fermé.** Si le `hostname` n'est pas dans `CONFIGS`, aucune configuration n'est appliquée, aucun client Supabase n'est créé et un message bloquant s'affiche (« Domaine non configuré ») — il n'y a plus de repli sur la production.

---

## 6. Ajouter un nouveau domaine

1. Ajoutez une entrée dans l'objet `CONFIGS` de `public/js/config.js`, clé = le `hostname` exact :

```javascript
'mon-domaine.example.com': {
  supabaseUrl:      'https://<ref>.supabase.co',
  supabaseKey:      'sb_publishable_<clé publiable>',
  turnstileSiteKey: '<sitekey Turnstile>',   // requis : auth-gate exige le jeton (voir 01-supabase §7)
},
```

2. Ajoutez l'origine (`https://mon-domaine.example.com`) à la liste CORS commune des fonctions Edge, `supabase/functions/_shared/cors.ts`, puis redéployez `auth-gate`, `manage-user` et `test-notification` ([01](01-supabase.md) §9).
3. Ajoutez le domaine à la liste des domaines du widget Turnstile (§7.1).
4. Commit + push → Cloudflare Pages redéploie automatiquement.
5. Si le domaine correspond à un **autre projet Supabase**, ce projet doit avoir été installé selon [01](01-supabase.md).

> Domaines déjà déclarés dans le code : `optilab-envois.pages.dev`, `tests-deploiement.optilab-envois.pages.dev`, `optilab-envois.onrender.com`, `dev-optilab-envois.onrender.com`, `localhost`, `127.0.0.1`. **Tous visent aujourd'hui le même projet que la production** : voir la séparation dev/prod recommandée ([05](05-procedures-securite.md) §4). Le sort des entrées Render reste à décider.

---

## 7. Configurer Cloudflare Turnstile (captcha)

Le captcha protège l'écran de connexion. Il fonctionne en deux parties : la **sitekey** (publique, dans le front) et la **clé secrète** (dans Supabase Auth).

### 7.1 Créer le widget

1. Dans Cloudflare : **Turnstile → Add site**.
2. **Domains** : ajoutez vos domaines de production (`optilab-envois.pages.dev`, domaine personnalisé, etc.).
3. Récupérez la **sitekey** et la **clé secrète**. La clé secrète se colle **directement** dans Supabase (§7.3), sans passer par un fichier ni un message.

### 7.2 Fournir la sitekey au front

1. `public/js/config.js` → champ `turnstileSiteKey` de l'entrée du domaine → exposée en `window.TURNSTILE_SITE_KEY`.
2. `public/index.html` charge le script Turnstile en **rendu explicite** :
   ```html
   <script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onloadTurnstileCallback&render=explicit" async defer></script>
   ```
   C'est la **seule** exception à la règle « version exacte + SRI » : Cloudflare impose cette adresse exacte, sans version figée ni copie.

Laisser `turnstileSiteKey: ''` **ne désactive pas** le captcha : `auth-gate` exige un jeton et refuserait toute connexion. `localhost` et `127.0.0.1` portent la **sitekey de test** publique de Cloudflare, dont le jeton factice n'est accepté que par la clé secrète **de test** — réservée à un projet de développement. Tant que ces entrées visent la production, la connexion locale n'est pas prise en charge.

### 7.3 Fournir la clé secrète à Supabase

Voir [01 — Supabase, §7](01-supabase.md#7-configurer-lauthentification-console) : la **clé secrète** va dans **Authentication → Attack Protection → CAPTCHA protection**, fournisseur `Turnstile`. C'est Supabase Auth qui valide le jeton envoyé par `auth-gate`.

> Les deux clés doivent provenir du **même** widget, sinon la validation échoue et le login est refusé. Ne réglez **jamais** la clé secrète de test sur le projet de production, et ne désactivez jamais ce réglage pour « débloquer » un poste.

---

## 8. Vérifications

- Ouvrez `https://<votre-domaine>/` → l'écran de connexion s'affiche, le widget Turnstile apparaît.
- Ouvrez `https://<votre-domaine>/confirm/` → la page de confirmation publique se charge (saisie du N° d'envoi et du code de 10 caractères).
- Connectez-vous avec le compte admin créé à l'étape 01.
- Console navigateur : aucun blocage CSP ; aucun message « Domaine non configuré ».
- Ouvrez une adresse de préversion (`<hash>.optilab-envois.pages.dev`) → message bloquant, aucune requête vers Supabase.

---

*Dernière mise à jour : 2026-11-10 — CSP sans cdnjs, `config.js` en échec fermé, gabarits sans valeur réelle*
