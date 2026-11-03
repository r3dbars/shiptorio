# GitHub connection reliability

GitHub remains the account authority. Cancelling sign-in, blocked cookies, missing
App configuration, a rejected ticket, a bad response, and a provider/network failure
must each leave a visible retry path without disclosing provider bodies or secrets.
The OAuth token exchange has an eight-second network timeout; repository discovery
keeps the shared GitHub client's existing request limits and rate-limit handling.
The first-factory timing target is measured after selecting a repository, excluding
time the player spends approving GitHub's own sign-in and installation screens.

A failed repository discovery does not issue a new session with an empty or partial
repository inventory. Existing account authorization, guest merge behavior, and
same-origin redirect validation still apply. This does not replace GitHub's real
installation consent or relax access to repositories.

The new 2D frontend is owned separately. Backend work must not edit
`web/src/deck2d/` or `web/public/deck/`.
