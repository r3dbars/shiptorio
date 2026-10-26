# Goal 12: controlled signup and abuse protection

Oct 26 checkpoint: controlled access before factories spend resources. Signup uses
GitHub identity, an email/GitHub waitlist, admin approval and one-use invite codes.
Email entries do not grant access until an admin links a verified GitHub identity.
The shared password remains available through an explicit fallback flag.

Implementation in progress. No shared protocol or web map changes planned. Quotas
will use atomic D1 admission so concurrent requests cannot overspend a user limit.
Goal 10 budget integration and current auth work will be checked before merge.
