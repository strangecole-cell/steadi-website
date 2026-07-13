-- Both tables hold sensitive tester PII and payout data, and every
-- read/write in this system goes through server-side Edge Functions using
-- the service_role key (which bypasses RLS entirely). So RLS is enabled
-- with NO policies for the anon/authenticated roles: the public Supabase
-- API (PostgREST) has zero access to these tables. Only the service_role
-- key, used exclusively in Edge Functions, can read or write them.

alter table public.approved_testers enable row level security;
alter table public.reimbursement_requests enable row level security;
