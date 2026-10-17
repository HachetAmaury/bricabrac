// Creates the first admin account. Usage:
//   npm run admin:create -- <email> <password> "<display name>"
// Needs SUPABASE_SERVICE_ROLE_KEY (server-side secret, never commit it).
import { createClient } from '@supabase/supabase-js'

const DEFAULT_URL = 'https://bkppqrnfxyacngmmamkw.supabase.co'

const [email, password, displayName] = process.argv.slice(2)
if (!email || !password || !displayName) {
  console.error('Usage: npm run admin:create -- <email> <password> "<display name>"')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || DEFAULT_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!serviceKey) {
  console.error('Missing SUPABASE_SERVICE_ROLE_KEY (set it in .env or the environment).')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } })

// is_admin lives in app_metadata: users can edit user_metadata, not app_metadata.
const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: displayName },
  app_metadata: { is_admin: true },
})

if (error) {
  console.error(`Failed to create admin: ${error.message}`)
  process.exit(1)
}
const userId = data.user.id

// The profiles trigger may not see app_metadata at insert time: set the flag explicitly.
const { error: profileError } = await supabase
  .from('profiles')
  .update({ is_admin: true, display_name: displayName })
  .eq('id', userId)
if (profileError) {
  console.error(`User ${userId} created, but setting profiles.is_admin failed: ${profileError.message}`)
  process.exit(1)
}
console.log(`Admin created: ${userId}`)
