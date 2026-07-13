import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Verifies the caller is a logged-in Supabase Auth user whose email matches
// the single allowed admin address. Returns the user on success, or null if
// the request should be rejected (no/invalid token, or wrong email).
export async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY environment variable");
  }

  const authClient = createClient(supabaseUrl, anonKey);
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data.user || !data.user.email) return null;

  const adminEmail = (Deno.env.get("ADMIN_EMAIL") ?? "").trim().toLowerCase();
  if (!adminEmail || data.user.email.trim().toLowerCase() !== adminEmail) return null;

  return data.user;
}
