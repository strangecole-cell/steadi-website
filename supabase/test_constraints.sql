-- Run this in the Supabase SQL Editor AFTER running the migrations to
-- verify the constraints behave as intended. Results print as an actual
-- table (last statement is a SELECT), not as notices, so they're visible
-- in every version of the SQL Editor UI.
--
-- This commits real test rows (Test One / Test Two) into your tables.
-- Run supabase/cleanup_test_data.sql afterward to remove them.

create temporary table test_results (
  step int,
  check_name text,
  result text
);

insert into public.approved_testers (full_name, email)
values ('Test One', 'test.one@example.com'),
       ('Test Two', 'test.two@example.com');

insert into test_results values (1, 'two distinct approved testers inserted',
  case when (select count(*) from public.approved_testers where email_normalized in ('test.one@example.com', 'test.two@example.com')) = 2
    then 'PASS' else 'FAIL' end);

do $$
begin
  insert into public.approved_testers (full_name, email) values ('Test One Duplicate', '  Test.One@Example.com  ');
  insert into test_results values (2, 'duplicate email (different case/spacing) rejected', 'FAIL - duplicate was allowed');
exception when unique_violation then
  insert into test_results values (2, 'duplicate email (different case/spacing) rejected', 'PASS');
end $$;

do $$
declare
  v_tester_id uuid;
begin
  select id into v_tester_id from public.approved_testers where email_normalized = 'test.one@example.com';
  insert into public.reimbursement_requests (tester_id, submitted_name, submitted_email, amazon_order_number)
  values (v_tester_id, 'Test One', 'test.one@example.com', '111-1111111-1111111');
  insert into test_results values (3, 'first reimbursement request inserted', 'PASS');
end $$;

do $$
declare
  v_tester_id uuid;
begin
  select id into v_tester_id from public.approved_testers where email_normalized = 'test.one@example.com';
  insert into public.reimbursement_requests (tester_id, submitted_name, submitted_email, amazon_order_number)
  values (v_tester_id, 'Test One', 'test.one@example.com', '222-2222222-2222222');
  insert into test_results values (4, 'second request for same tester rejected', 'FAIL - was allowed');
exception when unique_violation then
  insert into test_results values (4, 'second request for same tester rejected', 'PASS');
end $$;

do $$
declare
  v_tester_id uuid;
begin
  select id into v_tester_id from public.approved_testers where email_normalized = 'test.two@example.com';
  insert into public.reimbursement_requests (tester_id, submitted_name, submitted_email, amazon_order_number)
  values (v_tester_id, 'Test Two', 'test.two@example.com', ' 111-1111111-1111111 ');
  insert into test_results values (5, 'reused Amazon order number rejected', 'FAIL - was allowed');
exception when unique_violation then
  insert into test_results values (5, 'reused Amazon order number rejected', 'PASS');
end $$;

do $$
declare
  v_tester_id uuid;
begin
  select id into v_tester_id from public.approved_testers where email_normalized = 'test.two@example.com';
  insert into public.reimbursement_requests (tester_id, submitted_name, submitted_email, amazon_order_number)
  values (v_tester_id, 'Test Two', 'test.two@example.com', '333-3333333-3333333');
  insert into test_results values (6, 'unique order number for 2nd tester inserted', 'PASS');
end $$;

insert into test_results values (7, 'reimbursement_amount defaulted to 40.00',
  case when (select reimbursement_amount from public.approved_testers where email_normalized = 'test.one@example.com') = 40.00
    then 'PASS' else 'FAIL' end);

update public.approved_testers set full_name = 'Test One Renamed' where email_normalized = 'test.one@example.com';

insert into test_results values (8, 'updated_at trigger fired on update',
  case when (select updated_at from public.approved_testers where email_normalized = 'test.one@example.com') >
            (select created_at from public.approved_testers where email_normalized = 'test.one@example.com')
    then 'PASS' else 'FAIL' end);

select step, check_name, result from test_results order by step;
