import { getServiceRoleClient } from "../_shared/supabase-client.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders(req) };

  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const admin = await requireAdmin(req);
  if (!admin) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("reimbursement_requests")
    .select(
      `id, submitted_name, submitted_email, amazon_order_number, status,
       submitted_at, reviewed_at, approved_at, rejected_at,
       tremendous_order_id, tremendous_status, failure_message,
       approved_testers ( full_name, email, reimbursement_amount )`,
    )
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("admin-list-requests: query failed", error);
    return new Response(JSON.stringify({ error: "Failed to load requests" }), { status: 500, headers: jsonHeaders });
  }

  const tremendousMode = (Deno.env.get("TREMENDOUS_MODE") ?? "sandbox").trim().toLowerCase();

  return new Response(JSON.stringify({ requests: data, tremendousMode }), { status: 200, headers: jsonHeaders });
});
