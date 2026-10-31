---
title: Getting started
description: Play the tutorial, then create your own factory on a real repo.
section: Start here
order: 2
---
# Getting started

There are two parts. The **tutorial** plays on sample work in your browser and touches nothing real. **Your own factory** runs on one of your GitHub repos and ships real pull requests.

## Play the tutorial

Open [shiptorio.dev](https://shiptorio.dev). Shippy shows you the deck: one line from your repo to the rocket, with one crate waiting on your call.

- A card shows up at the bottom. **Swipe right** (or tap the right button) to approve. **Swipe left** for Later.
- The crate moves down the line. Watch the stations light up.
- Approve the same kind of fix three times. The dots on the card fill up, and the fourth one goes through on its own. That's the point: you teach the factory, then it's free to work while you deal with the next jam.

Nothing in the tutorial is real work. No GitHub, no agents, no merges.

The tutorial needs no password. It's open to everyone on shiptorio.dev (shiptorio.com still shows its landing page for now).

## Create your own factory

When the tutorial ends, Shippy offers to build yours with a **Start with your repo** card.

1. **Enter the preview password.** A small popup asks for it. Real repos are locked to people with the password while we're in preview. If your browser already has it, you skip this.
2. **Sign in with GitHub.** Shiptorio only uses your GitHub identity. See [Install the GitHub App](/docs/github-app).
3. **Pick a repo.** Install the Shiptorio GitHub App on just that repo. Your open issues show up in the Repo pile.
4. **Connect your coding agent.** Install the local runner and sign in to Codex or Muse Code on your own machine. See [Connect your machine](/docs/runner).
5. **Start an issue.** Pick one from the pile. The Planner proposes a plan; you approve **Start build**; your agent builds it and opens a PR; Checks and Review run; you hold **Ship it** at the Gate.

That's your first real rocket.

## Keyboard

- With the card or its button focused, **Enter** approves it (hold Enter on **Ship it**). **Escape** chooses Later.
- **M** mutes sound.

## Try it locally

```sh
bun install
bun run dev:web
```

Then open `http://localhost:5173/deck.html` for the tutorial, or add `?source=sim` for a sample factory that keeps going.
