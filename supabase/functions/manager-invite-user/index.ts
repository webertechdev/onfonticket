import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://onfonticket.pages.dev',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authorization) return json({ error: 'AUTH_REQUIRED' }, 401)

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } } })
  const { data: callerData, error: callerError } = await callerClient.auth.getUser()
  if (callerError || !callerData.user) return json({ error: 'AUTH_REQUIRED' }, 401)

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: callerProfile, error: profileError } = await admin
    .from('profiles')
    .select('id,role:roles(name)')
    .eq('id', callerData.user.id)
    .maybeSingle()
  const roleName = Array.isArray(callerProfile?.role) ? callerProfile.role[0]?.name : (callerProfile?.role as { name?: string } | null)?.name
  if (profileError || roleName !== 'RISK-MANAGER') return json({ error: 'NOT_AUTHORISED' }, 403)

  let body: { email?: string; fullName?: string; role?: 'RISK-MANAGER' | 'RISK-OFFICER' }
  try { body = await request.json() } catch { return json({ error: 'INVALID_JSON' }, 400) }
  const email = body.email?.trim().toLowerCase()
  const fullName = body.fullName?.trim() || email?.split('@')[0] || 'ONFON staff'
  const requestedRole = body.role === 'RISK-MANAGER' ? 'RISK-MANAGER' : 'RISK-OFFICER'
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) return json({ error: 'INVALID_EMAIL' }, 400)

  const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: 'https://onfonticket.pages.dev/auth',
    data: { full_name: fullName },
  })
  if (inviteError) return json({ error: inviteError.message }, 400)

  const { data: roleRow, error: roleError } = await admin.from('roles').select('id').eq('name', requestedRole).single()
  if (roleError || !roleRow) return json({ error: 'ROLE_NOT_FOUND' }, 500)
  const { error: updateError } = await admin.from('profiles').update({ full_name: fullName, role_id: roleRow.id, is_active: true, updated_at: new Date().toISOString() }).eq('id', invited.user.id)
  if (updateError) return json({ error: updateError.message }, 500)

  return json({ userId: invited.user.id, email, role: requestedRole })
})
