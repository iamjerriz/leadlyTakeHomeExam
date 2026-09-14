import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Service-role client for server-side use only. Never expose this key to a
// browser/client — it bypasses row-level security.
export const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});
