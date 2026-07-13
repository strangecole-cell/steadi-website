import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Service-role client for use inside Edge Functions only. Never import
// this into any browser-facing code — the service role key bypasses RLS.
export function getServiceRoleClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variable",
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
