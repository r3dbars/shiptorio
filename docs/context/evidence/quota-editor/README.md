# Focused quota editor repair

Before: the existing Raise limit URL `/admin/signup?login=fixture` redirects to
`/admin` and has no quota controls. Captured from the actual pre-repair route in
an isolated signed admin fixture.

After: native browser save/reload tests on the repaired application show the
focused selected-account form and persisted 250-run quota. Tests also fetch the
real limits API (outside the browser route mock) to verify effective values.

Screenshots are 390×844 and 1280×720 and were inspected. No live account quotas or
production resources were changed.
