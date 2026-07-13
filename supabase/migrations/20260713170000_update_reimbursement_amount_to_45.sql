-- Reward bumped from $40 to $45 to cover tester tax variance across states.

alter table public.approved_testers
  alter column reimbursement_amount set default 45.00;

-- Only backfill testers who haven't been paid yet — never rewrite the
-- on-file amount for someone whose reward has already gone out.
update public.approved_testers
set reimbursement_amount = 45.00
where status = 'invited'
  and reimbursement_amount = 40.00;
