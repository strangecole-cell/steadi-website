create table if not exists public.reimbursement_requests (
  id uuid primary key default gen_random_uuid(),
  tester_id uuid not null references public.approved_testers (id) on delete restrict,

  submitted_name text not null,
  submitted_email text not null,
  email_normalized text generated always as (lower(trim(submitted_email))) stored,

  amazon_order_number text not null,
  -- Trimmed + uppercased so "111-2223334-4445555" and " 111-2223334-4445555 "
  -- can't both slip through as "different" order numbers.
  amazon_order_number_normalized text generated always as (upper(trim(amazon_order_number))) stored,

  status text not null default 'pending'
    check (status in ('pending', 'processing', 'paid', 'rejected', 'failed')),

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,

  tremendous_order_id text,
  tremendous_reward_id text,
  tremendous_status text,
  failure_message text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One approved tester can have exactly one reimbursement request, ever.
-- (This is the "has not already submitted or been paid" rule enforced at
-- the database level, on top of the application-level check.)
create unique index if not exists reimbursement_requests_tester_id_key
  on public.reimbursement_requests (tester_id);

-- One Amazon order number can only be used for one reimbursement request.
create unique index if not exists reimbursement_requests_order_number_key
  on public.reimbursement_requests (amazon_order_number_normalized);

-- Used by the admin page to list pending requests quickly.
create index if not exists reimbursement_requests_status_idx
  on public.reimbursement_requests (status);

drop trigger if exists reimbursement_requests_set_updated_at on public.reimbursement_requests;
create trigger reimbursement_requests_set_updated_at
  before update on public.reimbursement_requests
  for each row execute function public.set_updated_at();
