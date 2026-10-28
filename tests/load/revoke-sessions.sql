-- Run only with the pinned shiptorio-staging D1 config after the load window.
-- Retain fixture identities for reproducibility, but revoke every bearer session.
DELETE FROM sessions
WHERE user_id IN (900000001, 900000002, 900000003, 900000004, 900000005, -900000001, -900000002, -900000003, -900000004, -900000005)
  AND user_id IN (SELECT id FROM users WHERE login IN (
    'staging-load-0', 'staging-load-1', 'staging-load-2', 'staging-load-3', 'staging-load-4'
  ));
