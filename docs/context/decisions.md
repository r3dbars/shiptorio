# Repository decisions

## 2026-10-30 — Submission cleanup and GitHub hygiene

The pixel deck with Shippy is the product. Freeze Oct 31, record Nov 1, submit Nov 4 at noon CT.
The shaft map, build mode, empire and pricing remain parked. This pass changed documentation and removed
only unreachable web helpers; uncertain candidates are recorded in [papercuts.md](papercuts.md).

### Completed cleanup PRs

- [#734](https://github.com/r3dbars/shiptorio/pull/734): short README, current deck screenshot and quick start.
- [#735](https://github.com/r3dbars/shiptorio/pull/735): current focus, dates and deck-only steering.
- [#736](https://github.com/r3dbars/shiptorio/pull/736): all public help pages, runner guide and historical-art labels.
- [#737](https://github.com/r3dbars/shiptorio/pull/737): unused React-era web flags and their uncalled loader.
- [#738](https://github.com/r3dbars/shiptorio/pull/738): orphaned exports and an unused station drawing helper.

Each PR ran `bun run check` before ready-for-review and merged into `dev` after CI, self-host, Stranger and
CodeQL passed. No tests were removed, disabled or quarantined. No `main` promotion was performed.

### Remote branches deleted

The complete candidate list was reported before action. Immediately before deletion, each branch tip was
rechecked against the remote, current open PR heads and ancestry in `dev` or `main`. Deletion used an atomic
push with a lease for each recorded SHA, followed by a remote readback. Squash-equivalent branches without
ancestry evidence were retained. `dev`, `main`, `origin/HEAD`, all `shiptorio/runner-*` branches and every branch
with an open PR were excluded.

| Deleted branch | Recorded tip | Merged into |
| --- | --- | --- |
| `claude/batch-458-backup` | `d09e2665d2634b21a7344f0a789ce95f48a23c88` | dev, main |
| `claude/gameplay-trust-lamps` | `71f30ad50fda45913898d4ff3387104df5ae81fb` | dev, main |
| `claude/project-thread-1ngjyy` | `c1410dbb132920122dee7984366b2dfef53f9484` | dev, main |
| `claude/project-thread-1rjo3b` | `3291e69846bad6cd5fb6dab1db16221b1293f0da` | dev, main |
| `claude/project-thread-1yw6cw` | `50830f3c4b836802528f219c8a8f76c31b3a96ad` | dev, main |
| `claude/project-thread-20m2vw` | `865f5a9be2ca51b1f8623a616e281762435082c4` | dev, main |
| `claude/project-thread-2ebd76` | `3e308c2e17b2d0229d6ca09cd836299c0a56fefe` | dev, main |
| `claude/project-thread-4tyg1n` | `ca1645c146b8d7b7b31f51c5a9c614f74290d3a9` | dev, main |
| `claude/project-thread-5bvqq5` | `c5d300c77c1f835d448070aa5227878fd636d811` | dev |
| `claude/project-thread-6ht2v6` | `4cc1d05d2274c73566a5c6100ca7e40d60ffb626` | dev, main |
| `claude/project-thread-7njapu` | `b1b2c5009c751449185c7db218876abfcce86ebc` | dev, main |
| `claude/project-thread-7z6vf9` | `487c235e740a2f3223909596a98c32611ecb91c1` | dev, main |
| `claude/project-thread-82oad1` | `6cda3a96bb38c419af07b4b97d7f9db64a94c52e` | dev, main |
| `claude/project-thread-8ow122` | `964f6a44432b0ba96e2b390ff79865ef6755317d` | dev, main |
| `claude/project-thread-999zu5` | `bf735e8ca22406672d3a933e202f8343546705cd` | dev, main |
| `claude/project-thread-9dqreq` | `d6451f83ad1d73f456fa0c2199a6037b425fe772` | dev |
| `claude/project-thread-9xzkws` | `4d23dc7dfac0d13aded85e8575ef26a914b4253e` | dev, main |
| `claude/project-thread-c3rtdf` | `7fccf74f7b704a1efc81af1b1e57af28b2bdc316` | dev |
| `claude/project-thread-c54cj4` | `af9634ff380bea51c1d724debb72fdbfa5b4cf2e` | dev, main |
| `claude/project-thread-d5pr8t` | `17c8980aa5ad89c4978ff8f88e6dbf40e2f38e8d` | dev, main |
| `claude/project-thread-do48w7` | `5cacf14999dbd2a9dd3d40c0d5f3a002523c9bf0` | dev |
| `claude/project-thread-drwqm4` | `54effd3f296257f17fc0a8c6002edc7b51b079f9` | dev, main |
| `claude/project-thread-g4eq5j` | `bc08d6d39d45098728d64995316e9f3be58a8f99` | dev, main |
| `claude/project-thread-gairvz` | `abd5c37a91430c07e5dfede29bc396ffff9b2e69` | dev, main |
| `claude/project-thread-grr4e5` | `593bdfc56e2c1cbad419d7a6ccdda60dbbd3e84e` | dev, main |
| `claude/project-thread-hesson` | `fea939f3646b04c3a9e54e3e20454a0d2d25f7d6` | dev, main |
| `claude/project-thread-ho9pyx` | `2860559ad873dee1c8ee6de9820c0c08b4356498` | dev, main |
| `claude/project-thread-ke4rse` | `a2e8c8ea9dc6e8a25a25abd137b8a65ed4cef7f8` | dev, main |
| `claude/project-thread-kkclzx` | `ca4b523bcd4976df93249032e44d7c2a8a0c23c9` | dev, main |
| `claude/project-thread-kmitbx` | `54ec7483e13bd0efaafb437a1e25455583d6fdfb` | dev, main |
| `claude/project-thread-lp9jdc` | `7b1d724ba85cbb22d61048261ac56c41cc3a7c8f` | dev |
| `claude/project-thread-nc391o` | `368a2c4658d7eb1ea43020271d378732301858a3` | dev, main |
| `claude/project-thread-nn2end` | `10147fa9574c5e3e715bbb375f160810df735f57` | dev, main |
| `claude/project-thread-nx4u5f` | `8e458cf170ee9208b89989980e3eb20e8bd47308` | dev, main |
| `claude/project-thread-owy7ip` | `8daba7ec03c7a658ae102cae7101ec5a8b149779` | dev, main |
| `claude/project-thread-phs5wk` | `fadf382acf6eb853338c59207ef57b1abd3602de` | dev, main |
| `claude/project-thread-pmukvp` | `6ea3bdc435d181ba15cf6b3a5b8b7b437ba4e1dc` | dev, main |
| `claude/project-thread-ppehbx` | `d4a7bcdf607465007322e7e3cf21b7904865b931` | dev, main |
| `claude/project-thread-q5po5i` | `63a783cc20a7ffed1be53e8d5c743a26cd9a0aa2` | dev, main |
| `claude/project-thread-q6yzyx` | `04651115d436673bdbd1702eadb941569fdba69a` | dev, main |
| `claude/project-thread-r9unfm` | `a94de716e802f721898b90ad24e9b83d0284e728` | dev |
| `claude/project-thread-rekvaq` | `48e0a9915fa7c9baa05413e684dcecd5e23ed43d` | dev |
| `claude/project-thread-ry4a4x` | `4ff74f8a4e432b531ec05c6787f21afe8e82b7dc` | dev |
| `claude/project-thread-rymp0h` | `5a944c875918d650e729cfd7ae090e6766772824` | dev, main |
| `claude/project-thread-sauweo` | `d7f6586f531d4271699c7db487ed139df5ee45d5` | dev |
| `claude/project-thread-t7kr85` | `f2ed3461e7277b9251d9779c02a023654270fbcc` | dev, main |
| `claude/project-thread-upsmhk` | `903493d5a54a407e017faa2afcf16b09265d11b0` | dev, main |
| `claude/project-thread-vs6zme` | `d150f36eef70b3486c87dbe881deb6c522565f21` | dev, main |
| `claude/project-thread-ww93xr` | `3915799858fb42bd9d13e99678ec7ecf9e8dce3b` | dev, main |
| `claude/project-thread-xzo3g1` | `d711be4009e2f29f0ea08da5f82292fcf013cba1` | dev |
| `claude/project-thread-yjrsis` | `e29bcadad439cb9292c199a1c6f817b499fb53d1` | dev, main |
| `claude/project-thread-z0q5mf` | `d9951e5748e0288cbdc3aa6cff1e9ad2c627eed3` | dev, main |
| `claude/project-thread-z4gr7i` | `43f00a5e8ddcd7372fe897ab00c3bddb9cc226a3` | dev, main |
| `claude/project-thread-zf5mao` | `d860efcfa50a796d924d9d8eec7731017a569e49` | dev |
| `codex/browser-matrix-shards` | `065dda5d70984f5854fb37d3a425575b4044da48` | dev, main |
| `codex/buildout-event-contract` | `bd88aa97041358e914c05a66a43cd93c246d7fde` | dev, main |
| `codex/buildout-observation-batching` | `c7a02785b028128ac6ced7b79866e4011848dd1a` | dev, main |
| `codex/buildout-perf-evidence` | `0a5acccab5762abb90826e30cf6aab344e9a9c5b` | dev, main |
| `codex/buildout-press-ownership` | `7579482d71fd2a8bf05f27c350fa3a57e2c143b0` | dev, main |
| `codex/buildout-ready-guard` | `4c4d8cfa2f5bdf96e3753e1c9f616fa1b6a69b0b` | dev, main |
| `codex/buildout-warm-lifetime` | `73e44217ce32b8a7281f3f5d10c240b395529657` | dev, main |
| `codex/check-helper-log-1950` | `9b63e66d09213a3207ba47ba092ef5cff985351f` | dev, main |
| `codex/ci-proof-9f04319f-a` | `9f04319f4958438616c7fb0d36ed96ba393040cb` | dev |
| `codex/ci-proof-9f04319f-b` | `9f04319f4958438616c7fb0d36ed96ba393040cb` | dev |
| `codex/ci-proof-b76aab76` | `b76aab76a095025246da3194d312560b15114466` | dev |
| `codex/ci-proof-b76aab76-b` | `b76aab76a095025246da3194d312560b15114466` | dev |
| `codex/decision-frame-dedupe` | `c27c1b208b44aa8b73616f30f9c1f168667b4839` | dev, main |
| `codex/deck-plan-button` | `96d0df02eeef48e47479b3904983b5ee03a07dd4` | dev |
| `codex/floor-render-elapsed` | `6798f3ade7c3815471e0d905422354bd2837cb95` | dev, main |
| `codex/floor-trigger-window` | `7ceb88674c34f8b70833db164031d9060e6e0628` | dev, main |
| `codex/gpu-submission-backpressure` | `d877ffb809fed72db40ea8d194950205d60794c9` | dev, main |
| `codex/keychain-policy-verified` | `2ae13798365da5f4a5333bd7d88dcd06edfcb7a9` | dev, main |
| `codex/keychain-restart` | `46b314853fb0268b3e8caca2f8b18c77dcc35a65` | dev, main |
| `codex/landing-uploaded-wordmark` | `25f79dadf59ae57c51a216b4d17eaeaeb3d33771` | dev, main |
| `codex/merge-helper-log` | `1dafeeea00fb1285e6071e4294b8475b60d21b5c` | dev, main |
| `codex/merge-readiness-guard` | `74feccceb953a78d282f4359cbbbcda9651fdb30` | dev, main |
| `codex/observe-manual-launch` | `ecc09a384f3cfd3de3bf5dc82047db98da458237` | dev, main |
| `codex/physical-hold-render-lease` | `34952d8af6aeaeca55c51d19d342183cbda2a772` | dev, main |
| `codex/preserve-owner-budget` | `d6b6c3178d411b3139413b51245f0aca4effc900` | dev, main |
| `codex/redactor-text-memo` | `642bc6ca44e3d1da2a3dd933aca4a2a69d94c8f3` | dev, main |
| `codex/runner-base-refresh` | `bfc16e493fce651b506673a9088588366206649a` | dev, main |
| `codex/runner-escalation-slot` | `0b1049568e898fb9d80551edb7009ff70fe42b1a` | dev, main |
| `codex/runner-overnight` | `7dbcd0e34ad172a554f0255da23e7a433cb80fc2` | dev, main |
| `codex/severe-device-render-budget` | `3a4472679348758e9baf351184473ad5a08a81e6` | dev, main |
| `fix/buildout-phase-elapsed` | `7ce2ce73b57dfac31bc3fa6831f219d4ad0a55d1` | dev, main |
| `fix/catastrophic-frame-fallback` | `c534789fdc2ba898fbc652ec8eb305629e1c65f9` | dev, main |
| `fix/foreground-render-stalls` | `0ca5fdfcd124d3bb765af581b7b7b045baa5c618` | dev, main |
| `phase-1-scaffold` | `3acfa76d475f10d071f825fa47fd5965013764fa` | dev, main |
| `release/2026-10-27-queue` | `99e19047c1f1ab218deb8613ffa6dd3ce46960e3` | dev, main |

Total: **89 remote branches deleted**.

### PRs and issues

Open PRs were reviewed before action. The cleanup PRs above were merged in their requested order.

- Closed [#373](https://github.com/r3dbars/shiptorio/pull/373), the manual recovery patch, with this comment:

> Superseded by #463, the supervised runner implementation of #170; keeping that PR for the player's Gate decision.

  Its `shiptorio/runner-*` branch remains. Closing this superseded PR did not merge its code.

- [#733](https://github.com/r3dbars/shiptorio/pull/733) remains with its active agent; no changes made.
- [#739](https://github.com/r3dbars/shiptorio/pull/739) appeared after the initial inventory and was also left untouched.
- [#571](https://github.com/r3dbars/shiptorio/pull/571), the promotion PR, was left untouched.
- [#463](https://github.com/r3dbars/shiptorio/pull/463) remains for the player's Gate decision. No factory PR was merged.

**No issues closed.** The only open issue at review, [#170](https://github.com/r3dbars/shiptorio/issues/170),
is not shipped: current `dev` still ignores terminal Sentry status on assignment notifications, and #463 is
unmerged. It stays open. No action was taken in `r3dbars/Testing`.

### Repository metadata

Set and read back the description:

> A pixel factory over your GitHub repo. Shippy, powered by Meta Muse Spark, runs the line; you approve at the Gate.

Added topics: `game`, `github`, `ai-agents`, `cloudflare-workers`, `meta`.
