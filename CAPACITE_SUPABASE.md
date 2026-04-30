# Traçabilité OPTILAB — Estimation de capacité Supabase Free

> Généré le 2026-04-30 par Claude (IA). Le code source, la BDD et le contexte générale de fonctionnement de l'application ont été fournis. Les variables ont été définies en fonction du volume reçu au CH Rimouski en Mars et en Avril 2026. **Ces résultats sont purement théoriques**.

---

## Hypothèses de calcul

### Hypothèses utilisateurs / sessions

| Paramètre | Valeur | Raisonnement |
|-----------|-------:|--------------|
| Laboratoires | 16 | Grappe BSL-GAS |
| Comptes par labo | 10 | Hypothèse fournie |
| Total comptes | 160 | — |
| Utilisateurs actifs / labo / jour | 2,5 (moy.) | 2–3 selon l'énoncé |
| Utilisateurs actifs / jour | **40** | 16 × 2,5 |
| Connexions / utilisateur actif / jour | 3,5 (moy.) | 3–4 selon l'énoncé |
| **Sessions / jour** | **140** | 40 × 3,5 |
| **Sessions / mois** | **4 200** | 140 × 30 |

### Hypothèses techniques

| Paramètre | Valeur | Source |
|-----------|-------:|--------|
| Poids moyen d'un envoi en base | ~1 024 octets | Données + index + part audit |
| Poids d'un envoi en JSON gzip (API) | ~280 octets | JSON brut ~1 100 o → compression ~75 % |
| Overhead fixe base (schéma, référentiels, profils) | ~21 MB | Mesuré sur schéma actuel |
| Stockage disponible pour les envois | **479 MB** | 500 MB − 21 MB |
| Limite bande passante Supabase Free | **5 GB / mois** | Plan Free |

### Formules

```
Bande passante mensuelle (GB) = sessions_mois × envois_en_base × 280 octets ÷ 10⁹

Seuil bande passante atteint quand :
  envois_en_base > 5 000 000 000 ÷ (4 200 × 280) ≈ 4 250 envois
```

---

## Scénario 1 — 150 envois / jour

### Accumulation et bande passante mois par mois

| Mois | Envois en base | BW / session (gzip) | BW mensuelle | Statut |
|:----:|:-:|:-:|:-:|:---:|
| 0,5 (15 j) | 2 250 | 0,63 MB | 2,6 GB | ✅ |
| **1** | **4 500** | **1,26 MB** | **5,3 GB** | **❌ dépassement** |
| 2 | 9 000 | 2,52 MB | 10,6 GB | ❌ |
| 3 | 13 500 | 3,78 MB | 15,9 GB | ❌ |
| 6 | 27 000 | 7,56 MB | 31,8 GB | ❌ |
| 12 | 54 750 | 15,3 MB | 64,4 GB | ❌ |

> **⚠️ Bande passante : limite atteinte en ~28 jours (< 1 mois)**

### Stockage

| Période | Envois en base | Taille |
|---------|:-:|:-:|
| 1 an | 54 750 | ~53 MB |
| 5 ans | 273 750 | ~267 MB |
| **9 ans** | **~490 000** | **~479 MB** |

> **Stockage : limite atteinte en ~9 ans** — pas un enjeu à court terme.

---

## Scénario 2 — 200 envois / jour

### Accumulation et bande passante mois par mois

| Mois | Envois en base | BW / session (gzip) | BW mensuelle | Statut |
|:----:|:-:|:-:|:-:|:---:|
| 0,5 (15 j) | 3 000 | 0,84 MB | 3,5 GB | ✅ |
| **0,7 (21 j)** | **4 200** | **1,18 MB** | **4,9 GB** | **⚠️ zone rouge** |
| **1** | **6 000** | **1,68 MB** | **7,1 GB** | **❌ dépassement** |
| 2 | 12 000 | 3,36 MB | 14,1 GB | ❌ |
| 3 | 18 000 | 5,04 MB | 21,2 GB | ❌ |
| 12 | 73 000 | 20,4 MB | 85,7 GB | ❌ |

> **⚠️ Bande passante : limite atteinte en ~21 jours (3 semaines)**

### Stockage

| Période | Envois en base | Taille |
|---------|:-:|:-:|
| 1 an | 73 000 | ~71 MB |
| 5 ans | 365 000 | ~356 MB |
| **6,7 ans** | **~490 000** | **~479 MB** |

> **Stockage : limite atteinte en ~6,7 ans.**

---

## Scénario 3 — 250 envois / jour

### Accumulation et bande passante mois par mois

| Mois | Envois en base | BW / session (gzip) | BW mensuelle | Statut |
|:----:|:-:|:-:|:-:|:---:|
| 0,5 (15 j) | 3 750 | 1,05 MB | 4,4 GB | ✅ |
| **0,57 (17 j)** | **4 250** | **1,19 MB** | **5,0 GB** | **⚠️ seuil** |
| **1** | **7 500** | **2,10 MB** | **8,8 GB** | **❌ dépassement** |
| 2 | 15 000 | 4,20 MB | 17,6 GB | ❌ |
| 3 | 22 500 | 6,30 MB | 26,5 GB | ❌ |
| 12 | 91 250 | 25,6 MB | 107 GB | ❌ |

> **⚠️ Bande passante : limite atteinte en ~17 jours (2,5 semaines)**

### Stockage

| Période | Envois en base | Taille |
|---------|:-:|:-:|
| 1 an | 91 250 | ~89 MB |
| 5 ans | 456 250 | ~445 MB |
| **5,4 ans** | **~490 000** | **~479 MB** |

> **Stockage : limite atteinte en ~5,4 ans.**

---

## Tableau comparatif — Résumé

### Sans modification (architecture actuelle)

| Scénario | Bande passante dépassée | Stockage dépassé | Facteur limitant |
|----------|:-:|:-:|:---:|
| **150 envois/jour** | **~1 mois** | ~9 ans | Bande passante |
| **200 envois/jour** | **~3 semaines** | ~6,7 ans | Bande passante |
| **250 envois/jour** | **~2,5 semaines** | ~5,4 ans | Bande passante |

La bande passante est le facteur limitant dans tous les cas. La cause est architecturale : l'application charge l'intégralité des envois à chaque connexion.

### Avec modifications — comparaison des options

| Option | 150/j BW | 200/j BW | 250/j BW | BW stable dans le temps ? | Effort |
|--------|:---:|:---:|:---:|:---:|--------|
| **Aucune** | ❌ 5,3 GB (mois 1) | ❌ 7,1 GB (mois 1) | ❌ 8,8 GB (mois 1) | Non — croît sans fin | — |
| **A — Filtre 7 jours** | ✅ 1,2 GB | ✅ 1,6 GB | ✅ 2,0 GB | Oui | Faible (2–3 lignes) |
| **B — Plan Pro** | ✅ 5,3 GB | ✅ 7,1 GB | ✅ 8,8 GB | Non — croît quand même | Aucun (payant) |
| **C — Historique sup. + pagination** | ✅ 0,16 GB | ✅ 0,17 GB | ✅ 0,17 GB | **Oui, indéfiniment** | Moyen (refacto) |

> L'Option C réduit la bande passante de **97 %** par rapport à la situation actuelle et la rend **indépendante du volume cumulé en base**.

---

## Cause racine et solutions

### Pourquoi la bande passante s'épuise si vite

À chaque connexion, l'application envoie une requête PostgreSQL sans filtre temporel :

```javascript
// Requête actuelle — charge TOUS les envois
sb.from('envois').select('*, exp_lab:exp_labo_id(*), dest_lab:dest_labo_id(*)')
```

Chaque session télécharge l'ensemble du dataset, et le volume croît sans plafond.

---

### Option A — Filtre temporel (modification de code, plan Free maintenu)

Charger uniquement les envois récents au démarrage ; laisser l'historique se charger à la demande (filtre de dates dans le panneau Historique).

**Filtre maximum permettant de rester sous 5 GB/mois :**

| Scénario | Envois max chargeables | Fenêtre max | Fenêtre recommandée |
|----------|:-:|:-:|:-:|
| 150 envois/jour | 4 250 | **28 jours** | 14 jours |
| 200 envois/jour | 4 250 | **21 jours** | 14 jours |
| 250 envois/jour | 4 250 | **17 jours** | 7–10 jours |

Avec un filtre de **7 jours** pour le chargement initial :

| Scénario | Envois chargés | BW mensuelle | Marge |
|----------|:-:|:-:|:-:|
| 150/jour | 1 050 | **1,2 GB** | ✅ 75 % de marge |
| 200/jour | 1 400 | **1,6 GB** | ✅ 68 % de marge |
| 250/jour | 1 750 | **2,0 GB** | ✅ 60 % de marge |

Un filtre de 7 jours maintient la bande passante confortablement sous le seuil **dans les trois scénarios, indéfiniment**, quelle que soit l'ancienneté de la base.

---

### Option C — Accès historique réservé aux superviseurs + résumé paginé

Refactorisation de l'architecture de chargement :

| Changement | Détail |
|-----------|--------|
| **Historique** | Panneau masqué pour le rôle `technicien`. Accessible uniquement aux rôles `superviseur_labo`, `superviseur_grappe`, `admin` (1 par labo max actif). |
| **Résumé labo** | Chargement initial des 10 derniers envois du labo courant via requête paginée côté serveur. Navigation par page sur demande. |
| **Chargement initial (tous rôles)** | Seuls les envois actifs du labo de l'utilisateur (En transit + arrivés récemment), filtrés par `exp_labo_id` ou `dest_labo_id`. |

```javascript
// Chargement initial — actifs du labo uniquement (~30–40 lignes réseau-wide par labo)
sb.from('envois')
  .select('*, exp_lab:exp_labo_id(*), dest_lab:dest_labo_id(*)')
  .or(`exp_labo_id.eq.${laboId},dest_labo_id.eq.${laboId}`)
  .in('statut', ['En transit','En attente','Problème'])

// Résumé labo — 10 derniers, paginé côté serveur
sb.from('envois').select('...')
  .eq('exp_labo_id', laboId)
  .order('ts_envoi', { ascending: false })
  .range(offset, offset + 9)          // offset = (page-1) × 10

// Historique (superviseurs uniquement) — paginé, chargé à la demande
sb.from('envois').select('...')
  .order('ts_envoi', { ascending: false })
  .range(offset, offset + 49)         // 50 lignes / page
```

#### Décomposition des sessions

| Population | Actifs / jour | Sessions / jour | Sessions / mois |
|------------|:---:|:---:|:---:|
| Techniciens | 24 | 84 | 2 520 |
| Superviseurs (1 / labo) | 16 | 56 | 1 680 |
| **Total** | **40** | **140** | **4 200** |

#### Ce que chaque session télécharge

| Rôle | Contenu | Volume |
|------|---------|-------:|
| **Technicien** | Envois actifs du labo (~30–40 lignes) + labs + config | ~20 KB |
| **Superviseur** | Même initial + 3–5 pages historique (50 lignes/page) | ~65 KB |

Le volume par session est **indépendant du nombre total d'envois en base** : un envoi réceptionné quitte la vue active et n'est plus téléchargé au démarrage.

#### Bande passante mensuelle par scénario

| Scénario | Sessions tech. | Sessions sup. | BW techniciens | BW superviseurs | **BW totale** | **% quota Free** |
|----------|:-:|:-:|:-:|:-:|:-:|:-:|
| 150/jour | 2 520 | 1 680 | ~49 MB | ~109 MB | **~158 MB** | **3,1 %** |
| 200/jour | 2 520 | 1 680 | ~54 MB | ~112 MB | **~166 MB** | **3,2 %** |
| 250/jour | 2 520 | 1 680 | ~59 MB | ~114 MB | **~173 MB** | **3,4 %** |

La bande passante mensuelle est quasi constante entre les scénarios parce qu'elle ne dépend plus du cumul en base — seulement du nombre d'envois *actifs* à l'instant T.

#### Viabilité long terme (stockage)

Le stockage reste identique aux options A et B. La bande passante, elle, n'est plus un enjeu.

| Scénario | Stockage épuisé |
|----------|:-:|
| 150/jour | ~9 ans |
| 200/jour | ~6,7 ans |
| 250/jour | ~5,4 ans |

#### Modifications nécessaires dans le code

| Fichier | Changement |
|---------|-----------|
| `app.js` — `loadEnvois()` | Ajouter filtre `exp_labo_id/dest_labo_id` + statuts actifs |
| `app.js` — `renderResume()` | Remplacer filtrage local par requête paginée `.range()` |
| `app.js` — `sp('historique')` | Bloquer si `CU.role === 'technicien'` |
| `index.html` | Masquer le bouton nav Historique pour les techniciens |
| `app.js` — historique | Charger les données à la demande (premier accès) avec pagination |

---

### Option B — Passer au plan Pro (aucun changement de code)

| Plan | Bande passante | Coût | Durée de viabilité (250/j, sans filtre) |
|------|:-:|:-:|:-:|
| Free | 5 GB/mois | 0 $ | **< 3 semaines** |
| Pro | 250 GB/mois | 25 USD/mois | **~2,3 ans** (puis Pro XL requis) |
| Pro avec ajout BW | +1 TB | 10 USD/10 GB | Variable selon usage |

Sans filtre temporel, même le plan Pro devient insuffisant au bout de ~2 ans à 250 envois/jour. **L'option B seule n'est pas une solution à long terme.**

---

### Recommandation

| Priorité | Option | Quand choisir |
|:---:|--------|---------------|
| 1re | **C — Historique superviseurs + pagination** | Si une refactorisation est acceptable. Solution la plus robuste : ~170 MB/mois quelle que soit la durée de vie du projet. |
| 2e | **A — Filtre 7 jours** | Si le délai de livraison est court et qu'on veut une mise en production rapide. Viable indéfiniment à ces volumes. |
| 3e | **B — Plan Pro** | Uniquement comme mesure transitoire, jamais seul : sans modification architecturale, même le plan Pro est dépassé à long terme. |

L'Option C est la seule qui élimine le problème à la racine. Elle apporte en prime un bénéfice métier (les techniciens ont une vue épurée centrée sur leur labo) et réduit le risque d'erreur de réception.

Si une transition vers Supabase self-hosted est envisagée à terme, la limite de bande passante disparaît et ces optimisations deviennent optionnelles, mais restent des bonnes pratiques de performance.

---

## Suivi en projet pilote

La consommation de bande passante réelle dépendra du comportement effectif des utilisateurs (fréquence de connexion, volume d'envois quotidien réel, nombre de labos actifs dans la phase pilote). Les estimations ci-dessus reposent sur des hypothèses théoriques qui doivent être validées en conditions réelles.

**Il est recommandé de surveiller activement la bande passante Supabase pendant toute la durée du projet pilote.**

L'indicateur est accessible directement dans le tableau de bord Supabase :
*Project → Reports → Bandwidth*

Les seuils d'alerte suivants sont recommandés :

| Seuil | Action |
|-------|--------|
| > 2,5 GB / mois | Investiguer — rythme d'utilisation plus élevé qu'estimé |
| > 4 GB / mois | Implémenter l'Option A ou C avant la fin du mois |
| > 4,8 GB / mois | Passer temporairement au plan Pro (25 USD) le temps d'appliquer le correctif |

Les données collectées pendant le pilote permettront également d'affiner les estimations de volume (envois/jour, sessions/jour) et de dimensionner correctement la solution pour le déploiement en production.
