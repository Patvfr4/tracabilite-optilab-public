// Supabase Edge Function — manage-user
// Permet aux superviseurs et admins de créer/modifier des utilisateurs.
// Utilise le service role key (côté serveur uniquement, jamais exposé au client).

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, payload } = await req.json()

    // Client admin (service role) — accès complet, contourne le RLS
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Client utilisateur — pour vérifier ses permissions via le token JWT
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
        auth: { autoRefreshToken: false, persistSession: false }
      }
    )

    // Vérifier l'identité du demandeur
    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Non authentifié' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Vérifier le rôle du demandeur
    const { data: requesterProfile } = await adminClient
      .from('profiles')
      .select('role, labo_id')
      .eq('id', user.id)
      .single()

    if (!requesterProfile || !['superviseur_labo', 'superviseur_grappe', 'admin'].includes(requesterProfile.role)) {
      return new Response(JSON.stringify({ error: 'Droits insuffisants' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION : créer un utilisateur ────────────────────────────
    if (action === 'create') {
      const { employee_id, password, nom, labo_id, labo_ids: rawLaboIds, role } = payload
      // labo_ids doit toujours contenir au moins labo_id
      const labo_ids: string[] = rawLaboIds && rawLaboIds.length > 0
        ? rawLaboIds
        : (labo_id ? [labo_id] : [])

      // Un superviseur_labo ne peut créer des comptes que dans son laboratoire
      if (requesterProfile.role === 'superviseur_labo' && labo_id !== requesterProfile.labo_id) {
        return new Response(JSON.stringify({ error: 'Vous ne pouvez créer des utilisateurs que pour votre laboratoire' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Un superviseur_labo ne peut pas attribuer un rôle supérieur au sien
      if (requesterProfile.role === 'superviseur_labo' && ['admin', 'superviseur_grappe'].includes(role)) {
        return new Response(JSON.stringify({ error: 'Rôle non autorisé' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const email = `${employee_id.toLowerCase()}@optilab.internal`

      // Créer l'utilisateur dans Supabase Auth
      const { data: authUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      })

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Créer le profil applicatif (labo_ids inclus dès la création)
      const { error: profileError } = await adminClient.from('profiles').insert({
        id: authUser.user.id,
        employee_id,
        nom,
        labo_id,
        labo_ids,
        role,
        must_change_password: true,
        active: true,
      })

      if (profileError) {
        // Rollback : supprimer l'utilisateur Auth créé pour éviter les comptes orphelins
        await adminClient.auth.admin.deleteUser(authUser.user.id)
        return new Response(JSON.stringify({ error: profileError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({ success: true, employee_id }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION : réinitialiser le mot de passe ───────────────────
    if (action === 'reset_password') {
      const { profile_id, new_password } = payload

      // Vérifier que le demandeur a le droit de modifier cet utilisateur
      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('labo_id, role')
        .eq('id', profile_id)
        .single()

      if (!targetProfile) {
        return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (targetProfile.role === 'admin' && requesterProfile.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Les comptes administrateur ne peuvent être modifiés que par un administrateur' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (
        requesterProfile.role === 'superviseur_labo' &&
        targetProfile.labo_id !== requesterProfile.labo_id
      ) {
        return new Response(JSON.stringify({ error: 'Droits insuffisants' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      const { error: resetError } = await adminClient.auth.admin.updateUserById(profile_id, {
        password: new_password,
      })

      if (resetError) {
        return new Response(JSON.stringify({ error: resetError.message }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      // Forcer le changement de mot de passe à la prochaine connexion
      await adminClient.from('profiles')
        .update({ must_change_password: true })
        .eq('id', profile_id)

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // ── ACTION : désactiver / activer un utilisateur ─────────────
    if (action === 'toggle_active') {
      const { profile_id, active } = payload

      const { data: targetProfile } = await adminClient
        .from('profiles')
        .select('role, labo_id')
        .eq('id', profile_id)
        .single()

      if (!targetProfile) {
        return new Response(JSON.stringify({ error: 'Utilisateur introuvable' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (targetProfile.role === 'admin' && requesterProfile.role !== 'admin') {
        return new Response(JSON.stringify({ error: 'Les comptes administrateur ne peuvent être modifiés que par un administrateur' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      if (
        requesterProfile.role === 'superviseur_labo' &&
        targetProfile.labo_id !== requesterProfile.labo_id
      ) {
        return new Response(JSON.stringify({ error: 'Droits insuffisants' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }

      await adminClient.from('profiles')
        .update({ active })
        .eq('id', profile_id)

      return new Response(JSON.stringify({ success: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
