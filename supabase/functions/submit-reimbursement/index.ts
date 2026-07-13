import { getServiceRoleClient } from "../_shared/supabase-client.ts";
import { corsHeaders, handlePreflight } from "../_shared/cors.ts";

// One message for every failure reason (wrong code, unknown email, name
// mismatch, already submitted, reused order number, ...) so the response
// never reveals *why* a submission was rejected.
const GENERIC_ERROR = "We could not verify this submission. Please check your information and try again.";

const MAX_LEN = { name: 200, email: 254, order: 64, code: 100 };

// Best-effort in-memory rate limit — resets on cold start and isn't shared
// across scaled instances, but it's a cheap deterrent against a script
// hammering this single low-traffic form. The real duplicate-submission
// protection is the DB unique constraints, not this.
const attempts = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 5;

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recent = (attempts.get(ip) ?? []).filter((t) => t > windowStart);
  recent.push(now);
  attempts.set(ip, recent);
  return recent.length > RATE_LIMIT_MAX;
}

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aBytes = enc.encode(a);
  const bBytes = enc.encode(b);

  if (aBytes.length !== bBytes.length) {
    // Still touch every byte of `a` so the failure path takes comparable
    // time whether or not the length matches.
    let dummy = 0;
    for (let i = 0; i < aBytes.length; i++) dummy |= aBytes[i];
    return false;
  }

  let diff = 0;
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i];
  return diff === 0;
}

function clean(value: unknown, maxLen: number): string | null {
  if (typeof value !== "string") return null;
  // deno-lint-ignore no-control-regex
  const trimmed = value.trim().replace(/[\x00-\x1F\x7F]/g, "");
  if (!trimmed || trimmed.length > maxLen) return null;
  return trimmed;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[.,''\-]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Forgiving on purpose: ignores case, extra spaces, and minor punctuation.
// Never the sole authorization check — email match + tester code are
// required regardless of how well the name matches.
function namesReasonablyMatch(submitted: string, onFile: string): boolean {
  const a = nameTokens(submitted);
  const b = nameTokens(onFile);
  if (a.length === 0 || b.length === 0) return false;

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  const longerSet = new Set(longer);
  const matchedTokens = shorter.filter((t) => longerSet.has(t)).length;

  return matchedTokens === shorter.length && (shorter.length >= 2 || longer.length >= 2);
}

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const jsonHeaders = { "Content-Type": "application/json", ...corsHeaders(req) };
  const fail = (status = 400) =>
    new Response(JSON.stringify({ error: GENERIC_ERROR }), { status, headers: jsonHeaders });

  if (req.method !== "POST") {
    return fail(405);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (isRateLimited(ip)) {
    return fail(429);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail();
  }

  const fullName = clean(body.full_name, MAX_LEN.name);
  const email = clean(body.email, MAX_LEN.email);
  const orderNumber = clean(body.amazon_order_number, MAX_LEN.order);
  const testerCode = clean(body.tester_code, MAX_LEN.code);

  if (!fullName || !email || !orderNumber || !testerCode) {
    return fail();
  }

  const expectedCode = Deno.env.get("STEADI_TESTER_CODE") ?? "";
  if (!expectedCode || !timingSafeEqual(testerCode, expectedCode)) {
    return fail();
  }

  const supabase = getServiceRoleClient();
  const emailNormalized = normalizeEmail(email);

  const { data: tester, error: testerError } = await supabase
    .from("approved_testers")
    .select("id, full_name, status")
    .eq("email_normalized", emailNormalized)
    .maybeSingle();

  if (testerError) {
    console.error("submit-reimbursement: tester lookup failed", testerError);
    return fail(500);
  }

  if (!tester) {
    return fail();
  }

  if (!namesReasonablyMatch(fullName, tester.full_name)) {
    return fail();
  }

  if (tester.status === "submitted" || tester.status === "approved" || tester.status === "paid") {
    return fail();
  }

  const { data: existingByTester } = await supabase
    .from("reimbursement_requests")
    .select("id")
    .eq("tester_id", tester.id)
    .maybeSingle();

  if (existingByTester) {
    return fail();
  }

  const orderNormalized = orderNumber.toUpperCase();
  const { data: existingByOrder } = await supabase
    .from("reimbursement_requests")
    .select("id")
    .eq("amazon_order_number_normalized", orderNormalized)
    .maybeSingle();

  if (existingByOrder) {
    return fail();
  }

  const { error: insertError } = await supabase.from("reimbursement_requests").insert({
    tester_id: tester.id,
    submitted_name: fullName,
    submitted_email: email,
    amazon_order_number: orderNumber,
  });

  if (insertError) {
    // A unique_violation here means a race condition slipped past the
    // pre-checks above (two near-simultaneous submissions) — still a
    // generic error to the client, but worth distinguishing in logs.
    console.error("submit-reimbursement: insert failed", insertError);
    return fail(insertError.code === "23505" ? 400 : 500);
  }

  const { error: statusUpdateError } = await supabase
    .from("approved_testers")
    .update({ status: "submitted" })
    .eq("id", tester.id);

  if (statusUpdateError) {
    console.error("submit-reimbursement: tester status update failed", statusUpdateError);
  }

  return new Response(JSON.stringify({ success: true }), { status: 200, headers: jsonHeaders });
});
