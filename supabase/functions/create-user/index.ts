import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return json({ success: false, error: 'Missing auth header' })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Verify caller's token and check admin role
    const { data: { user: caller }, error: authError } = await adminClient.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !caller) {
      return json({ success: false, error: `Auth failed: ${authError?.message || 'no user'}` })
    }

    const { data: callerProfile } = await adminClient
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single()

    if (callerProfile?.role !== 'admin') {
      return json({ success: false, error: `Admin required. Your role: ${callerProfile?.role || 'unknown'}` })
    }

    const { email, name, role, credits } = await req.json()

    if (!email) {
      return json({ success: false, error: 'Email is required' })
    }

    // Invite user — sends them an email with a magic link
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
      return json({ success: false, error: `Invite failed: ${createError.message}` })
    }

    const newUser = inviteData?.user
    if (!newUser) {
      return json({ success: false, error: 'Invite returned no user data' })
    }

    // The trigger creates with role='ae' and credits=5 by default.
    // Update if the caller specified different values.
    const updates: Record<string, unknown> = {}
    if (role && role !== 'ae') updates.role = role
    if (credits !== undefined && credits !== 5) updates.credits_remaining = credits
    if (name) updates.name = name

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await adminClient
        .from('users')
        .update(updates)
        .eq('id', newUser.id)
      if (updateError) {
        // User was created but profile update failed — not fatal
        console.error('Profile update failed:', updateError.message)
      }
    }

    return json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        name: name || email.split('@')[0],
        role: role || 'ae',
        credits: credits ?? 5,
      },
    })
  } catch (err) {
    return json({ success: false, error: `Unexpected: ${(err as Error).message}` })
  }
})
