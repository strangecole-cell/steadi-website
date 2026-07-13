-- Run this AFTER reviewing the results of test_constraints.sql to remove
-- the test rows it committed (Test One / Test Two), so your real tables
-- are empty and ready for actual tester data.

delete from public.reimbursement_requests
where email_normalized in ('test.one@example.com', 'test.two@example.com');

delete from public.approved_testers
where email_normalized in ('test.one@example.com', 'test.two@example.com');
