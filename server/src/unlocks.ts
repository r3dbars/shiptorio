// The unlock playbook (docs/BRAIN.md step 3). For each signal kind, the moves that clear it, best first.
// The brain picks one of these by id and may reword its title and because line; it can't invent a play or a
// tool. Actions are only the deck's existing safe tools; everything else is a link the player opens (the
// signal's own evidence, or the repo page where the fix happens). Nothing here merges or skips a check; the one
// write, fix_failing_pr, files an issue and still needs its plan approved like any other build.

import type { BrainSignal, BrainUnlock, MoveKind, UnlockEffort } from "@shiptorio/shared";

export interface PlayContext { repo?: string }
export interface Play {
  play: string;
  kinds: readonly string[];
  kind: MoveKind;
  effort: UnlockEffort;
  /** The default card headline. Plain words; the brain may reword it with the real number. */
  title: string;
  grows?: string[];
  action?: (s: BrainSignal) => { tool: string; args: Record<string, unknown> };
  /** Where Continue goes when there's no action. Defaults to the signal's first evidence link. */
  path?: string; // under https://github.com/<repo>/
}

const gh = (repo: string | undefined, path: string) => repo && /^[\w-][\w.-]*\/[\w-][\w.-]*$/.test(repo) && !repo.includes("..") ? `https://github.com/${repo}/${path}` : undefined;
const inspect = (s: BrainSignal) => ({ tool: "inspect_bottleneck", args: { signalId: s.id } });
const connect = (kind: string) => () => ({ tool: "connect_source", args: { kind } });
/** A red PR: Continue files a fix issue and puts it on the line (the plan still waits for its own yes). */
const fixPr = (s: BrainSignal) => {
  const pr = Number(/#(\d+)/.exec(s.evidence[0]?.label ?? "")?.[1]);
  return pr ? { tool: "fix_failing_pr", args: { pr, workflow: s.scope ?? "CI", url: s.evidence[0]?.url } } : inspect(s);
};

export const PLAYBOOK: readonly Play[] = [
  // factory: the line itself
  { play: "clear_queue_jam", kinds: ["queue_jam"], kind: "unblock", effort: "tap", title: "Clear the jam on the line", action: inspect },
  { play: "connect_agent", kinds: ["no_agent", "no_power"], kind: "unblock", effort: "minutes", title: "Plug in an agent to build", grows: ["+1 BUILDER"], action: connect("claude") },
  { play: "read_rework_scars", kinds: ["rework_loop"], kind: "verify", effort: "minutes", title: "See why work keeps bouncing back", action: inspect },
  // repo flow
  { play: "review_stale_prs", kinds: ["prs_stale", "prs_dropped"], kind: "review", effort: "minutes", title: "Land or close the stale PRs", path: "pulls?q=is%3Apr+is%3Aopen+sort%3Aupdated-asc" },
  { play: "launch_waiting_prs", kinds: ["prs_waiting_on_you", "approve_queue"], kind: "ship", effort: "tap", title: "Launch what's waiting on you", action: inspect },
  { play: "speed_up_merges", kinds: ["slow_merge"], kind: "review", effort: "minutes", title: "Get PRs merged faster", path: "pulls?q=is%3Apr+is%3Aopen+sort%3Acreated-asc" },
  { play: "clean_stale_branches", kinds: ["branches_stale"], kind: "unblock", effort: "minutes", title: "Clear out the dead branches", path: "branches/stale" },
  { play: "connect_github", kinds: ["repo_missing"], kind: "input", effort: "minutes", title: "Connect your repo", grows: ["+1 SOURCE"], action: connect("github") },
  { play: "split_big_prs", kinds: ["big_prs"], kind: "review", effort: "hours", title: "Split the biggest PR", path: "pulls" },
  { play: "triage_issues", kinds: ["issues_untriaged", "backlog_growing"], kind: "input", effort: "minutes", title: "Sort the new issues", path: "issues?q=is%3Aissue+is%3Aopen+no%3Alabel" },
  { play: "add_first_tests", kinds: ["no_tests"], kind: "verify", effort: "hours", title: "Add a first test so the checks mean something", grows: ["+1 CHECK"] },
  { play: "write_next_issues", kinds: ["backlog_empty"], kind: "input", effort: "minutes", title: "Write down what to build next", grows: ["+1 ORE"], path: "issues/new" },
  { play: "inspect_ship_rate", kinds: ["ship_rate_drop"], kind: "unblock", effort: "tap", title: "Find out why shipping slowed", action: inspect },
  // CI
  { play: "ci_cache_installs", kinds: ["ci_slow"], kind: "automate", effort: "hours", title: "Speed up CI", path: "actions" },
  { play: "fix_flaky_test", kinds: ["ci_flaky"], kind: "verify", effort: "hours", title: "Fix the flaky test", path: "actions" },
  { play: "fix_red_main", kinds: ["ci_red_main"], kind: "unblock", effort: "minutes", title: "Get main green again", path: "actions?query=branch%3Amain" },
  { play: "ci_add_runners", kinds: ["ci_queue"], kind: "automate", effort: "minutes", title: "Stop PRs queueing for CI", path: "actions" },
  { play: "fix_blocking_check", kinds: ["ci_blocking"], kind: "unblock", effort: "minutes", title: "Have the Builder fix the failing check", action: fixPr },
  { play: "add_ci", kinds: ["ci_missing"], kind: "automate", effort: "minutes", title: "Turn on CI so every PR gets checked", grows: ["+1 CHECK"], path: "actions/new" },
  // Sentry
  { play: "connect_sentry", kinds: ["sentry_missing"], kind: "input", effort: "minutes", title: "Connect Sentry to see what breaks", grows: ["+1 SOURCE"], action: connect("sentry") },
  { play: "triage_errors", kinds: ["errors_piling", "errors_unowned"], kind: "unblock", effort: "minutes", title: "Triage the errors piling up" },
  { play: "chase_error_spike", kinds: ["error_spike", "regression"], kind: "unblock", effort: "minutes", title: "Chase down the new errors" },
  // PostHog
  { play: "connect_posthog", kinds: ["no_analytics"], kind: "input", effort: "minutes", title: "Connect PostHog to see who uses it", grows: ["+1 SOURCE"], action: connect("posthog") },
  { play: "fix_funnel_step", kinds: ["funnel_drop", "funnel_leak"], kind: "build", effort: "hours", title: "Fix the step where people drop off" },
  { play: "get_first_users", kinds: ["no_users", "usage_flat", "growth_stall"], kind: "input", effort: "hours", title: "Put it in front of more people" },
  { play: "find_what_changed", kinds: ["usage_falling"], kind: "unblock", effort: "minutes", title: "Find what changed when usage dropped", path: "pulls?q=is%3Apr+is%3Amerged+sort%3Aupdated-desc" },
  { play: "announce_feature", kinds: ["feature_unused"], kind: "input", effort: "minutes", title: "Tell people about what you shipped" },
  // feedback
  { play: "reply_to_feedback", kinds: ["feedback_unanswered"], kind: "reply", effort: "minutes", title: "Answer the people who wrote in" },
  { play: "ask_for_feedback", kinds: ["feedback_thin"], kind: "input", effort: "minutes", title: "Ask a few users what's missing" },
  { play: "fix_top_complaint", kinds: ["same_complaint"], kind: "build", effort: "hours", title: "Fix what people keep asking about", path: "issues/new" },
  // the player's own goals and taps
  { play: "set_a_goal", kinds: ["goal_missing"], kind: "input", effort: "tap", title: "Set a goal so the factory knows what matters", action: () => ({ tool: "ask_goal", args: {} }) },
  { play: "revisit_goal", kinds: ["goal_stalled", "goal_off_track"], kind: "input", effort: "tap", title: "Check in on your goal", action: () => ({ tool: "ask_goal", args: {} }) },
  { play: "tune_the_deck", kinds: ["card_ignored", "later_streak", "never_reason"], kind: "input", effort: "tap", title: "Tell the factory what to stop suggesting" },
];

/** A kind no play covers yet (a collector added it): look at the evidence. */
const LOOK: Play = { play: "look_at_it", kinds: [], kind: "unblock", effort: "minutes", title: "Take a look" };

export const playsFor = (kind: string): Play[] => { const hit = PLAYBOOK.filter(p => p.kinds.includes(kind)); return hit.length ? hit : [LOOK]; };
export const findPlay = (id: string): Play | undefined => id === LOOK.play ? LOOK : PLAYBOOK.find(p => p.play === id);

/** How the loop knows it worked: the signal clears, or its metric gets back past its baseline. */
export function doneWhen(s: BrainSignal): BrainUnlock["doneWhen"] {
  const m = s.metric;
  if (!m || m.baseline === undefined || m.value === m.baseline) return { signalId: s.id };
  return m.value > m.baseline ? { signalId: s.id, below: m.baseline } : { signalId: s.id, above: m.baseline };
}

const safeUrl = (u: string | undefined) => { try { return u && /^https:$/.test(new URL(u).protocol) ? u : undefined; } catch { return undefined; } };

/** Builds the unlock for a play against one signal. Words default to the playbook's; the brain passes its own. */
export function unlockFor(play: Play, s: BrainSignal, bottleneckId: string, ctx: PlayContext, words: { title?: string; because?: string } = {}): BrainUnlock {
  const action = play.action?.(s);
  const url = action ? undefined : safeUrl(play.path ? gh(ctx.repo, play.path) : undefined) ?? safeUrl(s.evidence.find(e => e.url)?.url);
  return {
    id: `${bottleneckId}:${play.play}`, bottleneckId, play: play.play, kind: play.kind, effort: play.effort,
    title: (words.title || play.title).slice(0, 80),
    because: (words.because || s.title).slice(0, 140),
    ...(action ? { action } : {}), ...(url ? { url } : {}), ...(play.grows ? { grows: play.grows } : {}),
    doneWhen: doneWhen(s),
  };
}
