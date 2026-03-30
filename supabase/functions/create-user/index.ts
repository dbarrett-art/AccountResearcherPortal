import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    // Verify caller identity
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing auth header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify caller's token and check admin role
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid auth token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: callerProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse request
    const { email, name, role, credits } = await req.json()

    if (!email) {
      return new Response(JSON.stringify({ error: 'Email is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Invite user — sends them an email with a magic link
    // The handle_new_user trigger will auto-create the users row
    const { data: inviteData, error: createError } = await adminClient.auth.admin.inviteUserByEmail(
      email,
      {
        data: {
          name: name || email.split('@')[0],
        },
        redirectTo: 'https://dbarrett-art.github.io/AccountResearcherPortal/',
      }
    )

    if (createError) {
      return new Response(JSON.stringify({ error: createError.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const newUser = inviteData?.user
    if (!newUser) {
      return new Response(JSON.stringify({ error: 'User creation returned no data' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // The trigger creates with role='ae' and credits=5 by default.
    // Update if the caller specified different values.
    const updates: Record<string, unknown> = {}
    if (role && role !== 'ae') updates.role = role
    if (credits !== undefined && credits !== 5) updates.credits_remaining = credits
    if (name) updates.name = name

    if (Object.keys(updates).length > 0) {
      await adminClient
        .from('users')
        .update(updates)
        .eq('id', newUser.id)
    }

    return new Response(JSON.stringify({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: name || email.split('@')[0],
        role: role || 'ae',
        credits: credits ?? 5,
      },
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
