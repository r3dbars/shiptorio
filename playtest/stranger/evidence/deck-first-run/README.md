# New-player deck evidence (#46)

Real local Worker, D1 and Factory Durable Object; fixture GitHub OAuth, an existing fixture App installation and fake local Codex runner. Each viewport starts a new account/browser/factory. The temporary setup commands shown in baseline screenshots only work against the disposed local test worker; no real credentials appear here.

Baseline: `e03b35b6`, with manual Codex engine and Repo inbox navigation where the product had no direct next action. After: this PR, selecting the repo opens Codex setup; ready leads to the inbox. The test stops before Start issue, and checks no coding job or PR was created. CSS animation is completed for screenshot capture; running-world animation is unchanged.

The specialized Stranger test captures each interaction at 1280×720 and 390×844, sharing the authenticated session. The generic `scripts/shots/deck.mjs` opens a separate guest browser, so the first-run script captures this authenticated sequence directly with Playwright instead.

| Step | Before desktop | Before phone | After desktop | After phone |
| --- | --- | --- | --- | --- |
| enter-deck | [before desktop-1280](before/desktop-1280/01-enter-deck.png) | [before phone-390](before/phone-390/01-enter-deck.png) | [after desktop-1280](after/desktop-1280/01-enter-deck.png) | [after phone-390](after/phone-390/01-enter-deck.png) |
| github-sign-in | [before desktop-1280](before/desktop-1280/02-github-sign-in.png) | [before phone-390](before/phone-390/02-github-sign-in.png) | [after desktop-1280](after/desktop-1280/02-github-sign-in.png) | [after phone-390](after/phone-390/02-github-sign-in.png) |
| choose-repository | [before desktop-1280](before/desktop-1280/03-choose-repository.png) | [before phone-390](before/phone-390/03-choose-repository.png) | [after desktop-1280](after/desktop-1280/03-choose-repository.png) | [after phone-390](after/phone-390/03-choose-repository.png) |
| codex-setup | [before desktop-1280](before/desktop-1280/04-codex-setup.png) | [before phone-390](before/phone-390/04-codex-setup.png) | [after desktop-1280](after/desktop-1280/04-codex-setup.png) | [after phone-390](after/phone-390/04-codex-setup.png) |
| runner-ready | [before desktop-1280](before/desktop-1280/05-runner-ready.png) | [before phone-390](before/phone-390/05-runner-ready.png) | [after desktop-1280](after/desktop-1280/05-runner-ready.png) | [after phone-390](after/phone-390/05-runner-ready.png) |
| first-issue-card | [before desktop-1280](before/desktop-1280/06-first-issue-card.png) | [before phone-390](before/phone-390/06-first-issue-card.png) | [after desktop-1280](after/desktop-1280/06-first-issue-card.png) | [after phone-390](after/phone-390/06-first-issue-card.png) |

Timing reports: [before](before/timings.json), [after](after/timings.json). After totals: desktop 9.856 s; phone 9.611 s. Real GitHub login and installation/download speed, real local Codex sign-in, and physical phones remain manual acceptance checks. Private-preview eligibility is unchanged.
