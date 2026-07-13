create table if not exists public.approved_testers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  -- Generated + stored so it stays automatically in sync with `email`,
  -- and can carry a real unique index for case-insensitive matching.
  email_normalized text generated always as (lower(trim(email))) stored,
  reimbursement_amount numeric(10,2) not null default 40.00,
  status text not null default 'invited'
    check (status in ('invited', 'submitted', 'approved', 'paid', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One approved-tester record per email, regardless of case/spacing.
create unique index if not exists approved_testers_email_normalized_key
  on public.approved_testers (email_normalized);

drop trigger if exists approved_testers_set_updated_at on public.approved_testers;
create trigger approved_testers_set_updated_at
  before update on public.approved_testers
  for each row execute function public.set_updated_at();
