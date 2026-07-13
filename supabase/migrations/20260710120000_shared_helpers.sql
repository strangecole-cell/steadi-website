-- Shared helper: keeps updated_at current on every row update.
-- Used by both approved_testers and reimbursement_requests.

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
