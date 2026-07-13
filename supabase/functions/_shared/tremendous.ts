interface SendRewardParams {
  requestId: string;
  recipientName: string;
  recipientEmail: string;
  amountUsd: number;
}

interface SendRewardResult {
  ok: boolean;
  orderId?: string;
  rewardId?: string;
  status?: string;
  errorMessage?: string;
}

// Sends the reward (amount comes from the tester's own record, never a
// hardcoded value) to the tester's approved email — never the submitted
// email; the caller must pass the approved_testers.email value. Uses an
// Idempotency-Key derived from the reimbursement request's own id, so
// retrying a failed/aborted attempt reuses the same Tremendous order
// instead of creating a second reward.
export async function sendTremendousReward(params: SendRewardParams): Promise<SendRewardResult> {
  const apiKey = Deno.env.get("TREMENDOUS_API_KEY");
  const baseUrl = Deno.env.get("TREMENDOUS_BASE_URL") ?? "https://testflight.tremendous.com/api/v2";
  const campaignId = Deno.env.get("TREMENDOUS_CAMPAIGN_ID");

  if (!apiKey || !campaignId) {
    return {
      ok: false,
      errorMessage: "Tremendous is not configured (missing TREMENDOUS_API_KEY or TREMENDOUS_CAMPAIGN_ID).",
    };
  }

  const idempotencyKey = `reimbursement-${params.requestId}`;

  const payload = {
    external_id: idempotencyKey,
    payment: { funding_source_id: "balance" },
    reward: {
      value: { denomination: params.amountUsd, currency_code: "USD" },
      campaign_id: campaignId,
      recipient: { name: params.recipientName, email: params.recipientEmail },
      delivery: { method: "EMAIL" },
    },
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    return { ok: false, errorMessage: `Network error calling Tremendous: ${String(err)}` };
  }

  const responseBody = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      responseBody?.errors?.[0]?.message ||
      responseBody?.message ||
      responseBody?.error?.message ||
      (responseBody ? JSON.stringify(responseBody) : `Tremendous returned HTTP ${response.status}`);
    return { ok: false, errorMessage: String(message).slice(0, 800) };
  }

  const order = responseBody?.order;
  const reward = order?.reward ?? order?.rewards?.[0];

  return {
    ok: true,
    orderId: order?.id,
    rewardId: reward?.id,
    status: reward?.delivery?.status ?? order?.status ?? "unknown",
  };
}
