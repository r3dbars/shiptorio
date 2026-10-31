---
title: Trust
description: How the factory learns which calls it can make on its own, one kind of card at a time.
section: The loop
order: 2
---
# Trust

Day one, every step asks you. Trust is how that changes, and it's the only progress bar.

## The dots

After the first approval, eligible cards show progress toward three approvals of the same kind: for example, "start building docs-only plans in this repo". Each filled dot is one approval.

- **Approve it as suggested**: one dot fills.
- **Three in a row**: that kind becomes automatic. The station turns green and the next one goes through without a card.
- **Later, a change, or Never**: the dots empty and it asks again.

Starting an issue and approving a build plan are learned separately. Rework, a changed base, or anything the factory hasn't seen before always asks fresh.

## What never becomes automatic

- **Merging.** The Gate always needs your hold on **Ship it**.
- **Anything outside the files you approved.** The server rejects those diffs no matter what.

Legacy launch permits and autonomy levels are parked and are not part of the deck's trust meter.

## Turning it back off

Answering **Ask me again** on an automatic step removes it and resets its dots.
