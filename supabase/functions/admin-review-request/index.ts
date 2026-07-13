import { getServiceRoleClient } from "../_shared/supabase-client.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { requireAdmin } from "../_shared/require-admin.ts";
import { sendTremendousReward } from "../_shared/tremendous.ts";

type ServiceClient = ReturnType<typeof getServiceRoleClient>;

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders(req) };

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  }

  const admin = await requireAdmin(req);
  if (!admin) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers: jsonHeaders });
  }

  const requestId = typeof body.request_id === "string" ? body.request_id : null;
  const action =
    body.action === "approve" || body.action === "reject" || body.action === "retry" ? body.action : null;

  if (!requestId || !action) {
    return new Response(
      JSON.stringify({ error: "request_id and action ('approve', 'reject', or 'retry') are required" }),
      { status: 400, headers: jsonHeaders },
    );
  }

  const supabase = getServiceRoleClient();
  const now = new Date().toISOString();

  if (action === "reject") {
    const { data: updated, error: updateError } = await supabase
      .from("reimbursement_requests")
      .update({ reviewed_at: now, rejected_at: now, status: "rejected" })
      .eq("id", requestId)
      .is("reviewed_at", null)
      .select("id, tester_id")
      .maybeSingle();

    if (updateError) {
      console.error("admin-review-request: reject update failed", updateError);
      return new Response(JSON.stringify({ error: "Failed to update request" }), { status: 500, headers: jsonHeaders });
    }
    if (!updated) {
      return new Response(JSON.stringify({ error: "This request has already been reviewed." }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    const { error: testerError } = await supabase
      .from("approved_testers")
      .update({ status: "rejected" })
      .eq("id", updated.tester_id);
    if (testerError) console.error("admin-review-request: tester status update failed", testerError);

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
  }

  if (action === "approve") {
    // Guards against double-clicks / two admin tabs reviewing the same
    // request: only matches a row that hasn't been reviewed yet.
    const { data: updated, error: updateError } = await supabase
      .from("reimbursement_requests")
      .update({ reviewed_at: now, approved_at: now })
      .eq("id", requestId)
      .is("reviewed_at", null)
      .select("id, tester_id")
      .maybeSingle();

    if (updateError) {
      console.error("admin-review-request: approve update failed", updateError);
      return new Response(JSON.stringify({ error: "Failed to update request" }), { status: 500, headers: jsonHeaders });
    }
    if (!updated) {
      return new Response(JSON.stringify({ error: "This request has already been reviewed." }), {
        status: 409,
        headers: jsonHeaders,
      });
    }

    const { error: testerError } = await supabase
      .from("approved_testers")
      .update({ status: "approved" })
      .eq("id", updated.tester_id);
    if (testerError) console.error("admin-review-request: tester status update failed", testerError);

    return await processPayout(supabase, updated.id, updated.tester_id, jsonHeaders);
  }

  // action === "retry" — for requests already approved whose payout attempt
  // previously failed (or never got picked up). Never re-runs the review
  // guard above; only re-attempts the Tremendous call.
  const { data: existing, error: fetchError } = await supabase
    .from("reimbursement_requests")
    .select("id, tester_id, approved_at, status")
    .eq("id", requestId)
    .maybeSingle();

  if (fetchError || !existing) {
    return new Response(JSON.stringify({ error: "Request not found" }), { status: 404, headers: jsonHeaders });
  }
  if (!existing.approved_at || !["pending", "failed"].includes(existing.status)) {
    return new Response(JSON.stringify({ error: "This request is not eligible for a payout retry." }), {
      status: 409,
      headers: jsonHeaders,
    });
  }

  return await processPayout(supabase, existing.id, existing.tester_id, jsonHeaders);
});

async function processPayout(
  supabase: ServiceClient,
  requestId: string,
  testerId: string,
  jsonHeaders: Record<string, string>,
) {
  // Atomically claim the row before calling Tremendous: only a row still
  // in 'pending' or 'failed' can be claimed, so a concurrent click/retry
  // (or this same request racing itself) can't trigger two Tremendous
  // calls for one reimbursement.
  const { data: claimed, error: claimError } = await supabase
    .from("reimbursement_requests")
    .update({ status: "processing" })
    .eq("id", requestId)
    .in("status", ["pending", "failed"])
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error("admin-review-request: claim for processing failed", claimError);
    return new Response(JSON.stringify({ error: "Failed to start payout" }), { status: 500, headers: jsonHeaders });
  }

  if (!claimed) {
    return new Response(
      JSON.stringify({ success: true, note: "Payout already in progress or completed." }),
      { status: 200, headers: jsonHeaders },
    );
  }

  const { data: tester } = await supabase
    .from("approved_testers")
    .select("full_name, email, reimbursement_amount")
    .eq("id", testerId)
    .maybeSingle();

  if (!tester) {
    await supabase
      .from("reimbursement_requests")
      .update({ status: "failed", failure_message: "Approved tester record not found." })
      .eq("id", requestId);
    return new Response(JSON.stringify({ error: "Approved tester record not found." }), {
      status: 500,
      headers: jsonHeaders,
    });
  }

  // The reward always goes to the tester's approved email on file — never
  // the (possibly different) email submitted through the public form.
  const result = await sendTremendousReward({
    requestId,
    recipientName: tester.full_name,
    recipientEmail: tester.email,
    amountUsd: Number(tester.reimbursement_amount),
  });

  if (!result.ok) {
    await supabase
      .from("reimbursement_requests")
      .update({ status: "failed", failure_message: result.errorMessage ?? "Unknown Tremendous error" })
      .eq("id", requestId);

    return new Response(JSON.stringify({ error: result.errorMessage ?? "Tremendous payout failed." }), {
      status: 502,
      headers: jsonHeaders,
    });
  }

  await supabase
    .from("reimbursement_requests")
    .update({
      status: "paid",
      tremendous_order_id: result.orderId ?? null,
      tremendous_reward_id: result.rewardId ?? null,
      tremendous_status: result.status ?? null,
      failure_message: null,
    })
    .eq("id", requestId);

  const { error: testerPaidError } = await supabase
    .from("approved_testers")
    .update({ status: "paid" })
    .eq("id", testerId);
  if (testerPaidError) console.error("admin-review-request: tester paid status update failed", testerPaidError);

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
}
