# Traçabilité OPTILAB — Estimation de capacité Supabase Free

> Généré le 2026-04-30 — refondu le 2026-05-09 (BETA 1.9.6) par Claude (IA).
> Le code source, la BDD et le contexte général de fonctionnement ont été fournis.
> Les variables de volume s'appuient sur les données réelles du CH Rimouski (mars–avril 2026).
> **Ces résultats sont purement théoriques.**

---

## 1. Hypothèses de calcul

### 1.1 Utilisateurs & sessions

| Paramètre | Valeur | Raisonnement |
|-----------|-------:|--------------|
| Laboratoires actifs | 16 | Grappe BSL-GAS |
| Comptes par labo | 10 | Hypothèse |
| Total comptes | 160 | — |
| Utilisateurs actifs / labo / jour | 2,5 (moy.) | 2–3 selon l'énoncé |
| Utilisateurs actifs / jour | **40** | 16 × 2,5 |
| Connexions / utilisateur actif / jour | 3,5 (moy.) | 3–4 selon l'énoncé |
| **Sessions / jour** | **140** | 40 × 3,5 |
| **Sessions / mois** | **4 200** | 140 × 30 |

### 1.2 Paramètres techniques

| Paramètre | Valeur | Source |
|-----------|-------:|--------|
| Poids moyen d'un envoi en base | ~1 024 octets | Données + index + part audit |
| Poids d'un envoi en JSON gzip (API) | ~280 octets | JSON brut ~1 100 o → compression ~75 % |
| Overhead fixe base (schéma + référentiels + profils + nouvelles tables BETA 1.9.6) | **~23 MB** | Estimation — voir §2 |
| Stockage disponible pour les données transactionnelles | **477 MB** | 500 MB − 23 MB |
| Limite bande passante Supabase Free | **5 GB / mois** | Plan Free |

---

## 2. Impact des nouvelles tables — BETA 1.9.6

Six nouvelles tables ont été ajoutées depuis la première estimation.

### 2.1 Tables statiques ou à faible croissance

| Table | Lignes initiales | Croissance | Taille initiale |
|-------|:-:|-----------|:-:|
| `module_config` | ~32 | 1 ligne / module / labo activé | ~16 KB |
| `user_lab_memberships` | ~320¹ | ±1 / modification d'utilisateur | ~96 KB |
| `grappes` | 1 | Quasi-nulle | < 1 KB |
| `grappe_config` | ~8 | ±1 / réglage de grappe | ~3 KB |

> ¹ 160 comptes × 2 labos en moyenne = ~320 memberships.

**Impact overhead fixe :** +2 MB de schéma SQL + données statiques → overhead total passe de ~21 MB à **~23 MB**.

### 2.2 Tables transactionnelles — Bons de départ

| Table | Lignes / envoi BD | Taille / ligne | Poids / envoi BD |
|-------|:-:|:-:|:-:|
| `bons_depart` | ~0,1 (1 bon / 10 envois) | ~300 B | ~30 B |
| `bons_depart_envois` | 1 | ~150 B | ~150 B |
| `bons_depart_sections` | ~0,1 | ~250 B | ~25 B |
| **Total / envoi passant par BD** | | | **~205 B** |

> Hypothèse 50 % des envois via BD → ~100 B de surcoût moyen / envoi (**+10 % du poids par envoi**).

### 2.3 Surcharge bande passante par session

Les nouvelles requêtes de démarrage (module_config, grappe_config, memberships) ajoutent ~4–5 KB par session — non significatif à l'échelle des calculs ci-dessous.

> Le panneau **Bons de départ** est chargé à la demande, pas au démarrage — pas d'impact sur la BW initiale.

---

## 3. Architecture actuelle de chargement

`loadEnvois()` dans `envois.js` est **déjà optimisé** avec deux requêtes distinctes :

```javascript
var cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString(); // J−7

// q1 — actifs : En transit + En attente
//   Pas de filtre temporel, mais naturellement borné :
//   les envois En transit sont réceptionnés en quelques jours
//   → ~50–200 lignes max pour toute la grappe à un instant T
var q1 = sb.from('envois').select(sel)
  .in('statut', ['En attente', 'En transit'])
  .is('annule_at', null)
  .order('ts_envoi', { ascending: false });

// q2 — récents : Reçu + Problème, filtrés à J−7
//   Volume fixe, indépendant de l'historique cumulé
var q2 = sb.from('envois').select(sel)
  .in('statut', ['Reçu', 'Problème'])
  .gte('ts_envoi', cutoff)
  .order('ts_envoi', { ascending: false });

// Non-superviseurs : filtrés au labo actif uniquement
if (!estGrappe()) {
  q1 = q1.or(`exp_labo_id.eq.${laboId},dest_labo_id.eq.${laboId}`);
  q2 = q2.or(`exp_labo_id.eq.${laboId},dest_labo_id.eq.${laboId}`);
}
```

**Résumé labo (Envoyés)** et **Historique** sont également paginés côté serveur via `.range(offset, offset+N)`.

### Volume chargé par session

| Rôle | Contenu | Volume estimé (gzip) |
|------|---------|:-:|
| **Technicien** | Actifs labo (~10–20 lignes) + Reçu/Problème J−7 labo (~20–30 lignes) + config + labs + module_config | ~25–30 KB |
| **Superviseur** | Actifs toute grappe (~50–200 lignes) + Reçu/Problème J−7 toute grappe (~300–500 lignes) + config | ~50–80 KB |

**La bande passante par session est indépendante du volume cumulé en base.**

---

## 4. Bande passante mensuelle (architecture actuelle)

La BW est quasi-constante dans le temps et quasi-identique dans les trois scénarios de volume.

| Rôle | Volume / session | Sessions / mois | BW / mois |
|------|:-:|:-:|:-:|
| Techniciens (24 actifs/j × 3,5 conn.) | ~30 KB | 2 520 | ~74 MB |
| Superviseurs (16 actifs/j × 3,5 conn.) | ~65 KB | 1 680 | ~107 MB |
| **Total** | | **4 200** | **~181 MB — 3,6 % du quota Free** |

> **✅ Plan Free largement suffisant pour la bande passante, quelle que soit la durée de vie du projet.**

---

## 5. Stockage cumulé

Le stockage, lui, croît avec le temps et constitue l'unique limite à surveiller.

### Stockage par table / an (scénario 200 envois/jour)

| Table | Lignes / an | Taille / ligne | Stockage / an |
|-------|:-:|:-:|:-:|
| `envois` | 73 000 | ~600 B | ~44 MB |
| `envois_hgrappe` | ~20 000¹ | ~700 B | ~14 MB |
| `envois_audit` | ~365 000² | ~1 200 B | ~438 MB³ |
| `bons_depart*` | ~36 500 | ~200 B moy. | ~7 MB |
| `notification_queue` + `notification_log` | ~8 000⁴ | ~1 500 B | ~12 MB |
| Statiques (labs, config, profils, memberships) | Faible | — | ~2 MB |
| **Total / an** | | | **~77 MB / an (hors audit)** |

> ¹ Estimation 10 envois HG/jour.
> ² ~5 événements d'audit/envoi (création, 2–3 modifications, réception, annulation éventuelle) × 73 000 envois.
> ³ La table `envois_audit` est le principal risque stockage — voir §6.
> ⁴ Purge automatique des entrées > 90 jours déjà en place.

### Limites par scénario de volume

| Scénario | Sans audit (77 MB/an¹) | Avec audit (438 MB/an²) |
|----------|:-:|:-:|
| **150 envois/jour** | Libre > 10 ans | **~1,1 an avant 477 MB** |
| **200 envois/jour** | ~6 ans | **< 1 an avant 477 MB** |
| **250 envois/jour** | ~5 ans | **< 1 an avant 477 MB** |

> ¹ Valeur pour 200 envois/jour, proportionnelle aux autres scénarios.
> ² `envois_audit` représente ~85 % du stockage total si non purgée.

---

## 6. Risque principal : table `envois_audit`

La table `envois_audit` enregistre chaque modification de chaque envoi. À ~1 200 B/ligne et ~5 événements/envoi, elle génère **~438 MB/an à 200 envois/jour** — bien au-delà de la limite Free en moins d'un an.

### Options de mitigation

| Option | Impact stockage | Effort |
|--------|:-:|--------|
| **Purge automatique > 1 an** (cron Supabase) | Stabilise à ~438 MB de plateau | Faible — 1 fonction SQL + cron |
| **Purge > 3 mois** (rétention minimale) | Stabilise à ~110 MB de plateau | Faible |
| **Archivage vers storage externe** (Supabase Storage / S3) | Illimité | Moyen |
| **Passer au plan Pro** (8 GB inclus) | Libre > 10 ans avec audit complet | Aucun (payant) |

> **Recommandation** : ajouter une purge automatique `envois_audit > 1 an` via un cron Supabase Edge Function, ou passer au plan Pro dès la mise en production.

---

## 7. Realtime

| Métrique | Estimation | Limite Free | Limite Pro |
|---|:-:|:-:|:-:|
| Messages / mois¹ | ~100 000 | 2 000 000 | 5 000 000 |
| Connexions simultanées | ~15 max | 200 | 500 |

> ¹ (150 envois/j + 40 réceptions/j + 20 modifs/j) × 15 postes connectés × 26 j = ~90 000/mois

**Realtime ne constitue pas un facteur limitant.**

---

## 8. Résumé

| Ressource | Situation actuelle | Risque |
|-----------|:-:|--------|
| **Bande passante** | ~181 MB/mois (3,6 % du quota) | ✅ Aucun — architecture optimisée |
| **Realtime** | ~100 000 msg/mois | ✅ Aucun |
| **Auth MAU** | ~40 / 50 000 | ✅ Aucun |
| **Stockage (hors audit)** | ~77 MB/an | ✅ Libre 5–6 ans |
| **Stockage (`envois_audit`)** | ~438 MB/an | ⚠️ **Critique — purge requise** |

---

## 9. Recommandations

| Priorité | Action | Quand |
|:---:|--------|-------|
| 1re | **Purge `envois_audit` > 1 an** — cron Edge Function mensuel | Avant mise en production |
| 2e | **Plan Pro** (25 USD/mois) — PITR, SLA, backup quotidien, logs | Dès mise en production |
| 3e | Surveiller *Project → Reports → Bandwidth* et *Database → Storage* | Pendant le pilote |

---

## 10. Suivi en projet pilote

**Indicateurs à surveiller dans le tableau de bord Supabase :**

| Indicateur | Chemin | Seuil d'alerte |
|------------|--------|:-:|
| Bande passante | *Reports → Bandwidth* | > 2,5 GB/mois |
| Stockage DB | *Reports → Database* | > 300 MB |
| Realtime | *Reports → Realtime* | > 1 500 000 msg/mois |

Les données collectées pendant le pilote permettront de valider les hypothèses de volume (envois/jour, sessions/jour) et d'affiner la politique de rétention de `envois_audit`.
