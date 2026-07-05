---
name: Projet OPTILAB envois
description: Stack, structure, architecture générale et décisions techniques du projet
type: project
---

# Projet OPTILAB envois

## Stack
- **Frontend** : HTML/CSS/JS vanille, modules ES natifs, pas de framework
- **Backend** : Supabase (PostgreSQL + Auth + Edge Functions Deno + Realtime)
- **Plan Supabase** : Free (les crons Supabase sont disponibles sur ce plan)
- **Déploiement** : Vercel ou hébergement statique

## Structure JS
- `app.js` : initialisation Supabase, variables globales, DOMContentLoaded (~120 lignes)
- `state.js` : bridge getters/setters window.* → state.*
- `utils.js`, `auth.js`, `ui.js`, `labs.js`, `app-config.js`, `envois.js`, `hgrappe.js`, `print.js`, `print-hg.js`, `hgrappe.js`
- `main.js` : point d'entrée ES modules, expose tout sur window via Object.assign

## Conventions
- Toutes les fonctions exportées dans les modules doivent aussi être dans l'import ET le Object.assign(window,{}) de main.js
- Les fonctions privées (non exportées) restent dans leur module
- Pas de bundler — ES modules natifs directs

## Décisions clés
- **Multi-labo** : `labo_ids UUID[]` sur profiles + `activeLabo` state + écran picker (scr-labo)
- **Crons** : Supabase cron jobs disponibles sur le plan Free (contrairement à ce que je pensais)
- **Notifications email** : Edge Functions send-notifications + test-notification, déployées avec --no-verify-jwt, sécurisées par NOTIF_SECRET custom header
