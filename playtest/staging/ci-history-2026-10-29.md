# CI history audit — 2026-10-29

Window: 2026-10-26 00:00 UTC through the audit at 2026-10-29 18:12 UTC. Historical failures are not claims that the current head is failing.

## Current proof

[Full diagnostic suite](https://github.com/r3dbars/shiptorio/actions/runs/40925086070) passed check, selfhost, all six browser shards, load and release-validation on `e03b35b6`. This predates the current batch and is not the final two-run acceptance.

## What was checked

- 226 failed workflow runs: 120 CI, 67 Stranger E2E, 20 Deploy, 13 Staging, five retired Stranger path, one Player bot.
- Downloaded available failed-job logs; 73 older logs are unavailable (`log not found` from GitHub). Their run/job status is still listed below; exact missing assertions cannot be reconstructed honestly.
- Examined 78 successful full-scope CI runs for retry/sample markers. Playwright is configured with `retries: 0`, including its original checked-in configuration. No automatic browser retry markers were found.
- One successful run used the existing median-of-three load sampler. This policy was not changed.
- Four successful CI runs were manual second attempts. One followed cancellation; three followed infrastructure startup failures with no failed test steps.

## Manual reruns

- [Run 40731466110](https://github.com/r3dbars/shiptorio/actions/runs/40731466110): first-attempt jobs: check=cancelled, selfhost=cancelled, browser=skipped, load=skipped, full-suite=cancelled.
- [Run 40489472746](https://github.com/r3dbars/shiptorio/actions/runs/40489472746): first-attempt jobs: check=failure, selfhost=failure, browser=skipped, load=skipped.
- [Run 40489185520](https://github.com/r3dbars/shiptorio/actions/runs/40489185520): first-attempt jobs: selfhost=failure, check=failure, load=skipped, browser=skipped.
- [Run 40489183676](https://github.com/r3dbars/shiptorio/actions/runs/40489183676): first-attempt jobs: check=failure, selfhost=failure, browser=skipped, load=skipped.

## Additional load samples

- [Run 40794697814](https://github.com/r3dbars/shiptorio/actions/runs/40794697814) on `d30878a5`: 2026-10-29T00:40:00.2416001Z load run 2: latency p95 1830ms, tick p95 4601ms; 2026-10-29T00:42:38.0793751Z load run 3: latency p95 1383ms, tick p95 2995ms; 2026-10-29T00:42:38.0795721Z median of 3: latency p95 1830ms (budget 3000), tick p95 4601ms (budget 5000)

## Current remediation

The single recent Player bot failure timed out taking a screenshot after navigation. The bot now exercises the actual 2D deck, synchronizes captures with URL and deck-ready signals, and retains the real held Launch and socket receipt checks. Its provider fixture follows the actual GitHub App install URL/callback contract. A new deployed guest smoke verifies the product entry after staging deployment. No tests were disabled or given automatic retries.

## Every failed run

| Run | UTC | Workflow | Failed job / step | Log |
| --- | --- | --- | --- | --- |
| [40910345749](https://github.com/r3dbars/shiptorio/actions/runs/40910345749) | 2026-10-29T16:18:57Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40909836164](https://github.com/r3dbars/shiptorio/actions/runs/40909836164) | 2026-10-29T16:15:52Z | CI | check: Run bun test --parallel | available |
| [40903335812](https://github.com/r3dbars/shiptorio/actions/runs/40903335812) | 2026-10-29T15:36:47Z | CI | check: Run bun test --parallel | available |
| [40875947198](https://github.com/r3dbars/shiptorio/actions/runs/40875947198) | 2026-10-29T12:45:44Z | Staging | deploy: Run bun test --parallel | available |
| [40872665571](https://github.com/r3dbars/shiptorio/actions/runs/40872665571) | 2026-10-29T12:22:05Z | Player bot | local: Run bun run playtest:bot -- --persona test-newbie --url http://localhost:8809 --out playtest/out/local | available |
| [40797924647](https://github.com/r3dbars/shiptorio/actions/runs/40797924647) | 2026-10-29T01:02:23Z | Staging | deploy: Run bun test --parallel | available |
| [40797547990](https://github.com/r3dbars/shiptorio/actions/runs/40797547990) | 2026-10-29T00:58:58Z | Staging | deploy: Run bun test --parallel | available |
| [40776221120](https://github.com/r3dbars/shiptorio/actions/runs/40776221120) | 2026-10-28T21:57:59Z | Staging | deploy: Verify preview-gated signed fixture service hop | available |
| [40774943679](https://github.com/r3dbars/shiptorio/actions/runs/40774943679) | 2026-10-28T21:48:17Z | CI | check: Run bun test --parallel | available |
| [40774570726](https://github.com/r3dbars/shiptorio/actions/runs/40774570726) | 2026-10-28T21:45:30Z | CI | check: Run bun test --parallel | available |
| [40774529345](https://github.com/r3dbars/shiptorio/actions/runs/40774529345) | 2026-10-28T21:45:13Z | CI | check: Run bun test --parallel | available |
| [40774529659](https://github.com/r3dbars/shiptorio/actions/runs/40774529659) | 2026-10-28T21:45:13Z | CI | check: Run bun test --parallel | available |
| [40774528901](https://github.com/r3dbars/shiptorio/actions/runs/40774528901) | 2026-10-28T21:45:12Z | CI | check: Run bun test --parallel | available |
| [40774464837](https://github.com/r3dbars/shiptorio/actions/runs/40774464837) | 2026-10-28T21:44:45Z | CI | check: Run bun test --parallel | available |
| [40774397299](https://github.com/r3dbars/shiptorio/actions/runs/40774397299) | 2026-10-28T21:44:14Z | Staging | deploy: Run bun test --parallel | available |
| [40774198660](https://github.com/r3dbars/shiptorio/actions/runs/40774198660) | 2026-10-28T21:42:45Z | CI | check: Run bun test --parallel | available |
| [40773968559](https://github.com/r3dbars/shiptorio/actions/runs/40773968559) | 2026-10-28T21:41:02Z | Staging | deploy: Run bun test --parallel | available |
| [40771296604](https://github.com/r3dbars/shiptorio/actions/runs/40771296604) | 2026-10-28T21:21:41Z | Staging | deploy: Deploy isolated staging | available |
| [40767663802](https://github.com/r3dbars/shiptorio/actions/runs/40767663802) | 2026-10-28T20:56:17Z | Staging | deploy: Deploy isolated staging | available |
| [40765817029](https://github.com/r3dbars/shiptorio/actions/runs/40765817029) | 2026-10-28T20:43:32Z | CI | check: Typecheck, build and runner verification boundary (in parallel) | available |
| [40765682609](https://github.com/r3dbars/shiptorio/actions/runs/40765682609) | 2026-10-28T20:42:36Z | Staging | deploy: Deploy isolated staging | available |
| [40764108026](https://github.com/r3dbars/shiptorio/actions/runs/40764108026) | 2026-10-28T20:31:54Z | Staging | deploy: Update existing private fixture | available |
| [40751535684](https://github.com/r3dbars/shiptorio/actions/runs/40751535684) | 2026-10-28T19:08:07Z | CI | browser (iphone-14, 1): Run browser tests; browser (desktop, 1): Run browser tests | available |
| [40749753190](https://github.com/r3dbars/shiptorio/actions/runs/40749753190) | 2026-10-28T18:56:29Z | CI | check: Run bun test --parallel; browser (desktop, 1): Run browser tests; browser (iphone-14, 1): Run browser tests; browser (pixel-7, 1): Run browser tests | available |
| [40749550225](https://github.com/r3dbars/shiptorio/actions/runs/40749550225) | 2026-10-28T18:55:07Z | Staging | deploy: Run curl --fail --retry 3 --retry-delay 5 https://shiptorio.dev/api/health | available |
| [40749224680](https://github.com/r3dbars/shiptorio/actions/runs/40749224680) | 2026-10-28T18:52:59Z | CI | check: Run bun test --parallel | available |
| [40747088893](https://github.com/r3dbars/shiptorio/actions/runs/40747088893) | 2026-10-28T18:39:03Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40746719193](https://github.com/r3dbars/shiptorio/actions/runs/40746719193) | 2026-10-28T18:36:37Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40746486892](https://github.com/r3dbars/shiptorio/actions/runs/40746486892) | 2026-10-28T18:35:07Z | CI | browser (desktop, 1): Run browser tests; browser (iphone-14, 1): Run browser tests; browser (pixel-7, 1): Run browser tests | available |
| [40745228815](https://github.com/r3dbars/shiptorio/actions/runs/40745228815) | 2026-10-28T18:27:03Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40744139885](https://github.com/r3dbars/shiptorio/actions/runs/40744139885) | 2026-10-28T18:20:10Z | CI | browser (desktop, 1): Run browser tests; browser (pixel-7, 1): Run browser tests; browser (iphone-14, 1): Run browser tests | available |
| [40742692950](https://github.com/r3dbars/shiptorio/actions/runs/40742692950) | 2026-10-28T18:10:54Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40740072656](https://github.com/r3dbars/shiptorio/actions/runs/40740072656) | 2026-10-28T17:54:06Z | Staging | deploy: Verify preview-gated signed fixture service hop | available |
| [40731284446](https://github.com/r3dbars/shiptorio/actions/runs/40731284446) | 2026-10-28T16:59:03Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40729079346](https://github.com/r3dbars/shiptorio/actions/runs/40729079346) | 2026-10-28T16:45:21Z | Staging | deploy: Run bun run typecheck && bun test && bun run build | available |
| [40722395710](https://github.com/r3dbars/shiptorio/actions/runs/40722395710) | 2026-10-28T16:04:49Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40719337582](https://github.com/r3dbars/shiptorio/actions/runs/40719337582) | 2026-10-28T15:46:26Z | CI | load: Run bun run test:load | available |
| [40716111907](https://github.com/r3dbars/shiptorio/actions/runs/40716111907) | 2026-10-28T15:27:18Z | CI | load: Run bun run test:load; browser (pixel-7): Run browser tests; browser (desktop): Run browser tests; browser (iphone-14): Run browser tests | available |
| [40716107444](https://github.com/r3dbars/shiptorio/actions/runs/40716107444) | 2026-10-28T15:27:17Z | CI | load: Run bun run test:load; browser (iphone-14): Run browser tests | available |
| [40710598884](https://github.com/r3dbars/shiptorio/actions/runs/40710598884) | 2026-10-28T14:54:36Z | CI | browser (pixel-7, 1): Run browser tests | available |
| [40707196857](https://github.com/r3dbars/shiptorio/actions/runs/40707196857) | 2026-10-28T14:34:00Z | CI | browser (desktop): Run browser tests; browser (iphone-14): Run browser tests; load: Run bun run test:load | available |
| [40706832104](https://github.com/r3dbars/shiptorio/actions/runs/40706832104) | 2026-10-28T14:31:48Z | CI | browser (desktop, 1): Run browser tests | available |
| [40704971363](https://github.com/r3dbars/shiptorio/actions/runs/40704971363) | 2026-10-28T14:20:33Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40703518244](https://github.com/r3dbars/shiptorio/actions/runs/40703518244) | 2026-10-28T14:11:34Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40703080473](https://github.com/r3dbars/shiptorio/actions/runs/40703080473) | 2026-10-28T14:08:51Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40698974216](https://github.com/r3dbars/shiptorio/actions/runs/40698974216) | 2026-10-28T13:42:55Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40696934882](https://github.com/r3dbars/shiptorio/actions/runs/40696934882) | 2026-10-28T13:29:48Z | CI | browser (iphone-14): Run browser tests; browser (desktop): Run browser tests | available |
| [40613954864](https://github.com/r3dbars/shiptorio/actions/runs/40613954864) | 2026-10-28T01:15:40Z | CI | load: Run bun run test:load; browser (pixel-7, 1): Run browser tests; browser (iphone-14, 1): Run browser tests | available |
| [40611004397](https://github.com/r3dbars/shiptorio/actions/runs/40611004397) | 2026-10-28T00:47:28Z | CI | browser (pixel-7, 1): Run browser tests; browser (desktop, 1): Run browser tests; browser (iphone-14, 1): Run browser tests | available |
| [40608476360](https://github.com/r3dbars/shiptorio/actions/runs/40608476360) | 2026-10-28T00:23:40Z | CI | browser (pixel-7, 1): Run browser tests; browser (desktop, 1): Run browser tests; browser (iphone-14, 1): Run browser tests | available |
| [40606380258](https://github.com/r3dbars/shiptorio/actions/runs/40606380258) | 2026-10-28T00:04:32Z | CI | browser (desktop, 1): Run browser tests; browser (pixel-7, 1): Run browser tests; load: Run bun run test:load; browser (iphone-14, 1): Run browser tests | available |
| [40602214907](https://github.com/r3dbars/shiptorio/actions/runs/40602214907) | 2026-10-27T23:27:05Z | CI | load: Run bun run test:load | available |
| [40600771254](https://github.com/r3dbars/shiptorio/actions/runs/40600771254) | 2026-10-27T23:14:43Z | CI | browser (pixel-7): Run browser tests; browser (iphone-14): Run browser tests; browser (desktop): Run browser tests | available |
| [40595570444](https://github.com/r3dbars/shiptorio/actions/runs/40595570444) | 2026-10-27T22:32:16Z | CI | load: Run bun run test:load | available |
| [40587120072](https://github.com/r3dbars/shiptorio/actions/runs/40587120072) | 2026-10-27T21:28:46Z | CI | browser (iphone-14): Run browser tests; browser (pixel-7): Run browser tests | available |
| [40585617509](https://github.com/r3dbars/shiptorio/actions/runs/40585617509) | 2026-10-27T21:18:13Z | CI | browser (iphone-14): Run browser tests | available |
| [40580686789](https://github.com/r3dbars/shiptorio/actions/runs/40580686789) | 2026-10-27T20:44:15Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40579156337](https://github.com/r3dbars/shiptorio/actions/runs/40579156337) | 2026-10-27T20:33:48Z | CI | browser (desktop): Run browser tests | available |
| [40575738762](https://github.com/r3dbars/shiptorio/actions/runs/40575738762) | 2026-10-27T20:11:01Z | CI | browser (pixel-7): Run browser tests; browser (iphone-14): Run browser tests; browser (desktop): Run browser tests | available |
| [40575425668](https://github.com/r3dbars/shiptorio/actions/runs/40575425668) | 2026-10-27T20:08:57Z | CI | browser (desktop): Run browser tests | available |
| [40574810643](https://github.com/r3dbars/shiptorio/actions/runs/40574810643) | 2026-10-27T20:04:48Z | CI | browser (desktop): Run browser tests | available |
| [40574627553](https://github.com/r3dbars/shiptorio/actions/runs/40574627553) | 2026-10-27T20:03:33Z | CI | browser (desktop): Run browser tests; browser (iphone-14): Run browser tests; browser (pixel-7): Run browser tests | available |
| [40574425709](https://github.com/r3dbars/shiptorio/actions/runs/40574425709) | 2026-10-27T20:02:12Z | CI | check: Run bun test | available |
| [40574388704](https://github.com/r3dbars/shiptorio/actions/runs/40574388704) | 2026-10-27T20:01:57Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40573893441](https://github.com/r3dbars/shiptorio/actions/runs/40573893441) | 2026-10-27T19:58:39Z | CI | browser (iphone-14): Run browser tests; browser (pixel-7): Run browser tests; browser (desktop): Run browser tests | available |
| [40573811871](https://github.com/r3dbars/shiptorio/actions/runs/40573811871) | 2026-10-27T19:58:04Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40572754927](https://github.com/r3dbars/shiptorio/actions/runs/40572754927) | 2026-10-27T19:50:48Z | CI | browser (iphone-14): Run browser tests; browser (desktop): Run browser tests; browser (pixel-7): Run browser tests | available |
| [40572747521](https://github.com/r3dbars/shiptorio/actions/runs/40572747521) | 2026-10-27T19:50:44Z | CI | browser (pixel-7): Run browser tests; browser (desktop): Run browser tests; browser (iphone-14): Run browser tests | available |
| [40572724596](https://github.com/r3dbars/shiptorio/actions/runs/40572724596) | 2026-10-27T19:50:35Z | CI | browser (iphone-14): Run browser tests; browser (pixel-7): Run browser tests; browser (desktop): Run browser tests | available |
| [40572720445](https://github.com/r3dbars/shiptorio/actions/runs/40572720445) | 2026-10-27T19:50:33Z | Deploy | deploy: Browser smoke, Roll back failed deployment | available |
| [40570190970](https://github.com/r3dbars/shiptorio/actions/runs/40570190970) | 2026-10-27T19:33:30Z | CI | browser (desktop): Run browser tests; browser (pixel-7): Run browser tests; browser (iphone-14): Run browser tests | available |
| [40568364603](https://github.com/r3dbars/shiptorio/actions/runs/40568364603) | 2026-10-27T19:21:29Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40511934270](https://github.com/r3dbars/shiptorio/actions/runs/40511934270) | 2026-10-27T13:25:40Z | CI | load: Run bun run test:load; browser (desktop): Run browser tests | available |
| [40511204277](https://github.com/r3dbars/shiptorio/actions/runs/40511204277) | 2026-10-27T13:20:42Z | CI | browser (desktop): Run browser tests; load: Run bun run test:load | available |
| [40510155018](https://github.com/r3dbars/shiptorio/actions/runs/40510155018) | 2026-10-27T13:13:28Z | CI | load: Run bun run test:load | available |
| [40508942180](https://github.com/r3dbars/shiptorio/actions/runs/40508942180) | 2026-10-27T13:04:58Z | CI | load: Run bun run test:load | available |
| [40507271749](https://github.com/r3dbars/shiptorio/actions/runs/40507271749) | 2026-10-27T12:52:48Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40506912379](https://github.com/r3dbars/shiptorio/actions/runs/40506912379) | 2026-10-27T12:50:08Z | CI | load: Run bun run test:load | available |
| [40505555139](https://github.com/r3dbars/shiptorio/actions/runs/40505555139) | 2026-10-27T12:40:00Z | CI | load: Run bun run test:load | available |
| [40504536153](https://github.com/r3dbars/shiptorio/actions/runs/40504536153) | 2026-10-27T12:32:15Z | CI | load: Run bun run test:load | available |
| [40495605253](https://github.com/r3dbars/shiptorio/actions/runs/40495605253) | 2026-10-27T11:22:03Z | CI | load: Run bun run test:load | available |
| [40495260259](https://github.com/r3dbars/shiptorio/actions/runs/40495260259) | 2026-10-27T11:19:23Z | Deploy | deploy: Run bun test | available |
| [40494689439](https://github.com/r3dbars/shiptorio/actions/runs/40494689439) | 2026-10-27T11:14:50Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40494507398](https://github.com/r3dbars/shiptorio/actions/runs/40494507398) | 2026-10-27T11:13:24Z | CI | check: Run bun test | available |
| [40494297919](https://github.com/r3dbars/shiptorio/actions/runs/40494297919) | 2026-10-27T11:11:45Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40494297794](https://github.com/r3dbars/shiptorio/actions/runs/40494297794) | 2026-10-27T11:11:44Z | CI | check: Run bun test | available |
| [40493808836](https://github.com/r3dbars/shiptorio/actions/runs/40493808836) | 2026-10-27T11:07:53Z | CI | check: Run bun test | available |
| [40493808555](https://github.com/r3dbars/shiptorio/actions/runs/40493808555) | 2026-10-27T11:07:53Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40493796593](https://github.com/r3dbars/shiptorio/actions/runs/40493796593) | 2026-10-27T11:07:47Z | Deploy | deploy: Run bun test | available |
| [40493741353](https://github.com/r3dbars/shiptorio/actions/runs/40493741353) | 2026-10-27T11:07:21Z | CI | check: Run bun test | available |
| [40492888301](https://github.com/r3dbars/shiptorio/actions/runs/40492888301) | 2026-10-27T11:00:41Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40492679260](https://github.com/r3dbars/shiptorio/actions/runs/40492679260) | 2026-10-27T10:59:05Z | CI | check: Run bun test | available |
| [40488710578](https://github.com/r3dbars/shiptorio/actions/runs/40488710578) | 2026-10-27T10:28:14Z | Stranger E2E | stranger | unavailable |
| [40488670594](https://github.com/r3dbars/shiptorio/actions/runs/40488670594) | 2026-10-27T10:27:56Z | Stranger E2E | stranger | unavailable |
| [40488575128](https://github.com/r3dbars/shiptorio/actions/runs/40488575128) | 2026-10-27T10:27:11Z | Stranger E2E | stranger | unavailable |
| [40488338927](https://github.com/r3dbars/shiptorio/actions/runs/40488338927) | 2026-10-27T10:25:21Z | Stranger E2E | stranger | unavailable |
| [40488294410](https://github.com/r3dbars/shiptorio/actions/runs/40488294410) | 2026-10-27T10:25:02Z | Stranger E2E | stranger | unavailable |
| [40482878115](https://github.com/r3dbars/shiptorio/actions/runs/40482878115) | 2026-10-27T09:42:53Z | Deploy | deploy | unavailable |
| [40482632643](https://github.com/r3dbars/shiptorio/actions/runs/40482632643) | 2026-10-27T09:40:58Z | CI | check; selfhost | unavailable |
| [40482618094](https://github.com/r3dbars/shiptorio/actions/runs/40482618094) | 2026-10-27T09:40:52Z | Stranger E2E | stranger | unavailable |
| [40454449804](https://github.com/r3dbars/shiptorio/actions/runs/40454449804) | 2026-10-27T05:17:13Z | Stranger E2E | stranger | unavailable |
| [40454449913](https://github.com/r3dbars/shiptorio/actions/runs/40454449913) | 2026-10-27T05:17:13Z | CI | check; selfhost | unavailable |
| [40454297183](https://github.com/r3dbars/shiptorio/actions/runs/40454297183) | 2026-10-27T05:15:38Z | Stranger E2E | stranger | unavailable |
| [40454297458](https://github.com/r3dbars/shiptorio/actions/runs/40454297458) | 2026-10-27T05:15:38Z | CI | check; selfhost | unavailable |
| [40453504607](https://github.com/r3dbars/shiptorio/actions/runs/40453504607) | 2026-10-27T05:07:21Z | CI | selfhost; check | unavailable |
| [40453504749](https://github.com/r3dbars/shiptorio/actions/runs/40453504749) | 2026-10-27T05:07:21Z | Stranger E2E | stranger | unavailable |
| [40453223190](https://github.com/r3dbars/shiptorio/actions/runs/40453223190) | 2026-10-27T05:04:21Z | CI | selfhost; check | unavailable |
| [40453223400](https://github.com/r3dbars/shiptorio/actions/runs/40453223400) | 2026-10-27T05:04:21Z | Stranger E2E | stranger | unavailable |
| [40447573030](https://github.com/r3dbars/shiptorio/actions/runs/40447573030) | 2026-10-27T04:03:08Z | Stranger E2E | stranger | unavailable |
| [40447573028](https://github.com/r3dbars/shiptorio/actions/runs/40447573028) | 2026-10-27T04:03:08Z | CI | check; selfhost | unavailable |
| [40446471069](https://github.com/r3dbars/shiptorio/actions/runs/40446471069) | 2026-10-27T03:51:17Z | CI | selfhost; check | unavailable |
| [40446467913](https://github.com/r3dbars/shiptorio/actions/runs/40446467913) | 2026-10-27T03:51:14Z | Stranger E2E | stranger | unavailable |
| [40445404164](https://github.com/r3dbars/shiptorio/actions/runs/40445404164) | 2026-10-27T03:39:43Z | CI | selfhost; check | unavailable |
| [40445404181](https://github.com/r3dbars/shiptorio/actions/runs/40445404181) | 2026-10-27T03:39:43Z | Stranger E2E | stranger | unavailable |
| [40445047081](https://github.com/r3dbars/shiptorio/actions/runs/40445047081) | 2026-10-27T03:35:48Z | Stranger E2E | stranger | unavailable |
| [40445047120](https://github.com/r3dbars/shiptorio/actions/runs/40445047120) | 2026-10-27T03:35:48Z | CI | check; selfhost | unavailable |
| [40443500574](https://github.com/r3dbars/shiptorio/actions/runs/40443500574) | 2026-10-27T03:19:12Z | CI | check; selfhost | unavailable |
| [40443500581](https://github.com/r3dbars/shiptorio/actions/runs/40443500581) | 2026-10-27T03:19:12Z | Stranger E2E | stranger | unavailable |
| [40443135408](https://github.com/r3dbars/shiptorio/actions/runs/40443135408) | 2026-10-27T03:15:17Z | Stranger E2E | stranger | unavailable |
| [40443135438](https://github.com/r3dbars/shiptorio/actions/runs/40443135438) | 2026-10-27T03:15:17Z | CI | selfhost; check | unavailable |
| [40443060706](https://github.com/r3dbars/shiptorio/actions/runs/40443060706) | 2026-10-27T03:14:31Z | Stranger E2E | stranger | unavailable |
| [40443060745](https://github.com/r3dbars/shiptorio/actions/runs/40443060745) | 2026-10-27T03:14:31Z | CI | selfhost; check | unavailable |
| [40442763732](https://github.com/r3dbars/shiptorio/actions/runs/40442763732) | 2026-10-27T03:11:21Z | CI | check; selfhost | unavailable |
| [40442763785](https://github.com/r3dbars/shiptorio/actions/runs/40442763785) | 2026-10-27T03:11:21Z | Stranger E2E | stranger | unavailable |
| [40442666222](https://github.com/r3dbars/shiptorio/actions/runs/40442666222) | 2026-10-27T03:10:20Z | Stranger E2E | stranger | unavailable |
| [40442549499](https://github.com/r3dbars/shiptorio/actions/runs/40442549499) | 2026-10-27T03:09:07Z | Stranger E2E | stranger | unavailable |
| [40442450073](https://github.com/r3dbars/shiptorio/actions/runs/40442450073) | 2026-10-27T03:08:03Z | Stranger E2E | stranger | unavailable |
| [40442209083](https://github.com/r3dbars/shiptorio/actions/runs/40442209083) | 2026-10-27T03:05:33Z | CI | check; selfhost | unavailable |
| [40442209065](https://github.com/r3dbars/shiptorio/actions/runs/40442209065) | 2026-10-27T03:05:32Z | Stranger E2E | stranger | unavailable |
| [40442182030](https://github.com/r3dbars/shiptorio/actions/runs/40442182030) | 2026-10-27T03:05:17Z | Stranger E2E | stranger | unavailable |
| [40442022233](https://github.com/r3dbars/shiptorio/actions/runs/40442022233) | 2026-10-27T03:03:38Z | Stranger E2E | stranger | unavailable |
| [40442022236](https://github.com/r3dbars/shiptorio/actions/runs/40442022236) | 2026-10-27T03:03:38Z | CI | check; selfhost | unavailable |
| [40441695134](https://github.com/r3dbars/shiptorio/actions/runs/40441695134) | 2026-10-27T03:00:20Z | Stranger E2E | stranger | unavailable |
| [40441687314](https://github.com/r3dbars/shiptorio/actions/runs/40441687314) | 2026-10-27T03:00:16Z | Stranger E2E | stranger | unavailable |
| [40441687302](https://github.com/r3dbars/shiptorio/actions/runs/40441687302) | 2026-10-27T03:00:16Z | CI | selfhost; check | unavailable |
| [40441524394](https://github.com/r3dbars/shiptorio/actions/runs/40441524394) | 2026-10-27T02:58:33Z | CI | selfhost; check | unavailable |
| [40441524385](https://github.com/r3dbars/shiptorio/actions/runs/40441524385) | 2026-10-27T02:58:33Z | Stranger E2E | stranger | unavailable |
| [40441506651](https://github.com/r3dbars/shiptorio/actions/runs/40441506651) | 2026-10-27T02:58:22Z | Stranger E2E | stranger | unavailable |
| [40441204176](https://github.com/r3dbars/shiptorio/actions/runs/40441204176) | 2026-10-27T02:55:11Z | Stranger E2E | stranger | unavailable |
| [40441006013](https://github.com/r3dbars/shiptorio/actions/runs/40441006013) | 2026-10-27T02:53:06Z | Stranger E2E | stranger | unavailable |
| [40440944334](https://github.com/r3dbars/shiptorio/actions/runs/40440944334) | 2026-10-27T02:52:27Z | Stranger E2E | stranger | unavailable |
| [40440788065](https://github.com/r3dbars/shiptorio/actions/runs/40440788065) | 2026-10-27T02:50:48Z | Deploy | deploy | unavailable |
| [40440784734](https://github.com/r3dbars/shiptorio/actions/runs/40440784734) | 2026-10-27T02:50:46Z | Stranger E2E | stranger | unavailable |
| [40440643290](https://github.com/r3dbars/shiptorio/actions/runs/40440643290) | 2026-10-27T02:49:18Z | Stranger E2E | stranger | unavailable |
| [40440582005](https://github.com/r3dbars/shiptorio/actions/runs/40440582005) | 2026-10-27T02:48:38Z | Stranger E2E | stranger | unavailable |
| [40440582024](https://github.com/r3dbars/shiptorio/actions/runs/40440582024) | 2026-10-27T02:48:38Z | CI | check; selfhost | unavailable |
| [40440466519](https://github.com/r3dbars/shiptorio/actions/runs/40440466519) | 2026-10-27T02:47:24Z | CI | check; selfhost | unavailable |
| [40440466479](https://github.com/r3dbars/shiptorio/actions/runs/40440466479) | 2026-10-27T02:47:24Z | Stranger E2E | stranger | unavailable |
| [40440287385](https://github.com/r3dbars/shiptorio/actions/runs/40440287385) | 2026-10-27T02:45:31Z | CI | selfhost; check | unavailable |
| [40440287361](https://github.com/r3dbars/shiptorio/actions/runs/40440287361) | 2026-10-27T02:45:31Z | Stranger E2E | stranger | unavailable |
| [40440233456](https://github.com/r3dbars/shiptorio/actions/runs/40440233456) | 2026-10-27T02:45:01Z | Stranger E2E | stranger | unavailable |
| [40440182492](https://github.com/r3dbars/shiptorio/actions/runs/40440182492) | 2026-10-27T02:44:29Z | CI | selfhost; check | unavailable |
| [40440182436](https://github.com/r3dbars/shiptorio/actions/runs/40440182436) | 2026-10-27T02:44:29Z | Stranger E2E | stranger | unavailable |
| [40440046398](https://github.com/r3dbars/shiptorio/actions/runs/40440046398) | 2026-10-27T02:43:05Z | Deploy | deploy | unavailable |
| [40440013675](https://github.com/r3dbars/shiptorio/actions/runs/40440013675) | 2026-10-27T02:42:45Z | Deploy | deploy | unavailable |
| [40439926352](https://github.com/r3dbars/shiptorio/actions/runs/40439926352) | 2026-10-27T02:41:50Z | Stranger E2E | stranger | unavailable |
| [40439878431](https://github.com/r3dbars/shiptorio/actions/runs/40439878431) | 2026-10-27T02:41:20Z | Stranger E2E | stranger | unavailable |
| [40439794587](https://github.com/r3dbars/shiptorio/actions/runs/40439794587) | 2026-10-27T02:40:27Z | CI | check; selfhost | unavailable |
| [40439794592](https://github.com/r3dbars/shiptorio/actions/runs/40439794592) | 2026-10-27T02:40:27Z | Stranger E2E | stranger | unavailable |
| [40439788803](https://github.com/r3dbars/shiptorio/actions/runs/40439788803) | 2026-10-27T02:40:24Z | Deploy | deploy | unavailable |
| [40439774019](https://github.com/r3dbars/shiptorio/actions/runs/40439774019) | 2026-10-27T02:40:15Z | CI | selfhost; check | unavailable |
| [40439767098](https://github.com/r3dbars/shiptorio/actions/runs/40439767098) | 2026-10-27T02:40:12Z | Stranger E2E | stranger | unavailable |
| [40439649270](https://github.com/r3dbars/shiptorio/actions/runs/40439649270) | 2026-10-27T02:38:58Z | Stranger E2E | stranger | unavailable |
| [40439557716](https://github.com/r3dbars/shiptorio/actions/runs/40439557716) | 2026-10-27T02:38:00Z | Stranger E2E | stranger | unavailable |
| [40439556051](https://github.com/r3dbars/shiptorio/actions/runs/40439556051) | 2026-10-27T02:37:59Z | Deploy | deploy | unavailable |
| [40434529506](https://github.com/r3dbars/shiptorio/actions/runs/40434529506) | 2026-10-27T01:46:15Z | Deploy | deploy: Run bun test | available |
| [40434411981](https://github.com/r3dbars/shiptorio/actions/runs/40434411981) | 2026-10-27T01:45:08Z | Deploy | deploy: Run bun test | available |
| [40433950064](https://github.com/r3dbars/shiptorio/actions/runs/40433950064) | 2026-10-27T01:40:23Z | Deploy | deploy: Run bun test | available |
| [40433902905](https://github.com/r3dbars/shiptorio/actions/runs/40433902905) | 2026-10-27T01:39:56Z | Deploy | deploy: Run bun test | available |
| [40433439698](https://github.com/r3dbars/shiptorio/actions/runs/40433439698) | 2026-10-27T01:35:09Z | Deploy | deploy: Run bun test | available |
| [40433426036](https://github.com/r3dbars/shiptorio/actions/runs/40433426036) | 2026-10-27T01:35:01Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40433387011](https://github.com/r3dbars/shiptorio/actions/runs/40433387011) | 2026-10-27T01:34:38Z | Deploy | deploy: Run bun test | available |
| [40433015571](https://github.com/r3dbars/shiptorio/actions/runs/40433015571) | 2026-10-27T01:30:54Z | Deploy | deploy: Run bun test | available |
| [40432585623](https://github.com/r3dbars/shiptorio/actions/runs/40432585623) | 2026-10-27T01:26:34Z | CI | check: Run bun test | available |
| [40430209387](https://github.com/r3dbars/shiptorio/actions/runs/40430209387) | 2026-10-27T01:02:54Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40429183568](https://github.com/r3dbars/shiptorio/actions/runs/40429183568) | 2026-10-27T00:52:59Z | Stranger E2E | stranger: Run bun run stranger | available |
| [40428959075](https://github.com/r3dbars/shiptorio/actions/runs/40428959075) | 2026-10-27T00:50:46Z | Deploy | deploy: Live smoke, Roll back failed deployment | available |
| [40427320941](https://github.com/r3dbars/shiptorio/actions/runs/40427320941) | 2026-10-27T00:34:59Z | Stranger path | stranger: Walk the stranger path | available |
| [40423256162](https://github.com/r3dbars/shiptorio/actions/runs/40423256162) | 2026-10-26T23:57:46Z | Stranger path | stranger: Walk the stranger path | available |
| [40411074588](https://github.com/r3dbars/shiptorio/actions/runs/40411074588) | 2026-10-26T22:15:51Z | CI | check: Run bun test | available |
| [40410740886](https://github.com/r3dbars/shiptorio/actions/runs/40410740886) | 2026-10-26T22:13:23Z | Stranger path | stranger: Walk the stranger path | available |
| [40408926922](https://github.com/r3dbars/shiptorio/actions/runs/40408926922) | 2026-10-26T21:59:41Z | CI | load: Run bun run test:load | available |
| [40408782397](https://github.com/r3dbars/shiptorio/actions/runs/40408782397) | 2026-10-26T21:58:33Z | CI | check: Run bun test | available |
| [40408518810](https://github.com/r3dbars/shiptorio/actions/runs/40408518810) | 2026-10-26T21:56:30Z | CI | check: Run bun run test:fast | available |
| [40408084276](https://github.com/r3dbars/shiptorio/actions/runs/40408084276) | 2026-10-26T21:53:17Z | Deploy | deploy: Live smoke | available |
| [40407719286](https://github.com/r3dbars/shiptorio/actions/runs/40407719286) | 2026-10-26T21:50:37Z | Deploy | deploy: Live smoke | available |
| [40407666426](https://github.com/r3dbars/shiptorio/actions/runs/40407666426) | 2026-10-26T21:50:14Z | CI | check: Run bun test | available |
| [40407494954](https://github.com/r3dbars/shiptorio/actions/runs/40407494954) | 2026-10-26T21:48:58Z | CI | check: Run bun test | available |
| [40406880375](https://github.com/r3dbars/shiptorio/actions/runs/40406880375) | 2026-10-26T21:44:30Z | CI | check: Run bun run test:fast | available |
| [40406845839](https://github.com/r3dbars/shiptorio/actions/runs/40406845839) | 2026-10-26T21:44:15Z | CI | check: Run bun test | available |
| [40406404640](https://github.com/r3dbars/shiptorio/actions/runs/40406404640) | 2026-10-26T21:41:01Z | Stranger path | stranger: Walk the stranger path | available |
| [40405947044](https://github.com/r3dbars/shiptorio/actions/runs/40405947044) | 2026-10-26T21:37:41Z | Stranger path | stranger: Walk the stranger path | available |
| [40405933039](https://github.com/r3dbars/shiptorio/actions/runs/40405933039) | 2026-10-26T21:37:35Z | CI | check: Run bun test | available |
| [40405614691](https://github.com/r3dbars/shiptorio/actions/runs/40405614691) | 2026-10-26T21:35:19Z | CI | check: Run bun test | available |
| [40405557704](https://github.com/r3dbars/shiptorio/actions/runs/40405557704) | 2026-10-26T21:34:56Z | CI | check: Run bun run typecheck | available |
| [40405457265](https://github.com/r3dbars/shiptorio/actions/runs/40405457265) | 2026-10-26T21:34:13Z | CI | check: Run bun test | available |
| [40405346659](https://github.com/r3dbars/shiptorio/actions/runs/40405346659) | 2026-10-26T21:33:26Z | CI | load: Run bun run test:load | available |
| [40404992498](https://github.com/r3dbars/shiptorio/actions/runs/40404992498) | 2026-10-26T21:30:53Z | CI | check: Run bun test | available |
| [40404345425](https://github.com/r3dbars/shiptorio/actions/runs/40404345425) | 2026-10-26T21:26:19Z | CI | browser: Run bun run test:e2e --update-snapshots | available |
| [40404208216](https://github.com/r3dbars/shiptorio/actions/runs/40404208216) | 2026-10-26T21:25:21Z | CI | check: Run bun test | available |
| [40403858314](https://github.com/r3dbars/shiptorio/actions/runs/40403858314) | 2026-10-26T21:22:53Z | CI | check: Run bun test | available |
| [40403703610](https://github.com/r3dbars/shiptorio/actions/runs/40403703610) | 2026-10-26T21:21:45Z | CI | check: Run bun test | available |
| [40403525010](https://github.com/r3dbars/shiptorio/actions/runs/40403525010) | 2026-10-26T21:20:30Z | CI | check: Run bun test | available |
| [40403288872](https://github.com/r3dbars/shiptorio/actions/runs/40403288872) | 2026-10-26T21:18:49Z | CI | check: Run bun test | available |
| [40403208298](https://github.com/r3dbars/shiptorio/actions/runs/40403208298) | 2026-10-26T21:18:13Z | CI | check: Run bun run typecheck | available |
| [40403163852](https://github.com/r3dbars/shiptorio/actions/runs/40403163852) | 2026-10-26T21:17:54Z | CI | check: Run bun run typecheck | available |
| [40403116654](https://github.com/r3dbars/shiptorio/actions/runs/40403116654) | 2026-10-26T21:17:34Z | CI | check: Run bun test | available |
| [40402998020](https://github.com/r3dbars/shiptorio/actions/runs/40402998020) | 2026-10-26T21:16:45Z | CI | check: Run bun test | available |
| [40402497155](https://github.com/r3dbars/shiptorio/actions/runs/40402497155) | 2026-10-26T21:13:17Z | CI | check: Run bun test | available |
| [40400866531](https://github.com/r3dbars/shiptorio/actions/runs/40400866531) | 2026-10-26T21:02:00Z | CI | check: Run bun run typecheck | available |
| [40399152509](https://github.com/r3dbars/shiptorio/actions/runs/40399152509) | 2026-10-26T20:50:08Z | CI | check: Run bun run typecheck | available |
| [40397950733](https://github.com/r3dbars/shiptorio/actions/runs/40397950733) | 2026-10-26T20:41:57Z | CI | check: Run bun run typecheck | available |
| [40397742220](https://github.com/r3dbars/shiptorio/actions/runs/40397742220) | 2026-10-26T20:40:30Z | CI | check: Run bun run typecheck | available |
| [40397544931](https://github.com/r3dbars/shiptorio/actions/runs/40397544931) | 2026-10-26T20:39:09Z | CI | check: Run bun run typecheck | available |
| [40396073072](https://github.com/r3dbars/shiptorio/actions/runs/40396073072) | 2026-10-26T20:29:19Z | CI | check: Run bun run typecheck | available |
| [40395049931](https://github.com/r3dbars/shiptorio/actions/runs/40395049931) | 2026-10-26T20:22:29Z | CI | check: Run bun test | available |
| [40391336428](https://github.com/r3dbars/shiptorio/actions/runs/40391336428) | 2026-10-26T19:57:22Z | CI | check: Run bun test | available |
| [40390620291](https://github.com/r3dbars/shiptorio/actions/runs/40390620291) | 2026-10-26T19:52:31Z | CI | check: Run bun test | available |
| [40389995703](https://github.com/r3dbars/shiptorio/actions/runs/40389995703) | 2026-10-26T19:48:17Z | CI | check: Run bun test | available |
| [40389879172](https://github.com/r3dbars/shiptorio/actions/runs/40389879172) | 2026-10-26T19:47:29Z | CI | check: Run bun run typecheck | available |
| [40389703972](https://github.com/r3dbars/shiptorio/actions/runs/40389703972) | 2026-10-26T19:46:18Z | CI | check: Run bun run typecheck | available |
| [40389513385](https://github.com/r3dbars/shiptorio/actions/runs/40389513385) | 2026-10-26T19:45:04Z | CI | check: Run bun test | available |
| [40389383352](https://github.com/r3dbars/shiptorio/actions/runs/40389383352) | 2026-10-26T19:44:12Z | CI | check: Run bun test | available |
| [40381384126](https://github.com/r3dbars/shiptorio/actions/runs/40381384126) | 2026-10-26T18:50:54Z | CI | check: Run bun test | available |
| [40373856427](https://github.com/r3dbars/shiptorio/actions/runs/40373856427) | 2026-10-26T18:00:20Z | Deploy | deploy: Run oven-sh/setup-bun@v2 | available |
| [40372727506](https://github.com/r3dbars/shiptorio/actions/runs/40372727506) | 2026-10-26T17:52:46Z | CI | check: Run bun run typecheck | available |

## Named failing assertions recovered from available logs

These names come from historical runs, not the final baseline. Durations were removed to deduplicate the same assertion.

- Claude CLI login → status → sandbox uses the same private config outside job workspaces
- D1 migrations > have unique, gapless numbers starting at 0001
- Factory lifecycle > accepts build commands but ignores malformed messages and removal of active machinery
- Factory lifecycle > durably queues delivery work and folds it before acknowledgment
- Factory lifecycle > keeps a tracked PR when its issue-close webhook arrives before the merge
- Factory lifecycle > runs Spark planning, exclusive runner claim, scoped branch verification and idempotent PR receipts
- Factory: FAKE_POSTHOG polls on the alarm and drops ore on the checkout district once per day
- Factory: Sentry mine opens a deposit, spawns biters on the right district, grows them, and counts the kill
- Factory: keys set as Worker secrets plug the mines in when the map opens, and stay unplugged once disconnected
- Factory: unconfigured mine answers with setup steps and a connect link for this repo
- Linux sandbox isolates host files, credentials, descendants and network
- PR code has read-only tokens, no deployment secrets and no privileged event context
- Sentry webhook: rejects bad signatures, needs no preview password, queues once per request id
- Shippy unfolds out of the corner, walks to the stop, works it, and folds back home
- a changed head returns to CI instead of consuming an old launch approval
- a historical docs permit cannot launch code or cross-lane changes
- a hung step times out instead of wedging its scope queue
- a player can't set keys for a repo they can't reach
- a queued same-head rerun removes launch readiness without recording rework
- authenticates, durably enqueues before 202, and deduplicates completed deliveries
- automatic launch requires a stable current diff and still permits unchanged docs
- completed DO delivery tombstones prevent replay even when D1 intake raced
- current-commit inspection > paginates issue backfill, excludes PRs and caps it at fifty issues
- does not retry a durable delivery before its persisted backoff deadline
- durable live check-in decisions > a locked card cannot merge through a details option and a right swipe only schedules proof
- durable live check-in decisions > can resolve the third-defer choice for an implied bottleneck card
- durable live check-in decisions > defers until the next check-in, retains counts across restart, and escalates the third defer
- durable live check-in decisions > dismiss once removes only that card and undo restores it after a DO restart
- durable live check-in decisions > mutes one kind/scope in D1, applies that rule after restart, and undo removes exactly its rule
- durable live check-in decisions > persists wrong-call feedback for the planner, while undo retracts that note
- durable live check-in decisions > records class automation intent without issuing a permit, and retracts it on undo
- durable live check-in decisions > refuses an expired undo and a stale undo behind a newer decision
- durable live check-in decisions > routes an actual non-top card and rejects stale ids without executing another card
- every core scenario is covered with a gameplay and disconnection journey
- every internal link, anchor and image resolves
- exhausted deliveries leave a durable dead letter and player card while later work continues
- geothermal end to end: a docs fix built by a local model becomes a PR
- installed repo cards keep legacy fields, expose their full name, and omit unknown issue counts
- invalid replacements and source limits leave every proposed file untouched
- live gauntlet in the Factory > runs verify and Spark review, offers the launch card, and merges on the player's tap
- merge refresh blocks pending, failed and unavailable checks without a webhook
- no "Spark" in player copy, except the one credit
- no session, preview-only cookies, invalid repo, unknown API and setup cannot bypass the boundary
- orbit watch in the Factory > a revert PR and a red check on the merge commit both trip it
- permits in the Factory > offers the permit, auto-launches the next clean docs PR, and revokes on rework
- planner power pick must name an allowed plant
- playbook > covers every known kind and only uses the deck's safe tools
- preexisting tracked or untracked edits cannot enter a structured Codex patch
- preview access alone, disallowed logins, and sessions without preview access cannot list repos
- preview access alone, disallowed logins, pre-accounts cookies, signed-out sessions and missing preview access cannot list repos
- privileged browser socket lifetime > denies expired or legacy connections before player actions and stops their broadcasts
- public docs survive password and waitlist gates while private APIs stay gated
- real account logout immediately revokes existing sockets and runner grants even with positive KV membership
- rebuilding during replay ends it before carry, restores the waiting line and releases the overlay once
- recovers a comment after a lost POST response, without a second comment
- repo discovery filters tenants and uninstallation overrides a positive KV grant
- returns runtime telemetry identity and release using the signed session
- runner capability is confined to pairing user, installation and repo, including renewal
- runner revoke is a same-origin signed-in web action and invalidates renewal
- runner transport authenticates independently without opening the preview or other repos
- saving either source returns the signed-in player to the actual live repo
- scar → re-plan → approve → one same-branch fix → fresh gauntlet → Launch
- second allowed user cannot read state/jobs, pair a runner, send HTTP moves, upgrade sockets or see/save connect pages
- signed webhooks mutate only their named repo and Sentry dedupe IDs are tenant-scoped
- signing out deletes the session row, so the same cookie stops working
- supervisor refuses symlink parents, symlink targets and hardlinked source
- tests/e2e/buildout.pw.ts:116:3 › build as you go › dark to rocket, one build at a time 
- tests/e2e/buildout.pw.ts:118:3 › build as you go › dark to rocket, one build at a time 
- tests/e2e/buildout.pw.ts:120:3 › build as you go › reduced motion: still camera, short builds, payoff still plays 
- tests/e2e/buildout.pw.ts:122:3 › build as you go › reduced motion: still camera, short builds, payoff still plays 
- tests/e2e/buildout.pw.ts:123:3 › build as you go › dark to rocket, one build at a time 
- tests/e2e/buildout.pw.ts:127:3 › build as you go › reduced motion: still camera, short builds, payoff still plays 
- tests/e2e/buildout.pw.ts:144:3 › build as you go › dark to rocket, one build at a time 
- tests/e2e/floors.pw.ts:116:3 › floors grow with the build-as-you-go run › flag off: no floor growth 
- tests/e2e/floors.pw.ts:49:3 › floors grow with the build-as-you-go run › dark to rocket: each floor rises right before the build that sits on it 
- tests/e2e/floors.pw.ts:50:3 › floors grow with the build-as-you-go run › dark to rocket: each floor rises right before the build that sits on it 
- tests/e2e/floors.pw.ts:51:3 › floors grow with the build-as-you-go run › dark to rocket: each floor rises right before the build that sits on it 
- tests/e2e/journey.pw.ts:4:1 › intro → sign in → repo → approve → PR → gauntlet → launch → rocket 
- tests/e2e/journey.pw.ts:5:1 › intro → sign in → repo → approve → PR → gauntlet → launch → rocket 
- tests/e2e/judge.pw.ts:3:1 › no-login judge replay: three mines → plan → rework gauntlet → permit → rockets → Floor 
- tests/e2e/reconnect.pw.ts:113:1 › a 1s blip never shows reconnect UI; a long outage shows a quiet notice 
- tests/e2e/reconnect.pw.ts:6:1 › 60s offline while a PR ships → snapshot in 2s, one celebration, no replay 
- tests/e2e/recovery.pw.ts:141:5 › 1440x900 › a context that never restores gets a fresh canvas and current factory 
- tests/e2e/recovery.pw.ts:141:5 › 390x844 › a context that never restores gets a fresh canvas and current factory 
- tests/e2e/recovery.pw.ts:42:5 › 1440x900 › lost context restores and draws within two seconds without navigation 
- the empire lists one island per repo the player can reach, and never anyone else's
- the normal replay cap also finishes once if a stale cap and a rebuild follow it
- the story plays all four beats and ends on the connect card
- trusted supervisor applies exact edits and explicit new tests in the real OS boundary
- upgrades remote HTTP before authentication and sets HSTS on HTTPS gate responses
- watchdog survives restart, offers one scar/card, and alarm always recovers from a broken tick
- whatsNext > a lane near its permit points at the merge gate
- whatsNext > caught up still always has a move
- whatsNext > fixes still on the line: watch them
- whatsNext > room to build suggests another assembler
- workflow actions are immutable and checkout leaves no Git credential behind
