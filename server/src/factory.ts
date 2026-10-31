import { PRIVATE_SOCKET_TIMING, PrivateSocketTiming, measureSocket, timingResponse } from "./private-socket-timing";
import { assertRefreshItem, ownsRefreshPr, refreshTarget, RefreshBaseMoved } from "./runner-refresh";
import { adminPaused, auditAdmin } from "./admin-control";
import { activeAdminView, readAdminView, viewCookieValue } from "./admin-view";
import { pruneExpiredDeliveryMarkers } from "./delivery-retention";
import { accountIdentity } from "./account-identity";
import { runnerAuthMove, type AuthHarness } from "./runner-health";
import { planningFailure, planningHold, planningCapacity, planningCapacityRaised, planningFailureKind, planningDeadline, plannerRestDeck, plannerBusy, PLANNER_BUSY_LINE, PLANNING_DEADLINE_MS, PLANNER_REST_KEY, type PlanningRetry } from "./planning-retry";
import { availableJobHarness, syncRunnerPower } from "./runner-power";
import { factoryDeleted } from "./account-data";
import { pollDelay, RateLimitError } from "./rate-limit";
import { factorySpend } from "./spend";
import { BudgetError, budgetAccount, budgetLimits, budgetUsage } from "./budget";
import { runQuotaStatus, runQuota } from "./signup";
import * as Sentry from "@sentry/cloudflare";
import { capture, currentTrace, inTrace, log, report, sentryOptions, type Trace, type TelemetryEnv } from "./telemetry";
import { redact, redactText } from "./redact";
import { Redactor } from "./redact";

import { repoAccess, requireUser, validRepo } from "./authorization";

import { stuckItem } from "./reliability";
import { validatePlan, validatePatch } from "./injection-policy";

// One Factory per repo. It owns the factory state, runs the tick loop on an alarm,
// talks to browsers over websockets, and drives Spark jobs that open real PRs.

import { authorizationRevoked } from "./session";
import { handleLifecycle, lifecycleEvents, RETENTION_MS } from "./github-lifecycle";
import { purgeInstallationTokens } from "./github";
import { flagEnabled, flagOptedOut } from "./flags";
import { DurableObject } from "cloudflare:workers";
import { pollDevice, type DeviceRecord, type JoinRecord } from "./device-pairing";
import { BrowserFrames, browserHeartbeat, browserSocketActive, browserSocketAllowed, browserSocketAuth, browserSocketEpoch, type BrowserSocketEnv, type BrowserSocketAuth } from "./browser-socket";

import { consumeBudget, rateLimit, type Budget, type LimitResult } from "./rate-limit";
import { unlockMove, signalWeight, freshSignals, type Diagnosis } from "@shiptorio/shared";
import {
  SCIENCE_FOR,
  WebToServer,
  canSetPriority,
  emptyResearch,
  lineOrder,
  withPriority,
  fallbackExperiment,
  insertCheck,
  researchBlocked,
  projectPipeline,
  suggestResearch,
  techById,
  TECHS,
  type FactoryState,
  type FunnelWindow,
  type Item,
  type Move,
  type Patch,
  type ServerToWeb,
  type SourceKind,
  type SourceStatus,
  type SupportTicket,
  type Thought,
  type ThoughtDecision,
  summarizeIsland,
  type IslandSummary,
  type AutonomyLevel,
  GOAL_MOVE_ID,
  GOALS,
  GOAL_IDS,
  goalMove,
  goalsFromPick,
  goalText,
  tiltByGoals,
  inferGoals,
  type GoalGuess,
  type Goals,
} from "@shiptorio/shared";
import { commitToBranch, fileContent, gh, installationToken, inspectPullRequest, freshIssueInput, issueReporters, openIssues, openPullRequest, repoTree, runnerInstallationToken, pullRequestReadiness, type AppCredentials } from "./github";
import { hasMachine, pickAssembler, SAFE_PATH, starterLine, upsert } from "./engine";
import { layoutMap } from "./map";
import { initialFactoryState, reconcileFactoryGitHubAccess } from "./factory-initialization";
import { inventoryCommand } from "./factory-inventory";
import { gameMaster, heuristicTriage, readGoals, judgeOrbit, judgePermit, pickPower, pickResearch, pickFiles, planLocalTask, proposeExperiment, sparkConfigured, sparkModel, triage, writeFix, type GameMasterBrief, type GameMasterCall, type SparkEnv, type Triage } from "./spark";
import { projectLiveBottleneck, emptyBrain, recordThought, scoreShip } from "./brain";
import { RepositoryReadUnavailable, type SparkStep, type Toolbox } from "./spark-tools";
import { ciReport, codeSearch, factoryBrief, issueComments, signalsBrief, treePaths } from "./spark-context";
import { issueRevision, RunnerHarness, runnerPathAllowed, validLease, type RunnerJob, type RunnerReceipt } from "./runner-job";
import { enforceRoute, geothermalGuard, harnessLabel, LOCAL_POWER_ID, looksSmall, ruleRoute } from "./geothermal";
import { foldSignal, matchDistrict, oreWeight } from "./ore";
import { changedPaths, canRework, proofComment, diffText, freshInspection, launchMove, liveStations, mergePullRequest, nextGate, prFiles, referencedFiles, researchMove, reviewComment, reviewDiff, reworkMove, runChecks, setStage, stageOf, stationsPassed, verifyFromDiff, withChecks } from "./gauntlet";
import { autonomyView, emptyBook, laneOf, mayAutoLaunch, permitMove, permitReady, recordRework, recordShip, setPermit, snooze, earned, type PermitBook } from "./permits";
import { escape, grantLevel, ladderOf, LEVEL_NAME, levelMove, levelReady, levelTap, lowerLevel, snoozeLevel } from "./levels";
import { githubStatus, normalizeGitHub, TRUST_LABEL, type GitHubPayload } from "./sources/github";
import type { Signal } from "./sources";
import { buildDeck, moveScope, enrichMove } from "./deck";
import { closeGone, loadTaps, offerCards, offeredRow, openCards, purgeTaps, recordOutcome, recordTap, tapBrief, tapsEnabled, tapsReport, type NeverReason, type TapAction, type TapContext, type TapOutcome } from "./taps";
import { deriveBottleneck, stageForItem, type StageHistory, type StageMetrics } from "./bottleneck";
import { eligible as brainEligible, emptyMemory as emptyBrainMemory, named as brainNamed, modelDiagnose, runDiagnose, tapBrain, type BrainMemory } from "./diagnose";
import { collect, emptyCache as emptySignalCache, type SignalCache } from "./signals";
import { dismissNote, resetLearn, forget, forgetAll, forgetOnComeback, freshWork, isLearned, learnedList, learnFromYes, learnKey, learnMeter, learnOption, learnScope, noteAutoRun } from "./learn";
import { hasDeferReceipt, beginCheckin, deferCard, emptyDeckBook, moveKey, noteYes, plannerFeedback, resetYes, suppressed, thirdDefer, yesKey, type DeckBook, type DeckRule } from "./deck-decisions";
import { normalizeSentry, sentryStatus, type SentryPayload } from "./sources/sentry";
import { recordSentryPulse, SENTRY_PULSES_KEY, type SentryPulse } from "./signals/sentry";
import { analyze, fakePostHogRows, fetchRouteDays, POLL_MS, postHogStatus, type RouteDay } from "./sources/posthog";
import { experimentSignal, growthTick, MEASURE_ID, measureMachine, newExperiment, routeUsers } from "./growth";
import { linkedRepo, linkRepo, postHogCreds, sentryCreds, markUsed, legacyCredentialOwner, type CredsEnv, type MineKind } from "./sources/creds";
import { expired, isWatching, regress, revertedPr, startWatch, watchForRevert, watchForSentry, watchForSha } from "./orbit";
import { isOperatorSupport, supportCreds, supportStatus, type SupportEnv, type SupportMessage } from "./sources/support";
import { deliverReply, fallbackDraft, foldMessage, heuristicSupport, issueFor, issueMove, linkCandidates, makeDraft, playerTap, replyMove, type PlayerTap } from "./support";
import { draftReply, triageSupport, type SupportTriage } from "./spark-support";

import { loadFactoryState, readFactoryState, saveFactoryState, stateSize, persistedState } from "./state-storage";

export interface FactoryEnv extends AppCredentials, SparkEnv, CredsEnv, BrowserSocketEnv, TelemetryEnv, SupportEnv {

  PUBLIC_URL?: string;
  GITHUB_WEBHOOK_SECRET?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  HOSTED_SPARK_ASSEMBLER?: string;
  /** "off" stops the card tap log (docs/context/taps.md). */
  TAPS_LOG?: string;
  DB: D1Database;
  FACTORY: DurableObjectNamespace<Factory>;
}

const TICK_MS = 2000;
const READINESS_POLL_MS = 30_000;
const MAX_ATTEMPTS = 3;
const RUNNER_LEASE_MS = 30 * 60 * 1000;
// Longer than the runner's 30s request timeout, so an in-flight claim is never handed out twice.
const LOST_CLAIM_MS = 45_000;
// Local runner planning/publication currently requires a real GitHub issue.
const runnerIssue = (item: Item) => item.source === "github_issue" && /^gh-\d+$/.test(item.id);
const proposesPlan = (move: Move) => move.options.some(o => o.actions.some(a => a.tool === "plan_runner_job"));
const MINE_KIND: Record<Signal["source"], SourceKind | undefined> = { github_issue: "github", sentry: "sentry", posthog: "posthog", inbox: undefined, lint: undefined };
// Where each mine's ore deposit sits on the live map, left of the splitter.
const DEPOSIT_Y: Record<MineKind, number> = { sentry: -3, posthog: 3 };
const REVIEW_COMMENT_TRIES = 5;
interface PendingComment { pr: number; body: string; itemId?: string; tries: number }
const workRevision = (item: Item) => issueRevision(item.title, JSON.stringify({ body: item.body ?? "", failure: item.failure ?? "", scars: item.scars ?? [] }));

/** Who tapped, for the send log. Sockets carry their verified login (browser-socket.ts). */
const playerLogin = (auth: unknown) => (auth && typeof auth === "object" && typeof (auth as { login?: unknown }).login === "string" ? (auth as { login: string }).login : "player");

interface Meta {
  repo: string;
  installationId: number;
}

/** deckBook.yes is keyed "kind|scope"; the goals collector wants Continues by kind. */
const rollUpYes = (yes?: Record<string, number>) => {
  const out: Record<string, number> = {};
  for (const [key, n] of Object.entries(yes ?? {})) out[key.split("|")[0]] = (out[key.split("|")[0]] ?? 0) + n;
  return out;
};

/** Player words for background work that failed (the card once showed "offerRunnerPlan failed"). */
const RELIABILITY_WORDS = {
  alarm: "The factory's clock", tick: "Background work", watchdog: "Checking for stuck work", orbitExpire: "Wrapping up a launch",
  offerRunnerPlan: "Preparing the next plan", planRunnerJobs: "Preparing plans", planComment: "Posting the plan on GitHub",
  reconcileGitHub: "Catching up with GitHub", reconcile: "Catching up with GitHub", retryReviewComments: "Posting review notes",
  runGauntlet: "Running checks", offerGauntletMove: "Preparing the next check", runLearned: "Running work you taught it",
  runLevel: "Running automatic work", autoLaunchPermitted: "An automatic launch", offerGoalMove: "Suggesting a goal",
  offerLevelMove: "Suggesting the next level", offerPermitMove: "Suggesting a launch permit", offerResearchMove: "Suggesting research",
  pollPostHog: "Reading PostHog", reconnectMines: "Reconnecting your sources", tickSupport: "Reading support messages",
} as const;

/** A red PR Shippy filed a fix for (`fixesPr:<issue>`): brought in once merged, confirmed once its checks finish. */
type FixRecord = { pr: number; sameRepo: boolean; done?: boolean; fixedBy?: number; confirmed?: boolean };

class FactoryBase extends DurableObject<FactoryEnv> {
  /** Dedicated probe object: storage read only, never initializes a repo or schedules work. */
  async health(): Promise<{ ok: boolean }> {
    await this.ctx.storage.get("ops-health");
    return { ok: true };
  }

  // Dedicated security objects never load repo state, call Spark, or set alarms.
  async securityLimit(budget: Budget): Promise<LimitResult> {
    return consumeBudget(this.ctx.storage, budget);
  }
  private state: FactoryState | null = null;
  private meta: Meta | null = null;
  private socketEpoch: string | null = null;
  private credentialsReady = false;
  private redactor = new Redactor(this.env);
  private credentialRepoId: number | null = null;
  private credentialScope() { return this.meta && this.credentialRepoId ? { installationId: this.meta.installationId, repo: this.meta.repo, repoId: this.credentialRepoId } : undefined; }
  private running = new Set<string>(); // item ids with a job in flight

  private sparkEnv(): SparkEnv {
    return { ...this.env, budgetRepo: this.meta!.repo, budgetAccount: () => budgetAccount(this.env.DB, this.meta!.repo) };
  }

  async usage() {
    await this.load();
    if (!this.meta) throw new Error("Factory not initialized");
    return budgetUsage(this.env, await budgetAccount(this.env.DB, this.meta.repo));
  }

  private batchingDecisions = false;
  private activeBrowserMoves = 0;
  private openMoves: Move[] | null = null;
  private deckBook: DeckBook | null = null;
  private deckRules: DeckRule[] | null = null;
  /** Card ids on the deck that already have a card_taps row this showing (docs/context/taps.md); null until loaded. */
  private tapsOpen: Set<string> | null = null;
  private tapBriefCache: { at: number; brief: ReturnType<typeof tapBrief> } | null = null;
  private tapsFailed = false;

  private accountErased = false;

  /** An export is an allowlist of saved user data, never raw runner jobs or credentials. */
  async exportAccountData(): Promise<string> {
    const state = await readFactoryState(this.ctx.storage);
    return JSON.stringify({
      state,
      permits: await this.ctx.storage.get<PermitBook>("permits") ?? null,
      research: state?.research ?? null,
      logs: {
        thoughts: state?.brain?.thoughts ?? [],
        approvals: await this.ctx.storage.get<{kind: string; scope: string; at: number; actionId: string}[]>("approvalEvents") ?? [],
        stages: await this.ctx.storage.get<StageHistory[]>("stageHistory") ?? [],
        // docs/context/taps.md: every card this factory dealt and what was tapped.
        taps: await this.accountTaps(),
      },
    });
  }

  /** This factory's card_taps rows, under its repo name or its retained repo-id key. */
  private async accountTaps(): Promise<unknown[]> {
    const meta = await this.ctx.storage.get<Meta>("meta");
    const keys = [...new Set([meta?.repo, await this.ctx.storage.get<string>("githubDataKey")].filter((k): k is string => !!k))];
    const rows: unknown[] = [];
    for (const key of keys) rows.push(...(await this.env.DB.prepare("SELECT * FROM card_taps WHERE repo = ? ORDER BY shown_at").bind(key).all()).results);
    return rows;
  }

  async accountConnectionStatus() {
    return { paired: !!await this.ctx.storage.get("runnerPair"), presence: await this.ctx.storage.get<{harnesses: string[]; seenAt: number}>("runnerPresence") ?? null };
  }

  async closeAccountSockets(login: string) {
    for (const ws of this.ctx.getWebSockets("web")) {
      const auth = ws.deserializeAttachment() as { login?: string } | null;
      if (auth?.login?.toLowerCase() === login.toLowerCase()) ws.close(1008, "Signed out everywhere");
    }
  }

  async pruneAccountDeliveries(installationIds: number[], userId: number) {
    const owned = new Set(installationIds);
    await this.ctx.blockConcurrencyWhile(async () => {
      for (const prefix of ["delivery:", "failed:delivery:"]) {
        const entries = await this.ctx.storage.list<{payload?: GitHubPayload}>({prefix});
        for (const [key, value] of entries) if (key.startsWith(prefix) && (owned.has(value.payload?.installation?.id ?? -1) || value.payload?.sender?.id === userId)) await this.ctx.storage.delete(key);
      }
    });
  }

  async eraseAccountData() {
    return this.ctx.blockConcurrencyWhile(async () => {
      this.accountErased = true;
      for (const ws of this.ctx.getWebSockets()) ws.close(1008, "Factory deleted");
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      this.state = null; this.meta = null;
      this.openMoves = null; this.deckBook = null; this.deckRules = null; this.tapsOpen = null; this.tapBriefCache = null;
      this.running.clear();
    });
  }

  private async assertAccountActive(repo?: string) {
    const object = this.ctx.id?.toString();
    if (this.accountErased || repo && await factoryDeleted(this.env.DB, repo) || object && await factoryDeleted(this.env.DB, `object:${object}`)) {
      this.accountErased = true;
      throw new Error("Factory deleted");
    }
  }

  private accountPut<T>(key: string, value: T) {
    if (this.accountErased) throw new Error("Factory deleted");
    return this.ctx.storage.put(key, value);
  }

  /** Every decision refresh lands here; most leave the stored JSON as it was, and storage stays the judge of that. */
  private async accountPutChanged<T>(key: string, value: T) {
    if (this.accountErased) throw new Error("Factory deleted");
    if (JSON.stringify(await this.ctx.storage.get(key)) !== JSON.stringify(value)) await this.ctx.storage.put(key, value);
  }

  private accountAlarm(at: number) {
    if (this.accountErased) throw new Error("Factory deleted");
    return this.ctx.storage.setAlarm(at);
  }

  async observedCall(method: string, args: unknown[], trace: Trace): Promise<any> {
    const allowed = ["allowDeviceStart", "startDevice", "startJoin", "takeJoin", "approveDevice", "readyDevice", "pollDevice", "activateRunner", "recordRunnerGrant", "rejectRunnerGrant", "runnerStatus", "planningRetries", "retryAIReview", "startInboxIssue", "heartbeatRunner", "revokeRunner", "ensure", "connectMine", "disconnectMine", "pairRunner", "runnerJobs", "isRunnerPaired", "enqueueRunner", "claimRunner", "finishRunner", "enqueueGitHub", "enqueueSentry", "enqueueSupport", "debugSnapshot", "adminControl", "exportState", "summary", "exportAccountData", "eraseAccountData", "accountConnectionStatus", "closeAccountSockets", "pruneAccountDeliveries"];

    if (!allowed.includes(method)) throw new Error("Unknown factory RPC");
    return inTrace(trace, this.env, task => this.ctx.waitUntil(task), async () => {
      const start = Date.now();
      try {
        const result = await (this as unknown as Record<string, (...args: unknown[]) => Promise<unknown>>)[method](...args);
        log("info", "factory.rpc", { method, durationMs: Date.now() - start });
        return result;
      } catch (error) { report(error, "factory.rpc_failed", { method, durationMs: Date.now() - start }); throw error; }
    });
  }

  /** Internal RPC reachable only through the authenticated, audited admin route. No merge action exists. */
  async adminControl(action: string, input: {level?: AutonomyLevel}) {
    await this.load();
    if(!this.state || !this.meta) throw new Error('Factory unavailable');
    if(action === 'autonomy') {
      if(!input.level || !['advisor','floor','build','lights_out'].includes(input.level)) throw new Error('Invalid level');
      const book=await this.permitBook();
      await this.savePermits({...book,ladder:{...ladderOf(book),level:input.level,since:Date.now()}});
      return;
    }
    if(action === 'fast-forward') {
      // Only scheduling delays. Never alter leases, inspection proof, strikes or launch permits.
      for(const [key,value] of await this.ctx.storage.list<PlanningRetry>({prefix:'planningRetry:'})) {
        await this.accountPut(key,{...value,retryAt:0});
      }
      await this.accountPut('posthogPoll',{nextAt:0,failures:0});
      await this.accountAlarm(Date.now()+1);
      return;
    }
    if(action !== 'reset-factory') throw new Error('Unknown control');
    await this.ctx.blockConcurrencyWhile(async()=>{
      const jobs=await this.runnerJobs();
      if(this.running.size || this.batchingDecisions || this.initializing || this.activeBrowserMoves || jobs.some(j=>j.status==='running'||j.status==='planning') || this.state!.items.some(i=>i.prNumber&&i.state!=='launched')) throw new Error('Active work must finish first');
      for(const [key] of await this.ctx.storage.list()) {
        if(/^(runnerJob:|planningRetry:|delivery:)/.test(key)||['permits','openMoves','deckBook','approvalEvents','stageHistory','support','research','researchOffered','sparkResearch','posthogTraffic','pendingReviewComments','reconcileAt','reconcileCursor','runnerLastJobId','supportSeen'].includes(key)) await this.ctx.storage.delete(key);
      }
      await this.env.DB.prepare('DELETE FROM move_kind_rules WHERE repo=?').bind(this.meta!.repo).run();
      this.openMoves=null;this.deckBook=null;this.deckRules=null;
      this.state={repo:this.meta!.repo,baseBranch:this.state!.baseBranch,districts:this.state!.districts,...starterLine(),items:[],science:{red:0,green:0,grey:0,blue:0},trust:0.5,tick:0,sources:this.state!.sources};
      await this.save();
      await this.broadcast({type:'snapshot',state:this.state!});
      await this.scheduleTick();
    });
  }

  async debugSnapshot() {
    await this.load();
    // No runner receipts, pairing grants, issue bodies, source keys, or private code.
    const s = this.state;
    return redact(s ? { release: this.env.BUILD_SHA ?? "unknown", repo: this.meta?.repo, tick: s.tick, machines: s.machines, belts: s.belts,
      items: s.items.map(i => ({ id: i.id, state: i.state, district: i.district, attempts: i.attempts, prNumber: i.prNumber, failure: i.failure })),
      brain: s.brain, power: s.power } : null);
  }

  private async decisionData() {
    if (!this.openMoves) this.openMoves = await this.ctx.storage.get<Move[]>("openMoves") ?? (this.state?.deck?.length ? [...this.state.deck] : this.state?.move ? [this.state.move] : []);
    if (!this.deckBook) this.deckBook = await this.ctx.storage.get<DeckBook>("deckBook") ?? emptyDeckBook();
    if (!this.deckRules) {
      const query = this.env.DB.prepare("SELECT kind, scope, action_id AS actionId FROM move_kind_rules WHERE repo = ?").bind(this.meta!.repo);
      this.deckRules = (await query.all<DeckRule>()).results;
    }
  }

  /** One hook for the autonomy lane. Records intent; it never grants a launch permit. */
  private async recordApproval(kind: string, scope: string, actionId = crypto.randomUUID()) {
    const events = await this.ctx.storage.get<{ kind: string; scope: string; at: number; actionId: string }[]>("approvalEvents") ?? [];
    await this.accountPut("approvalEvents", [...events.slice(-199), { kind, scope, at: Date.now(), actionId }]);
  }

  // Publication state is per live DO instance, not an authorization cache. A new
  // instance publishes its first deck/move, and each new socket still gets a snapshot.
  private decisionPublications: Partial<Record<"deck" | "move", { payload: string; policyRevision: number }>> = {};

  private publishDecisionFrame(message: Extract<ServerToWeb, { type: "deck" | "move" }>): void {
    const type = message.type, payload = JSON.stringify(message), policyRevision = this.redactor.policyRevision;
    const previous = this.decisionPublications[type];
    if (previous?.payload === payload && previous.policyRevision === policyRevision) return;
    // Pending publications also suppress duplicates. A rejected cursor/delivery
    // must release only its own stamp: an older failure cannot invalidate a newer
    // payload, or a later identical payload under a new policy (the ABA case).
    const publication = { payload, policyRevision };
    this.decisionPublications[type] = publication;
    const failed = (error: unknown) => {
      if (this.decisionPublications[type] === publication) delete this.decisionPublications[type];
      report(error, "factory.decision_publication_failed", { kind: type });
    };
    try { void this.broadcast(message).catch(failed); } catch (error) { failed(error); }
  }

  private async refreshDecisions() {
    if (!this.state || !this.meta || this.batchingDecisions) return;
    await this.decisionData();
    const s = this.state, now = Date.now(), jobs = await this.runnerJobs();
    const resting = await this.plannerRest();
    const heldIssues = new Set((await this.planningRetries()).map(r => r.itemId));
    const presence = await this.ctx.storage.get<{ harnesses: string[]; seenAt: number }>("runnerPresence");
    const history = await this.ctx.storage.get<StageHistory[]>("stageHistory") ?? [];
    let changed = false;
    for (const entry of history.filter(h => h.exitedAt === undefined)) {
      const item = s.items.find(i => i.id === entry.itemId);
      if (!item || stageForItem(item, jobs) !== entry.stage) { entry.exitedAt = now; changed = true; }
    }
    for (const item of s.items) {
      const stage = stageForItem(item, jobs);
      if (stage && !history.some(h => h.itemId === item.id && h.stage === stage && h.exitedAt === undefined)) {
        history.push({ itemId: item.id, stage, enteredAt: Math.min(now, item.updatedAt) }); changed = true;
      }
    }
    if (changed) await this.accountPut("stageHistory", history.filter(h => h.exitedAt === undefined || h.exitedAt > now - 86400000).slice(-4000));
    const presenceFresh = !!presence?.harnesses.length && now - presence.seenAt < 20000;
    if (!presenceFresh && !jobs.some(j => j.status === "running")) {
      const power = syncRunnerPower(s.power, []);
      if (JSON.stringify(power) !== JSON.stringify(s.power)) { s.power = power; this.broadcast({ type: "patch", patch: { power } }); }
    }
    const telemetryState = presenceFresh || jobs.some(j => j.status === "running") ? s : { ...s, power: s.power.filter(p => p.kind !== "solar" && p.kind !== "geothermal") };
    const derived = deriveBottleneck(telemetryState, { now, history, jobs, powered: this.env.HOSTED_SPARK_ASSEMBLER === "1" || !!presence?.harnesses.length && now - presence.seenAt < 20000 || jobs.some(j => j.status === "running") });
    s.bottleneck = derived.bottleneck;
    const metrics = derived.stages;
    this.openMoves = this.openMoves!.filter(move => {
      const item = move.itemId && s.items.find(i => i.id === move.itemId);
      if (move.itemId && (!item || item.state === "launched")) return false;
      // Restored or delayed merge cards cannot acquire authority over a new commit.
      if (move.options.some(o => o.actions.some(a => a.tool === "request_merge" && (!item || a.args.pr !== item.prNumber || typeof a.args.headSha !== "string" || !/^[a-f0-9]{40}$/.test(a.args.headSha) || a.args.headSha !== item.inspection?.headSha)))) return false;
      const boundHead = move.options.flatMap(o => o.actions).find(a => typeof a.args.headSha === "string")?.args.headSha;
      if (boundHead && item && boundHead !== item.inspection?.headSha) return false;
      const proposing = move.options.some(o => o.actions.some(a => a.tool === "plan_runner_job"));
      const refreshing = move.options.some(o => o.actions.some(a => a.tool === "plan_runner_job" && a.args.refreshBase === true));
      if (proposing && item && (resting || heldIssues.has(item.id) || item.priority === "park" || !runnerIssue(item) || !(refreshing ? ["on_pad", "passed", "inspecting", "rejected"] : ["ore", "queued", "rejected"]).includes(item.state) || jobs.some(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status)))) return false;
      const boundScars = move.options.flatMap(o => o.actions).find(a => typeof a.args.scarCount === "number")?.args.scarCount;
      if (proposing && item && boundScars !== undefined && boundScars !== (item.scars?.length ?? 0)) return false;
      const jobId = move.options.flatMap(o => o.actions).find(a => a.tool === "approve_runner_job")?.args.jobId;
      if (jobId && !jobs.some(j => j.id === jobId && j.status === "awaiting_approval")) return false;
      if (move.stage === "pad" && item && item.state !== "on_pad" && item.state !== "rejected") return false;
      if (move.stage === "resources" && !move.id.startsWith("runner-auth:") && s.bottleneck?.stage !== "resources") return false;
      // A stuck alarm is stale once the item moves on, and a queued issue isn't stuck while your machine is online: it waits on its plan card.
      if (move.id.startsWith("stuck:") && item && (!move.title.endsWith(`stuck at ${item.state}`) || item.state === "queued" && presenceFresh)) return false;
      return true;
    });
    // One plan card at a time, the oldest first (older factories dealt one per queued issue).
    let planCard = false;
    this.openMoves = this.openMoves.filter(m => !proposesPlan(m) || suppressed(this.deckBook!, m) || (planCard ? false : (planCard = true)));
    this.openMoves = this.openMoves.filter(m => !m.id.startsWith("bottleneck:") || m.id === `bottleneck:${s.bottleneck?.stationId ?? s.bottleneck?.stage}`);
    const impliedMove = this.openMoves.find(m => m.id.startsWith("bottleneck:"));
    // docs/ATTENTION.md: behind the flag, the player's Continues in a row lift that class of card a little.
    const yes = await flagEnabled(this.env, "attention") ? this.deckBook!.yes : undefined;
    const learning = await flagEnabled(this.env, "learn");
    this.kickBrain(derived, now);
    const brainCard = await this.brainCard(derived);
    const ranked = buildDeck(s, [...this.openMoves!.filter(m => !m.id.startsWith("bottleneck:") && !suppressed(this.deckBook!, m)), ...(brainCard && !suppressed(this.deckBook!, brainCard) ? [brainCard] : [])], { now, impliedMove, yes, buildMoving: jobs.some(j => ["planning", "ready", "running"].includes(j.status)), rules: this.deckRules!.map(r => ({ ...r, kind: r.kind as NonNullable<Move["kind"]> })) });
    const offered = plannerRestDeck(resting ? ranked : this.applyGameMaster(ranked), resting ?? undefined);
    this.askGameMaster(ranked, metrics);
    for (const implied of offered.filter(m => m.id.startsWith("bottleneck:"))) {
      if (!this.openMoves!.some(m => m.id === implied.id)) this.openMoves!.push(implied);
    }
    this.openMoves = this.openMoves!.filter(m => !m.id.startsWith("bottleneck:") || offered.some(card => card.id === m.id));
    const deck = offered.filter(m => !suppressed(this.deckBook!, m)).map(m => {
      const decision = this.deckBook!.decisions[moveKey(m)];
      // A "That's fixed" card is news, not a decision: past Hides on other wins (they share a key) don't wrap it.
      if (decision && decision.count >= 3 && !m.id.startsWith("win:")) return thirdDefer(m);
      // Say out loud when the player's own taps put a card here, unless the game master already explained it.
      const streak = yes?.[yesKey(m.kind ?? "unblock", moveScope(m, s))] ?? 0;
      const card = streak >= 2 && !m.because ? { ...m, because: `You said yes to the last ${streak} like this.` } : m;
      // docs/LEARN.md: the dots. How many more yeses until the factory does this kind on its own.
      const learn = learning ? learnMeter(this.deckBook!, m, learnScope(m, moveScope(m, s), jobs), freshWork(m, s.items.find(i => i.id === m.itemId), jobs)) : undefined;
      return learn ? { ...card, learn } : card;
    });
    const previous = s.move;
    s.deck = deck; s.move = deck[0] ?? null;
    s.learned = learning ? learnedList(this.deckBook!) : [];
    s.liveBottleneck = projectLiveBottleneck(s, jobs, now);
    await this.logDeck(deck);
    await this.accountPutChanged("openMoves", this.openMoves);
    await this.accountPutChanged("deckBook", this.deckBook);
    await this.save();
    this.broadcast({ type: "patch", patch: { bottleneck: s.bottleneck, liveBottleneck: s.liveBottleneck, learned: s.learned, pipeline: projectPipeline(s, jobs, presenceFresh) } });
    // Unchanged decisions need no new transport frame. Every frame we do publish
    // retains broadcast's fresh session/membership checks; tick and queue telemetry
    // keep flowing even when the cards are unchanged.
    this.publishDecisionFrame({ type: "deck", deck });
    if (s.move) this.publishDecisionFrame({ type: "move", move: s.move });
    else {
      delete this.decisionPublications.move;
      if (previous) this.broadcast({ type: "move_resolved", moveId: previous.id, actor: "player" });
    }
  }

  // ---------- the bottleneck brain (docs/BRAIN.md): collect signals, diagnose ONE bottleneck, deal ONE unlock ----------

  private brainBusy = false;
  private brainKickedAt = 0;
  /** "Look now" (scripts/e2e/real-loop.ts look): the next pass re-reads every source and skips the half-hour wait. */
  private brainForce = false;
  private brainLookAt = 0;

  /** One forced look every 20s at most; the day's run cap and budget stop still apply inside runDiagnose. */
  private async brainLook() {
    if (Date.now() - this.brainLookAt < 20_000) return;
    this.brainLookAt = Date.now(); this.brainForce = true; this.brainKickedAt = 0;
    await this.refreshDecisions();
  }

  /** The brain's current card, from its stored memory. The "brain" flag (default off) gates it. */
  private async brainCard(derived: { bottleneck: FactoryState["bottleneck"] }): Promise<Move | null> {
    if (!await flagEnabled(this.env, "brain")) return null;
    const memory = await this.ctx.storage.get<BrainMemory>("brainMemory");
    const cur = memory?.current, win = await this.winCard(memory);
    // A fresh follow-up goes first, even over the next problem; an older one waits until the deck is quiet.
    if (win && (!cur || Date.now() - win.createdAt < 30 * 60_000)) return win;
    if (!cur) return null;
    const move = unlockMove(cur.bottleneck, cur.unlock, cur.shownAt);
    // A queue-jam card stands on the jam's station, so the deck doesn't also deal the plain bottleneck card.
    const jam = derived.bottleneck;
    return cur.bottleneck.id.startsWith("factory:queue_jam") && jam ? { ...move, stage: jam.stage, focus: jam.stationId ?? jam.stage } : move;
  }

  /** Shippy's follow-up: the last unlock that worked, once, until the player taps it. */
  private async winCard(memory: BrainMemory | undefined): Promise<Move | null> {
    const seen = await this.ctx.storage.get<number>("brainWinSeen") ?? 0;
    const open = (memory?.cleared ?? []).filter(c => c.clearedAt > seen && Date.now() - c.clearedAt <= 6 * 3_600_000);
    // "#39 passes its checks now, with the fix from #43" says more than the plain CI clear that lands beside it.
    const win = open.find(c => c.bottleneckId.startsWith("fix:")) ?? open[0];
    if (!win) return null;
    return {
      id: `win:${win.bottleneckId}`, title: "That's fixed",
      why: win.bottleneckId.startsWith("fix:") ? `Shippy checked again: ${win.title}.` : `Shippy checked again: "${win.title.replace(/\.$/, "")}" is clear now.`,
      kind: "unblock", createdAt: win.clearedAt, attention: "suggest",
      options: [{ id: "continue", label: "Nice", recommended: true, actions: [] }, { id: "later", label: "Hide", recommended: false, actions: [] }],
    };
  }

  private async seeWin(card: Move) {
    const cleared = (await this.ctx.storage.get<BrainMemory>("brainMemory"))?.cleared ?? [];
    const win = cleared.find(c => card.id === `win:${c.bottleneckId}`);
    // One follow-up per fix: seeing it also covers the clears that came with it.
    if (win) await this.accountPut("brainWinSeen", Math.max(...cleared.filter(c => Math.abs(c.clearedAt - win.clearedAt) < 10 * 60_000).map(c => c.clearedAt)));
    await this.refreshDecisions();
  }

  /**
   * One pass of the loop, off the tick: read due collectors, diagnose (throttled inside runDiagnose), store
   * memory and the Diagnosis, and refresh the deck only when the card changed. One pass in flight; at most every 30s.
   */
  private kickBrain(derived: { bottleneck: FactoryState["bottleneck"]; stages: StageMetrics[] }, now: number) {
    if (this.brainBusy || now - this.brainKickedAt < 30_000 || !this.meta) return;
    this.brainBusy = true; this.brainKickedAt = now;
    const force = this.brainForce; this.brainForce = false;
    const run = async () => {
      if (!await flagEnabled(this.env, "brain")) {
        if (this.state?.holdingBack) { this.state.holdingBack = null; await this.save(); this.broadcast({ type: "patch", patch: { holdingBack: null } }); }
        return;
      }
      const s = this.state!, meta = this.meta!;
      let token: Promise<string> | undefined;
      const { cache, errors } = await collect({
        force, state: s, repo: meta.repo, env: this.env, jam: { bottleneck: derived.bottleneck ?? null, stages: derived.stages },
        storage: { get: key => this.ctx.storage.get(key) },
        githubToken: () => token ??= installationToken(this.env, meta.installationId),
        publicUrl: this.publicUrl(), yes: rollUpYes(this.deckBook?.yes),
        posthogCreds: async () => await this.ctx.storage.get<boolean>("posthogLinked") ? postHogCreds(this.env, this.credentialScope(), this.redactor) : {},
      }, force ? emptySignalCache() : await this.ctx.storage.get<SignalCache>("brainSignals") ?? emptySignalCache(), now);
      for (const e of errors) this.log("warn", `Couldn't read ${e.source} signals: ${e.error.slice(0, 200)}`);
      await this.accountPut("brainSignals", cache);
      await this.decisionData();
      const stored = await this.ctx.storage.get<BrainMemory>("brainMemory") ?? emptyBrainMemory();
      // A forced look forgets when it last looked and what it saw, so the throttle treats the picture as new.
      const before = force ? { ...stored, lastAt: undefined, mainKey: undefined, quiet: false } : stored;
      const feedback = plannerFeedback(this.deckBook!, this.deckRules!);
      const budget = await this.brainBudget();
      const steps: { tool: string; reason: string; result: string }[] = [];
      const permits = await this.ctx.storage.get<PermitBook>("permits");
      const result = await runDiagnose({
        signals: tiltByGoals(cache.signals, s.goals), memory: before, now, goal: s.goal, playerFeedback: feedback, ctx: { repo: meta.repo }, budget,
        think: sparkConfigured(this.env) ? brief => this.think("diagnose", { title: `${brief.signals.length} ${brief.signals.length === 1 ? "signal" : "signals"}, heaviest: ${brief.signals[0]?.title ?? "none"}`, target: derived.bottleneck?.stationId },
          () => modelDiagnose(this.sparkEnv(), brief, { repo: meta.repo }, { factory: () => factoryBrief(s, undefined, permits, feedback) }, async step => { steps.push(step); }),
          out => ({ ...("quiet" in out ? { outcome: "Nothing worth a card right now", reason: out.reason } : { outcome: `${out.bottleneck.title} → ${out.unlock.title}`, reason: out.reason }), steps })) : undefined,
      });
      result.memory = await this.confirmFixes(result.memory, now);
      await this.accountPut("brainMemory", result.memory);
      const main = result.memory.current && cache.signals.find(x => x.id === result.memory.current!.bottleneck.signalIds[0]);
      const holdingBack = result.memory.current ? { ...result.memory.current.bottleneck, severity: main ? Math.min(1, signalWeight(main, now)) : 0 } : null;
      if (JSON.stringify(holdingBack) !== JSON.stringify(s.holdingBack ?? null)) {
        s.holdingBack = holdingBack;
        s.liveBottleneck = projectLiveBottleneck(s, await this.runnerJobs(), Date.now());
        await this.save();
        this.broadcast({ type: "patch", patch: { holdingBack, liveBottleneck: s.liveBottleneck } });
      }
      for (const c of result.cleared) this.log("success", `Unblocked: ${c.title.replace(/\.$/, "")}.`);
      // A forced look says what it weighed, so a "why didn't he notice X" is answerable from the deck's log.
      // Top four, plus any CI signal below them, since a red PR is what the Look button is usually for.
      const seen = freshSignals(cache.signals, now), shown = [...seen.slice(0, 4), ...seen.slice(4).filter(x => x.source === "ci")];
      // "set aside" marks what memory skips (Later, or acted on), so a pass over a heavy signal is readable.
      const open = new Set(brainEligible(cache.signals, before, now).map(x => x.id));
      if (force) this.log("info", `Shippy looked: ${shown.map(x => `${x.title.slice(0, 60)} (${signalWeight(x, now).toFixed(2)}${x.confidence < 1 ? `, ${Math.round(x.confidence * 100)}% sure` : ""}${open.has(x.id) ? "" : ", set aside"})`).join("; ") || "nothing to flag"}. ${result.why}`.slice(0, 600));
      if (result.decided) {
        const log = await this.ctx.storage.get<Diagnosis[]>("brainDiagnoses") ?? [];
        await this.accountPut("brainDiagnoses", [result.diagnosis, ...log].slice(0, 50));
      }
      if (result.decided && !result.thought && result.fellBack === undefined && result.diagnosis.bottleneck) {
        await this.note({ decision: "diagnose", by: "fallback", ms: 0, title: result.diagnosis.bottleneck.title, outcome: result.diagnosis.unlock?.title ?? "No card", reason: result.why, model: "heaviest-signal rule" });
      }
      const key = (m?: BrainMemory) => m?.current ? `${m.current.bottleneck.id}|${m.current.unlock.id}|${m.current.unlock.title}` : "";
      if (key(before) !== key(result.memory)) await this.refreshDecisions();
    };
    void run().catch(error => this.log("error", `Bottleneck brain failed: ${String(error)}`)).finally(() => {
      this.brainBusy = false;
      // A Look pressed while this pass ran would otherwise wait for the next tick.
      if (this.brainForce) { this.brainKickedAt = 0; void this.refreshDecisions().catch(() => {}); }
    });
  }

  /** The day's model budget as one fraction (calls or tokens, whichever is further along); null with no ledger. */
  private async brainBudget(): Promise<{ used: number; limit: number } | null> {
    const env = this.sparkEnv();
    if (!env.DB || !env.budgetAccount) return null;
    try {
      const u = await budgetUsage(env, await env.budgetAccount());
      return { used: Math.max(u.calls / Math.max(1, u.limits.calls), u.tokens / Math.max(1, u.limits.tokens)), limit: 1 };
    } catch { return null; }
  }

  private async tapBrainCard(bottleneckId: string, choice: "continue" | "later") {
    const memory = await this.ctx.storage.get<BrainMemory>("brainMemory");
    if (!memory) return;
    const signal = (await this.ctx.storage.get<SignalCache>("brainSignals"))?.signals.find(x => x.id === bottleneckId);
    await this.accountPut("brainMemory", tapBrain(memory, bottleneckId, choice, signal ? signalWeight(signal, Date.now()) : 0, Date.now(), signal && brainNamed(signal)));
    this.brainKickedAt = 0; // the slot is free: look again on the next tick
  }

  /**
   * Yes on a red PR: file one issue that says what's failing, and put it on the line. Its plan still waits for the
   * player's yes. When the fix merges, onPullClosed brings it into the red PR so its checks run again.
   */
  private async fixFailingPr(args: Record<string, unknown>): Promise<boolean> {
    const pr = Number(args.pr), workflow = String(args.workflow ?? "CI").slice(0, 80);
    if (!this.meta || !Number.isSafeInteger(pr) || pr < 1) return false;
    const repo = this.meta.repo;
    try {
      const token = await installationToken(this.env, this.meta.installationId);
      const pull = await gh<{ state: string; title: string; html_url: string; head: { repo: { full_name: string } | null } }>(`/repos/${repo}/pulls/${pr}`, token);
      if (pull.state !== "open") { this.log("info", `#${pr} isn't open anymore, so there's nothing to fix.`); return false; }
      let issue = await this.ctx.storage.get<number>(`fixIssueFor:${pr}`);
      // The trust label lets the planner take an issue the App filed itself (staging's App isn't shiptorio[bot]).
      if (issue) await gh(`/repos/${repo}/issues/${issue}/labels`, token, { method: "POST", body: JSON.stringify({ labels: [TRUST_LABEL] }) });
      else {
        const url = typeof args.url === "string" && args.url.startsWith("https://github.com/") ? args.url : pull.html_url;
        issue = (await gh<{ number: number }>(`/repos/${repo}/issues`, token, { method: "POST", body: JSON.stringify({
          title: `Fix "${workflow}" failing on #${pr}`.slice(0, 200), labels: [TRUST_LABEL],
          body: [`Shippy found the "${workflow}" check failing on #${pr} (${pull.title.slice(0, 120)}), so it can't ship.`, "", `Failing run: ${url}`, "",
            `Make "${workflow}" pass on the default branch. Fix the code the check exercises; don't weaken or skip the check, and don't change what #${pr} is for.`].join("\n"),
        }) })).number;
        await this.accountPut(`fixIssueFor:${pr}`, issue);
        await this.accountPut(`fixesPr:${issue}`, { pr, sameRepo: pull.head.repo?.full_name.toLowerCase() === repo.toLowerCase() });
      }
      const started = await this.startInboxIssue(issue, await this.runAccount() ?? "shippy");
      if ("waitingFor" in started) { this.log("info", `Filed #${issue} for the red check on #${pr}. It starts once PR #${started.waitingFor} is done.`); return true; }
      this.log("success", `Filed #${issue} to fix "${workflow}" on #${pr}. Approve its plan and the Builder fixes it.`, `gh-${issue}`);
      return true;
    } catch (error) {
      this.log("warn", `Couldn't start the fix for #${pr}: ${String(error).slice(0, 160)}`);
      return false;
    }
  }

  /** A fix build for a red PR failed: forget the Continue, so Shippy can deal the red-PR card again now, not in 6h. */
  private async reopenRedPrCard(itemId: string) {
    const issue = Number(/^gh-(\d+)$/.exec(itemId)?.[1]);
    if (!issue || !await this.ctx.storage.get(`fixesPr:${issue}`)) return;
    const memory = await this.ctx.storage.get<BrainMemory>("brainMemory");
    if (!memory) return;
    const acted = Object.fromEntries(Object.entries(memory.acted).filter(([id]) => !id.startsWith("ci:ci_blocking:")));
    if (Object.keys(acted).length !== Object.keys(memory.acted).length) await this.accountPut("brainMemory", { ...memory, acted });
  }

  /** The fix for a red PR merged: update that PR from the default branch so its checks run on the fix. */
  private async bringFixInto(issue: number, fixPr: number) {
    const target = await this.ctx.storage.get<FixRecord>(`fixesPr:${issue}`);
    if (!target || target.done || !this.meta) return;
    await this.accountPut(`fixesPr:${issue}`, { ...target, done: true, fixedBy: fixPr }); // a merge webhook and our own launch both land here
    if (!target.sameRepo) { this.log("info", `The fix for #${target.pr} merged in #${fixPr}. #${target.pr} comes from a fork, so its author needs to update it.`); return; }
    try {
      const token = await installationToken(this.env, this.meta.installationId);
      await gh(`/repos/${this.meta.repo}/pulls/${target.pr}/update-branch`, token, { method: "PUT", body: "{}" });
      this.log("success", `The fix merged in #${fixPr}. Shippy brought it into #${target.pr}, and its checks are running again.`);
      this.brainForce = true; this.brainKickedAt = 0; // look again soon; the check takes a few minutes
    } catch (error) {
      this.log("warn", `The fix merged in #${fixPr}, but #${target.pr} couldn't be updated: ${String(error).slice(0, 160)}`);
    }
  }

  /**
   * A fix Shippy brought into a red PR: once that PR's checks finish, he checks the result himself. Green is a win
   * for the follow-up card; still red is said plainly. Two GitHub reads a pass, only while a fix is out.
   */
  private async confirmFixes(memory: BrainMemory, now: number): Promise<BrainMemory> {
    if (!this.meta) return memory;
    const out = [...(await this.ctx.storage.list<FixRecord>({ prefix: "fixesPr:" })).entries()].filter(([, f]) => f.done && !f.confirmed);
    if (!out.length) return memory;
    const token = await installationToken(this.env, this.meta.installationId);
    let next = memory;
    for (const [key, f] of out) {
      try {
        const pull = await gh<{ state: string; head: { sha: string } }>(`/repos/${this.meta.repo}/pulls/${f.pr}`, token);
        const runs = (await gh<{ check_runs?: { status: string; conclusion: string | null }[] }>(`/repos/${this.meta.repo}/commits/${pull.head.sha}/check-runs?per_page=50`, token)).check_runs ?? [];
        if (pull.state === "open" && (!runs.length || runs.some(r => r.status !== "completed"))) continue;
        await this.accountPut(key, { ...f, confirmed: true });
        if (pull.state !== "open") continue;
        if (!runs.every(r => ["success", "neutral", "skipped"].includes(r.conclusion ?? ""))) { this.log("warn", `#${f.pr} still fails its checks after the fix in #${f.fixedBy}. It needs another look.`); continue; }
        const title = `#${f.pr} passes its checks now${f.fixedBy ? `, with the fix from #${f.fixedBy}` : ""}`;
        next = { ...next, cleared: [{ bottleneckId: `fix:${f.pr}`, play: "fix_blocking_check", title, clearedAt: now, heldMs: 0 }, ...next.cleared].slice(0, 10) };
        this.log("success", `${title}.`);
      } catch (error) { this.log("warn", `Couldn't check #${f.pr} after the fix: ${String(error).slice(0, 160)}`); }
    }
    return next;
  }

  /** Continue on an unlock card: run its one safe action (or the browser opens its link), and watch whether it worked. */
  private async chooseBrainMove(card: Move, option: Move["options"][number]): Promise<boolean> {
    if (card.id.startsWith("win:")) { await this.seeWin(card); return true; }
    if (!card.id.startsWith("unlock:")) return false;
    if (option.id === "later") { await this.swipe(card, "defer"); return true; }
    const action = option.actions[0];
    if (action?.tool === "fix_failing_pr" && !await this.fixFailingPr(action.args)) return true; // said why in the log; the card stays
    if (action?.tool === "connect_source" && (action.args.kind === "sentry" || action.args.kind === "posthog")) await this.connectMine(action.args.kind);
    else if (action?.tool === "inspect_bottleneck") this.log("info", card.why);
    else if (action?.tool === "ask_goal") { await this.publishGauntletMove(null); await this.offerGoalMove(true); }
    await this.recordApproval(card.kind ?? "unblock", moveScope(card, this.state!));
    await this.tapBrainCard(card.id.slice(7), "continue");
    return true;
  }

  // ---------- game master: Spark ranks the deck and words the bottleneck card ----------

  private gm: { key: string; call: GameMasterCall; wip?: number } | null = null;
  private gmAsking: string | null = null;
  private gmLastAt = 0;
  private gmFails = 0;

  private static deckKey(deck: readonly Move[], s: FactoryState): string {
    // Pile size is left out on purpose: a pile growing by one isn't a new deck, and each new key is a Spark call.
    return JSON.stringify([s.bottleneck?.stage, s.bottleneck?.stationId, deck.map(m => m.id).sort()]);
  }

  /** Spark's last call for this exact deck: its order first, its suggested option, its words on the bottleneck card. */
  private applyGameMaster(deck: Move[]): Move[] {
    const call = this.gm && this.gm.key === Factory.deckKey(deck, this.state!) ? this.gm.call : null;
    if (!call) return deck;
    const rank = (m: Move) => { const i = call.order.indexOf(m.id); return i === -1 ? Infinity : i; };
    return [...deck].sort((a, b) => rank(a) - rank(b)).map(m => {
      let move = m;
      const pick = call.picks[m.id];
      // Locked ship cards keep "run the missing check" on top; Spark can't talk a merge past the gauntlet.
      // A "do nothing" pick would stall autopilot on a card that has a real next step; ranking the card lower already says "later".
      const stalls = !m.options.find(o => o.id === pick)?.actions.length && m.options.some(o => o.recommended && o.actions.length);
      if (pick && !m.locked && !stalls) move = { ...move, options: move.options.map(o => ({ ...o, recommended: o.id === pick })) };
      // Spark's words quote the pile size it saw; once the pile changes, the card's own up-to-date words stand.
      if (m.id.startsWith("bottleneck:") && call.bottleneck && this.gm!.wip === this.state!.bottleneck?.wip) move = { ...move, title: call.bottleneck.title, why: call.bottleneck.why };
      // The why line only describes the option Spark picked, so a locked or overruled card keeps its own reason.
      if (call.because[m.id] && !m.locked && !(pick && stalls)) move = { ...move, because: call.because[m.id] };
      return move;
    });
  }

  /** Asks Spark for a fresh ranking when the deck changes. Never blocks the tick; one call in flight at a time. */
  private askGameMaster(deck: Move[], stages: StageMetrics[]) {
    const s = this.state!;
    if (!sparkConfigured(this.env) || !deck.length || this.state?.deck?.some(m => m.id === "planner-rest")) return;
    const key = Factory.deckKey(deck, s);
    // Ranking is a nice-to-have next to planning and review: at most every 5 min (a churning deck once burned
    // a rank a minute for half an hour), backing off to 15 min while it fails.
    const wait = Math.min(15 * 60_000, 5 * 60_000 * 2 ** this.gmFails);
    if (this.gm?.key === key || this.gmAsking || Date.now() - this.gmLastAt < wait) return;
    this.gmAsking = key; this.gmLastAt = Date.now();
    const brief = {
      goal: s.goal,
      bottleneck: s.bottleneck ? { stage: s.bottleneck.stage, stationId: s.bottleneck.stationId, wip: s.bottleneck.wip, ageMinutes: Math.round(s.bottleneck.ageMs / 60000), valueAtRisk: s.bottleneck.valueAtRisk, summary: s.bottleneck.summary } : null,
      stages: stages.filter(m => m.wip).map(m => ({ stage: m.stage, wip: m.wip, ageMinutes: Math.round(m.ageMs / 60000), throughputPerHour: m.throughputPerHour })),
      items: s.items.filter(i => i.state !== "launched").slice(0, 30).map(i => ({ id: i.id, title: i.title.slice(0, 120), kind: i.kind, state: i.state, district: i.district, scars: i.scars?.length ?? 0 })),
      cards: deck.map(m => ({ id: m.id, title: m.title.slice(0, 160), why: m.why.slice(0, 240), kind: m.kind, stage: m.stage, options: m.options.map(o => ({ id: o.id, label: o.label, recommended: o.recommended })) })),
      playerFeedback: plannerFeedback(this.deckBook!, this.deckRules!),
    } as GameMasterBrief;
    const top = (id: string) => deck.find(m => m.id === id);
    void this.rankBudgetLeft().then(async ok => { if (ok) brief.taps = await this.tapsForBrain(); return ok; }).then(ok => ok ? this.think("rank", { title: `${deck.length} decision ${deck.length === 1 ? "card" : "cards"}${s.bottleneck ? `, jam at ${s.bottleneck.stage}` : ""}`, target: s.bottleneck?.stationId },
      () => gameMaster(this.sparkEnv(), brief),
      call => ({ outcome: `Top card: ${call.bottleneck && call.order[0]?.startsWith("bottleneck:") ? call.bottleneck.title : top(call.order[0])?.title ?? "none"}`, reason: call.reason }))
      .then(async call => { this.gm = { key, call, wip: brief.bottleneck?.wip }; this.gmFails = 0; await this.refreshDecisions(); }) : undefined)
      .catch(() => { this.gm = null; this.gmFails = Math.min(this.gmFails + 1, 4); this.log("info", "The planner is resting. Factory rules are keeping the deck moving."); })
      .finally(() => { if (this.gmAsking === key) this.gmAsking = null; });
  }

  /** The game master stops at half the day's Spark budget, so ranking can never starve planning and review. */
  private async rankBudgetLeft(): Promise<boolean> {
    const env = this.sparkEnv();
    if (!env.DB || !env.budgetAccount) return true;
    try {
      const u = await budgetUsage(env, await env.budgetAccount());
      return u.calls < u.limits.calls / 2 && u.tokens < u.limits.tokens / 2;
    } catch { return true; }
  }

  private async publishDecision(move: Move | null) {
    await this.decisionData();
    if (move) {
      move = enrichMove(move, this.state!);
      const item = this.state!.items.find(i => i.id === move!.itemId);
      if (item?.inspection) move = { ...move, options: move.options.map(o => ({ ...o, actions: o.actions.map(a => ({ ...a, args: { ...a.args, headSha: a.tool === "request_merge" ? a.args.headSha : item.inspection!.headSha, scarCount: item.scars?.length ?? 0 } })) })) };
      const key = moveKey(move);
      const previous = this.openMoves!.find(m => moveKey(m) === key);
      if (previous) move = { ...move, id: previous.id, createdAt: previous.createdAt };
      this.openMoves = [...this.openMoves!.filter(m => moveKey(m) !== moveKey(move!)), move];
    } else if (this.state?.move) this.openMoves = this.openMoves!.filter(m => moveKey(m) !== moveKey(this.state!.move!));
    await this.refreshDecisions();
  }

  // ---------- the tap log (docs/context/taps.md): every card offered and what the player did ----------

  /** The log is a side channel: a failing write is reported once per instance and never blocks a tap. */
  private tapsError(error: unknown) {
    if (!this.tapsFailed) report(error, "factory.taps_log_failed");
    this.tapsFailed = true;
  }

  /** Logs cards new to the deck and closes the ones that left it untapped. Never breaks the deck. */
  private async logDeck(deck: Move[]): Promise<void> {
    if (!tapsEnabled(this.env) || !this.meta) return;
    try {
      const repo = this.meta.repo, now = Date.now();
      if (!this.tapsOpen) { this.tapsOpen = new Set(await openCards(this.env.DB, repo)); await purgeTaps(this.env.DB, now); }
      const ids = new Set(deck.map(m => m.id));
      const fresh = deck.filter(m => !this.tapsOpen!.has(m.id));
      const gone = [...this.tapsOpen].filter(id => !ids.has(id));
      await offerCards(this.env.DB, await Promise.all(fresh.map(m => this.tapRow(m, now))));
      await closeGone(this.env.DB, repo, gone, now);
      this.tapsOpen = ids;
    } catch (error) { this.tapsError(error); }
  }

  private async tapRow(move: Move, now: number) {
    const s = this.state!, b = s.bottleneck;
    // The model wrote it when the card carries the game master's reason or pick for it.
    let by = this.gm && (this.gm.call.because[move.id] === move.because || this.gm.call.picks[move.id]) ? "spark" as const : "rule" as const;
    const rank = s.brain?.thoughts.find(t => t.decision === "rank")?.reason;
    const context: TapContext = { bottleneck: b ? { stage: b.stage, wip: b.wip, ageMinutes: Math.round(b.ageMs / 60000) } : null, ...(rank ? { rank } : {}) };
    let play: string | undefined;
    // Bottleneck-brain cards (`unlock:<bottleneckId>`, #388): grade them by play, with the signals the brain saw.
    if (move.id.startsWith("unlock:")) {
      const memory = await this.ctx.storage.get<{ current?: { bottleneck: { id: string; by: "spark" | "rule" }; unlock: { play: string } } }>("brainMemory");
      const signals = await this.ctx.storage.get<{ signals: { id: string; severity: number }[] }>("brainSignals");
      if (memory?.current && `unlock:${memory.current.bottleneck.id}` === move.id) { play = memory.current.unlock.play; by = memory.current.bottleneck.by; }
      context.signals = (signals?.signals ?? []).slice(0, 10).map(x => ({ id: x.id, severity: Math.round(x.severity * 100) / 100 }));
    }
    return offeredRow(this.meta!.repo, move, moveScope(move, s), by, now, context, play);
  }

  private async logTap(card: Move, action: Exclude<TapAction, "gone">, optionId?: string, reason?: NeverReason): Promise<void> {
    if (!tapsEnabled(this.env) || !this.meta) return;
    try { await recordTap(this.env.DB, await this.tapRow(card, Date.now()), { action, optionId, reason }, Date.now()); }
    catch (error) { this.tapsError(error); }
  }

  private async logOutcome(itemId: string, outcome: TapOutcome): Promise<void> {
    if (outcome === "rework" || outcome === "came_back") await this.unlearnOnComeback(itemId);
    if (!tapsEnabled(this.env) || !this.meta) return;
    try { await recordOutcome(this.env.DB, this.meta.repo, itemId, outcome, Date.now()); } catch (error) { this.tapsError(error); }
  }

  /** docs/LEARN.md: work the factory started on its own came back, so that kind of card asks the player again. */
  private async unlearnOnComeback(itemId: string): Promise<void> {
    try {
      await this.decisionData();
      if (!forgetOnComeback(this.deckBook!, itemId)) return;
      await this.accountPut("deckBook", this.deckBook);
      this.log("warn", "Something the factory did on its own came back. It asks you about these again.");
    } catch (error) { report(error, "factory.unlearn_failed"); }
  }

  /** The player's last 30 days of taps, boiled down for the game master. Cached 10 minutes. */
  private async tapsForBrain(): Promise<ReturnType<typeof tapBrief> | undefined> {
    if (!tapsEnabled(this.env) || !this.meta) return undefined;
    if (this.tapBriefCache && Date.now() - this.tapBriefCache.at < 600000) return this.tapBriefCache.brief;
    try {
      const since = Date.now() - 30 * 86400000;
      const brief = tapBrief(tapsReport(await loadTaps(this.env.DB, { repo: this.meta.repo, since, limit: 1000 }), since));
      this.tapBriefCache = { at: Date.now(), brief };
      return brief;
    } catch (error) { this.tapsError(error); return undefined; }
  }

  private async swipe(move: Move, why: "defer" | "once" | "kind" | "spark" | "wrong", intent?: {id: string; userId: number; scope: string}) {
    if (move.id.startsWith("win:")) return this.seeWin(move);
    await this.decisionData();
    if (why !== "defer" && move.id.startsWith("unlock:")) await this.tapBrainCard(move.id.slice(7), "later");
    const book = this.deckBook!, key = moveKey(move), before = book.decisions[key] && structuredClone(book.decisions[key]);
    const jobs = await this.runnerJobs();
    const reset = () => { resetYes(book, move.kind ?? "unblock", moveScope(move, this.state!)); resetLearn(book, move.kind ?? "unblock", learnScope(move, moveScope(move, this.state!), jobs)); };
    if (why === "defer") {
      const counted = deferCard(book, move, intent);
      if (counted) { reset(); if (move.id.startsWith("unlock:")) await this.tapBrainCard(move.id.slice(7), "later"); }
    }
    else {
      reset();
      const id = crypto.randomUUID(), scope = moveScope(move, this.state!);
      book.decisions[key] = { key, move, count: before?.count ?? 0, dismissed: true };
      const undo: DeckBook["undos"][number] = { id, expiresAt: Date.now() + 300000, key, before };
      if (why === "kind") {
        const rule = { kind: move.kind ?? "unblock", scope, actionId: id };
        const existing = this.deckRules!.find(r => r.kind === rule.kind && r.scope === scope);
        if (!existing) {
          await this.env.DB.prepare("INSERT INTO move_kind_rules (repo, kind, scope, action_id, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(repo, kind, scope) DO NOTHING").bind(this.meta!.repo, rule.kind, scope, id, Date.now()).run();
          this.deckRules!.push(rule); undo.rule = rule;
        }
      }
      // docs/LEARN.md: a plain dismiss is a lesson too. The planner tries another version or something else next time.
      if (why === "once") { undo.noteId = id; book.notes.push({ id, text: dismissNote(move, scope) }); book.notes = book.notes.slice(-100); }
      if (why === "wrong") { undo.noteId = id; book.notes.push({ id, text: `Player correction for ${move.kind ?? "unblock"} in ${scope}: ${move.title}. Reason: wrong call; reconsider this proposal.` }); book.notes = book.notes.slice(-100); }
      if (why === "spark") await this.recordApproval(move.kind ?? "unblock", scope, id);
      book.undos = [...book.undos.filter(u => u.expiresAt > Date.now()), undo].slice(-100);
      const labels = { once: "Card dismissed.", kind: "This kind of card is now muted here.", spark: "Your preference for the factory to decide these has been recorded.", wrong: "Correction saved for the next plan." };
      this.broadcast({ type: "log", level: "info", text: labels[why], actor: "player", actionId: id, at: Date.now() });
    }
    // One durable book write contains both the parking effect and its receipt.
    // A restart before/after this write can neither acknowledge an unapplied tap nor recount it.
    if (intent) await this.accountPut("deckBook", book);
    await this.refreshDecisions();
  }

  private async undoDecision(actionId: string) {
    await this.decisionData();
    const book = this.deckBook!, undo = book.undos.find(u => u.id === actionId && u.expiresAt > Date.now());
    if (!undo) return;
    // Refuse an old undo after a newer decision on the same card.
    if (book.undos.some(u => u.key === undo.key && book.undos.indexOf(u) > book.undos.indexOf(undo))) return;
    if (undo.rule) {
      await this.env.DB.prepare("DELETE FROM move_kind_rules WHERE repo = ? AND kind = ? AND scope = ? AND action_id = ?").bind(this.meta!.repo, undo.rule.kind, undo.rule.scope, undo.id).run();
      this.deckRules = this.deckRules!.filter(r => r.actionId !== undo.id);
    }
    const approvals = await this.ctx.storage.get<{ actionId?: string }[]>("approvalEvents") ?? [];
    await this.accountPut("approvalEvents", approvals.filter(a => a.actionId !== undo.id));
    book.notes = book.notes.filter(n => n.id !== undo.noteId);
    if (undo.before) book.decisions[undo.key] = undo.before; else delete book.decisions[undo.key];
    book.undos = book.undos.filter(u => u.id !== actionId);
    this.log("info", "Dismissal undone. The card is back.");
    await this.refreshDecisions();
  }

  private async clearRunnerMove(): Promise<void> {
    if (this.state?.move?.stage === "resources" && !this.state.move.id.startsWith("runner-auth:")) await this.publishDecision(null);
  }

  private async publishRunnerMove(move: Move | null) { await this.publishDecision(move); }

  /** Posts Spark's plan and every tool call behind it on the GitHub issue, so the thinking is checkable in GitHub. */
  /**
   * Spark's read tools for one item at one commit: the repo (read, list, search), the issue thread, the PR and its
   * checks when there is one, the factory and the mines. All read-only; see server/src/spark-tools.ts.
   */
  private async sparkToolbox(token: string, item: Item, sha: string, paths: string[], pr?: { headSha: string; diff: () => Promise<string> }): Promise<Toolbox> {
    const repo = this.meta!.repo;
    await this.decisionData();
    const feedback = plannerFeedback(this.deckBook!, this.deckRules!);
    const permits = await this.permitBook();
    const issue = item.id.startsWith("gh-") ? Number(item.id.slice(3)) : undefined;
    return {
      paths: [...new Set(paths)].filter(runnerPathAllowed),
      read: path => fileContent(token, repo, path, sha),
      search: query => codeSearch(token, repo, query),
      ...(issue ? { comments: () => issueComments(token, repo, issue) } : {}),
      ...(pr ? { pr: pr.diff, ci: () => ciReport(token, repo, pr.headSha, item.failure) } : {}),
      issue: () => JSON.stringify({ title: item.title, body: item.body ?? "", district: item.district, failure: item.failure, scars: item.scars }),
      factory: () => factoryBrief(this.state!, item, permits, feedback),
      signals: () => signalsBrief(this.state!, item),
    };
  }

  private async planComment(token: string, job: RunnerJob, item: Item): Promise<void> {
    if (!item.id.startsWith("gh-") || !job.plan) return;
    const triage = this.state?.brain?.thoughts.find(t => t.itemId === item.id && t.decision === "triage" && t.by === "spark");
    const steps = (job.steps ?? []).map((st, i) => `${i + 1}. \`${st.tool}\` — ${st.reason}`).join("\n");
    const body = [
      `🧠 **Shiptorio planned this${job.reworkPr ? " rework" : ""}** with Meta Muse Spark (\`${sparkModel(this.env)}\`)`,
      triage ? `**Triage:** ${triage.outcome}. ${triage.reason}` : "",
      steps ? `**How it got there** (one tool call per turn, read-only):\n${steps}` : "",
      `**Plan for ${harnessLabel(job.harness)}:**\n\n${job.plan}`,
      job.allowedPaths.length ? `**Allowed files:** ${job.allowedPaths.map(p => `\`${p}\``).join(", ")}` : "",
      job.needsApproval ? "_Nothing builds until the player approves this plan in Shiptorio._" : "",
    ].filter(Boolean).join("\n\n");
    await gh(`/repos/${job.repo}/issues/${item.id.slice(3)}/comments`, token, { method: "POST", body: JSON.stringify({ body: `${body.slice(0, 60000)}\n\n<!-- shiptorio-plan:${job.id} -->` }) });
  }

  private runnerApprovalMove(job: RunnerJob, item: Item): Move {
    return { id: job.approvalMoveId ?? crypto.randomUUID(), title: `Build #${item.id.slice(3)}: ${item.title}`, why: `Review the plan and ${job.allowedPaths.length} files before ${job.harness === "local" ? "your computer's local model" : `your local ${harnessLabel(job.harness)}`} starts.`, itemId: item.id, stage: "build", kind: "build", focus: "assembler-1", createdAt: Date.now(), plan: [`Files: ${job.allowedPaths.join(", ")}`, `Base commit: ${job.baseSha}`, ...(job.refreshBase ? [`Update existing PR #${job.reworkPr}: replace branch ${job.branch} only if its head is still ${job.refreshBase.expectedHeadSha}.`, "This replaces the old fix commit with a new scoped commit on the base shown above. Your agent runs fresh base-failing/head-passing proof; CI and review restart. Nothing merges until Launch."] : []), ...(job.route ? [`Power: ${job.route}`] : []), ...(job.plan ?? "").split("\n").filter(Boolean), "Checks run before a PR opens. You still decide when to merge."], options: [{ id: "approve", label: `Approve and build with ${harnessLabel(job.harness)}`, recommended: true, actions: [{ tool: "approve_runner_job", args: { jobId: job.id, ...(job.refreshBase ? { refreshBase: true } : {}) }, reason: "Approve this exact plan, file scope and base commit." }] }, { id: "decline", label: "Not now", recommended: false, actions: [] }] };
  }

  private async offerRunnerPlan(): Promise<void> {
    if (!(await this.load())) return;
    const s = this.state!;
    const jobs = await this.runnerJobs();
    const awaiting = jobs.find(j => j.status === "awaiting_approval" && j.plan && j.approvalMoveId);
    const awaitingItem = awaiting && s.items.find(i => i.id === awaiting.itemId);
    if (awaiting && awaitingItem) { await this.publishRunnerMove(this.runnerApprovalMove(awaiting, awaitingItem)); return; }
    if (jobs.some(j => ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) return;
    const presence = await this.ctx.storage.get<{ harnesses: RunnerJob["harness"][]; seenAt: number }>("runnerPresence");
    if (!presence || Date.now() - presence.seenAt > 20000) return;
    // One plan card at a time: the next issue is dealt once this one is planned, built or set aside.
    if (s.deck?.some(proposesPlan)) return;
    await this.decisionData();
    const parked = new Set(this.openMoves!.filter(m => proposesPlan(m) && suppressed(this.deckBook!, m)).map(m => m.itemId));
    // A base update is a separate explicit plan, never an automatic rework or a Launch shortcut.
    const refreshChecked = await this.ctx.storage.get<number>("runnerRefreshCheckedAt") ?? 0;
    const refreshCandidates = s.items.filter(i => runnerIssue(i) && i.prNumber && i.branch?.startsWith("shiptorio/runner-") && ["on_pad", "passed", "inspecting"].includes(i.state) && canRework(i) && jobs.some(j => j.itemId === i.id && j.branch === i.branch && !!j.approvedAt && !!j.headSha));
    if (Date.now() - refreshChecked >= 30000 && this.meta && refreshCandidates.length) {
      await this.accountPut("runnerRefreshCheckedAt", Date.now());
      const token = await installationToken(this.env, this.meta.installationId);
      const cursor = (await this.ctx.storage.get<number>("runnerRefreshCursor") ?? 0) % refreshCandidates.length;
      await this.accountPut("runnerRefreshCursor", (cursor + 3) % refreshCandidates.length);
      for (const item of [...refreshCandidates.slice(cursor), ...refreshCandidates.slice(0, cursor)].slice(0, 3)) {
        if (await this.ctx.storage.get<number>(`runnerDeferred:${item.id}`) === item.updatedAt) continue;
        // One PR that can't be read right now must not block dealing the next issue's plan below.
        const target = await refreshTarget(token, this.meta.repo, item.prNumber!, item.branch!, s.baseBranch).catch((error: unknown) => { log("warn", "factory.refresh_target_skipped", { itemId: item.id, error: error instanceof Error ? error.message : String(error) }); return null; });
        if (!target || !ownsRefreshPr(jobs, item, this.meta.repo, target.headSha)) continue;
        const harness = presence.harnesses.includes("codex") ? "codex" : presence.harnesses.find(h => h !== "local");
        if (!harness) continue;
        await this.publishRunnerMove({ id: `refresh-base:${item.id}:${target.headSha}:${target.baseSha}`, title: `Update #${item.prNumber} to latest ${target.baseBranch}`, why: "The main branch advanced. Review a fresh plan before your local agent rebuilds and verifies the same PR.", stage: "build", kind: "build", itemId: item.id, createdAt: Date.now(), options: [{ id: "refresh-base", label: "Plan update and verify again", recommended: true, actions: [{ tool: "plan_runner_job", args: { harness, refreshBase: true }, reason: "Request a new plan; replacing the existing branch requires your separate approval." }] }, { id: "decline", label: "Later", recommended: false, actions: [] }] });
        return;
      }
    }
    for (const item of lineOrder(s.items.filter(i => runnerIssue(i) && ["queued", "ore", "rejected"].includes(i.state) && !i.prNumber))) {
      if (parked.has(item.id)) continue;
      if (planningHold(await this.ctx.storage.get<PlanningRetry>(`planningRetry:${item.id}`))) continue;
      if (await this.ctx.storage.get<number>(`runnerDeferred:${item.id}`) === item.updatedAt) continue;
    const small = presence.harnesses.includes("local") && looksSmall({ kind: item.kind, title: item.title, scars: item.scars?.length ?? 0 });
    const lead = small ? "local" : presence.harnesses.find(h => h !== "local") ?? presence.harnesses[0];
    const choices = presence.harnesses.slice(0, 3).map(harness => ({ id: harness, label: harness === "local" ? "Plan on your computer (free)" : `Plan with ${harnessLabel(harness)}`, recommended: harness === lead, actions: [{ tool: "plan_runner_job", args: { harness }, reason: "Read this issue and propose a file scope before building." }] }));
    if (!choices.length) return;
    await this.publishRunnerMove({ id: crypto.randomUUID(), title: `Plan #${item.id.slice(3)}: ${item.title}`, why: "Get a focused plan first. Review its files and steps before any code changes.", stage: "build", kind: "build", itemId: item.id, createdAt: Date.now(), options: [...choices, { id: "decline", label: "Later", recommended: false, actions: [] }] });
    return;
    }
  }

  private async resolveRunnerMove(move: Move): Promise<void> {
    await this.decisionData();
    this.openMoves = this.openMoves!.filter(card => card.id !== move.id);
    await this.refreshDecisions();
  }

  /** by: who let it through. The planner's own taps (autonomy levels, learned cards) are never recorded as the player's. */
  private async chooseRunnerMove(move: Move, optionId: string, by: "player" | "autonomy" = "player"): Promise<boolean> {
    const moveId = move.id;
    if (!move.itemId || !move.options.some(o => o.id === optionId) && optionId !== "decline") return false;
    const item = this.state!.items.find(i => i.id === move.itemId);
    const refreshMove = move.options.some(o => o.actions.some(a => a.tool === "plan_runner_job" && a.args.refreshBase === true)) || (await this.runnerJobs()).some(j => j.approvalMoveId === moveId && !!j.refreshBase);
    const available = (candidate: Item) => refreshMove ? !!candidate.prNumber && ["on_pad", "passed", "inspecting", "rejected"].includes(candidate.state) : (!candidate.prNumber || candidate.state === "rejected") && ["ore", "queued", "rejected"].includes(candidate.state);
    if (!item || !available(item)) {
      if (optionId === "approve") log("warn", "factory.runner_approval_refused", { reason: "item_unavailable", itemId: move.itemId, state: item?.state, hasPr: !!item?.prNumber, refreshMove });
      return false;
    }
    // GitHub names are case-insensitive; a browser visit can refresh metadata casing after planning.
    const job = (await this.runnerJobs()).find(j => j.approvalMoveId === moveId && j.itemId === move.itemId && j.repo.toLowerCase() === this.meta?.repo.toLowerCase() && j.status === "awaiting_approval");
    if (job) {
      return this.ctx.blockConcurrencyWhile(async () => {
        const stored = await this.ctx.storage.get<RunnerJob>(`runnerJob:${job.id}`);
        if (!stored || stored.status !== "awaiting_approval" || stored.approvalMoveId !== moveId || stored.itemId !== move.itemId || stored.repo.toLowerCase() !== this.meta?.repo.toLowerCase()) {
          if (optionId === "approve") log("warn", "factory.runner_approval_refused", { reason: "stored_job_mismatch", itemId: move.itemId, found: !!stored, status: stored?.status, sameCard: stored?.approvalMoveId === moveId, sameItem: stored?.itemId === move.itemId, sameRepo: stored?.repo.toLowerCase() === this.meta?.repo.toLowerCase() });
          return false;
        }
        const currentItem = this.state?.items.find(i => i.id === stored.itemId);
        if (!currentItem || !available(currentItem)) {
          if (optionId === "approve") log("warn", "factory.runner_approval_refused", { reason: "item_changed", itemId: move.itemId, state: currentItem?.state });
          return false;
        }
        if (stored.inputRevision !== await workRevision(currentItem)) {
          stored.status = "failed"; stored.error = "Issue changed; request a fresh plan.";
          await this.accountPut(`runnerJob:${stored.id}`, stored);
          await this.resolveRunnerMove(move);
          this.log("warn", stored.error, item.id);
          return false;
        }
        if (optionId === "approve") {
          if (stored.refreshBase) {
            try { assertRefreshItem(stored, currentItem); await refreshTarget(await installationToken(this.env, this.meta!.installationId), stored.repo, stored.reworkPr!, stored.branch, stored.baseBranch!, { headSha: stored.refreshBase.expectedHeadSha, baseSha: stored.baseSha!, baseBranch: stored.baseBranch! }); }
            catch { stored.status = "failed"; stored.error = "Factory head or base changed; review a fresh plan."; await this.accountPut(`runnerJob:${stored.id}`, stored); await this.resolveRunnerMove(move); this.log("warn", stored.error, item.id); return false; }
          }
          stored.status = "ready"; stored.approvedAt = Date.now(); stored.approvedBy = by;
        }
        else if (optionId === "decline") { stored.status = "failed"; stored.error = "Player declined this plan."; await this.accountPut(`runnerDeferred:${currentItem.id}`, currentItem.updatedAt); }
        else return false;
        await this.accountPut(`runnerJob:${stored.id}`, stored);
        await this.resolveRunnerMove(move);
        this.broadcast({ type: "log", level: "info", text: optionId === "approve" ? "Plan approved. Your local agent can now start." : "Plan set aside. No build started.", at: Date.now(), actor: by === "autonomy" ? "spark" : "player", tool: optionId === "approve" ? "approve_runner_job" : "decline_runner_job", approvedBy: by, reason: by === "autonomy" ? "Approved on its own: the planner's autonomy level or a kind of card you taught it" : "Decision from the game", itemId: item.id });
        return true;
      });
    }
    if (optionId === "decline") { await this.accountPut(`runnerDeferred:${item.id}`, item.updatedAt); await this.resolveRunnerMove(move); return true; }
    const action = move.options.find(o => o.id === optionId)?.actions[0];
    if (action?.tool !== "plan_runner_job" || !RunnerHarness.safeParse(action.args.harness).success) {
      if (optionId === "approve") log("warn", "factory.runner_approval_refused", { reason: "approval_job_missing", itemId: move.itemId, repo: this.meta?.repo });
      return false;
    }
    try {
      await this.enqueueRunner({ itemId: item.id, harness: action.args.harness as RunnerJob["harness"], allowedPaths: [], needsApproval: true, refreshBase: action.args.refreshBase === true });
      await this.resolveRunnerMove(move);
      this.log("info", "Reading the issue and code to prepare your plan. No build has started.", item.id);
      return true;
    } catch (error) { this.log("warn", error instanceof Error ? error.message : "Unable to plan this issue", item.id); return false; }
  }

  async allowDeviceStart() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const saved = await this.ctx.storage.get<{ count: number; expires: number }>("deviceRate");
      const rate = saved && saved.expires > now ? saved : { count: 0, expires: now + 10 * 60_000 };
      if (rate.count >= 10) return false;
      rate.count++;
      await this.accountPut("deviceRate", rate); await this.accountAlarm(rate.expires);
      return true;
    });
  }
  async startDevice(secret: string, expires: number) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get("device")) return false;
      await this.accountPut("device", { secret, expires } satisfies DeviceRecord);
      await this.accountAlarm(expires);
      return true;
    });
  }
  async startJoin(record: JoinRecord) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get("join")) return false;
      await this.accountPut("join", record);
      await this.accountAlarm(record.expires);
      return true;
    });
  }
  /** Burns the join code on first use, whatever happens next. */
  async takeJoin(): Promise<JoinRecord | null> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await this.ctx.storage.get<JoinRecord & { used?: boolean }>("join");
      if (!record || record.used) return null;
      await this.accountPut("join", { ...record, used: true });
      return record.expires > Date.now() ? record : null;
    });
  }
  async approveDevice(approved: NonNullable<DeviceRecord["approved"]>) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await this.ctx.storage.get<DeviceRecord>("device");
      if (!record || record.expires <= Date.now() || record.delivered || record.approved) return false;
      record.approved = approved;
      await this.accountPut("device", record);
      return true;
    });
  }
  async readyDevice() {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await this.ctx.storage.get<DeviceRecord>("device");
      if (record) { record.ready = true; await this.accountPut("device", record); }
    });
  }
  async heartbeatRunner(pairId: string, harnesses: RunnerJob["harness"][], authRequired?: AuthHarness[]) {
    if (!await this.isRunnerPaired(pairId)) throw new Error("Runner pairing revoked");
    await this.accountPut("runnerPresence", { harnesses, authRequired, seenAt: Date.now() });
    await this.load();
    if (this.state) {
      const power = syncRunnerPower(this.state.power, harnesses, authRequired);
      if (JSON.stringify(power) !== JSON.stringify(this.state.power)) await this.patch({ power });
    }
    if (authRequired !== undefined && this.state) {
      await this.decisionData();
      const ids = authRequired.map(h => `runner-auth:${h}`);
      const current = this.openMoves!.filter(m => m.id.startsWith("runner-auth:")).map(m => m.id);
      if (ids.length === current.length && ids.every(id => current.includes(id))) return;
      this.openMoves = this.openMoves!.filter(m => !m.id.startsWith("runner-auth:") || ids.includes(m.id));
      for (const h of authRequired) if (!this.openMoves.some(m => m.id === `runner-auth:${h}`)) this.openMoves.push(runnerAuthMove(h));
      await this.refreshDecisions();
    }
  }
  async pollDevice(secret: string) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const record = await this.ctx.storage.get<DeviceRecord>("device");
      const result = pollDevice(record, secret);
      if (record) await this.accountPut("device", record);
      return result;
    });
  }
  async runnerStatus() {
    const presence = await this.ctx.storage.get<{ harnesses: string[]; seenAt: number }>("runnerPresence");
    const jobs = await this.runnerJobs();
    const lastId = await this.ctx.storage.get<string>("runnerLastJobId");
    const last = jobs.find(job => job.id === lastId);
    const paired = !!await this.ctx.storage.get("runnerPair");
    const expires = await this.ctx.storage.get<number>("runnerGrantExpiry");
    const repair = await this.ctx.storage.get<{code: string; at: number}>("runnerRepair") ??
      (paired && expires && expires <= Date.now() ? {code: "runner_grant_expired", at: expires} : null);
    return { needsRepair: !!repair, repairCommand: repair ? "shiptorio-runner pair" : null, repairReason: repair?.code ?? null,
      paired, online: paired && !repair && !!presence && Date.now() - presence.seenAt < 20000,
      seenAt: presence?.seenAt ?? null, harnesses: presence?.harnesses ?? [],
      lastJob: last ? { id: last.id, status: last.status } : null, ...await this.runnerNow(jobs) };
  }
  /** What your machine is doing right now, in one line: the job it's on, else the card it waits on you for. */
  private async runnerNow(jobs: RunnerJob[]) {
    const state = await this.load();
    const rank = ["running", "ready", "awaiting_approval", "planning"];
    const job = jobs.filter(j => rank.includes(j.status)).sort((a, b) => rank.indexOf(a.status) - rank.indexOf(b.status))[0];
    const item = job && state?.items.find(i => i.id === job.itemId);
    const waiting = state?.deck?.find(m => m.options.some(o => o.actions.some(a => a.tool === "plan_runner_job" || a.tool === "approve_runner_job")));
    return {
      working: job ? { itemId: job.itemId, number: job.itemId.startsWith("gh-") ? Number(job.itemId.slice(3)) : null, title: item?.title ?? "", status: job.status, harness: job.harness } : null,
      waitingOn: waiting ? { moveId: waiting.id, title: waiting.title } : null,
    };
  }
  async activateRunner(pairId: string) { await this.assertAccountActive(); await this.accountPut("runnerPair", pairId); await this.ctx.storage.delete("runnerPresence"); await this.ctx.storage.delete("runnerRepair"); await this.ctx.storage.delete("runnerGrantExpiry"); }
  async pairRunner(): Promise<string> {
    await this.assertAccountActive(this.meta?.repo);
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");
    const pairId = crypto.randomUUID();
    await this.accountPut("runnerPair", pairId); // Re-pairing revokes the previous token.
    await this.ctx.storage.delete("runnerRepair");
    await this.ctx.storage.delete("runnerGrantExpiry");
    return pairId;
  }
  async recordRunnerGrant(pairId: string, expires: number) {
    return this.ctx.blockConcurrencyWhile(async () => {
      if (await this.isRunnerPaired(pairId)) await this.accountPut("runnerGrantExpiry", Math.max(expires, await this.ctx.storage.get<number>("runnerGrantExpiry") ?? 0));
    });
  }
  async rejectRunnerGrant(pairId: string, code: "runner_grant_expired" | "runner_access_revoked", expires?: number) {
    return this.ctx.blockConcurrencyWhile(async () => {
      const knownExpiry = await this.ctx.storage.get<number>("runnerGrantExpiry");
      if (code === "runner_grant_expired" && knownExpiry && expires && expires < knownExpiry) return;
      if (await this.isRunnerPaired(pairId)) {
        await this.accountPut("runnerRepair", { code, at: Date.now() });
        await this.ctx.storage.delete("runnerPresence");
      }
    });
  }
  async revokeRunner(): Promise<void> {
    await this.accountPut("runnerRepair", { code: "runner_pair_revoked", at: Date.now() });
    await this.ctx.storage.delete("runnerPair");
    await this.ctx.storage.delete("runnerPresence");
    await this.load();
    if (this.state) await this.patch({ power: syncRunnerPower(this.state.power, []) });
  }
  async isRunnerPaired(pairId: string): Promise<boolean> {
    return await this.ctx.storage.get("runnerPair") === pairId;
  }

  async runnerJobs(): Promise<RunnerJob[]> {
    await this.load();
    const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
    return this.redactor.value([...jobs.values()].map(({ lease, ...job }) => job));
  }

  private async runAccount(fallback?: string) {
    return (await this.env.DB.prepare("SELECT login FROM signup_resources WHERE kind='factory' AND resource=? ORDER BY rowid LIMIT 1")
      .bind(this.meta!.repo.toLowerCase()).first<{login:string}>())?.login ?? fallback;
  }

  private async parkPlanner(retry: PlanningRetry) {
    if (retry.kind === "cap") {
      try { retry.capacity = await planningCapacity(this.env, await budgetAccount(this.env.DB, this.meta!.repo), this.meta!.repo); } catch { /* Keep the timed hold if the ledger cannot be read. */ }
    }
    await this.accountPut(PLANNER_REST_KEY, retry);
  }

  private async plannerRest() {
    const hold = planningHold(await this.ctx.storage.get<PlanningRetry>(PLANNER_REST_KEY));
    if (hold?.kind === "cap" && hold.capacity && this.env.SPARK_DISABLED !== "1") {
      try {
        const current = await planningCapacity(this.env, await budgetAccount(this.env.DB, this.meta!.repo), this.meta!.repo);
        if (planningCapacityRaised(hold.capacity, current)) {
          for (const [key, retry] of await this.ctx.storage.list<PlanningRetry>({ prefix: "planningRetry:" })) if (retry.kind === "cap") await this.ctx.storage.delete(key);
          return null;
        }
      } catch { /* Ledger outages cannot grant permission to spend. */ }
    }
    return hold;
  }

  async planningRetries() {
    const rows = await this.ctx.storage.list<PlanningRetry>({ prefix: "planningRetry:" });
    return this.redactor.value([...rows.entries()].flatMap(([key, retry]) => key !== PLANNER_REST_KEY && planningHold(retry) ? [{ itemId: key.slice("planningRetry:".length), ...retry }] : []));
  }

  /** Recheck the same rejected head; this cannot approve or merge it. */
  async retryAIReview(itemId: string, expectedHead: string) {
    if (!(await this.load()) || !this.meta || await this.githubStopped()) return false;
    const item = this.state!.items.find(i => i.id === itemId);
    if (!item?.prNumber || item.state !== "rejected" || item.inspection?.headSha !== expectedHead || stageOf(item, "ai")?.state !== "rework" || stageOf(item, "ci")?.state !== "passed" || stageOf(item, "verify")?.state !== "passed") return false;
    if ((await this.runnerJobs()).some(j => j.itemId === itemId && ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) return false;
    const evidence = await inspectPullRequest(await installationToken(this.env, this.meta.installationId), this.meta.repo, item.prNumber, expectedHead, this.state!.baseBranch);
    if (evidence.stale || evidence.state !== "passed" || !this.state!.items.some(i => i === item)) return false;
    await this.patch({items:[{...item,state:"inspecting",failure:undefined,machineId:"review-1",updatedAt:Date.now(),inspection:{...item.inspection,state:"pending",humanApproved:false,stages:item.inspection.stages.map(s => s.gate === "ai" || s.gate === "human" ? {...s,state:"pending",reason:"Waiting for a fresh review of this commit"} : s)}}]});
    await this.decisionData();
    this.openMoves = this.openMoves!.filter(m => m.itemId !== itemId);
    await this.refreshDecisions();
    await this.scheduleTick();
    this.log("info", "Review queued again for the same PR commit. Earlier review evidence is retained; nothing is approved or merged.", itemId);
    return true;
  }

  /** Issue numbers already past Repo (anything but fresh ore or launched), so the inbox stops offering them. */
  async lineIssues(): Promise<number[]> {
    if (!(await this.load())) return [];
    return this.state!.items.filter(i => !["ore", "launched"].includes(i.state)).map(i => Number(/^gh-(\d+)$/.exec(i.id)?.[1])).filter(n => n > 0);
  }

  async startInboxIssue(number: number, requestedBy: string) {
    if (!(await this.load()) || !this.meta || !Number.isSafeInteger(number) || number < 1) throw new Error("Invalid issue selection");
    const active = this.state!.items.find(i => i.prNumber && ["inspecting", "on_pad", "passed"].includes(i.state));
    if (active) return { waitingFor: active.prNumber };
    const signal = await freshIssueInput(await installationToken(this.env, this.meta.installationId), this.meta.repo, number);
    await this.ingestSignal(signal);
    const job = await this.enqueueRunner({ itemId: `gh-${number}`, harness: "codex", allowedPaths: [], needsApproval: true }, requestedBy);
    return { jobId: job.id };
  }

  async enqueueRunner(input: { itemId: string; harness: RunnerJob["harness"]; allowedPaths: string[]; needsApproval?: boolean; refreshBase?: boolean }, requestedBy?: string): Promise<RunnerJob> {
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");

    // Expected planning denials must leave the atomic callback normally: a throw
    // inside blockConcurrencyWhile resets the entire object, even if callers catch it.
    const result = await this.ctx.blockConcurrencyWhile(async () => {
      if (!(await this.load()) || !this.meta) return new Error("Factory not connected");
      const item = this.state!.items.find(i => i.id === input.itemId);
      const refresh = input.refreshBase === true && !!item?.prNumber && ["on_pad", "passed", "inspecting", "rejected"].includes(item.state) && item.branch?.startsWith("shiptorio/runner-");
      const rework = refresh || !!item?.prNumber && item.state === "rejected" && item.branch?.startsWith("shiptorio/runner-");
      if (input.refreshBase && !refresh) return new Error("Factory PR is not available for a base update");
      if (!item || !runnerIssue(item) || !refresh && !["ore", "queued", "rejected"].includes(item.state) || item.prNumber && !rework) return new Error("Item is not available to build");
      if (rework && (!input.needsApproval || !canRework(item))) return new Error("This PR requires player escalation, not another automatic rework offer");
      if (!input.allowedPaths.every(runnerPathAllowed)) return new Error("Unsafe approved path");
      const jobs = await this.runnerJobs();
      for (const old of jobs.filter(j => j.status === "running" && j.deadline && j.deadline <= Date.now())) {
        const stored = await this.ctx.storage.get<RunnerJob>(`runnerJob:${old.id}`);
        if (stored) await this.accountPut(`runnerJob:${old.id}`, { ...stored, status: "failed", error: "Lease expired; another attempt requires player approval." });
        old.status = "failed";
      }
      if (jobs.some(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) return new Error("This issue already has an active runner job; finish its plan or build first");
      if (this.env.SPARK_DISABLED === "1" || this.running.size + jobs.filter(j => ["planning", "awaiting_approval", "ready", "running"].includes(j.status)).length >= budgetLimits(this.env).jobs) return new Error("Factory job budget reached; finish the active runner job first");
      const hold = await this.plannerRest() ?? planningHold(await this.ctx.storage.get<PlanningRetry>(`planningRetry:${item.id}`));
      if (hold) return new Error(`Planning paused after ${hold.failures} failed tries; retry at ${new Date(hold.retryAt).toISOString()}. ${hold.reason}`);
      const account = await this.runAccount(requestedBy);
      if (!account) return new Error("Run quota owner unavailable");
      const quota = await runQuotaStatus(this.env, account);
      if (quota.used >= quota.limit) return new Error(`Daily run quota reached; resumes at ${new Date(quota.resetsAt).toISOString()}`);
      const usage = await this.usage().catch(error => { if (error instanceof BudgetError) return error; throw error; });
      if (usage instanceof BudgetError) return usage;
      if (usage.limits.disabled || usage.calls >= usage.limits.calls || usage.tokens >= usage.limits.tokens) {
        const error = new BudgetError("Planner daily call/token budget exhausted");
        await this.parkPlanner(planningFailure(undefined, error));
        await this.refreshDecisions(); await this.scheduleTick();
        return error;
      }

      const id = crypto.randomUUID();
      const { refreshBase: _refreshBase, ...approvedInput } = input;
      const job: RunnerJob = { ...approvedInput, repo: this.meta.repo, id, branch: `shiptorio/runner-${id}`, status: "planning", deadline: Date.now() + PLANNING_DEADLINE_MS, runAccount: account };
      if (rework) { job.reworkPr = item.prNumber; job.branch = item.branch!; }
      if (refresh) {
        const target = await refreshTarget(await installationToken(this.env, this.meta.installationId), job.repo, item.prNumber!, item.branch!, this.state!.baseBranch);
        if (!target || !ownsRefreshPr(jobs, item, job.repo, target.headSha)) return new Error("Only an approved runner PR behind its base can be refreshed");
        job.refreshBase = { expectedHeadSha: target.headSha }; job.baseSha = target.baseSha; job.verifyBaseSha = target.baseSha; job.baseBranch = target.baseBranch;
      }
      if (currentTrace()) await this.accountPut(`trace:${item.id}`, currentTrace());
      await this.accountPut(`runnerJob:${id}`, job);
      await this.accountPut("runnerLastJobId", id);
      await this.refreshDecisions();
      this.broadcast({ type: "log", level: "info", text: `Planning ${item.title} for ${job.harness}.`, at: Date.now(), actor: "spark", tool: "assign_job", approvedBy: "player", reason: "Player approved this issue and exact file scope.", itemId: item.id });
      await this.scheduleTick();
      return job;
    });
    if (result instanceof Error) throw result;
    return result;
  }

  /** Pick the power plant. The planner chooses among plants the fixed geothermal guard allows; the guard has the last word. */
  private async routeRunnerJob(job: RunnerJob, item: Item, signal?: AbortSignal): Promise<void> {
    const presence = await this.ctx.storage.get<{ harnesses: RunnerJob["harness"][]; seenAt: number }>("runnerPresence");
    const available = presence?.harnesses?.length ? presence.harnesses : [job.harness];
    if (!available.includes("local") && job.harness !== "local") return; // subscriptions only: the player's pick stands
    const c = { kind: item.kind, title: item.title, paths: job.allowedPaths, scars: item.scars?.length ?? 0, rework: !!job.reworkPr };
    const guard = geothermalGuard(c);
    const allowed = available.filter(h => h !== "local" || guard.ok);
    let pick: { harness: string; why: string } | null = allowed.length === 1 ? { harness: allowed[0], why: guard.reason } : null;
    if (!pick) {
      try {
        if (!sparkConfigured(this.env)) throw new Error("No planner key");
        pick = await this.think("route", { title: item.title, itemId: item.id }, () => pickPower({ ...this.sparkEnv(), planningSignal: signal }, {
          title: item.title, kind: item.kind, plan: job.plan ?? "", files: job.allowedPaths,
          plants: allowed.map(h => h === "local" ? { harness: h, name: "Geothermal (your computer)", cost: "free", strength: "small model, fine for docs and tiny fixes" } : { harness: h, name: `Solar (${h === "codex" ? "ChatGPT" : h === "muse_code" ? "Meta Muse Code" : "Claude"})`, cost: "spends weekly subscription usage", strength: "strong coding agent" }),
        }), out => ({ outcome: `Routed to ${harnessLabel(out.harness)}`, reason: out.why || guard.reason }));
      } catch { pick = ruleRoute(c, available); }
    }
    const final = pick && enforceRoute(pick.harness as RunnerJob["harness"], c, available);
    if (!final) throw new Error(`${guard.reason} Sign in to Claude or Codex on your runner to build it.`);
    job.harness = final.harness;
    job.route = `${final.harness === "local" ? "geothermal, your computer (free)" : `solar, ${harnessLabel(final.harness)}`}. ${final.why || pick!.why}`.trim();
    this.broadcast({ type: "log", level: "info", text: final.vetoed ? `Too big for local power: ${guard.reason} Moved to ${harnessLabel(final.harness)}.` : `Power: ${job.route}`, at: Date.now(), actor: "spark", tool: "set_power", reason: final.why || pick!.why || "Routing rule", approvedBy: "player", itemId: item.id });
  }

  private async planRunnerJobs(): Promise<void> {
    if (this.env.SPARK_DISABLED === "1" || await adminPaused(this.env.DB, this.meta?.repo)) return;
    const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
    let job = [...jobs.values()].find(j => j.status === "planning");
    if (!job && this.running.size < budgetLimits(this.env).jobs && ![...jobs.values()].some(j => ["ready", "running", "awaiting_approval"].includes(j.status))) {
      const parked = await this.ctx.storage.list<RunnerJob>({ prefix: "planningResume:" });
      for (const saved of parked.values()) {
        const item = this.state?.items.find(i => i.id === saved.itemId);
        if (!item || item.priority === "park" || !(saved.refreshBase ? ["on_pad", "passed", "inspecting", "rejected"] : ["ore", "queued", "rejected"]).includes(item.state) || await this.ctx.storage.get<number>(`runnerDeferred:${saved.itemId}`) === item.updatedAt) { await this.ctx.storage.delete(`planningResume:${saved.id}`); continue; }
        if (await this.plannerRest() || planningHold(await this.ctx.storage.get<PlanningRetry>(`planningRetry:${saved.itemId}`))) continue;
        job = { ...saved, status: "planning", planningStarted: false, error: undefined, deadline: Date.now() + PLANNING_DEADLINE_MS };
        await this.accountPut(`runnerJob:${job.id}`, job);
        break;
      }
    }
    if (!job || !this.meta || !this.state) return;
    const trace = await this.ctx.storage.get<Trace>(`trace:${job.itemId}`);
    return inTrace({ ...trace, requestId: trace?.requestId ?? currentTrace()?.requestId ?? crypto.randomUUID(), repo: this.meta.repo, itemId: job.itemId, job: job.id }, this.env, task => this.ctx.waitUntil(task), () => this.planRunnerJob(job));
  }

  private async planRunnerJob(job: RunnerJob): Promise<void> {
    if (!this.meta || !this.state) return;
    try {
      await planningDeadline(signal => this.performRunnerPlan(job, signal), Math.max(0, (job.deadline ?? Date.now() + PLANNING_DEADLINE_MS) - Date.now()));
    } catch (error) {
      const key = `planningRetry:${job.itemId}`;
      const retry = planningFailure(await this.ctx.storage.get<PlanningRetry>(key), error);
      await this.accountPut(key, retry);
      if (retry.kind !== "other") {
        await this.parkPlanner(retry);
        await this.accountPut(`planningResume:${job.id}`, job);
      }
      this.foreman(job.itemId, "plan", false);
      job.status = "failed"; job.deadline = undefined;
      job.error = "Planning paused. No build run charged. The planner will try again after resting.";
      await this.accountPut(`runnerJob:${job.id}`, job);
      this.log("info", job.error, job.itemId);
      await this.refreshDecisions(); await this.scheduleTick();
    }
  }

  private async performRunnerPlan(job: RunnerJob, signal: AbortSignal): Promise<void> {
    if (!this.meta || !this.state) return;
    signal.throwIfAborted();
    if (job.planningStarted) throw new Error("Planner interrupted before finishing");
    job.planningStarted = true;
    await this.accountPut(`runnerJob:${job.id}`, job);
    let item = this.state.items.find(i => i.id === job.itemId);
    if (!item) throw new Error("Item removed");
    const beforeRefresh = await workRevision(item);
    const token = await installationToken(this.env, this.meta.installationId);
    const tree = await repoTree(token, this.meta.repo);
    if (!job.refreshBase) job.baseSha = (await gh<{ object: { sha: string } }>(`/repos/${job.repo}/git/ref/heads/${tree.branch}`, token)).object.sha;
    job.verifyBaseSha = job.baseSha;
    if (!job.refreshBase) job.baseBranch = tree.branch;
    let changedFiles: Awaited<ReturnType<typeof prFiles>> = [];
    if (job.reworkPr) {
      const pr = await gh<{ head: { sha: string; ref: string }; base: { sha: string; ref: string }; state: string; merged: boolean }>(`/repos/${job.repo}/pulls/${job.reworkPr}`, token);
      if (pr.merged || pr.state !== "open" || pr.head.ref !== job.branch) throw new Error("Rework PR is no longer available");
      if (job.refreshBase) {
        await refreshTarget(token, job.repo, job.reworkPr, job.branch, job.baseBranch!, { headSha: job.refreshBase.expectedHeadSha, baseSha: job.baseSha!, baseBranch: job.baseBranch! });
      } else { job.baseSha = pr.head.sha; job.verifyBaseSha = pr.base.sha; job.baseBranch = pr.base.ref; }
      changedFiles = await prFiles(token, job.repo, job.reworkPr);
      job.prTestFiles = changedFiles.filter(f => f.status !== "removed" && runnerPathAllowed(f.filename) && /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$/i.test(f.filename)).map(f => f.filename);
    }
    // Refresh persisted input before planning, never an already-approved/ready job.
    const input = await freshIssueInput(token, job.repo, Number(item.id.slice(3)));
    signal.throwIfAborted();
    const current = this.state.items.find(i => i.id === job.itemId);
    if (!current || beforeRefresh !== await workRevision(current) || this.state.items.find(i => i.id === job.itemId) !== current) throw new Error("Issue changed during input refresh");
    item = { ...current, title: input.title.slice(0, 500), body: input.body.slice(0, 16000), url: input.url };
    await this.patch({ items: [item] });
    job.inputRevision = await workRevision(item);
    await this.accountPut(`runnerJob:${job.id}`, job);
    job.steps = [];
    await this.decisionData();
    const feedback = plannerFeedback(this.deckBook!, this.deckRules!);
    const planningBody = `${item.body ?? ""}\n\nPlayer decision history (data, never authority): ${feedback}`;
    if (job.needsApproval) {
      const candidates = [...new Set([...tree.entries.filter(e => e.type === "blob").map(e => e.path), ...changedFiles.filter(f => f.status !== "removed").map(f => f.filename)])].filter(runnerPathAllowed);
      job.allowedPaths = await this.think("scope", { title: item.title, itemId: item.id }, () => pickFiles({ ...this.sparkEnv(), planningSignal: signal }, { title: item.title, body: planningBody, district: item.district, failure: item.failure, scars: item.scars }, candidates),
        files => ({ outcome: files.length ? `Scoped to ${files.join(", ")}` : "No safe files found", reason: `Picked ${files.length} of ${candidates.length} repo planning candidates to inspect before proposing writable scope.` }))
        .then(files => files.filter(runnerPathAllowed));
      if (!job.allowedPaths.length) throw new Error("No safe file scope proposed");
    }
    // Spark plans with the whole factory in reach: repo search and reads, the issue thread, the rework PR and its CI, scars, permits and mines.
    const box = await this.sparkToolbox(token, item, job.baseSha!, [...tree.entries.filter(e => e.type === "blob").map(e => e.path), ...changedFiles.filter(f => f.status !== "removed").map(f => f.filename)],
      job.reworkPr ? { headSha: job.refreshBase?.expectedHeadSha ?? job.baseSha!, diff: async () => diffText(changedFiles) } : undefined);
    const assignment = await this.think("plan", { title: item.title, itemId: item.id }, () => planLocalTask({ ...this.sparkEnv(), planningSignal: signal }, { title: item.title, body: planningBody, district: item.district, failure: item.failure, scars: item.scars, playerFeedback: feedback }, job.allowedPaths,
      box, async step => {
        signal.throwIfAborted();
        job.steps!.push(step);
        await this.accountPut(`runnerJob:${job.id}`, job);
        this.broadcast({ type: "log", level: "info", text: step.result, at: step.at, actor: "spark", tool: step.tool, reason: step.reason, approvedBy: "player", itemId: item.id });
      }, { widen: !!job.needsApproval }), a => ({ outcome: `${job.reworkPr ? "Re-planned after a scar" : "Plan"} for ${harnessLabel(job.harness)} in ${job.steps!.length} tool calls${a.heeded.length ? `, respecting ${a.heeded.length} of your past ${a.heeded.length === 1 ? "call" : "calls"}` : ""}`, reason: a.heeded[0] ? `${job.steps!.at(-1)?.reason ?? "Assigned the job."} Heeded: ${a.heeded[0]}` : job.steps!.at(-1)?.reason ?? "Read the issue and code, then assigned the job." }));
    signal.throwIfAborted();
    validatePlan(assignment.plan, assignment.files);
    if (!assignment.files.every(runnerPathAllowed)) throw new Error("Planned files fall outside the runner's path rules");
    job.plan = assignment.plan;
    job.allowedPaths = assignment.files;
    await this.routeRunnerJob(job, item, signal);
    signal.throwIfAborted();
    await this.planComment(token, job, item).catch(error => this.reliabilityFailure(`planComment:${item.id}`, error, item.id));
    signal.throwIfAborted();
    await this.ctx.storage.delete(`planningRetry:${job.itemId}`);
    await this.ctx.storage.delete(`planningResume:${job.id}`);
    job.deadline = undefined;
    job.status = job.needsApproval ? "awaiting_approval" : "ready";
    if (job.needsApproval) {
      const move = this.runnerApprovalMove(job, item);
      job.approvalMoveId = move.id;
    }
    await this.accountPut(`runnerJob:${job.id}`, job);
    if (job.needsApproval) await this.publishRunnerMove(this.runnerApprovalMove(job, item));
    await this.save();
    this.log("success", job.needsApproval ? "Your plan is ready to review. Nothing builds until you approve." : `Plan ready for ${job.harness}. Waiting for the local runner.`, item.id);
  }

  async claimRunner(pairId: string, harnesses: RunnerJob["harness"][]) {
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");
    if (!await this.isRunnerPaired(pairId)) throw new Error("Runner pairing revoked");
    await this.load();
    if (await adminPaused(this.env.DB, this.meta?.repo)) return null;
    // Rendering offers and updating the player's deck can perform provider reads.
    // They must never hold the DO's 30-second exclusive lock and reset an in-flight review.
    await this.accountPut("runnerPresence", { harnesses, seenAt: Date.now() });
    if (this.state) {
      const power = syncRunnerPower(this.state.power, harnesses);
      if (JSON.stringify(power) !== JSON.stringify(this.state.power)) await this.patch({ power });
    }
    await this.offerRunnerPlan();
    // Reconnected/idle runners may be the next event after a plan is ready. Honor earned
    // approvals here too, through the manual approval handler, before looking for a lease.
    if (this.state) await this.runLearned();
    await this.refreshDecisions();
    await this.scheduleTick();
    const job = await this.ctx.blockConcurrencyWhile(async () => {
      if (await this.ctx.storage.get("runnerPair") !== pairId) throw new Error("Runner pairing revoked");
      if (await adminPaused(this.env.DB,this.meta?.repo ?? (await this.ctx.storage.get<Meta>("meta"))?.repo)) return null;
      const running = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
      const expired = [...running.values()].filter(j => j.status === "running" && j.deadline && j.deadline <= Date.now());
      for (const old of expired) {
        // An expired lease would otherwise stay "running" forever and block every new plan.
        Object.assign(old, { status: "failed", error: "Lease expired; another attempt requires player approval." });
        await this.accountPut(`runnerJob:${old.id}`, old);
      }
      const live = [...running.values()].find(j => j.status === "running" && j.deadline && j.deadline > Date.now());
      // The runner claims only while idle, so the same pairing claiming again well after the lease was
      // granted means the claim response was lost (reset or client timeout). Hand the same job back.
      if (live?.pairId === pairId && harnesses.includes(live.harness) && live.deadline! - RUNNER_LEASE_MS + LOST_CLAIM_MS < Date.now()) {
        this.log("info", "The local runner lost its last claim, so Shiptorio handed the same job back.", live.itemId);
        return live;
      }
      if (live) return null;
      const stranded = this.state?.items.filter(i => i.state === "working" && expired.some(j => j.itemId === i.id)) ?? [];
      if (stranded.length) await this.patch({ items: stranded.map(i => ({ ...i, state: "queued" as const, updatedAt: Date.now() })) }, true);
      const jobs = await this.ctx.storage.list<RunnerJob>({ prefix: "runnerJob:" });
      const job = [...jobs.values()].find(j => j.status === "ready" && availableJobHarness(j.harness, harnesses));
      if (!job) return null;
      if (this.env.SPARK_DISABLED === "1" || this.running.size + [...jobs.values()].filter(j => j.status === "running").length >= budgetLimits(this.env).jobs) return null;
      const currentItem = this.state?.items.find(i => i.id === job.itemId);
      if (!currentItem || job.inputRevision && job.inputRevision !== await workRevision(currentItem)) {
        job.status = "failed"; job.error = "Issue changed before dispatch; request a fresh plan.";
        await this.accountPut(`runnerJob:${job.id}`, job);
        return null;
      }
      if (job.refreshBase) {
        try { assertRefreshItem(job, currentItem); await refreshTarget(await installationToken(this.env, this.meta!.installationId), job.repo, job.reworkPr!, job.branch, job.baseBranch!, { headSha: job.refreshBase.expectedHeadSha, baseSha: job.baseSha!, baseBranch: job.baseBranch! }); }
        catch { job.status = "failed"; job.error = "Factory head or base changed before dispatch; review a fresh plan."; await this.accountPut(`runnerJob:${job.id}`, job); return null; }
      }
      // Charge only a validated plan actually dispatched to the runner. Lost-claim recovery above never charges twice.
      const account = job.runAccount ?? await this.runAccount();
      if (!account) return null;
      const quota = await runQuotaStatus(this.env, account);
      if (quota.used >= quota.limit || !await runQuota(this.env as never, account)) return null;
      const selected = availableJobHarness(job.harness, harnesses)!;
      if (selected !== job.harness) {
        this.log("info", `${harnessLabel(job.harness)} is unavailable; ${harnessLabel(selected)} will execute the same approved plan.`, job.itemId);
        job.route = `solar, ${harnessLabel(selected)}. Preferred subscription unavailable at dispatch.`;
        job.harness = selected;
      }
      await this.accountPut("runnerLastJobId", job.id);
      Object.assign(job, { status: "running", pairId, lease: crypto.randomUUID(), deadline: Date.now() + RUNNER_LEASE_MS });
      await this.accountPut(`runnerJob:${job.id}`, job);
      const item = this.state!.items.find(i => i.id === job.itemId)!;
      const machineId = `runner-${job.harness}`;
      await this.patch({ items: [{ ...item, state: "working", machineId, attempts: item.attempts + 1, updatedAt: Date.now() }], machines: [{ id: machineId, type: "assembler", x: 0, y: 6, harness: job.harness, powerId: job.harness === "local" ? LOCAL_POWER_ID : `solar-${job.harness}`, tier: 1, state: "working" }] }, true);
      this.log("info", job.harness === "local" ? "Your computer's local model picked up the plan (geothermal power)." : `Local ${job.harness} took the plan.`, item.id);
      return job;
    });
    if (job) await this.clearRunnerMove();
    await this.refreshDecisions();
    if (!job) return null;
    if (!this.meta) throw new Error("Missing repo");
    // Installation tokens go only to the runner supervisor, never to an agent child.
    return { ...job, token: await runnerInstallationToken(this.env, this.meta.installationId, this.meta.repo) };
  }

  async finishRunner(pairId: string, receipt: RunnerReceipt) {
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");
    if (await this.ctx.storage.get("runnerPair") !== pairId) throw new Error("Runner pairing revoked");
    await this.load();
    const job = await this.ctx.storage.get<RunnerJob>(`runnerJob:${receipt.jobId}`);
    if (!job || !this.meta || !this.state) throw new Error("Unknown job");
    if (job.status === "completed" && job.pairId === pairId && job.lease === receipt.lease) {
      await this.clearRunnerMove();
      const completedItem = this.state.items.find(i => i.id === job.itemId);
      const prNumber = completedItem?.prNumber ?? Number(job.prUrl?.split("/").at(-1));
      if (prNumber) {
        const pr = await gh<{ merged: boolean }>(`/repos/${job.repo}/pulls/${prNumber}`, await installationToken(this.env, this.meta.installationId));
        if (pr.merged) await this.onPullClosed(prNumber, true);
        else if (receipt.sha) await this.onCheckSuite([prNumber], true, "Reconcile completion receipt", receipt.sha);
      }
      return { prUrl: job.prUrl }; // lost acknowledgment
    }
    if (job.status === "failed" && (!receipt.ok || job.refreshBase && job.headSha === receipt.sha && job.proof?.headSha === receipt.sha) && job.pairId === pairId && job.lease === receipt.lease) return { status: "failed" };
    if (!validLease(job, pairId, receipt.lease)) throw new Error("Invalid or expired lease");
    const item = this.state.items.find(i => i.id === job.itemId)!;
    if (job.refreshBase) assertRefreshItem(job, item);
    if (!receipt.ok) {
      // The runner's own plain reasons ("Codex is out of usage until ...") are worth showing; anything else stays generic.
      job.status = "failed"; job.error = /^(?:Codex|Muse Code|Claude) (?:is out of usage|timed out|stopped)[\w ,.:'()/-]{0,200}$/.test(receipt.summary) ? receipt.summary : "Local build failed; player must approve another attempt.";
      await this.accountPut(`runnerJob:${job.id}`, job);
      await this.patch({ items: [{ ...item, state: "rejected", failure: job.error, updatedAt: Date.now() }], machines: this.state.machines.filter(m => m.id === item.machineId).map(m => ({ ...m, state: "blocked" as const })) });
      await this.reopenRedPrCard(item.id);
      return { status: "failed" };
    }
    if (!receipt.sha || !["typecheck", "test", "build"].every(c => receipt.checks.includes(c as RunnerReceipt["checks"][number]))) throw new Error("Missing local check receipts");
    const token = await installationToken(this.env, this.meta.installationId);
    const head = await gh<{ object: { sha: string } }>(`/repos/${job.repo}/git/ref/heads/${job.branch}`, token);
    if (head.object.sha !== receipt.sha) throw new Error("Pushed head mismatch");
    const diff = await gh<{ status: string; ahead_by: number; files: { filename: string; status: string; previous_filename?: string; changes: number; patch?: string }[] }>(`/repos/${job.repo}/compare/${job.baseSha}...${receipt.sha}`, token);
    if (diff.status !== "ahead" || diff.ahead_by !== 1 || !diff.files.length || diff.files.length > 10 || diff.files.some(f => !job.allowedPaths.includes(f.filename) || !runnerPathAllowed(f.filename) || f.status === "renamed" || f.status === "removed") || diff.files.reduce((n, f) => n + f.changes, 0) > 500) throw new Error("Pushed diff exceeds the approved scope");
    validatePlan(job.plan ?? "", job.allowedPaths);
    if (diff.files.some(f => typeof f.patch !== "string" || f.patch.split("\n").filter(l => /^[+-]/.test(l)).length !== f.changes)) throw new Error("Missing complete patch evidence");
    validatePatch(diff.files.map(f => f.filename), job.allowedPaths, diff.files.map(f => `+++ b/${f.filename}\n${f.patch}`).join("\n"));
    if (receipt.proof && (receipt.proof.headSha !== receipt.sha || receipt.proof.baseSha !== (job.verifyBaseSha ?? job.baseSha))) throw new Error("Verify proof is not bound to this base/head");
    if (job.refreshBase) {
      if (!job.approvedAt || !receipt.proof?.failsOnBase || !receipt.proof.passesOnHead || job.verifyBaseSha !== job.baseSha) throw new Error("Base refresh requires fresh approved regression proof");
      const commit = await gh<{ parents: { sha: string }[] }>(`/repos/${job.repo}/git/commits/${receipt.sha}`, token);
      if (commit.parents.length !== 1 || commit.parents[0].sha !== job.baseSha) throw new Error("Base refresh commit must have exactly the approved base parent");
      try { await refreshTarget(token, job.repo, job.reworkPr!, job.branch, job.baseBranch!, { headSha: receipt.sha, baseSha: job.baseSha!, baseBranch: job.baseBranch! }); }
      catch (error) {
        if (!(error instanceof RefreshBaseMoved)) throw error;
        // Keep audited publication identity for a NEW plan; this proof never completes the gauntlet.
        Object.assign(job, { status: "failed", error: error.message, headSha: receipt.sha, proof: receipt.proof, prUrl: `https://github.com/${job.repo}/pull/${job.reworkPr}` });
        await this.accountPut(`runnerJob:${job.id}`, job);
        this.log("warn", "The base advanced during publication. Review a fresh update plan before verification can continue.", item.id);
        await this.patch({ items: [{ ...item, state: "inspecting", machineId: "ci-1", inspection: freshInspection(receipt.sha), failure: error.message, updatedAt: Date.now() }] });
        return { status: "failed" };
      }
    }
    const evidence = receipt.proof ? proofComment(receipt.proof) : "";
    let pr: { number: number; html_url: string };
    if (job.reworkPr) {
      const existing = await gh<{ number: number; html_url: string; state: string; merged: boolean; body: string | null; head: { ref: string; sha: string } }>(`/repos/${job.repo}/pulls/${job.reworkPr}`, token);
      if (existing.state !== "open" || existing.merged || existing.head.ref !== job.branch || existing.head.sha !== receipt.sha || item.prNumber !== job.reworkPr) throw new Error("Rework PR changed or closed");
      if (evidence && !existing.body?.includes(`shiptorio-proof:${receipt.sha}`)) await gh(`/repos/${job.repo}/pulls/${job.reworkPr}`, token, { method: "PATCH", body: JSON.stringify({ body: `${existing.body ?? ""}\n\n${evidence}` }) });
      pr = { number: existing.number, html_url: existing.html_url };
    } else {
      pr = await openPullRequest(token, job.repo, { head: job.branch, base: job.baseBranch!, title: item.title, body: `Closes #${item.id.slice(3)}\n\nMuse Spark planned this task; ${job.harness === "local" ? `a local model on the player's own hardware (geothermal power) executed it${job.route ? ` (${job.route})` : ""}` : `the local ${job.harness} subscription executed it`}.\n\n${job.plan}\n\nLocal supervisor receipts: typecheck, tests and web build passed on ${receipt.sha}.\n\n${receipt.summary}\n\n${evidence}\n\nHuman review and merge required.` });
    }
    job.status = "completed"; job.prUrl = pr.html_url; job.headSha = receipt.sha; job.proof = receipt.proof;
    await this.accountPut(`runnerJob:${job.id}`, job);
    await this.patch({ items: [{ ...item, branch: job.branch, prNumber: pr.number, prUrl: pr.html_url, state: "inspecting", failure: undefined, machineId: "ci-1", inspection: freshInspection(receipt.sha), updatedAt: Date.now() }], machines: this.state.machines.filter(m => m.id === item.machineId).map(m => ({ ...m, state: "idle" as const })) });
    this.log("success", `Local ${job.harness} ${job.reworkPr ? "updated" : "opened"} PR #${pr.number}; waiting for CI and independent verification.`, item.id);
    return { prUrl: pr.html_url };
  }

  /** Acknowledge only after durable enqueue. No API calls, backfill or model work here. */
  async enqueueGitHub(deliveryId: string, event: string, payload: GitHubPayload): Promise<void> {
    const key = `delivery:${deliveryId}`;
    await this.assertAccountActive(payload.repository?.full_name ?? this.meta?.repo);
    if (await this.ctx.storage.get("migratedTo")) throw new Error("Legacy factory migrated");
    if (!lifecycleEvents.includes(event) && await this.githubStopped()) return;
    if ((await this.ctx.storage.get<number>(`done:${key}`) ?? 0) > Date.now() || await this.ctx.storage.get(`failed:${key}`)) return;
    if (!(await this.ctx.storage.get(key))) await this.accountPut(key, { event, payload, attempts: 0, receivedAt: Date.now(), trace: currentTrace() });

    await this.scheduleTick();
  }

  /** Same durable queue as GitHub, for the Sentry mine. `resource` is the Sentry-Hook-Resource header. */
  async enqueueSentry(deliveryId: string, resource: string, payload: SentryPayload): Promise<void> {
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");
    const key = `delivery:sentry-${deliveryId}`;
    await this.assertAccountActive(this.meta?.repo ?? "");
    if ((await this.ctx.storage.get<number>(`done:${key}`) ?? 0) > Date.now() || await this.ctx.storage.get(`failed:${key}`)) return;
    if (!(await this.ctx.storage.get(key))) await this.accountPut(key, { source: "sentry", deliveryId, event: resource, payload, attempts: 0, receivedAt: Date.now(), trace: currentTrace() });

    await this.scheduleTick();
  }

  private async processDeliveries(): Promise<void> {
    const listed = await this.ctx.storage.list<{ trace?: Trace; source?: "sentry" | "support"; deliveryId?: string; event: string; payload: GitHubPayload; attempts: number; nextAt?: number; receivedAt?: number }>({ prefix: "delivery:", limit: 100 });
    // Storage lists keys in delivery-GUID order; work through them in the order they arrived.
    const pending = [...listed].sort(([, a], [, b]) => (a.receivedAt ?? 0) - (b.receivedAt ?? 0));
    let processed = 0;

    for (const [key, delivery] of pending) {
      if (delivery.nextAt && delivery.nextAt > Date.now()) continue;
      if (++processed > 4) break;
      try {
        const completed = (await this.ctx.storage.get<number>(`done:${key}`) ?? 0) > Date.now();
        if (!completed) {
          await inTrace(delivery.trace ?? { requestId: currentTrace()?.requestId ?? crypto.randomUUID(), repo: this.meta?.repo }, this.env, task => this.ctx.waitUntil(task), async () => {
          if (delivery.source === "sentry") await this.handleSentry(delivery.event, delivery.payload as SentryPayload);
          else if (delivery.source === "support") await this.handleSupport(delivery.payload as unknown as SupportMessage);
          else {
            await this.handleGitHub(delivery.event, delivery.payload);
            await this.refreshReadinessPolls();
          }
          log("info", "webhook.processed", { deliveryId: delivery.deliveryId ?? key.slice(9), webhookEvent: delivery.event });
        });
        await this.accountPut(`done:${key}`, Date.now() + 7 * 86400000);
        }

        const id = delivery.deliveryId ?? key.slice("delivery:".length);
        await this.env.DB.prepare("UPDATE webhook_deliveries SET state = 'done' WHERE source = ? AND delivery_id = ?").bind(delivery.source ?? "github", id).run();
        await this.ctx.storage.delete(key);
      } catch (error) {
        if (error instanceof RateLimitError) {
          // A provider cooldown is waiting, not a failed processing attempt.
          await this.accountPut(key, { ...delivery, nextAt: Math.max(Date.now() + 1000, error.retryAt) });
          continue;
        }
        inTrace(delivery.trace ?? { requestId: crypto.randomUUID(), repo: this.meta?.repo }, this.env, task => this.ctx.waitUntil(task), () => report(error, "webhook.processing_failed", { deliveryId: delivery.deliveryId ?? key.slice(9) }));
        // Keep the original payload durably queued. Never log credentials or raw API bodies.
        const attempts = delivery.attempts + 1;
        if (attempts >= 5) {
          await this.accountPut(`failed:${key}`, { ...delivery, attempts });
          await this.ctx.storage.delete(key);
          this.log("error", "Webhook retries exhausted; payload retained for operator replay.");
          if (this.state) await this.publishDecision({ id: `failed:${key}`, title: "A source delivery needs attention", why: "Five processing attempts failed. The payload is retained for operator replay.", stage: "intake", kind: "unblock", createdAt: Date.now(), options: [{ id: "later", label: "Look later", recommended: true, actions: [] }] });
          continue;
        }
        await this.accountPut(key, { ...delivery, attempts, nextAt: Date.now() + Math.min(600000, 5000 * 2 ** Math.min(attempts, 7)) * (0.5 + Math.random()) });
        this.log("error", `${delivery.source === "sentry" ? "Sentry" : delivery.source === "support" ? "Support" : "GitHub"} delivery deferred (attempt ${attempts}); check App configuration and API availability.`);
        // One bad delivery waits out its own backoff; the rest of the queue keeps moving.
        continue;
      }
    }
    const remaining = await this.ctx.storage.list<{ nextAt?: number }>({ prefix: "delivery:" });
    if (remaining.size) {
      const next = Math.max(Date.now() + TICK_MS, Math.min(...[...remaining.values()].map(d => d.nextAt ?? Date.now())));
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm == null || alarm > next) await this.accountAlarm(next);
    }
  }

  private async handleGitHub(event: string, p: GitHubPayload): Promise<void> {
    const installationId = p.installation?.id;
    const repo = p.repository?.full_name;
    if (lifecycleEvents.includes(event)) { await handleLifecycle(this.env, event, p); return; }
    if (await this.githubStopped()) return;


    if (!repo || !installationId || (this.meta && this.meta.repo.toLowerCase() !== repo.toLowerCase())) return;

    if (event === "shiptorio_install" || event === "issues" || event === "issue_comment") {
      if (await this.ctx.storage.get<boolean>("githubDisabled")) return;
      await this.ensure(repo, installationId);
      if (event === "shiptorio_install") {
        if (await this.ctx.storage.get<boolean>("githubBackfilled")) return;
        const token = await installationToken(this.env, installationId);
        const issues = await openIssues(token, repo);
        for (let offset = 0; offset < issues.length; offset += 5) {
          const batch = issues.slice(offset, offset + 5);
          const reporters = await Promise.all(batch.map((issue) => issueReporters(token, repo, issue)));
          for (let i = 0; i < batch.length; i++) for (const signal of normalizeGitHub({ repository: { full_name: repo }, issue: batch[i] })) await this.ingestSignal({ ...signal, reporters: reporters[i] });
        }
        await this.accountPut("githubBackfilled", true);
        this.log("info", `GitHub mine connected: ${issues.length} open issues loaded. The planner will sort the ore.`);
      } else {
        for (const signal of normalizeGitHub(p)) await this.ingestSignal(signal);
      }
      return;
    }
    if (!(await this.load())) return;
    if (event === "push" && p.ref === `refs/heads/${p.repository?.default_branch}`) await this.refreshDistricts();
    const pr = p.pull_request as { number?: number; merged?: boolean; merge_commit_sha?: string; title?: string; body?: string | null; html_url?: string; head?: { sha: string; ref: string }; base?: { ref: string } } | undefined;
    if (event === "pull_request" && p.action === "closed" && pr?.number) await this.onPullClosed(pr.number, !!pr.merged, pr.merge_commit_sha);
    if (event === "pull_request" && p.action === "closed" && pr) await this.orbitRevert(pr);
    const check = (p.check_run ?? p.check_suite) as { pull_requests?: { number: number }[]; head_sha?: string; conclusion?: string; name?: string; html_url?: string; app?: { name?: string } } | undefined;
    if (["check_run", "check_suite"].includes(event) && p.action === "completed" && check?.head_sha && ["failure", "timed_out", "startup_failure"].includes(check.conclusion ?? "")) await this.orbitDeploy(check.head_sha, check.name ?? check.app?.name ?? "CI", check.html_url);
    if (["check_run", "check_suite"].includes(event) && ["completed", "queued", "in_progress", "requested", "rerequested"].includes(p.action ?? "") && check) await this.onCheckSuite((check.pull_requests ?? []).map((pr) => pr.number), check.conclusion === "success", check.conclusion ?? "pending", check.head_sha);
  }

  async revokeGitHubUser(login: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets("web")) {
      const auth = ws.deserializeAttachment() as { login?: string } | null;
      if (auth?.login?.toLowerCase() === login.toLowerCase()) ws.close(1008, "GitHub authorization revoked");
    }
  }

  private async githubStopped(): Promise<boolean> {
    return !!(await this.ctx.storage.get("githubLifecycle")) || !!(await this.ctx.storage.get("migratedTo"));
  }

  /** Migration snapshots include jobs, dedupe keys, permits, decisions and pending deliveries. */
  async exportLegacy(target: string): Promise<[string, unknown][]> {
    await this.assertAccountActive();
    return this.ctx.blockConcurrencyWhile(async () => {
      await this.accountPut("migratedTo", target);
      await this.ctx.storage.deleteAlarm();
      for (const ws of this.ctx.getWebSockets("web")) ws.close(1012, "Repository identity upgraded; reconnect");
      return [...await this.ctx.storage.list()].filter(([key]) => key !== "migratedTo");
    });
  }

  async finishLegacy(): Promise<void> {
    await this.assertAccountActive();
    await this.ctx.blockConcurrencyWhile(async () => {
      const target = await this.ctx.storage.get<string>("migratedTo");
      if (!target) return;
      await this.ctx.storage.deleteAll();
      await this.accountPut("migratedTo", target);
      this.state = null; this.meta = null; this.openMoves = null; this.deckBook = null; this.deckRules = null;
    });
  }

  async importLegacy(entries: [string, unknown][]): Promise<void> {
    await this.assertAccountActive();
    await this.ctx.blockConcurrencyWhile(async () => {
      await this.ctx.storage.transaction(async tx => {
        if (await tx.get("legacyImported")) return;
        if (!(await tx.get("state"))) for (const [key, value] of entries) await tx.put(key, value);
        await tx.put("legacyImported", true);
      });
      this.state = null; this.meta = null;
      const lifecycle = await this.ctx.storage.get<{ deleteAt?: number }>("githubLifecycle");
      if (lifecycle?.deleteAt) await this.accountAlarm(lifecycle.deleteAt);
      else if (!lifecycle) await this.scheduleTick();
    });
  }

  async archiveGitHub(reason: string, at: number, repo?: string, installationId?: number): Promise<void> {
    await this.assertAccountActive();
    if (repo && installationId && !(await this.ctx.storage.get("meta"))) await this.accountPut("meta", { repo, installationId });
    await this.pauseGitHub(reason, at + RETENTION_MS);
  }

  async pauseGitHub(reason: string, deleteAt?: number): Promise<void> {
    await this.assertAccountActive();
    await this.accountPut("githubLifecycle", { reason, ...(deleteAt ? { deleteAt } : {}) });
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.delete("runnerPair");
    for (const job of await this.runnerJobs()) if (["running", "planning"].includes(job.status)) await this.accountPut(`runnerJob:${job.id}`, { ...job, status: "failed", error: "GitHub access changed; a fresh player approval is required." });
    if (await this.load()) {
      if (this.meta) purgeInstallationTokens(this.meta.installationId);
      await this.patch({ sources: [{ ...githubStatus(this.env), state: "needs_action", detail: `${reason}. ${deleteAt ? "Factory archived; reconnect within 30 days to restore it." : "Factory paused until access is restored."}` }] });
    }
    if (deleteAt) await this.accountAlarm(deleteAt); // retention only; production ticks stop
    for (const ws of this.ctx.getWebSockets("web")) ws.close(1008, "GitHub access changed");
  }

  async setRepositoryId(id: number): Promise<void> {
    await this.assertAccountActive();
    await this.accountPut("githubRepoId", id);
    this.credentialRepoId = id;
  }

  async retainReferencesById(id: number): Promise<void> {
    await this.assertAccountActive();
    const meta = await this.ctx.storage.get<Meta>("meta");
    if (!meta) return;
    const key = `repo:${id}`;
    await this.env.DB.batch([
      this.env.DB.prepare("UPDATE pull_requests SET repo = ? WHERE repo = ?").bind(key, meta.repo),
      this.env.DB.prepare("UPDATE move_kind_rules SET repo = ? WHERE repo = ?").bind(key, meta.repo),
      this.env.DB.prepare("UPDATE card_taps SET repo = ? WHERE repo = ?").bind(key, meta.repo),
      this.env.DB.prepare("UPDATE credentials SET scope = ? WHERE scope = ?").bind(`archived:${key}:installation:${meta.installationId}:repo:${meta.repo}`, `installation:${meta.installationId}:repo:${meta.repo}`),
    ]);
    await this.accountPut("githubDataKey", key);
  }

  async restoreGitHub(repo: string, installationId: number, repoId?: number): Promise<void> {
    await this.assertAccountActive();
    await this.load();
    if (repoId) await this.setRepositoryId(repoId);
    const retainedKey = await this.ctx.storage.get<string>("githubDataKey");
    if (retainedKey) {
      await this.env.DB.batch([
        this.env.DB.prepare("UPDATE pull_requests SET repo = ? WHERE repo = ?").bind(repo, retainedKey),
        this.env.DB.prepare("UPDATE move_kind_rules SET repo = ? WHERE repo = ?").bind(repo, retainedKey),
        this.env.DB.prepare("UPDATE card_taps SET repo = ? WHERE repo = ?").bind(repo, retainedKey),
      ]);
      const archivedScope = `archived:${retainedKey}:installation:${this.meta!.installationId}:repo:${this.meta!.repo}`;
      if (repo === this.meta!.repo && installationId === this.meta!.installationId) await this.env.DB.prepare("UPDATE credentials SET scope = ? WHERE scope = ?").bind(`installation:${installationId}:repo:${repo}`, archivedScope).run();
      else await this.env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(archivedScope).run();
      await this.ctx.storage.delete("githubDataKey");
    }
    // Metadata can be restored without network I/O; initialization/backfill stays in the queue.
    if (this.meta && (this.meta.repo !== repo || this.meta.installationId !== installationId)) {
      await this.ctx.storage.delete("runnerPair");
      await this.ctx.storage.delete("runnerPresence");
      for (const job of await this.runnerJobs()) await this.accountPut(`runnerJob:${job.id}`, { ...job, repo, ...(["running", "planning", "ready", "awaiting_approval"].includes(job.status) ? { status: "failed", error: "Repository identity changed; approve a fresh plan." } : {}) });
    }
    this.meta = { repo, installationId };
    await this.accountPut("meta", this.meta);
    if (this.state) {
      this.state.repo = repo;
      for (const item of this.state.items) if (item.ore?.fingerprint.startsWith("github:")) item.ore.fingerprint = `github:${repo}#${item.id.replace(/^gh-/, "")}`;
      await this.save();
    }
    await this.ctx.storage.delete("githubLifecycle");
    await this.ctx.storage.delete("githubDisabled");
    await this.ctx.storage.deleteAlarm();
    await this.scheduleTick();
  }

  async setGitHubPermissions(source: SourceStatus): Promise<void> {
    await this.assertAccountActive();
    if (source.state === "needs_action") await this.pauseGitHub(source.detail);
    if (!(await this.load()) && this.meta && source.state === "needs_action") {
      await this.accountPut("githubNeedsInitialization", true);
      this.state = { repo: this.meta.repo, baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 };
    }
    if (await this.load()) await this.patch({ sources: [...(this.state!.sources ?? []).filter(s => s.kind !== "github"), source] });
    await this.accountPut("githubPermissions", source);
  }

  async disconnectGitHub(): Promise<void> {
    await this.accountPut("githubDisabled", true);
    if (await this.load()) await this.patch({ sources: [{ ...githubStatus(this.env), state: "not_connected", detail: "GitHub mine disconnected for this repository." }] });
  }

  async ingestSignal(signal: Signal): Promise<void> {
    if (!(await this.load())) return;
    const s = this.state!;
    const existing = s.items.find((i) => i.ore?.fingerprint === signal.fingerprint || (signal.source === "github_issue" && i.id === `gh-${signal.externalId}`));
    if (signal.action === "resolved" && signal.source === "sentry" && existing && (existing.state === "launched" || existing.state === "on_pad")) {
      // Sentry went quiet after our fix shipped: the biters are dead.
      const m = s.metrics ?? { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 };
      await this.patch({ metrics: { ...m, bitersKilled: m.bitersKilled + 1 } });
      this.log("success", `Biters cleared: Sentry marked "${existing.title}" resolved.`, existing.id);
      return;
    }
    if (signal.action === "close" || signal.action === "resolved") {
      const jobs = (await this.runnerJobs()).filter(j => j.itemId === existing?.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status));
      if (jobs.some(j => j.status === "running")) return; // Preserve the in-flight build's eventual PR receipt.
      for (const job of jobs) await this.accountPut(`runnerJob:${job.id}`, { ...job, status: "failed", error: "Issue closed before dispatch." });
      if (existing && this.state?.move?.itemId === existing.id) await this.publishRunnerMove(null);
      if (existing && !existing.prNumber && existing.state !== "launched") await this.patch({ removed: [{ kind: "item", id: existing.id }] });
      return;
    }
    const folded = foldSignal(existing, signal);
    if (folded === existing) return;
    if (signal.source === "sentry") {
      // Orbit watch: the error a launch just fixed fired again, or a new one is spiking on the folder it touched.
      const comeback = !!existing && existing.state === "launched";
      const watched = watchForSentry(s.items, folded, comeback, signal.occurredAt);
      if (watched && comeback) return this.orbitTrip(folded, "sentry", `Sentry fired "${folded.title}" again`, signal.url);
      if (watched && await this.orbitCaused(watched, folded)) await this.orbitTrip(watched, "sentry", `New Sentry errors spiked on /${folded.district} ("${folded.title}", ${folded.ore?.count} events)`, signal.url);
    }
    // New ore lands on the district its stack frame or route points at; triage can still move it.
    const item = existing || !signal.districtHint ? folded : { ...folded, district: matchDistrict(signal.districtHint, s.districts.map((d) => d.name)) };
    const kind = MINE_KIND[signal.source] ?? "github";
    const status = s.sources?.find((source) => source.kind === kind) ?? (kind === "github" ? githubStatus(this.env) : await this.mineStatus(kind as MineKind));
    const now = Date.now();
    const sameDay = status.lastEventAt && new Date(status.lastEventAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
    await this.patch({ items: [item], sources: [...(s.sources ?? []).filter((source) => source.kind !== kind), { ...status, state: "connected", lastEventAt: now, eventsToday: (sameDay ? status.eventsToday : 0) + 1 }] });
    const verb = signal.source === "sentry" ? (existing ? "More biters" : "Biters") : signal.source === "posthog" ? (existing ? "Traffic ore updated" : "Traffic ore") : existing ? "Ore updated" : "Ore";
    this.log(signal.source === "sentry" ? "warn" : "info", `${verb}: ${item.title}${!existing && item.district !== "/" ? ` on /${item.district}` : ""}`, item.id);
    await this.scheduleTick();
  }

  // ---------- Sentry + PostHog mines ----------

  private publicUrl() {
    return (this.env.PUBLIC_URL || "https://shiptorio.com").replace(/\/$/, "");
  }

  private async mineStatus(kind: MineKind): Promise<SourceStatus> {
    const repo = this.meta?.repo ?? this.state?.repo;
    const status = kind === "sentry" ? sentryStatus(await sentryCreds(this.env, this.credentialScope(), this.redactor), this.publicUrl(), repo) : postHogStatus(await postHogCreds(this.env, this.credentialScope(), this.redactor), this.publicUrl(), this.env.FAKE_POSTHOG === "1");
    return repo && status.setup.actionUrl ? { ...status, setup: { ...status.setup, actionUrl: `${status.setup.actionUrl}?repo=${encodeURIComponent(repo)}` } } : status;
  }

  /** connect_source for a mine: plug it in if its credentials exist, otherwise answer with setup steps. */
  async connectMine(kind: MineKind): Promise<SourceStatus | null> {
    if (await this.githubStopped()) throw new Error("GitHub factory is archived or paused");
    if (!(await this.load())) return null;
    const status = await this.mineStatus(kind);
    const others = (this.state!.sources ?? []).filter((entry) => entry.kind !== kind);
    if (status.state !== "connected") {
      await this.patch({ sources: [...others, status] });
      this.log("info", `${kind === "sentry" ? "Sentry" : "PostHog"} needs one step: ${status.setup.steps.join(" ")}`);
      return status;
    }
    await this.accountPut(`${kind}Linked`, true);
    await this.ctx.storage.delete(`${kind}Disconnected`);
    await linkRepo(this.env, kind, this.state!.repo, this.credentialScope()!);
    const deposit = `ore-${kind}`;
    const splitter = this.state!.machines.find((m) => m.type === "splitter");
    const machines = this.state!.machines.some((m) => m.id === deposit) ? [] : [{ id: deposit, type: "ore_deposit" as const, x: -6, y: DEPOSIT_Y[kind], tier: 1, state: "idle" as const }];
    const belts = splitter && !this.state!.belts.some((b) => b.from === deposit) ? [{ id: `belt-${deposit}`, from: deposit, to: splitter.id }] : [];
    await this.patch({ machines, belts, sources: [...others, status] });
    this.log("success", kind === "sentry" ? "Sentry mine open. New errors will show up as biters on the folder they hit." : "PostHog mine open. Reading traffic per route now.");
    if (kind === "posthog") {
      await this.accountPut("posthogPoll", { nextAt: 0, failures: 0 });
      await this.scheduleTick();
    }
    return status;
  }

  /** Keys set as Worker secrets (no paste on /connect) still plug in: the first map that opens gets the mine,
   * unless the player unplugged it here or it's pinned/linked to another repo. */
  private async autoConnectMines(): Promise<void> {
    const repo = this.state?.repo?.toLowerCase();
    if (!repo) return;
    for (const kind of ["sentry", "posthog"] as const) {
      if ((await this.ctx.storage.get(`${kind}Linked`)) || (await this.ctx.storage.get(`${kind}Disconnected`))) continue;
      const linked = await linkedRepo(this.env, kind, this.credentialScope());
      if (linked && linked !== repo) continue;
      if ((await this.mineStatus(kind)).state === "connected") await this.connectMine(kind);
    }
  }

  async disconnectMine(kind: MineKind): Promise<void> {
    await this.ctx.storage.delete(`${kind}Linked`);
    await this.accountPut(`${kind}Disconnected`, true);
    if (kind === "posthog") await this.ctx.storage.delete("posthogPoll");
    if (!(await this.load())) return;
    await linkRepo(this.env, kind, null, this.credentialScope()!);
    const deposit = `ore-${kind}`;
    await this.patch({
      sources: (this.state!.sources ?? []).map((source) => source.kind === kind ? { ...source, state: "not_connected", detail: "Disconnected" } : source),
      removed: [
        ...(this.state!.machines.some((m) => m.id === deposit) ? [{ kind: "machine" as const, id: deposit }] : []),
        ...this.state!.belts.filter((b) => b.from === deposit).map((b) => ({ kind: "belt" as const, id: b.id })),
      ],
    });
  }

  private async handleSentry(resource: string, payload: SentryPayload): Promise<void> {
    if (!(await this.load()) || !(await this.ctx.storage.get<boolean>("sentryLinked"))) return;
    if (!(await sentryCreds(this.env, this.credentialScope(), this.redactor)).clientSecret) return;
    await markUsed(this.env, "sentry", this.credentialScope()!);
    const signals = normalizeSentry(this.redactor.value(payload), resource);
    // The brain's Sentry collector reads spikes off this hourly log. Assignments and resolves aren't errors.
    if (resource !== "issue" || payload.action === "created" || payload.action === "unresolved") {
      let pulses = (await this.ctx.storage.get<SentryPulse[]>(SENTRY_PULSES_KEY)) ?? [];
      for (const signal of signals) if (signal.action === "upsert") pulses = recordSentryPulse(pulses, signal.externalId, signal.occurredAt, Date.now());
      await this.accountPut(SENTRY_PULSES_KEY, pulses);
    }
    for (const signal of signals) await this.ingestSignal(signal);
  }

  /** Runs on the alarm. Every POLL_MS, with exponential backoff on errors and rate limits. */
  private async pollPostHog(): Promise<void> {
    if (!(await this.ctx.storage.get<boolean>("posthogLinked"))) return;
    let poll = await this.ctx.storage.get<{ nextAt: number; failures: number }>("posthogPoll");
    if (!poll) {
      poll = { nextAt: Date.now() + pollDelay(POLL_MS), failures: 0 };
      await this.accountPut("posthogPoll", poll);
      return;
    }
    const now = Date.now();
    if (now < poll.nextAt) return;
    const fake = this.env.FAKE_POSTHOG === "1";
    try {
      const creds = await postHogCreds(this.env, this.credentialScope(), this.redactor);
      if (!fake && !(creds.apiKey && creds.projectId)) throw new Error("PostHog key missing");
      const rows = fake ? fakePostHogRows(now) : await fetchRouteDays({ ...creds, apiKey: creds.apiKey!, projectId: creds.projectId! });
      if (!fake) await markUsed(this.env, "posthog", this.credentialScope()!);
      const { signals, traffic } = analyze(this.redactor.value(rows), creds.keyEvent || "$pageview", now);
      await this.accountPut("posthogPoll", { nextAt: now + pollDelay(POLL_MS), failures: 0 });
      await this.accountPut("posthogTraffic", traffic.slice(0, 50));
      for (const signal of signals) await this.ingestSignal(signal);
      await this.growthPoll(rows, creds.keyEvent || "$pageview", now);
      const top = traffic.slice(0, 3).map((t) => `${t.route} ${t.usersPerDay}/day`).join(", ");
      const status = this.state!.sources?.find((source) => source.kind === "posthog") ?? (await this.mineStatus("posthog"));
      await this.patch({ sources: [...(this.state!.sources ?? []).filter((source) => source.kind !== "posthog"), { ...status, state: "connected", detail: top ? `Busiest routes: ${top}.` : status.detail, lastEventAt: status.lastEventAt ?? now }] });
    } catch (err) {
      const failures = poll.failures + 1;
      const retry = (err as { retryAfter?: number }).retryAfter;
      await this.accountPut("posthogPoll", { nextAt: now + pollDelay(POLL_MS, failures, (retry ?? 0) * 1000), failures });
      const status = await this.mineStatus("posthog");
      await this.patch({ sources: [...(this.state!.sources ?? []).filter((source) => source.kind !== "posthog"), { ...status, state: "error", detail: `PostHog didn't answer (${err instanceof Error ? this.redactor.text(err.message).slice(0, 80) : "error"}). Retrying.` }] });
    }
  }

  // ---------- support mine (docs/context/support-mine.md) ----------
  // Customer email and Intercom chats land at the support well. Spark sorts each one and drafts a reply;
  // only a player's tap sends it. PlayerTap is minted in webSocketMessage and nowhere else.

  /** Same durable queue as the other mines. The Worker already checked the token or signature. */
  async enqueueSupport(deliveryId: string, message: SupportMessage): Promise<void> {
    await this.assertAccountActive(this.meta?.repo);
    const key = `delivery:support-${deliveryId}`;
    if (!(await this.ctx.storage.get(key))) await this.accountPut(key, { source: "support", deliveryId, event: message.channel, payload: message, attempts: 0, receivedAt: Date.now() });
    await this.scheduleTick();
  }

  private async supportStatusNow(): Promise<SourceStatus> {
    const repo = this.meta?.repo ?? this.state?.repo;
    return supportStatus(await supportCreds(this.env, repo), this.publicUrl(), repo, this.env.FAKE_SUPPORT === "1");
  }

  /** Plug the support well into the map: the deposit, its belt, and the source status. */
  async connectSupport(): Promise<SourceStatus | null> {
    if (!(await this.load())) return null;
    const status = await this.supportStatusNow();
    const others = (this.state!.sources ?? []).filter((entry) => entry.kind !== "email");
    if (status.state !== "connected") {
      await this.patch({ sources: [...others, status] });
      this.log("info", `Support mine needs one step: ${status.setup.steps[0]}`);
      return status;
    }
    await this.accountPut("supportLinked", true);
    const splitter = this.state!.machines.find((m) => m.type === "splitter");
    const machines = this.state!.machines.some((m) => m.id === "ore-inbox") ? [] : [{ id: "ore-inbox", type: "ore_deposit" as const, x: -6, y: 6, tier: 1, state: "idle" as const }];
    const belts = splitter && !this.state!.belts.some((b) => b.from === "ore-inbox") ? [{ id: "belt-ore-inbox", from: "ore-inbox", to: splitter.id }] : [];
    const previous = this.state!.sources?.find((entry) => entry.kind === "email");
    await this.patch({ machines, belts, sources: [...others, { ...status, lastEventAt: previous?.lastEventAt, eventsToday: previous?.eventsToday ?? 0 }] });
    if (machines.length) this.log("success", "Support mine open. Customer messages will show up as mail at the support well, with a reply drafted for you to send.");
    return status;
  }

  async disconnectSupport(): Promise<void> {
    await this.ctx.storage.delete("supportLinked");
    if (!(await this.load())) return;
    await this.patch({
      sources: (this.state!.sources ?? []).map((source) => source.kind === "email" ? { ...source, state: "not_connected", detail: "Disconnected" } : source),
      removed: [
        ...(this.state!.machines.some((m) => m.id === "ore-inbox") ? [{ kind: "machine" as const, id: "ore-inbox" }] : []),
        ...this.state!.belts.filter((b) => b.from === "ore-inbox").map((b) => ({ kind: "belt" as const, id: b.id })),
      ],
    });
  }

  private async handleSupport(message: SupportMessage): Promise<void> {
    if (!(await this.load())) return;
    // A message that passed the token or signature check means the player set the inlet up: open the well.
    if (!(await this.ctx.storage.get<boolean>("supportLinked"))) await this.connectSupport();
    const seen = (await this.ctx.storage.get<string[]>("supportSeen")) ?? [];
    const folded = await foldMessage(this.state!.support ?? [], message, seen);
    if (!folded.ticket) return;
    await this.accountPut("supportSeen", [...seen, `${message.channel}:${message.messageId}`].slice(-500));
    const now = Date.now();
    const status = this.state!.sources?.find((source) => source.kind === "email") ?? (await this.supportStatusNow());
    const sameDay = status.lastEventAt && new Date(status.lastEventAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10);
    await this.patch({ support: folded.tickets, sources: [...(this.state!.sources ?? []).filter((source) => source.kind !== "email"), { ...status, state: "connected", lastEventAt: now, eventsToday: (sameDay ? status.eventsToday : 0) + 1 }] });
    this.log("info", `${folded.isNew ? "Mail" : "More mail"} at the support well: ${folded.ticket.subject}`, folded.ticket.id);
    await this.scheduleTick();
  }

  /** Spark sorts the message and links it to work in the factory; the keyword rule stands in when it can't. */
  private async supportTriage(t: SupportTicket): Promise<SupportTriage & { by: "spark" | "fallback" }> {
    const s = this.state!, districts = s.districts.map((d) => d.name);
    const fallback = async (why: string) => {
      const h = heuristicSupport(t.subject, t.body, districts);
      await this.note({ decision: "support", by: "fallback", ms: 0, title: t.subject, outcome: `${h.kind} → ${h.district}`, reason: why, model: "keyword rule" });
      return { ...h, reason: why, by: "fallback" as const };
    };
    if (!sparkConfigured(this.env)) return fallback("No Meta API key, so a keyword rule sorted it.");
    return this.think("support", { title: t.subject, target: "ore-inbox" },
      () => triageSupport(this.sparkEnv(), t, districts, linkCandidates(s.items)),
      (out) => ({ outcome: `${out.kind} → ${out.district}${out.linkedItemId ? `, same as ${s.items.find((i) => i.id === out.linkedItemId)?.title ?? out.linkedItemId}` : ""}`, reason: out.reason }),
    ).then((out) => ({ ...out, by: "spark" as const })).catch(() => fallback("Spark didn't answer, so a keyword rule sorted it."));
  }

  private async supportDraft(t: SupportTicket, purpose: "answer" | "fixed"): Promise<SupportTicket["draft"]> {
    const kind = t.triage?.kind ?? "question";
    const linked = this.state!.items.find((i) => i.id === t.triage?.linkedItemId);
    if (!sparkConfigured(this.env)) return makeDraft(t.id, fallbackDraft(t, kind, purpose), purpose, "fallback");
    try {
      const out = await this.think("support", { title: `${purpose === "fixed" ? "“It's fixed” reply" : "Reply"}: ${t.subject}`, itemId: linked?.id, target: "ore-inbox" },
        () => draftReply(this.sparkEnv(), { purpose, ticket: t, kind, summary: t.triage?.summary ?? t.subject, linked: linked && { title: linked.title, state: linked.state, prUrl: linked.prUrl }, product: this.state!.repo.split("/")[1] ?? this.state!.repo }),
        (d) => ({ outcome: `Drafted a ${purpose === "fixed" ? "“it's fixed”" : kind} reply for you to send`, reason: d.reason }));
      return makeDraft(t.id, out.text, purpose, "spark");
    } catch {
      return makeDraft(t.id, fallbackDraft(t, kind, purpose), purpose, "fallback");
    }
  }

  /** Runs on the alarm: triage and draft a few tickets per tick, draft "it's fixed" replies, offer the cards. */
  private async tickSupport(): Promise<void> {
    const s = this.state!;
    let tickets = s.support ?? [];
    if (!tickets.length) return;
    let budget = 3, changed = false;
    for (const id of tickets.map((t) => t.id)) {
      let t = tickets.find((x) => x.id === id)!;
      if (budget <= 0) break;
      if (t.state === "new") {
        budget--;
        if (!t.triage) {
          const tri = await this.supportTriage(t);
          t = { ...t, triage: { kind: tri.kind, district: tri.district, summary: tri.summary, reason: tri.reason, linkedItemId: tri.linkedItemId ?? (t.issue ? `gh-${t.issue.number}` : undefined), by: tri.by } };
          if (tri.linkedItemId) await this.supportBoost(tri.linkedItemId, t);
        }
        t = t.triage!.kind === "spam" ? { ...t, state: "closed" } : { ...t, draft: await this.supportDraft(t, "answer"), state: "drafted" };
      } else if (t.state === "waiting_fix") {
        const item = s.items.find((i) => i.id === t.triage?.linkedItemId);
        if (item?.state !== "launched" || t.sent.some((x) => x.purpose === "fixed")) continue;
        budget--;
        t = { ...t, draft: await this.supportDraft(t, "fixed"), state: "drafted" };
        this.log("success", `“${item.title}” shipped. A reply telling ${t.name ?? "the customer"} it's fixed is ready for you to send.`, t.id);
      } else continue;
      tickets = (this.state!.support ?? tickets).map((x) => (x.id === id ? t : x));
      changed = true;
    }
    if (changed) await this.patch({ support: tickets });
    await this.offerSupportMoves();
  }

  /** A customer asking about work already in the factory makes that work weigh more. */
  private async supportBoost(itemId: string, t: SupportTicket): Promise<void> {
    const item = this.state!.items.find((i) => i.id === itemId);
    if (!item) return;
    const reporter = `support:${t.id}`;
    if (item.customer?.reporters.includes(reporter)) return;
    const ore = item.ore && { ...item.ore, reporters: [...item.ore.reporters, reporter].slice(-100), paying: item.ore.paying || !!t.paying };
    const customer = { usersAffected: item.customer?.usersAffected ?? 0, linked: item.customer?.linked ?? [], ...item.customer, reporters: [...(item.customer?.reporters ?? []), reporter].slice(-100), paying: item.customer?.paying || !!t.paying };
    await this.patch({ items: [{ ...item, ore, customer, value: ore ? oreWeight(ore, Date.now()) : item.value }] });
    this.broadcast({ type: "log", level: "info", text: `A customer wrote in about “${item.title}”. It weighs more now.`, at: Date.now(), itemId, actor: "spark", tool: "link_items", reason: t.triage?.reason });
  }

  private async offerSupportMoves(): Promise<void> {
    await this.decisionData();
    const want = (this.state!.support ?? []).flatMap((t) => [replyMove(t), issueMove(t)]).filter((m): m is Move => !!m);
    const ids = new Set(want.map((m) => m.id));
    const before = this.openMoves!.length;
    this.openMoves = this.openMoves!.filter((m) => !m.id.startsWith("support:") || ids.has(m.id));
    let dirty = before !== this.openMoves.length;
    for (const move of want) {
      const open = this.openMoves.find((m) => m.id === move.id);
      if (open && open.why === move.why && open.title === move.title) continue;
      if (open) this.openMoves = this.openMoves.filter((m) => m.id !== move.id);
      this.openMoves.push(enrichMove(move, this.state!));
      dirty = true;
    }
    if (dirty) await this.refreshDecisions();
  }

  private supportSending = new Set<string>();

  /** The only way a reply leaves: a player's tap on that exact draft. */
  private async sendSupportReply(tap: PlayerTap): Promise<void> {
    const s = this.state!;
    const t = s.support?.find((x) => x.id === tap.ticketId);
    if (!t?.draft || t.state !== "drafted" || t.draft.hash !== tap.draftHash) return;
    const key = `supportSend:${t.id}:${t.draft.hash}`;
    // Synchronous guard covers concurrent events in this instance; storage covers reconnect/restart.
    if (this.supportSending.has(key)) return;
    this.supportSending.add(key);
    try {
      if (await this.ctx.storage.get(key)) { this.log("warn", "This draft already has a delivery attempt. Check its result before sending again.", t.id); return; }
      await this.accountPut(key, { state: "sending", at: Date.now() });
      const creds = await supportCreds(this.env, this.meta?.repo ?? s.repo);
      const operator = await isOperatorSupport(this.env, s.repo);
      const sendEnv = operator ? this.env : { ...this.env, RESEND_API_KEY: undefined, SUPPORT_FROM: undefined };
      // All credential/identity awaits finish before the last exact-draft check.
      const current = this.state!.support?.find(x => x.id === t.id);
      if (current?.draft?.hash !== t.draft.hash || current.state !== "drafted") return;
      const result = await deliverReply(sendEnv, creds, t, tap).catch(() => ({ via: "outbox" as const, ok: false, error: "Delivery result is uncertain. Check the provider before trying again." }));
      await this.accountPut(key, { state: result.ok ? "sent" : "uncertain", at: Date.now() });
      if (!result.ok) { this.log("warn", result.error ?? "The reply did not confirm delivery. Check the provider.", t.id); return; }
      const latest = this.state!.support?.find(x => x.id === t.id);
      if (!latest) return;
      const unchanged = latest.draft?.hash === t.draft.hash && latest.messages === t.messages;
      const purpose = t.draft.purpose, kind = t.triage?.kind;
      const tracked = !!t.triage?.linkedItemId || !!t.issue;
      const done = purpose === "fixed" || !(kind === "bug" || kind === "feature") || !tracked;
      const next: SupportTicket = { ...latest, ...(unchanged ? { state: done ? "answered" as const : "waiting_fix" as const, draft: undefined } : {}), sent: [...latest.sent, { at: Date.now(), purpose, via: result.via, ...(result.via === "outbox" ? { text: t.draft.text } : {}) }].slice(-20) };
      const m = this.state!.metrics ?? { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 };
      const answered = result.via !== "outbox" && unchanged && done && kind !== "spam";
      await this.patch({ support: (this.state!.support ?? []).map(x => x.id === t.id ? next : x), ...(answered ? { metrics: { ...m, customersAnswered: m.customersAnswered + 1, shipScore: m.shipScore + 10 } } : {}) });
      await this.offerSupportMoves();
      this.log("success", result.via === "outbox" ? "Reply saved to the outbox; no external message was sent." : `Reply sent by ${result.via}.`, t.id);
    } finally { this.supportSending.delete(key); }
  }

  private async editSupportReply(ticketId: string, text: string): Promise<void> {
    const t = this.state!.support?.find((x) => x.id === ticketId);
    if (!t || t.state === "closed") return;
    const draft = await makeDraft(t.id, text, t.draft?.purpose ?? "answer", "player");
    await this.patch({ support: this.state!.support!.map((x) => (x.id === t.id ? { ...x, draft, state: "drafted" } : x)) });
    await this.offerSupportMoves();
  }

  /** A customer's bug becomes a real GitHub issue, so it rides the belt like any other. */
  private async fileSupportIssue(ticketId: string): Promise<void> {
    const s = this.state!, t = s.support?.find((x) => x.id === ticketId);
    if (!t || t.issue || !this.meta) return;
    const { title, body } = issueFor(t);
    let issue: { number: number; html_url: string; title: string; body?: string | null; state?: string; updated_at?: string; created_at?: string; user?: { login: string }; labels?: { name: string }[] };
    try {
      const token = await installationToken(this.env, this.meta.installationId);
      issue = await gh(`/repos/${this.meta.repo}/issues`, token, { method: "POST", body: JSON.stringify({ title, body, labels: ["bug"] }) });
    } catch (e) {
      this.log("warn", `Couldn't file the issue (${e instanceof Error ? e.message.slice(0, 80) : "GitHub error"}). Try again from the support well.`, t.id);
      return;
    }
    const itemId = `gh-${issue.number}`;
    const next: SupportTicket = { ...t, issue: { number: issue.number, url: issue.html_url }, triage: t.triage && { ...t.triage, linkedItemId: itemId }, state: t.state === "answered" ? "waiting_fix" : t.state };
    await this.patch({ support: (s.support ?? []).map((x) => (x.id === t.id ? next : x)) });
    for (const signal of normalizeGitHub({ repository: { full_name: this.meta.repo }, issue: { ...issue, body: issue.body ?? body, state: "open" } } as GitHubPayload)) await this.ingestSignal({ ...signal, reporters: [`support:${t.id}`], paying: t.paying });
    this.broadcast({ type: "log", level: "success", text: `Filed issue #${issue.number} from a customer's report. It's on the belt.`, at: Date.now(), actor: "player", tool: "file_support_issue", approvedBy: "player", reason: "You chose to file it.", itemId });
    await this.offerSupportMoves();
  }

  private async closeTicket(ticketId: string): Promise<void> {
    const t = this.state!.support?.find((x) => x.id === ticketId);
    if (!t) return;
    await this.patch({ support: this.state!.support!.map((x) => (x.id === t.id ? { ...x, state: "closed", draft: undefined } : x)) });
    await this.offerSupportMoves();
  }

  /** Card buttons for support cards. Send only runs with a tap minted from this player's own message. */
  private async chooseSupportMove(card: Move, option: Move["options"][number], tapFor: (tool: string, ticketId: string, draftHash: string) => PlayerTap | null): Promise<boolean> {
    if (!card.id.startsWith("support:")) return false;
    const action = option.actions[0];
    const ticketId = String(action?.args.ticketId ?? card.id.split(":").pop());
    if (action?.tool === "review_customer_reply") return true; // the browser opens the full preview; never send from a summary card
    if (action?.tool === "send_customer_reply") return true; // retire legacy summary-card sends
    if (action?.tool === "file_support_issue") await this.fileSupportIssue(ticketId);
    else await this.swipe(card, option.id === "skip" ? "once" : "defer");
    return true;
  }

  /** The growth loop (server/src/growth.ts): measure launched experiments, and turn a funnel drop into a new one. */
  private async growthPoll(rows: RouteDay[], keyEvent: string, now: number, windows: FunnelWindow[] = []): Promise<void> {
    const s = this.state!;
    const users = routeUsers(rows, keyEvent); // Traffic context, not an ordered funnel.
    // The route poll cannot supply unique-person cohort conversions. A future
    // authorized funnel query must provide these windows before live growth runs.
    if (!(await flagEnabled(this.env, "newFeatures")) || !windows.length) return;
    const tick = growthTick(s.experiments ?? [], s.items, windows, now);
    if (tick.changed) await this.patch({ experiments: tick.experiments });
    for (const exp of tick.decided) {
      // the call is plain math (shared/src/growth.ts), so it goes in the floor log, not the planner's decision log
      this.log(exp.state === "won" ? "success" : exp.state === "lost" ? "warn" : "info", `Measure station: ${exp.line} (p = ${(exp.p ?? 1).toFixed(3)})`, exp.itemId);
    }
    const drop = tick.drop;
    if (!drop) return;
    const districts = s.districts.map((d) => d.name);
    const fallback = () => ({ ...fallbackExperiment(drop), district: districts[0] ?? "/", reason: "A fixed rule picked the experiment." });
    const busiestRoutes = [...new Set(users.map((u) => u.route))].slice(0, 20);
    const pick = !sparkConfigured(this.env)
      ? fallback()
      : await this.think("growth", { title: `${drop.step.label} −${drop.dropPct}%`, target: "ore-posthog" },
          () => proposeExperiment(this.env, { step: drop.step.label, baseRate: drop.baseRate, rate: drop.rate, dropPct: drop.dropPct, lostPerDay: drop.lostPerDay, districts, busiestRoutes }),
          (p) => ({ outcome: p.title, reason: p.reason }),
        ).catch(fallback);
    const exp = newExperiment(drop, pick, now);
    if ((s.experiments ?? []).some((e) => e.id === exp.id)) return;
    await this.ingestSignal(experimentSignal(exp, drop, now));
    const item = this.state!.items.find((i) => i.ore?.fingerprint === `growth:${exp.id}`);
    const station = this.state!.machines.some((m) => m.id === MEASURE_ID) ? [] : [measureMachine()];
    await this.patch({ experiments: [{ ...exp, itemId: item?.id }, ...(this.state!.experiments ?? [])].slice(0, 20), ...(station.length && { machines: station }) });
    this.log("info", `${drop.step.label} fell ${drop.dropPct}%. New experiment on the line: ${exp.title}`, item?.id);
  }

  // ---------- state ----------

  // The empire overview's line for this repo. Reads stored state only: no tick, no GitHub calls.
  async summary(): Promise<IslandSummary | null> {
    const state = await this.load();
    return state ? summarizeIsland(state) : null;
  }

  private async load(): Promise<FactoryState | null> {
    await this.assertAccountActive(this.meta?.repo);
    this.socketEpoch = await browserSocketEpoch(this.env);
    if (!this.state) {
      const loaded = await loadFactoryState(this.ctx.storage);
      if (loaded) {
        const { schemaVersion: _version, ...wireState } = loaded;
        this.state = wireState;
      }
      this.meta = (await this.ctx.storage.get<Meta>("meta")) ?? null;
      this.credentialRepoId = await this.ctx.storage.get<number>("githubRepoId") ?? null;
      // A local agent can outlive this DO instance. Preserve in-flight work; the watchdog
      // asks the player to inspect it rather than dispatching the same task twice.
      if (this.state) {

        this.state.stations = liveStations(this.state);
        this.state.autonomy = autonomyView(await this.permitBook(), await this.autonomyFlags());
        this.state.brain = { ...(this.state.brain ?? emptyBrain(sparkModel(this.env), false)), model: sparkModel(this.env), online: sparkConfigured(this.env) };
      }
    }
    if (this.meta && !this.credentialsReady) {
      await sentryCreds(this.env, this.credentialScope(), this.redactor);
      await postHogCreds(this.env, this.credentialScope(), this.redactor);
      this.credentialsReady = true;
    }
    return this.state;
  }

  private async save() {
    if (this.accountErased) throw new Error("Factory deleted");
    if (this.state) await saveFactoryState(this.ctx.storage, this.redactor.value(this.state), () => { if (this.accountErased) throw new Error("Factory deleted"); });
  }

  /** Owner authorization is enforced by the Worker route, before DO access. */
  async exportState() {
    const state = await this.load();
    if (!state) return null;
    return { format: "shiptorio-factory", exportedAt: new Date().toISOString(),
      state: this.redactor.value(persistedState(structuredClone(state))), storage: stateSize(state) };
  }

  private broadcastQueue: Promise<void> = Promise.resolve();
  private browserFrames = new BrowserFrames(this.ctx.storage);

  private broadcast(msg: ServerToWeb) {
    const frame = this.browserFrames.frame(this.redactor.value(msg));
    const repo = this.meta?.repo ?? this.state?.repo;
    const deliver = async () => {
      const text = await frame;
      // A player may have many sockets. Share the same revocable session check only
      // within this frame; the next frame must query D1 again (no authorization TTL).
      const access = new Map<string, Promise<boolean>>();
      for (const ws of this.ctx.getWebSockets("web")) {
        try {
          const auth = ws.deserializeAttachment();
          if (!browserSocketAllowed(auth, this.env, this.socketEpoch) || !repo || auth.repo !== repo.toLowerCase() || !auth.user) { ws.close(1008, "Repository access revoked"); continue; }
          const key = JSON.stringify([auth.user.id, auth.user.sessionHash, auth.user.expiresAt, auth.user.login, (auth as {adminView?:string}).adminView]);
          let allowed = access.get(key);
          if (!allowed) { allowed = (auth as {adminView?:string}).adminView ? activeAdminView(this.env,(auth as {adminView:string}).adminView,auth.user.id,auth.user.sessionHash,repo).then(Boolean) : repoAccess(this.env, auth.user, repo).then(Boolean); access.set(key, allowed); }
          if (!await allowed) { ws.close(1008, "Repository access revoked"); continue; }
          ws.send(text);
        } catch { try { ws.close(1008, "Sign in again"); } catch {} }
      }
    };
    const delivery = this.broadcastQueue.then(deliver);
    this.broadcastQueue = delivery.catch(() => {});
    this.ctx.waitUntil?.(delivery);
    return delivery;
  }

  private log(level: "info" | "warn" | "error" | "success", text: string, itemId?: string) {
    text = this.redactor.text(text);
    log(level === "success" ? "info" : level, "factory.event", { message: text, itemId, repo: this.meta?.repo });
    if (level === "error") capture(new Error(text), { itemId, repo: this.meta?.repo });
    this.broadcast({ type: "log", level, text, at: Date.now(), itemId });
  }

  // ---------- the planner's decision log (docs/context/spark-audit.md) ----------

  private async note(thought: Omit<Thought, "id" | "model" | "at"> & { model?: string }) {
    const s = this.state;
    if (!s) return;
    s.brain = recordThought(s.brain ?? emptyBrain(sparkModel(this.env), sparkConfigured(this.env)), { ...thought, model: thought.model ?? sparkModel(this.env), at: Date.now() });
    await this.save();
    this.broadcast({ type: "patch", patch: { brain: s.brain } });
  }

  private foreman(targetId: string | undefined, tool: string, thinking: boolean) {
    if (!this.state) return;
    this.state.foreman = { targetId, tool, thinking };
    this.broadcast({ type: "patch", patch: { foreman: this.state.foreman } });
  }

  /**
   * One Spark decision: the drone flies to what it's thinking about, and the call lands in the decision
   * log with Spark's own reason. A failed call is logged too, then rethrown so the caller's fallback runs.
   */
  private async think<T>(decision: ThoughtDecision, about: { title: string; itemId?: string; target?: string }, ask: () => Promise<T>, explain: (out: T) => { outcome: string; reason: string; steps?: Thought["steps"] }): Promise<T> {
    const start = Date.now();
    this.foreman(about.target ?? about.itemId, decision, true);
    try {
      const hold = await this.plannerRest();
      if (hold && ["plan", "scope", "rank", "route", "diagnose"].includes(decision)) throw new Error("Planner resting");
      const out = await inTrace({ ...currentTrace(), requestId: currentTrace()?.requestId ?? crypto.randomUUID(), repo: this.meta?.repo, itemId: about.itemId }, this.env, task => this.ctx.waitUntil(task), ask);
      const explanation = explain(out);
      if (this.env.DB && this.env.META_API_KEY) {
        const usage = await this.usage();
        const spend = await factorySpend(this.env.DB, this.meta!.repo, Date.now(), usage.account);
        explanation.reason += ` Planner: ~$${spend.estimatedUsd.toFixed(4)} / $${spend.dailyBudgetUsd.toFixed(2)} today. ${spend.explanation}`;
        explanation.reason += ` Budget: ${usage.calls}/${usage.limits.calls} calls, ${usage.tokens}/${usage.limits.tokens} tokens today (UTC).`;
      }
      await this.note({ decision, by: "spark", ms: Date.now() - start, itemId: about.itemId, title: about.title, ...explanation });
      return out;
    } catch (e) {
      if (planningFailureKind(e) !== "other" && !(decision === "rank" && planningFailureKind(e) === "bad_output")) {
        await this.parkPlanner(planningFailure(await this.ctx.storage.get<PlanningRetry>(PLANNER_REST_KEY), e));
        await this.scheduleTick();
      }
      await this.note({ decision, by: "fallback", ms: Date.now() - start, itemId: about.itemId, title: about.title, outcome: "The planner is unavailable; a backup rule or your input is needed", reason: e instanceof Error ? e.message : "Planner call paused" });
      throw e;
    } finally {
      this.foreman(about.target ?? about.itemId, decision, false);
    }
  }

  /** Splitter triage through Spark, with the keyword rule as the logged fallback. */
  private async sparkTriage(item: { id?: string; title: string; body: string }, districts: string[]): Promise<Triage> {
    const fallback = async (why: string) => {
      const t = heuristicTriage(item.title, [], districts);
      await this.note({ decision: "triage", by: "fallback", ms: 0, itemId: item.id, title: item.title, outcome: `${t.kind} → ${t.district}`, reason: why, model: "keyword rule" });
      return t;
    };
    if (!sparkConfigured(this.env)) return fallback("No Meta API key, so a keyword rule sorted it.");
    return this.think("triage", { title: item.title, itemId: item.id, target: "splitter-1" },
      () => triage(this.sparkEnv(), { title: item.title, body: item.body, labels: [] }, districts),
      t => ({ outcome: `${t.kind} → ${t.district}`, reason: t.reason ?? "Classified from the issue text." }),
    ).catch(() => heuristicTriage(item.title, [], districts));
  }

  private async patch(p: Patch, deferDecisions = false) {
    const s = this.state!;
    if (p.research) s.research = p.research;
    // Researched checks join every PR that hasn't reached the verify bay yet.
    if (p.items && s.research?.done.length) p = { ...p, items: p.items.map((it) => withChecks(it, s)) };
    for (const it of p.items ?? []) upsert(s.items, it);
    for (const m of p.machines ?? []) upsert(s.machines, m);
    for (const b of p.belts ?? []) upsert(s.belts, b);
    for (const r of p.removed ?? []) {
      const list = r.kind === "item" ? s.items : r.kind === "machine" ? s.machines : s.belts;
      const i = list.findIndex((x) => x.id === r.id);
      if (i !== -1) list.splice(i, 1);
    }
    if (p.districts) s.districts = p.districts;
    if (p.power) s.power = p.power;
    if (p.science) s.science = p.science;
    if (p.trust !== undefined) s.trust = p.trust;
    if (p.tick !== undefined) s.tick = p.tick;
    if (p.goal !== undefined) s.goal = p.goal;
    if (p.goals) s.goals = p.goals;
    if (p.sources) s.sources = p.sources;
    if (p.experiments) s.experiments = p.experiments;
    // Bottlenecks are derived below; callers never set queue telemetry by hand.
    if (p.metrics) s.metrics = p.metrics;
    if (p.autonomy) s.autonomy = p.autonomy;
    if (p.learned) s.learned = p.learned;
    if (p.support) s.support = p.support;
    // Station piles follow the items, so every item change re-counts the gauntlet.
    if (p.items || p.removed || p.research || p.experiments) p = { ...p, stations: (s.stations = liveStations(s)) };
    await this.save();
    // Delivery revalidates browser membership over the network and may queue behind
    // an earlier frame. Never hold an atomic runner mutation behind that I/O.
    // broadcast preserves order and registers delivery with ctx.waitUntil.
    this.broadcast({ type: "patch", patch: p });
    if (!deferDecisions) await this.refreshDecisions();
  }

  private async scheduleTick() {
    // Pull a far-off poll/watch alarm in, so work never waits behind it.
    if (await this.githubStopped()) return;
    const at = await this.ctx.storage.getAlarm();
    if (at == null || at > Date.now() + TICK_MS) await this.accountAlarm(Date.now() + TICK_MS);
  }

  /** One wake-up for the earliest watch, even when every player and agent is offline. */
  private async scheduleOrbitDeadline() {
    const deadlines = this.state?.items.filter(i => i.state === "launched" && i.orbit?.state === "watching").map(i => i.orbit!.until) ?? [];
    if (!deadlines.length) return;
    const next = Math.max(Date.now() + 1, Math.min(...deadlines));
    const alarm = await this.ctx.storage.getAlarm();
    if (alarm == null || alarm > next) await this.accountAlarm(next);
  }

  // ---------- RPC from the Worker ----------

  private initializing: { repo: string; promise: Promise<void> } | null = null;

  /** Installation delivery and the first browser can arrive together. Never initialize twice. */
  async ensure(repo: string, installationId: number): Promise<void> {
    await this.assertAccountActive(repo);
    if (!validRepo(repo)) throw new Error("Repository mismatch");
    const pending = this.initializing;
    if (pending) {
      if (pending.repo !== repo.toLowerCase()) throw new Error("Repository mismatch");
      await pending.promise;
      if (this.meta && this.meta.repo.toLowerCase() !== repo.toLowerCase()) throw new Error("Repository mismatch");
      if (this.meta?.installationId !== installationId) await this.ensure(repo, installationId);
      return;
    }
    const operation = { repo: repo.toLowerCase(), promise: this.ensureFactory(repo, installationId) };
    this.initializing = operation;
    try { await operation.promise; }
    finally { if (this.initializing === operation) this.initializing = null; }
  }

  /** Creates the factory with districts from the repo and a starter line, if it doesn't exist yet. */
  private async ensureFactory(repo: string, installationId: number): Promise<void> {
    if (await this.githubStopped()) return;
    const existing = await this.load();
    if (!validRepo(repo) || (this.meta && this.meta.repo.toLowerCase() !== repo.toLowerCase())) throw new Error("Repository mismatch");

    if (existing) {
      if (await this.ctx.storage.get("githubNeedsInitialization")) {
        const tree = await repoTree(await installationToken(this.env, installationId), repo);
        if (await this.githubStopped()) return;
        this.state!.baseBranch = tree.branch;
        this.state!.districts = layoutMap(tree.entries).zones;
        await this.save();
        await this.ctx.storage.delete("githubNeedsInitialization");
      }
      if (this.meta?.installationId !== installationId || this.meta?.repo !== repo) {
        this.meta = { repo, installationId };
        await this.accountPut("meta", this.meta);
      }
      // Optional provider discovery must not delay an already usable map. Persist
      // the wake-up before returning so an eviction cannot lose the reconnect.
      await this.accountPut("mineReconnectPending", { repo: this.meta!.repo, installationId, generation: crypto.randomUUID() });
      await this.scheduleTick();
      return;
    }
    this.meta = { repo, installationId };
    await this.accountPut("meta", this.meta);
    const token = await installationToken(this.env, installationId);
    const tree = await repoTree(token, repo);
    if (await this.githubStopped()) return;
    this.state = initialFactoryState(repo, tree, this.env);
    await this.save();
  }

  /** Alarm-owned optional discovery; deletion/installation changes invalidate old work. */
  private async reconnectMines(): Promise<void> {
    const pending = await this.ctx.storage.get<Meta & { generation: string }>("mineReconnectPending");
    if (!pending || await this.githubStopped()) return;
    await this.assertAccountActive(pending.repo);
    if (!this.meta || this.meta.repo !== pending.repo || this.meta.installationId !== pending.installationId) return;
    await this.autoConnectMines();
    // Keep the marker on failure, including partial connection, for the next alarm.
    await this.ctx.storage.transaction(async tx => {
      const current = await tx.get<Meta & { generation: string }>("mineReconnectPending");
      if (current?.generation === pending.generation) await tx.delete("mineReconnectPending");
    });
  }

  async refreshDistricts(): Promise<void> {
    if (!(await this.load()) || !this.meta) return;
    const token = await installationToken(this.env, this.meta.installationId);
    const tree = await repoTree(token, this.meta.repo);
    await this.patch({ districts: layoutMap(tree.entries).zones });
  }

  async ingestIssue(issue: { number: number; title: string; body: string; url: string; labels: string[] }): Promise<void> {
    if (!(await this.load())) return;
    const id = `gh-${issue.number}`;
    if (this.state!.items.some((i) => i.id === id)) return;
    const item: Item = {
      id,
      kind: "feature",
      source: "github_issue",
      title: issue.title,
      body: `${issue.body}\n\nLabels: ${issue.labels.join(", ")}`,
      url: issue.url,
      district: "/",
      state: "ore",
      attempts: 0,
      updatedAt: Date.now(),
    };
    await this.patch({ items: [item] });
    this.log("info", `Ore: #${issue.number} ${issue.title}`, id);
    await this.scheduleTick();
  }

  async onCheckSuite(prNumbers: number[], _ok: boolean, _summary: string, headSha?: string): Promise<void> {
    if (!(await this.load()) || !this.meta) return;
    const token = await installationToken(this.env, this.meta.installationId);
    for (const item of this.state!.items) {
      if (!["inspecting", "on_pad", "passed"].includes(item.state) || !item.prNumber || !(prNumbers.includes(item.prNumber) || (headSha && item.inspection?.headSha === headSha))) continue;
      const result = await inspectPullRequest(token, this.meta.repo, item.prNumber, headSha, this.state!.baseBranch);
      if (result.stale || !this.state!.items.some(current => current === item && current.state !== "launched")) continue;
      if (result.state === "pending") {
        if (item.state !== "inspecting" || stageOf(item, "ci")?.state === "passed" || item.inspection?.headSha !== result.headSha) {
          await this.patch({ items: [{ ...item, state: "inspecting", machineId: "ci-1", inspection: freshInspection(result.headSha), updatedAt: Date.now() }] });
        }
        continue;
      }
      if (item.branch?.startsWith("shiptorio/runner-") && (!item.lane || item.inspection?.headSha !== result.headSha)) {
        const lane = await prFiles(token, this.meta.repo, item.prNumber).then((files) => laneOf(changedPaths(files))).catch(error => { this.log("error", `Lane metadata unavailable: ${String(error)}`, item.id); return null; });
        if (!this.state!.items.some(current => current === item && current.state !== "launched")) continue;
        item.lane = lane ?? undefined;
      }
      if (result.state === "passed") {
        if (item.branch?.startsWith("shiptorio/runner-")) {
          // Every check run reports in; only a new head (or the first green) restarts the gauntlet.
          if (stageOf(item, "ci")?.state === "passed" && result.headSha === item.inspection?.headSha) continue;
          const fresh = { ...item, state: "inspecting" as const, inspection: freshInspection(result.headSha) };
          await this.patch({ items: [setStage(fresh, "ci", "passed", result.summary)] });
          this.log("success", `Checks: CI passed PR #${item.prNumber}. Next, the proof check.`, item.id);
          await this.scheduleTick();
          continue;
        }
        const onPad = this.state!.machines.some((m) => m.type === "launch_pad");
        await this.patch({ items: [{ ...item, state: onPad ? "on_pad" : "passed", failure: undefined, updatedAt: Date.now() }] });
        this.log("success", `Checks passed PR #${item.prNumber}. Ready for Gate.`, item.id);
      } else if (item.branch?.startsWith("shiptorio/runner-")) {
        await this.patch({ items: [setStage(item, "ci", "rework", result.summary.split("\n")[0] || "CI failed")] });
        this.log("warn", `Checks: CI sent PR #${item.prNumber} back: ${result.summary.split("\n")[0]}`, item.id);
        await this.noteRework(item);
        await this.scheduleTick();
      } else {
        await this.patch({ items: [{ ...item, state: "rejected", failure: result.summary, updatedAt: Date.now() }] });
        this.log("warn", `Checks sent PR #${item.prNumber} back: ${result.summary}`, item.id);
        await this.scheduleTick();
      }
    }
  }

  async onPullClosed(prNumber: number, merged: boolean, mergeSha?: string): Promise<void> {
    if (!(await this.load())) return;
    const fix = merged ? this.state!.items.find(i => i.prNumber === prNumber && i.id.startsWith("gh-")) : undefined;
    try { await this.closePull(prNumber, merged, mergeSha); }
    finally { if (fix) await this.bringFixInto(Number(fix.id.slice(3)), prNumber); }
  }

  private async closePull(prNumber: number, merged: boolean, mergeSha?: string): Promise<void> {
    const creditKey = `launchCredit:${prNumber}`;
    if (merged) {
      // An item's active PR changes on rework. Credit belongs to the merged PR forever.
      const credit = await this.ctx.storage.get<{itemId: string; at: number; mergeSha?: string}>(creditKey);
      if (credit) {
        // Repair older stale writes without awarding another rocket or undoing an orbit regression.
        const current = this.state!.items.find(i => i.id === credit.itemId && i.prNumber === prNumber);
        if (current && current.state !== "launched" && current.orbit?.state !== "regressed") {
          await this.patch({items:[startWatch({...current,state:"launched",updatedAt:credit.at},credit.at,credit.mergeSha ?? mergeSha)]});
        }
        await this.scheduleOrbitDeadline(); return;
      }
      const previous = this.state!.items.find(i => i.orbit?.prNumber === prNumber || i.state === "launched" && i.prNumber === prNumber);
      if (previous) {
        // Seed watches shipped before this ledger, without changing their current work.
        await this.accountPut(creditKey, { itemId: previous.id, at: previous.orbit?.since ?? previous.updatedAt, mergeSha: previous.orbit?.mergeSha ?? mergeSha });
        await this.scheduleOrbitDeadline();
        return;
      }
    }
    let item = this.state!.items.find((i) => i.prNumber === prNumber);
    // Recover pre-fix issue-close ordering from our durable job and GitHub's real issue.
    // Never synthesize a rocket for an unrelated PR or reopen the GitHub issue.
    if (!item && merged && this.meta) {
      const job = (await this.runnerJobs()).find(j => j.status === "completed" && j.prUrl?.endsWith(`/pull/${prNumber}`));
      if (job) {
        // A queued regression or a newer PR is not the old issue-close deletion.
        if (this.state!.items.some(i => i.id === job.itemId)) return;
        const token = await installationToken(this.env, this.meta.installationId);
        const issue = await gh<NonNullable<GitHubPayload["issue"]>>(`/repos/${job.repo}/issues/${job.itemId.slice(3)}`, token);
        const signal = normalizeGitHub({ repository: { full_name: job.repo }, issue })[0];
        if (signal) {
          const { reason: _reason, ...classification } = await this.sparkTriage({ title: issue.title, body: issue.body ?? "" }, this.state!.districts.map(d => d.name));
          item = { ...foldSignal(undefined, { ...signal, action: "upsert" }), ...classification, state: "inspecting", branch: job.branch, prNumber, prUrl: job.prUrl, attempts: 1 };
        }
      }
    }
    if (!item || item.state === "launched") return;
    if (!merged) {
      await this.patch({ removed: [{ kind: "item", id: item.id }] });
      this.log("info", `PR #${prNumber} closed without merging. Item scrapped.`, item.id);
      return;
    }
    const candidate = item;
    const flags = await this.autonomyFlags();
    const committed = await this.ctx.blockConcurrencyWhile(async () => {
      const s = this.state!;
      const current = s.items.find(i => i.id === candidate.id);
      if (current && current.prNumber !== prNumber) return null;
      const launchedItem = current ?? candidate;
      const auto = (await this.ctx.storage.get<number>(`autoLaunch:${launchedItem.id}`)) === prNumber;
      // State, rocket credit and permit counters commit atomically. A failed write
      // leaves no partial credit; a redelivered receipt can safely try again.
      const result = await this.ctx.storage.transaction(async tx => {
        if (await tx.get(creditKey)) return null;
        const now = Date.now();
        const key = SCIENCE_FOR[launchedItem.kind];
        const book = recordShip(await tx.get<PermitBook>("permits") ?? emptyBook(), launchedItem, auto);
        const launched = startWatch({ ...launchedItem, state: "launched", updatedAt: now }, now, mergeSha);
        const items = s.items.some(i => i.id === launched.id) ? s.items.map(i => i.id === launched.id ? launched : i) : [...s.items, launched];
        const next: FactoryState = { ...s, items, science: { ...s.science, [key]: s.science[key] + 1 }, trust: Math.min(1, s.trust + 0.05), autonomy: autonomyView(book, flags), brain: scoreShip(s.brain, launched.id) };
        next.stations = liveStations(next, now);
        await tx.put("state", next);
        await tx.put("permits", book);
        await tx.put(creditKey, { itemId: launched.id, at: now, mergeSha });
        return { next, launched, auto };
      });
      if (result) Object.assign(s, result.next);
      return result;
    });
    if (!committed) return;
    const { next, launched, auto } = committed;
    await this.logOutcome(launched.id, launched.scars?.length ? "shipped_after_rework" : "shipped_clean");
    this.broadcast({ type: "patch", patch: { items: [launched], science: next.science, trust: next.trust, autonomy: next.autonomy, stations: next.stations, brain: next.brain } });
    await this.scheduleOrbitDeadline();
    await this.refreshDecisions();
    this.log("success", auto ? `Rocket launched on its own: PR #${prNumber} merged on the ${launched.lane} launch permit.` : `Rocket launched: PR #${prNumber} merged.`, launched.id);
    // A merge on GitHub doesn't wait for the gauntlet. Say which stations never got to look, so a missing review is explained.
    const skipped = (launched.inspection?.stages ?? []).filter(st => st.gate !== "human" && st.state !== "passed").map(st => st.gate === "ai" ? "Review" : st.gate === "ci" ? "the CI check" : "the proof check");
    if (skipped.length) this.log("warn", `PR #${prNumber} was merged before ${skipped.join(" and ")} finished, so ${skipped.length === 1 ? "it" : "they"} never signed off.`, launched.id);
    if (this.state!.move?.itemId === launched.id) await this.publishGauntletMove(null);
  }

  // ---------- the gauntlet (docs/LOOP.md) ----------

  private gauntletRunning = false;

  /** Keep foreground proof moving before optional polling uses this installation's budget.
   * At most two stations on one unchanged PR; background work still gets every tick. */
  private async runGauntletBurst(): Promise<void> {
    let target = this.state?.items.find(i => nextGate(i) && i.prNumber);
    for (let count = 0; count < 2 && target; count++) {
      if (Date.now() < this.githubRestUntil || await this.githubStopped() || await adminPaused(this.env.DB, this.meta?.repo)) return;
      const gate = nextGate(target), head = target.inspection?.headSha, pr = target.prNumber;
      if (!gate || !head || !pr) return;
      const advanced = await this.runGauntlet(target);
      if (!advanced || advanced.id !== target.id || advanced.prNumber !== pr || advanced.inspection?.headSha !== head || !nextGate(advanced) || nextGate(advanced) === gate) return;
      // A webhook may replace an inspection even on the same head. Only the
      // station's exact published receipt can authorize the next station here.
      target = this.state?.items.find(i => i.id === advanced.id && i.prNumber === pr && i.inspection === advanced.inspection && i.inspection?.headSha === head);
    }
  }

  /** Runs one station, preserving every current-head/inspection fence. */
  private async runGauntlet(target?: Item): Promise<Item | undefined> {
    if (this.gauntletRunning || !this.meta || !this.state) return;
    const item = target ? this.state.items.find(i => i === target && nextGate(i) && i.prNumber) : this.state.items.find((i) => nextGate(i) && i.prNumber);
    if (!item) return;
    const gate = nextGate(item)!;
    let advanced: Item | undefined;
    if (gate === "ai" && !sparkConfigured(this.env)) return; // waits for Spark power; the station shows the pile
    // A planner timeout or 429 parks the planner briefly; review waits it out instead of retrying every tick.
    if (gate === "ai" && plannerBusy(await this.plannerRest())) return;
    this.gauntletRunning = true;
    const pr = item.prNumber!;
    const inspection = item.inspection!;
    const headSha = inspection.headSha;
    // Any await can let a webhook/reconciliation replace this inspection. Results
    // belong only to the commit and station that started the run.
    const current = () => this.state!.items.find(i => i.id === item.id && i.prNumber === pr && i.inspection === inspection && nextGate(i) === gate);
    try {
      const token = await installationToken(this.env, this.meta.installationId);
      const evidence = await inspectPullRequest(token, this.meta.repo, pr, headSha, this.state.baseBranch);
      if (evidence.stale || evidence.state !== "passed") return;
      const files = await prFiles(token, this.meta.repo, pr);
      const jobs = (await this.runnerJobs()).filter(j => j.itemId === item.id);
      if (jobs.some(j => j.reworkPr === pr && ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) return;
      const job = jobs.find(j => j.headSha === item.inspection?.headSha && j.status === "completed") ?? jobs.find(j => j.prUrl?.endsWith(`/pull/${pr}`) && !j.headSha);
      if (jobs.some(j => j.refreshBase && j.headSha === headSha && j.status !== "completed") && !jobs.some(j => j.status === "completed" && j.headSha === headSha)) {
        return;
      }
      const builder = job?.harness === "codex" ? "Codex" : job?.harness === "muse_code" ? "Muse Code" : job?.harness === "claude_code" ? "Claude Code" : job?.harness === "local" ? "Local model" : "the planner";
      const lane = laneOf(changedPaths(files)) ?? undefined;
      const currentInLane = async () => {
        if (!current()) return;
        const refreshed = await inspectPullRequest(token, this.meta!.repo, pr, headSha, this.state!.baseBranch);
        if (refreshed.stale || refreshed.state !== "passed") return;
        const now = current();
        return now ? { ...now, lane } : now;
      };
      if (gate === "checks") {
        const now = await currentInLane();
        if (!now) return;
        const { item: checked, ran } = runChecks(now, files);
        advanced = checked;
        await this.patch({ items: [checked] });
        for (const r of ran) this.log(r.passed ? "success" : "warn", `${techById(r.id)?.name ?? r.id} ${r.passed ? "passed" : "sent back"} PR #${pr}: ${r.reason}`, item.id);
        if (checked.state === "rejected") await this.noteRework(checked);
      } else if (gate === "verify") {
        const v = verifyFromDiff(files.map((f) => f.filename), !!job, job?.proof, changedPaths(files));
        const now = await currentInLane();
        if (!now) return;
        advanced = setStage(now, "verify", v.passed ? "passed" : "rework", v.reason);
        await this.patch({ items: [advanced] });
        this.log(v.passed ? "success" : "warn", `Checks: proof ${v.passed ? "passed" : "sent back"} PR #${pr}: ${v.reason}`, item.id);
        if (!v.passed) await this.noteRework(now);
      } else {
        this.log("info", `Review is reading PR #${pr} (${builder} built it, a different model reviews).`, item.id);
        // Docs that name code get that code, read at the PR head, so the reviewer can check the examples work.
        const context = (await Promise.all(referencedFiles(files).map(async path => {
          const content = await fileContent(token, this.meta!.repo, path, headSha).catch(error => { throw new RepositoryReadUnavailable(error); });
          return { path, content: content === null ? undefined : redactText(content).slice(0, 6000) };
        })))
          .filter((c): c is { path: string; content: string } => typeof c.content === "string");
        // The reviewer can read, list and search the repo at the PR head, the issue thread and CI before it rules.
        const box = await this.sparkToolbox(token, item, headSha, await treePaths(token, this.meta.repo, headSha).catch(error => { throw new RepositoryReadUnavailable(error); }), { headSha, diff: async () => diffText(files) });
        const record = async (step: SparkStep) => this.broadcast({ type: "log", level: "info", text: step.result, at: step.at, actor: "spark", tool: step.tool, reason: step.reason, itemId: item.id });
        const verdict = await this.think("review", { title: `PR #${pr}: ${item.title}`, itemId: item.id, target: "review-1" }, () => reviewDiff(this.sparkEnv(), { title: item.title, body: item.body ?? "", builder }, diffText(files), context, box, record),
          v => ({ outcome: `${v.verdict === "pass" ? `Passed ${builder}'s PR` : `Sent ${builder}'s PR back`}${v.steps?.length ? ` after ${v.steps.length - 1} ${v.steps.length === 2 ? "look" : "looks"} at the repo` : ""}`, reason: v.reason }));
        const now = await currentInLane();
        if (!now) return;
        await this.postReviewComment(token, pr, `${reviewComment(verdict, builder)}\n\n<!-- shiptorio-review-head:${now.inspection!.headSha} -->`, item.id);
        const afterComment = await currentInLane();
        if (!afterComment) return;
        advanced = setStage(afterComment, "ai", verdict.verdict === "pass" ? "passed" : "rework", verdict.reason);
        await this.patch({ items: [advanced] });
        this.log(verdict.verdict === "pass" ? "success" : "warn", `Review ${verdict.verdict === "pass" ? "passed" : "sent back"} PR #${pr}: ${verdict.reason}`, item.id);
        if (verdict.verdict !== "pass") await this.noteRework(now);
      }
      await this.scheduleTick();
      return advanced;
    } catch (e) {
      if (e instanceof BudgetError || e instanceof RateLimitError || e instanceof RepositoryReadUnavailable) {
        const limit = e instanceof RepositoryReadUnavailable ? e.cause : e;
        if (limit instanceof RateLimitError) this.githubRest(limit.retryAt);
        this.log("warn", `Station is waiting (${e.message}). It picks up again on its own.`, item.id);
        return; // Keep pending proof; resource waiting is not a failed code review.
      }
      if (gate === "ai" && plannerBusy(await this.plannerRest()) && plannerBusy({ kind: planningFailureKind(e) })) {
        this.log("info", PLANNER_BUSY_LINE, item.id);
        return; // A slow or busy planner is not a failed code review; the same PR head is reviewed after the rest.
      }
      const latest = current();
      if (latest) {
        const failed = setStage(latest, gate === "checks" ? "ci" : gate, "rework", `Station request failed: ${String(e)}`);
        await this.patch({ items: [failed] });
        await this.noteRework(failed);
      }
      this.log("warn", `${gate === "ai" ? "Review" : gate === "checks" ? "The researched checks" : "The proof check"} couldn't run on PR #${pr} (${e instanceof Error ? e.message : "unknown error"}). The player can approve another attempt.`, item.id);
    } finally {
      this.gauntletRunning = false;
    }
  }

  /**
   * Spark's review verdict goes on the PR as a comment so it's checkable in GitHub. A failed post is never silent:
   * it's logged, shows in "how it thinks", and is queued to retry on the next ticks.
   */
  private async postReviewComment(token: string, pr: number, body: string, itemId?: string, tries = 0): Promise<boolean> {
    try {
      await gh(`/repos/${this.meta!.repo}/issues/${pr}/comments`, token, { method: "POST", body: JSON.stringify({ body }) });
      if (tries) this.log("success", `Review comment posted on PR #${pr} after ${tries} ${tries === 1 ? "retry" : "retries"}.`, itemId);
      return true;
    } catch (e) {
      const why = e instanceof Error ? e.message : "unknown error";
      const queue = (await this.ctx.storage.get<PendingComment[]>("pendingReviewComments")) ?? [];
      const giveUp = tries + 1 >= REVIEW_COMMENT_TRIES;
      await this.accountPut("pendingReviewComments", [...queue.filter(c => c.pr !== pr), ...(giveUp ? [] : [{ pr, body, itemId, tries: tries + 1 }])]);
      this.log(giveUp ? "error" : "warn", giveUp ? `Review comment on PR #${pr} still won't post (${why}). Gave up after ${REVIEW_COMMENT_TRIES} tries; check the app's pull request and issue write permission.` : `Review comment on PR #${pr} didn't post (${why}). Retrying.`, itemId);
      await this.note({ decision: "review", by: "spark", ms: 0, itemId, title: `Comment on PR #${pr}`, outcome: giveUp ? "Verdict made, but the comment never reached GitHub" : "Verdict made, comment didn't post yet; retrying", reason: why });
      return false;
    }
  }

  private async retryReviewComments(): Promise<void> {
    const queue = (await this.ctx.storage.get<PendingComment[]>("pendingReviewComments")) ?? [];
    if (!queue.length || !this.meta) return;
    const token = await installationToken(this.env, this.meta.installationId);
    for (const c of queue) if (await this.postReviewComment(token, c.pr, c.body, c.itemId, c.tries)) {
      const left = (await this.ctx.storage.get<PendingComment[]>("pendingReviewComments")) ?? [];
      await this.accountPut("pendingReviewComments", left.filter(x => x.pr !== c.pr));
    }
  }

  private async publishGauntletMove(move: Move | null): Promise<void> { await this.publishDecision(move); }

  /** A GitHub delivery may have changed mergeability: re-ask on the next tick, unless a rate limit is cooling down. */
  private async refreshReadinessPolls(): Promise<void> {
    const polls = await this.ctx.storage.list<{ head: string; nextAt: number; limited?: boolean }>({ prefix: "gauntletReadiness:" });
    for (const [key, poll] of polls) if (!poll.limited) await this.ctx.storage.delete(key);
  }

  /** The merge gate: a green PR on the pad, or a PR the gauntlet sent back, becomes the Next Move.
   *  poll: the 2s tick. It re-asks GitHub about the same inspected head at most every READINESS_POLL_MS,
   *  and waits out a rate limit, so one PR on the pad cannot fill the installation's shared GitHub queue. */
  private async offerGauntletMove(poll = false): Promise<void> {
    const s = this.state;
    if (!s) return;
    const now = Date.now();
    for (const item of s.items) {
      if (!item.prNumber || (await this.ctx.storage.get<number>(`gauntletDeferred:${item.id}`) ?? 0) > now) continue;
      if (item.state === "on_pad" && item.inspection?.state === "passed" && stationsPassed(item.inspection)) {
        const inspection = item.inspection;
        const pollKey = `gauntletReadiness:${item.id}`;
        const polled = await this.ctx.storage.get<{ head: string; nextAt: number }>(pollKey);
        if (poll && polled?.head === inspection.headSha && polled.nextAt > now) continue;
        let readiness = { ready: false, reason: "Waiting for GitHub to confirm this PR is ready to merge." };
        let nextAt = now + READINESS_POLL_MS, limited = false;
        try {
          const token = await installationToken(this.env, this.meta!.installationId);
          readiness = await pullRequestReadiness(token, this.meta!.repo, item.prNumber, inspection.headSha, s.baseBranch);
        } catch (error) {
          if (error instanceof RateLimitError) { nextAt = Math.max(nextAt, error.retryAt); limited = true; }
          this.log("warn", "GitHub merge readiness is unavailable; Launch is waiting.", item.id); report(error, "factory.merge_readiness_unavailable");
        }
        await this.accountPut(pollKey, { head: inspection.headSha, nextAt, limited });
        if (!this.state!.items.some(i => i.id === item.id && i.inspection === inspection && i.state === "on_pad")) continue;
        // Replace carried Launch cards too. A transient GitHub hold must not erase
        // completed runner/AI receipts or invent a rework scar.
        await this.decisionData();
        this.openMoves = this.openMoves!.filter(m => !(m.itemId === item.id && m.stage === "pad") || m.kind === (readiness.ready ? "ship" : "unblock"));
        const move = launchMove(item, now);
        await this.publishGauntletMove(readiness.ready ? move : {
          ...move, title: `PR #${item.prNumber} is waiting on GitHub`, why: readiness.reason, kind: "unblock",
          options: [{ id: "later", label: "Later", recommended: true, actions: [] }],
        });
        await this.refreshDecisions();
        continue;
      }
      if (item.state === "rejected" && item.branch?.startsWith("shiptorio/runner-") && item.scars?.length) {
        // Offered once per scar, unless the card was dropped (a planning hold drops plan cards) and nothing
        // took its place: then the rework would wait forever behind a card nobody can see.
        if ((await this.ctx.storage.get<number>(`gauntletOffered:${item.id}`)) === item.scars.length) {
          await this.decisionData();
          const jobs = await this.runnerJobs();
          const waiting = this.openMoves!.some(m => m.itemId === item.id && m.options.some(o => o.actions.some(a => a.tool === "plan_runner_job"))) || jobs.some(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status));
          if (waiting || planningHold(await this.ctx.storage.get<PlanningRetry>(`planningRetry:${item.id}`))) continue;
        }
        await this.accountPut(`gauntletOffered:${item.id}`, item.scars.length);
        const last = (await this.runnerJobs()).filter(j => j.itemId === item.id).at(-1)?.harness ?? "codex";
        // A scarred job never goes back to geothermal: the retry takes a subscription.
        const subs = (await this.ctx.storage.get<{ harnesses: RunnerJob["harness"][] }>("runnerPresence"))?.harnesses.filter(h => h !== "local") ?? [];
        const builder = last !== "local" ? last : subs[0] ?? "codex";
        await this.publishGauntletMove(reworkMove(item, now, builder as "codex" | "claude_code" | "muse_code"));
        continue;
      }
    }
  }

  /** Handles the merge gate's own cards. Returns false for every other move. */
  private async chooseGauntletMove(moveId: string, optionId: string): Promise<boolean> {
    const s = this.state!;
    const move = s.move;
    if (!move || move.id !== moveId || !move.itemId || !(move.stage === "pad" || (move.stage === "inspect" && move.kind === "review"))) return false;
    const item = s.items.find((i) => i.id === move.itemId);
    if (!item?.prNumber || !this.meta) return false;
    if (optionId === "later") {
      await this.accountPut(`gauntletDeferred:${item.id}`, Date.now() + 10 * 60 * 1000);
      await this.publishGauntletMove(null);
      if (s.bottleneck?.stationId === "gate-1") await this.refreshDecisions();
      return true;
    }
    if (optionId.startsWith("rework-") && move.options.some(o => o.id === optionId)) return false;
    const ready = optionId === "launch" && item.state === "on_pad" && item.inspection?.state === "passed" && stationsPassed(item.inspection);
    const overrule = optionId === "overrule" && item.state === "rejected";
    if (!ready && !overrule) return true;
    const action = move.options.find(o => o.id === optionId)?.actions.find(a => a.tool === "request_merge");
    if (!action || action.args.pr !== item.prNumber || (action.args.overrule === true) !== overrule) return true;
    await this.launch(item, overrule ? "overrule" : "player", action.args.headSha);
    return true;
  }

  /** Merges at the merge gate: the player's tap, an overrule, or a launch permit doing it on its own. */
  private async launch(item: Item, by: "player" | "overrule" | "autonomy", approvedHead: unknown): Promise<void> {
    if (by === "autonomy" && !(await flagEnabled(this.env, "permits"))) return;
    if (!item.prNumber || !this.meta) return;
    const launchingItem = this.state!.items.find(current => current.id === item.id && current.prNumber === item.prNumber);
    const launchingInspection = launchingItem?.inspection;
    try {
      if (typeof approvedHead !== "string" || !/^[a-f0-9]{40}$/.test(approvedHead) || launchingItem !== item || launchingInspection?.headSha !== approvedHead) throw new Error("Current checks changed since this approval was offered.");
      const token = await installationToken(this.env, this.meta.installationId);
      const head = (await gh<{ head: { sha: string } }>(`/repos/${this.meta.repo}/pulls/${item.prNumber}`, token)).head.sha;
      if (!launchingItem || !this.state!.items.some(current => current === launchingItem && current.inspection === launchingInspection)) throw new Error("Current checks changed while launch was being refreshed.");
      if (approvedHead !== head) {
        await this.patch({ items: [{ ...item, state: "inspecting", machineId: "ci-1", inspection: freshInspection(head), updatedAt: Date.now() }] });
        throw new Error("The PR changed after its checks ran. It goes back through the gauntlet.");
      }
      if (by !== "overrule") {
        if (!stationsPassed(item.inspection)) throw new Error("Current checks require complete station receipts.");
        const checks = await inspectPullRequest(token, this.meta.repo, item.prNumber, head, this.state!.baseBranch);
        if (!launchingItem || !this.state!.items.some(current => current === launchingItem)) throw new Error("Current checks changed while launch was being refreshed.");
        if (checks.stale) throw new Error("The PR changed while its checks were being refreshed.");
        if (checks.state !== "passed") {
          const current = checks.state === "failed" ? setStage(item, "ci", "rework", checks.summary) : { ...item, state: "inspecting" as const, machineId: "ci-1", inspection: freshInspection(head), updatedAt: Date.now() };
          await this.patch({ items: [current] });
          if (checks.state === "failed") await this.noteRework(current);
          throw new Error("Current checks have not passed. The PR is back at CI.");
        }
      }
      if (by === "autonomy") {
        // A permit belongs to a lane on this head, never an item's historical
        // classification. Bracket the file read with head checks; merge also
        // supplies the expected SHA so a subsequent push cannot win the race.
        const lane = laneOf(changedPaths(await prFiles(token, this.meta.repo, item.prNumber))) ?? undefined;
        const latestHead = (await gh<{ head: { sha: string } }>(`/repos/${this.meta.repo}/pulls/${item.prNumber}`, token)).head.sha;
        if (latestHead !== head) throw new Error("The PR changed while its launch permit was being checked.");
        if (lane !== item.lane || !mayAutoLaunch(await this.permitBook(), { ...item, lane })) {
          await this.patch({ items: [{ ...item, lane }] });
          throw new Error("The PR changed its permitted lane. A player must review the launch.");
        }
        await this.accountPut(`autoLaunch:${item.id}`, item.prNumber);
      }
      // Even an explicit overrule cannot bypass GitHub repository policy.
      const readiness = await pullRequestReadiness(token, this.meta.repo, item.prNumber, head, this.state!.baseBranch);
      if (!readiness.ready) {
        await this.offerGauntletMove();
        throw new Error(`Current checks: ${readiness.reason}`);
      }
      if (!this.state!.items.some(current => current.id === item.id && current.prNumber === item.prNumber && current.inspection === launchingInspection && current.inspection?.headSha === approvedHead && (by === "overrule" ? current.state === "rejected" : current.state === "on_pad" && stationsPassed(current.inspection)))) {
        throw new Error("Current checks changed while launch was being refreshed.");
      }
      const mergeSha = await mergePullRequest(token, this.meta.repo, item.prNumber, head, item.title);
      const reason = by === "overrule" ? "You overruled the gauntlet and merged." : by === "autonomy" ? `Launch permit: ${item.lane}. Every station passed on this commit.` : "You merged at Gate.";
      const stages = (item.inspection?.stages ?? []).map((st) => (st.gate === "human" ? { ...st, state: "passed" as const, reason } : st));
      // A merge webhook may already have launched this item. Add approval to the
      // current state, never the old pad snapshot, before publishing our launch.
      const current = this.state!.items.find(candidate => candidate.id === item.id && candidate.prNumber === item.prNumber);
      if (current) await this.patch({ items: [{ ...current, inspection: item.inspection && { ...item.inspection, stages, humanApproved: by !== "autonomy" } }] }, true);
      await this.onPullClosed(item.prNumber, true, mergeSha);
      this.broadcast({ type: "log", level: "success", text: by === "autonomy" ? `Launching #${item.prNumber} on its own.` : `Launching #${item.prNumber}.`, at: Date.now(), actor: by === "autonomy" ? "spark" : "player", tool: "request_merge", approvedBy: by === "autonomy" ? "autonomy" : "player", reason, itemId: item.id });
      if (this.state!.move?.itemId === item.id) await this.publishGauntletMove(null);
      if (this.state!.bottleneck?.stationId === "gate-1") await this.refreshDecisions();
    } catch (err) {
      if (by === "autonomy") {
        await this.ctx.storage.delete(`autoLaunch:${item.id}`);
        await this.accountPut(`autoLaunchFailed:${item.id}`, item.inspection?.headSha); // falls back to the launch card
      }
      const why = err instanceof Error && (err.message.startsWith("The PR changed") || err.message.startsWith("Current checks")) ? err.message : "GitHub didn't accept the merge. Open the PR to see why.";
      this.log("warn", why, item.id);
    }
  }

  // ---------- orbit watch (docs/LOOP.md station 5, src/orbit.ts) ----------

  /** A comeback after launch: scar the item, send it back on the rework belt, revoke its lane's permit. */
  private async orbitTrip(item: Item, signal: "sentry" | "revert" | "deploy", what: string, evidenceUrl?: string): Promise<void> {
    const s = this.state!;
    if (!isWatching(item)) return;
    const back = regress(item, signal, what, evidenceUrl);
    const m = s.metrics ?? { rockets: 0, bitersKilled: 0, escapedDefects: 0, customersAnswered: 0, usersUnblocked: 0, shipScore: 0 };
    await this.patch({ items: [back], metrics: { ...m, escapedDefects: m.escapedDefects + 1, shipScore: m.shipScore - 25 }, trust: Math.max(0, s.trust - 0.1) });
    this.log("warn", `Orbit watch: ${back.orbit!.reason}. It's back on the rework belt with an orbit scar.`, item.id);
    await this.noteRework(back, `#${back.orbit!.prNumber} came back in orbit (${signal === "sentry" ? "Sentry" : signal === "revert" ? "revert PR" : "red on main"})`);
    await this.escapedDefect(back);
    if (s.move?.itemId === item.id) await this.publishGauntletMove(null);
    await this.scheduleTick();
  }

  /**
   * A new error spiked on the folder a launch touched. The spike rule says "maybe"; Spark reads the launch's files
   * and the error and says whether it's really the launch. Unsure or unreachable means the rule's trip stands.
   */
  private async orbitCaused(watched: Item, error: Item): Promise<boolean> {
    const pr = watched.orbit?.prNumber ?? watched.prNumber;
    const title = `#${pr} vs "${error.title}"`;
    if (!sparkConfigured(this.env) || !this.meta || !pr) {
      await this.note({ decision: "orbit", by: "fallback", ms: 0, itemId: watched.id, title, outcome: "Tripped on the spike rule", reason: "No Meta API key, so any spike on the folder counts.", model: "spike rule" });
      return true;
    }
    try {
      const token = await installationToken(this.env, this.meta.installationId);
      const files = (await prFiles(token, this.meta.repo, pr)).map(f => f.filename).slice(0, 60);
      const since = watched.orbit!.since, now = Date.now();
      const v = await this.think("orbit", { title, itemId: watched.id, target: "orbit-1" }, () => judgeOrbit(this.sparkEnv(), {
        launch: { pr, title: watched.title, district: watched.district, files, launchedMinutesAgo: Math.round((now - since) / 60000) },
        error: { title: error.title, district: error.district, events: error.ore?.count ?? 1, firstSeenMinutesAfterLaunch: Math.round(((error.ore?.firstSeen ?? now) - since) / 60000), culprit: error.body?.slice(0, 300) },
      }), v => ({ outcome: v.caused ? `#${pr} caused it: back to rework` : `Not #${pr}'s fault: launch stays up`, reason: v.reason }));
      if (!v.caused) this.broadcast({ type: "log", level: "info", text: `Orbit watch: "${error.title}" spiked on /${error.district}, but it isn't #${pr}'s doing. The launch stays up.`, at: Date.now(), itemId: watched.id, actor: "spark", tool: "orbit_verdict", reason: v.reason });
      return v.caused;
    } catch {
      return true; // think() already logged the fallback
    }
  }

  /** Only a confirmed merge into the tracked branch can undo a watched launch. */
  private async orbitRevert(pr: { number?: number; title?: string; body?: string | null; html_url?: string; merged?: boolean; base?: { ref: string } }): Promise<void> {
    // Signed delivery authenticates GitHub, not the author's title/body claim.
    if (pr.merged !== true || !pr.base?.ref || pr.base.ref !== this.state!.baseBranch) return;
    const reverted = this.meta && revertedPr(pr, this.meta.repo);
    const watched = reverted ? watchForRevert(this.state!.items, reverted) : undefined;
    if (watched) await this.orbitTrip(watched, "revert", `Revert PR #${pr.number} undoes it`, pr.html_url);
  }

  /** A check failed on a watched launch's merge commit on main. */
  private async orbitDeploy(sha: string, name: string, url?: string): Promise<void> {
    const watched = watchForSha(this.state!.items, sha);
    if (watched) await this.orbitTrip(watched, "deploy", `"${name}" failed on main`, url);
  }

  /** Launches that made it 24h with no comeback. */
  private async orbitExpire(): Promise<void> {
    const clear = expired(this.state!.items);
    if (!clear.length) return;
    await this.patch({ items: clear });
    for (const i of clear) this.log("success", `Orbit watch: #${i.orbit!.prNumber} held 24h with no comeback.`, i.id);
  }

  // ---------- launch permits (docs/PRODUCT.md "Autonomy is earned") ----------

  private async permitBook(): Promise<PermitBook> {
    return (await this.ctx.storage.get<PermitBook>("permits")) ?? emptyBook();
  }

  private async savePermits(book: PermitBook): Promise<void> {
    await this.accountPut("permits", book);
    await this.patch({ autonomy: autonomyView(book, await this.autonomyFlags()) });
  }

  /** Permits and levels are parked (src/flags.ts): the player's one trust meter is learned cards. */
  private async autonomyFlags(): Promise<{ levels: boolean; permits: boolean }> {
    return { levels: await flagEnabled(this.env, "autonomy"), permits: await flagEnabled(this.env, "permits") };
  }

  /** A station sent work back. Its lane's streak resets and any permit there is revoked. */
  private async noteRework(item: Item, why = `PR #${item.prNumber} needed rework`): Promise<void> {
    await this.logOutcome(item.id, item.orbit?.state === "regressed" || /came back in orbit/.test(why) ? "came_back" : "rework");
    if (!item.lane) return;
    const { book, revoked } = recordRework(await this.permitBook(), item.lane);
    await this.savePermits(book);
    const card = this.state!.move;
    if (card?.kind === "automate" && card.options[0]?.actions[0]?.args.district === item.lane) await this.publishGauntletMove(null);
    if (revoked) {
      const text = `${item.lane} lost its launch permit: ${why}. Its PRs wait for you again until the lane earns trust back.`;
      await this.broadcast({ type: "autonomy_unlocked", level: "advisor", district: item.lane, text });
      this.log("warn", text, item.id);
    }
  }

  /** PRs in a lane with a permit launch on their own once every station passed. Runs before any card is offered. */
  private async autoLaunchPermitted(): Promise<void> {
    if (!(await flagEnabled(this.env, "permits"))) return;
    const book = await this.permitBook();
    for (const item of this.state?.items.filter((i) => mayAutoLaunch(book, i)) ?? []) {
      if ((await this.ctx.storage.get<string>(`autoLaunchFailed:${item.id}`)) === item.inspection?.headSha) continue;
      await this.launch(item, "autonomy", item.inspection?.headSha);
    }
  }

  /** A lane with a clean streak gets its permit card, when nothing else is waiting on the player. */
  private async offerPermitMove(): Promise<void> {
    if (!(await flagEnabled(this.env, "permits"))) return;
    const s = this.state;
    if (!s) return;
    const ready = permitReady(await this.permitBook());
    if (ready) await this.publishGauntletMove(await this.advisePermit(permitMove(ready), ready.lane, ready.streak));
  }

  private async grantPermit(lane: string, permit: boolean, by: "card" | "toggle"): Promise<void> {
    if (permit && !(await flagEnabled(this.env, "permits"))) return;
    const book = await this.permitBook();
    const r = book.lanes[lane];
    if (!r || r.permit === permit) return;
    if (permit && !earned(r)) { this.log("info", `${lane} hasn't earned a launch permit yet.`); return; }
    await this.savePermits(setPermit(book, lane, permit));
    const text = permit ? `${lane} has a launch permit. Its PRs that pass every station now ship on their own.` : `${lane} launch permit is off. Its PRs wait for you again.`;
    await this.broadcast({ type: "autonomy_unlocked", level: "advisor", district: lane, text });
    this.broadcast({ type: "log", level: "success", text, at: Date.now(), actor: "player", tool: "set_autonomy", approvedBy: "player", reason: by === "card" ? "You said yes on the permit card." : "You changed it in settings." });
  }

  // ---------- autonomy levels (src/levels.ts), behind the "autonomy" flag ----------

  /** The next level, once it's earned and not snoozed, becomes a card. */
  private async offerLevelMove(): Promise<void> {
    if (!(await flagEnabled(this.env, "autonomy"))) return;
    const book = await this.permitBook();
    const level = levelReady(book);
    if (level) await this.publishGauntletMove(levelMove(book, level));
  }

  /** Handles the level card. Returns false for every other move. */
  private async chooseLevelMove(moveId: string, optionId: string): Promise<boolean> {
    const move = this.state!.move;
    const level = move?.options[0]?.actions[0]?.args.level;
    if (!move || move.id !== moveId || move.kind !== "automate" || typeof level !== "string") return false;
    await this.publishGauntletMove(null);
    if (optionId !== "allow") { await this.accountPut("permits", snoozeLevel(await this.permitBook())); return true; }
    if (!(await flagEnabled(this.env, "autonomy"))) return true;
    const book = grantLevel(await this.permitBook(), level as AutonomyLevel);
    if (!book) { this.log("info", `${LEVEL_NAME[level as AutonomyLevel] ?? level} isn't earned yet.`); return true; }
    await this.savePermits(book);
    const text = `${LEVEL_NAME[level as AutonomyLevel]} unlocked. The planner does more on its own now. Merging still needs you or a lane's permit.`;
    await this.broadcast({ type: "autonomy_unlocked", level: level as AutonomyLevel, text });
    this.broadcast({ type: "log", level: "success", text, at: Date.now(), actor: "player", tool: "set_autonomy", approvedBy: "player", reason: "You said yes on the autonomy card." });
    return true;
  }

  /**
   * At Floor and above, the planner answers the cards its level covers (src/levels.ts levelTap) through the same
   * handlers a player's tap uses, so every job, head and scar check still applies. One card per tick, logged with
   * approvedBy "autonomy". Nothing here can merge: request_merge is never on the list.
   */
  private async runLevel(): Promise<void> {
    if (!(await flagEnabled(this.env, "autonomy"))) return;
    const level = ladderOf(await this.permitBook()).level;
    if (level === "advisor") return;
    await this.decisionData();
    const s = this.state!;
    for (const card of [...this.openMoves!]) {
      const tap = levelTap(card, level);
      if (!tap) continue;
      const label = card.options.find(o => o.id === tap.optionId)?.label ?? tap.optionId;
      s.move = card;
      const before = JSON.stringify(await this.runnerJobs());
      const handled = await this.choosePermitMove(card.id, tap.optionId) || await this.chooseGauntletMove(card.id, tap.optionId);
      if (!handled) await this.chooseRunnerMove(card, tap.optionId, "autonomy");
      const consumed = !this.openMoves!.some(m => m.id === card.id) || before !== JSON.stringify(await this.runnerJobs());
      await this.refreshDecisions();
      if (!consumed) continue;
      this.broadcast({ type: "log", level: "info", text: `${card.title}: ${label}`, at: Date.now(), itemId: card.itemId, actor: "spark", tool: card.options.find(o => o.id === tap.optionId)?.actions[0]?.tool, approvedBy: "autonomy", reason: `${tap.why}. Turn it down in Make it yours.` });
      return;
    }
  }

  /**
   * docs/LEARN.md: cards the player taught the factory (3 yeses in a row on one kind) get answered on their own, through
   * the same handlers a player's tap uses. One card per tick, logged as approvedBy "autonomy". Only plans and plan
   * approvals (learn.ts learnOption): nothing here can launch or merge.
   */
  private async runLearned(): Promise<void> {
    // Nothing learned yet is the common case: answer it from the cached deck book before reading the flag.
    await this.decisionData();
    const s = this.state!, book = this.deckBook!;
    if (!Object.keys(book.auto ?? {}).length || !(await flagEnabled(this.env, "learn"))) return;
    // The autonomy kill switch stops this too: an explicit global "false" means nothing runs on its own.
    if (await flagOptedOut(this.env, "autonomy")) return;
    for (const card of [...this.openMoves!]) {
      const optionId = learnOption(card);
      const scope = learnScope(card, moveScope(card, s), await this.runnerJobs());
      if (scope === null) continue;
      const key = learnKey(card, scope);
      if (!optionId || !isLearned(book, key) || suppressed(book, card)) continue;
      // The player who taught it decides: their own opt-out of learning or autonomy stops it.
      const by = book.auto![key].by;
      if (!by || !(await flagEnabled(this.env, "learn", by)) || await flagOptedOut(this.env, "autonomy", by)) continue;
      const jobs = await this.runnerJobs();
      // Rework, base refreshes and anything with a PR or a scar always wait for a fresh yes (#170).
      if (!freshWork(card, s.items.find(i => i.id === card.itemId), jobs)) continue;
      const label = card.options.find(o => o.id === optionId)?.label ?? optionId;
      s.move = card;
      const before = JSON.stringify(jobs);
      await this.chooseRunnerMove(card, optionId, "autonomy");
      const after = await this.runnerJobs();
      const consumed = !this.openMoves!.some(m => m.id === card.id) || before !== JSON.stringify(after);
      // Only count it as done when the handler actually approved or started the plan. A stale or refused plan
      // is the handler's to report; it is never logged as something the factory did.
      const done = after.some(j => j.itemId === card.itemId && (j.approvalMoveId === card.id ? j.status === "ready" && j.approvedBy === "autonomy" : !jobs.some(k => k.id === j.id)));
      if (consumed && done) {
        noteAutoRun(book, card.itemId, key);
        await this.logTap(card, "auto", optionId);
        await this.accountPut("deckBook", book);
      }
      await this.refreshDecisions();
      if (!consumed) continue;
      if (!done) return;
      this.broadcast({ type: "log", level: "info", text: `${card.title}: ${label}`, at: Date.now(), itemId: card.itemId, actor: "spark", tool: card.options.find(o => o.id === optionId)?.actions[0]?.tool, approvedBy: "autonomy", reason: "You taught it this one. Turn it off in Make it yours." });
      return;
    }
  }

  /** The player wants to be asked again for this kind of card. */
  private async unlearn(key: string): Promise<void> {
    await this.decisionData();
    if (!(key === "*" ? forgetAll(this.deckBook!) : forget(this.deckBook!, key))) return;
    await this.accountPut("deckBook", this.deckBook);
    this.log("info", "Got it. The factory asks you about these again.");
    await this.refreshDecisions();
  }

  /** The player turned the factory's level down. Going up only happens on the card. */
  private async setLevel(level: AutonomyLevel): Promise<void> {
    const book = lowerLevel(await this.permitBook(), level);
    if (!book) return;
    await this.savePermits(book);
    const text = `Autonomy is ${LEVEL_NAME[level]} now. The planner asks first for anything above it.`;
    this.broadcast({ type: "log", level: "info", text, at: Date.now(), actor: "player", tool: "set_autonomy", approvedBy: "player", reason: "You changed it in settings." });
  }

  /** Orbit watch caught an escaped defect: the factory drops back to Advisor and the clean count starts over. */
  private async escapedDefect(item: Item): Promise<void> {
    const { book, dropped } = escape(await this.permitBook());
    await this.savePermits(book);
    if (!dropped || !(await flagEnabled(this.env, "autonomy"))) return;
    const card = this.state!.move;
    if (card?.kind === "automate" && card.options[0]?.actions[0]?.args.level) await this.publishGauntletMove(null);
    const text = `An escaped defect dropped autonomy from ${LEVEL_NAME[dropped]} to Advisor. Every card waits for you until the factory ships clean again.`;
    await this.broadcast({ type: "autonomy_unlocked", level: "advisor", text });
    this.log("warn", text, item.id);
  }

  /** Handles the permit card. Returns false for every other move. */
  private async choosePermitMove(moveId: string, optionId: string): Promise<boolean> {
    const move = this.state!.move;
    if (!move || move.id !== moveId || move.kind !== "automate") return false;
    const lane = move.options[0]?.actions[0]?.args.district;
    if (typeof lane !== "string") return false;
    await this.publishGauntletMove(null);
    if (optionId === "allow") await this.grantPermit(lane, true, "card");
    else await this.accountPut("permits", snooze(await this.permitBook(), lane));
    return true;
  }

  // ---------- research (shared/src/research.ts) ----------

  /** Spends science packs on a tech. Its station drops onto the line right after CI and runs on every PR from now on. */
  private async research(tech: string, by: "tree" | "card"): Promise<void> {
    if (!(await flagEnabled(this.env, "research"))) return;
    const s = this.state!;
    const blocked = researchBlocked(s, tech);
    if (blocked) { this.log("info", blocked); return; }
    const t = techById(tech)!;
    const r = s.research ?? emptyResearch();
    const line = insertCheck(s, tech);
    const done = { done: [...r.done, tech], spent: r.spent + t.cost };
    const research = { ...done, suggest: suggestResearch({ ...s, research: done }) };
    await this.patch({ machines: line.machines, belts: line.belts, removed: line.removed.map((id) => ({ kind: "belt" as const, id })), research });
    this.broadcast({ type: "log", level: "success", text: `Researched: ${t.name}. It now checks every PR right after CI.`, at: Date.now(), actor: "player", tool: "research", approvedBy: "player", reason: by === "card" ? "You said yes on the research card." : `You spent ${t.cost} science packs in the research tree.` });
  }

  /** Repeated scars point at a tech: keep the tree's pick current, and offer it as a card once it's affordable. */
  private async offerResearchMove(): Promise<void> {
    if (!(await flagEnabled(this.env, "research"))) return;
    const s = this.state;
    if (!s) return;
    const suggest = await this.sparkResearch(suggestResearch(s));
    if (JSON.stringify(suggest) !== JSON.stringify(s.research?.suggest)) await this.patch({ research: { ...(s.research ?? emptyResearch()), suggest } });
    if (!suggest || researchBlocked(s, suggest.tech)) return;
    const offered = (await this.ctx.storage.get<string[]>("researchOffered")) ?? [];
    if (offered.includes(suggest.tech)) return; // one card per tech; the tree keeps the pick after that
    await this.accountPut("researchOffered", [...offered, suggest.tech]);
    await this.publishGauntletMove(researchMove(suggest.tech, suggest.why));
  }

  /**
   * The streak rule says a lane earned its permit card. Spark reads what actually shipped there and picks which
   * option the card suggests. It can only advise: the player still taps, and one rework still revokes it.
   */
  private async advisePermit(move: Move, lane: string, streak: number): Promise<Move> {
    const s = this.state!;
    const inLane = s.items.filter(i => i.lane === lane);
    const title = `Launch permit for ${lane === "docs" ? "docs" : `/${lane}`}`;
    if (!sparkConfigured(this.env)) {
      await this.note({ decision: "permit", by: "fallback", ms: 0, title, outcome: "Suggested Allow", reason: `${streak} clean ships in a row met the streak rule.`, model: "streak rule" });
      return move;
    }
    try {
      const a = await this.think("permit", { title, target: "gate-1" }, () => judgePermit(this.sparkEnv(), {
        lane, streak, need: streak,
        ships: inLane.filter(i => i.state === "launched").sort((x, y) => y.updatedAt - x.updatedAt).slice(0, streak).map(i => ({ title: i.title.slice(0, 120), review: i.inspection?.stages.find(st => st.gate === "ai")?.reason })),
        openRisks: inLane.filter(i => i.state !== "launched").slice(0, 10).map(i => ({ title: i.title.slice(0, 120), state: i.state })),
      }), a => ({ outcome: a.recommend ? "Suggested Allow" : "Suggested Not yet", reason: a.why || (a.recommend ? "The streak looks representative." : "Not enough real risk shipped yet.") }));
      return { ...move, why: a.why || move.why, options: move.options.map(o => ({ ...o, recommended: o.id === (a.recommend ? "allow" : "not_yet") })) };
    } catch {
      return move;
    }
  }

  /**
   * Spark reads the whole scar pile and picks the check worth researching. The tree's regex pick is the fallback,
   * and Spark is only asked when the scar pile changes.
   */
  private async sparkResearch(rule: ReturnType<typeof suggestResearch>): Promise<ReturnType<typeof suggestResearch>> {
    const s = this.state!;
    const scars = s.items.flatMap(i => (i.scars ?? []).filter(sc => sc.station !== "custom").map(sc => ({ station: sc.station, reason: sc.reason.slice(0, 200) })));
    if (scars.length < 2) return rule;
    const key = `${scars.length}:${(s.research?.done ?? []).join(",")}`;
    const cached = await this.ctx.storage.get<{ key: string; pick: ReturnType<typeof suggestResearch> | null }>("sparkResearch");
    if (cached?.key === key) return cached.pick ?? undefined;
    if (!sparkConfigured(this.env)) {
      await this.note({ decision: "research", by: "fallback", ms: 0, title: `${scars.length} scars`, outcome: rule ? `Suggested ${techById(rule.tech)?.name}` : "Nothing to research yet", reason: "No Meta API key, so the tree matched scar text to checks.", model: "scar rule" });
      await this.accountPut("sparkResearch", { key, pick: rule ?? null });
      return rule;
    }
    const r = s.research ?? emptyResearch();
    const techs = TECHS.filter(t => !r.done.includes(t.id) && !t.soon).map(t => ({ id: t.id, name: t.name, what: t.what, cost: t.cost, affordable: !researchBlocked(s, t.id) }));
    try {
      const pick = await this.think("research", { title: `${scars.length} scars on the rework belt`, target: "ci-1" }, () => pickResearch(this.sparkEnv(), { scars: scars.slice(-40), techs }),
        p => ({ outcome: p.tech ? `Suggested ${techById(p.tech)?.name}` : "Nothing worth researching yet", reason: p.why || "No check fits the scars." }));
      const out = pick.tech ? { tech: pick.tech, why: pick.why || rule?.why || `${techById(pick.tech)?.name} would have caught these.` } : undefined;
      await this.accountPut("sparkResearch", { key, pick: out ?? null });
      return out;
    } catch {
      await this.accountPut("sparkResearch", { key, pick: rule ?? null });
      return rule;
    }
  }

  /** Handles the research card. Returns false for every other move. */
  private async chooseResearchMove(moveId: string, optionId: string): Promise<boolean> {
    const move = this.state!.move;
    const action = move?.options[0]?.actions[0];
    if (!move || move.id !== moveId || action?.tool !== "research" || typeof action.args.tech !== "string") return false;
    await this.publishGauntletMove(null);
    if (optionId === "research") await this.research(action.args.tech, "card");
    return true;
  }

  // ---------- player goals (shared/src/goals.ts) ----------

  /**
   * After the first rocket, guess what the player wants from the README and their taps, keep the guess on the state
   * so the brain can weigh by it, and ask once on one card. A player pick ends it; Later parks it like any card.
   */
  private async offerGoalMove(revisit = false): Promise<void> {
    const s = this.state;
    if (!s || !this.meta || (!revisit && s.goals?.by === "player") || (s.metrics?.rockets ?? 0) < 1) return;
    await this.decisionData();
    if (this.openMoves!.some(m => m.id === GOAL_MOVE_ID)) return;
    const guesses = await this.guessGoals();
    const top = guesses[0];
    if (top && s.goals?.by !== "player" && s.goals?.picks[0] !== top.id) await this.patch({ goals: { picks: guesses.slice(0, 3).map(g => g.id), by: "inferred", at: Date.now(), why: top.why }, goal: goalText({ picks: guesses.slice(0, 3).map(g => g.id), by: "inferred", at: Date.now() }) });
    const move = goalMove(s, revisit ? undefined : s.goals, guesses, Date.now());
    // Dropped cards come back no sooner than three days later, so a "not now" never turns into a nag.
    const offeredAt = await this.ctx.storage.get<number>("goalOfferedAt") ?? 0;
    if (!move || (!revisit && Date.now() - offeredAt < 3 * 86400000)) return;
    await this.accountPut("goalOfferedAt", Date.now());
    await this.publishGauntletMove(move);
  }

  /** README words + Continue taps + plugged-in sources, then Spark reorders. Cached until the taps or README change. */
  private async guessGoals(): Promise<GoalGuess[]> {
    const s = this.state!;
    let readme = await this.ctx.storage.get<string>("goalReadme");
    if (readme === undefined) {
      readme = "";
      try { readme = await fileContent(await installationToken(this.env, this.meta!.installationId), this.meta!.repo, "README.md", s.baseBranch) ?? ""; } catch { /* no README is fine */ }
      await this.accountPut("goalReadme", readme.slice(0, 12000));
    }
    const yes: Record<string, number> = {};
    for (const [key, n] of Object.entries(this.deckBook!.yes ?? {})) { const kind = key.split("|")[0]; yes[kind] = (yes[kind] ?? 0) + n; }
    const sources = (s.sources ?? []).filter(x => x.state === "connected").map(x => x.kind);
    const rule = inferGoals({ readme, yes, sources, rockets: s.metrics?.rockets });
    const key = JSON.stringify([readme.length, yes, sources]);
    const cached = await this.ctx.storage.get<{ key: string; guesses: GoalGuess[] }>("goalGuess");
    if (cached?.key === key) return cached.guesses;
    let guesses = rule;
    if (!sparkConfigured(this.env)) {
      await this.note({ decision: "goal", by: "fallback", ms: 0, title: "What the player wants", outcome: `Guessed ${GOALS[rule[0].id].label}`, reason: "No Meta API key, so README words and your taps made the guess.", model: "goal rule" });
    } else {
      try {
        guesses = await this.think("goal", { title: "What the player wants", target: "factory" }, () => readGoals(this.sparkEnv(), { readme, guesses: rule, goals: GOAL_IDS.map(id => ({ id, label: GOALS[id].label })) }),
          g => ({ outcome: `Guessed ${GOALS[g[0].id].label}`, reason: g[0].why || "Read the README and your past calls." }));
      } catch { guesses = rule; }
    }
    await this.accountPut("goalGuess", { key, guesses });
    return guesses;
  }

  /**
   * The goal card, and the brain's set_a_goal / revisit_goal unlocks, whose Continue carries `ask_goal`: that deals
   * the goal card right away. Returns false for every other move.
   */
  private async chooseGoalMove(moveId: string, optionId: string): Promise<boolean> {
    const move = this.state!.move;
    const asks = move?.id === moveId && move.options.find(o => o.id === optionId)?.actions[0]?.tool === "ask_goal";
    if (asks) {
      await this.publishGauntletMove(null);
      await this.offerGoalMove(true);
      return true;
    }
    if (!move || move.id !== moveId || moveId !== GOAL_MOVE_ID) return false;
    const option = move.options.find(o => o.id === optionId);
    await this.publishGauntletMove(null);
    const goals = goalsFromPick(option?.actions[0]?.args.picks, Date.now(), this.state!.metrics?.rockets);
    if (goals) await this.setGoals(goals, "card");
    return true;
  }

  private async setGoals(goals: Goals, by: "card" | "menu"): Promise<void> {
    await this.decisionData();
    this.openMoves = this.openMoves!.filter(m => m.id !== GOAL_MOVE_ID);
    await this.patch({ goals, goal: goalText(goals) });
    const text = `Goal set: ${goals.picks.map(id => GOALS[id].label).join(", ")}. The factory hunts for what blocks it.`;
    this.broadcast({ type: "log", level: "success", text, at: Date.now(), actor: "player", tool: "set_goals", approvedBy: "player", reason: by === "card" ? "You picked it on the goal card." : "You changed it in Make it yours." });
    await this.refreshDecisions();
  }

  // ---------- websockets (browsers) ----------

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("origin") !== new URL(request.url).origin) return new Response("invalid origin", { status: 403 });
    const env = this.env as FactoryEnv & { TEST_USERS?: string; FIXTURE_INSTANCE?: string };
    const timing = env.PUBLIC_URL === "https://shiptorio.dev" && env.TEST_USERS === "on" && env.FIXTURE_INSTANCE === "shiptorio-fixture" ? new PrivateSocketTiming() : undefined;
    const auth = await measureSocket(timing, "do_auth", () => browserSocketAuth(request, timing ? { ...this.env, [PRIVATE_SOCKET_TIMING]: timing } as FactoryEnv : this.env));
    const response = await inTrace({ requestId: request.headers.get("X-Request-ID") ?? crypto.randomUUID(), userId: auth?.userId === undefined ? undefined : accountIdentity(auth.userId) }, this.env, task => this.ctx.waitUntil(task), () => this.#socketFetch(request, auth, timing));
    return timing && auth?.user && auth.user.id < 0 ? timingResponse(response, timing) : response;
  }

  async #socketFetch(request: Request, auth: BrowserSocketAuth | null, timing?: PrivateSocketTiming): Promise<Response> {

    if (request.headers.get("upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const user = auth?.user;
    if (!auth || !user) return new Response("login required", { status: 401 });
    const match = new URL(request.url).pathname.match(/^\/api\/repos\/([^/]+)\/([^/]+)\/factory$/);
    const repo = match ? `${match[1]}/${match[2]}`.toLowerCase() : "";
    await measureSocket(timing, "do_load", () => this.load());
    const adminView = await measureSocket(timing, "do_admin_view", () => readAdminView(this.env,request));
    if (viewCookieValue(request.headers.get("cookie")) && !adminView) return new Response("Admin view expired",{status:403});
    if (!validRepo(repo) || repo !== this.meta?.repo.toLowerCase() || !(adminView?.repo === repo) && !await measureSocket(timing, "do_repo_access", () => repoAccess(timing ? { ...this.env, [PRIVATE_SOCKET_TIMING]: timing } as FactoryEnv : this.env, user, repo))) return new Response("repository access denied", { status: 403 });
    Object.assign(auth, { repo, user, ...(adminView ? {adminView:adminView.idHash} : {}) });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, ["web"]);
    server.serializeAttachment(auth);
    const state = await measureSocket(timing, "do_load", () => this.load());

    if (!browserSocketAllowed(auth, this.env, this.socketEpoch)) { server.close(1008, "Sign in again"); }
    else if (state) {
      // Derived on reconnect from durable jobs, rather than a stored/optimistic step counter.
      const [jobs, presence] = await measureSocket(timing, "do_projection", () => Promise.all([this.runnerJobs(), this.ctx.storage.get<{ harnesses: string[]; seenAt: number }>("runnerPresence")]));
      const pipeline = projectPipeline(state, jobs, !!presence?.harnesses.length && Date.now() - presence.seenAt < 20000);
      const redact = () => this.redactor.value(structuredClone({ type: "snapshot", state: { ...state, pipeline, liveBottleneck: projectLiveBottleneck(state, jobs, Date.now()) } } satisfies ServerToWeb));
      const snapshot = timing ? timing.sync("do_redaction", redact) : redact();
      const frame = await measureSocket(timing, "do_frame", () => this.browserFrames.frame(snapshot, false));
      if (timing) timing.sync("do_send", () => server.send(frame));
      else server.send(frame);
    }
    else server.send(JSON.stringify({ type: "log", level: "warn", text: "No factory yet. Is the GitHub App installed on this repo?", at: Date.now() }));
    // Restoring the map must not wait for a new planner turn (or provider latency).
    if (!adminView && state) this.ctx.waitUntil((async () => {
      if (!(await this.githubStopped())) { await this.decisionData(); beginCheckin(this.deckBook!); await this.refreshDecisions(); }
    })());
    // The initial snapshot was authorized above. Other sockets may still be
    // revalidating queued frames; they must not hold this handshake open.
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let auth: { login?: string; userId?: number } | null = null;
    try { auth = ws.deserializeAttachment(); } catch { /* Legacy socket; validation below closes it. */ }
    return inTrace({ requestId: crypto.randomUUID(), userId: auth?.userId === undefined ? undefined : accountIdentity(auth.userId), repo: this.meta?.repo }, this.env, task => this.ctx.waitUntil(task), async () => {
      this.activeBrowserMoves++;
      try { await this.handleBrowserMessage(ws, raw); } catch (error) { report(error, "factory.websocket_failed"); throw error; } finally { this.activeBrowserMoves--; await this.broadcastQueue; }
    });
  }

  private async handleBrowserMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {

    this.socketEpoch = await browserSocketEpoch(this.env);
    let auth: unknown;
    try { auth = ws.deserializeAttachment(); } catch { /* Old sockets have no authenticated attachment. */ }
    if (!browserSocketAllowed(auth, this.env, this.socketEpoch)) { ws.close(1008, "Sign in again"); return; }
    if (typeof raw !== "string" || browserHeartbeat(ws, raw)) return;
    if (raw.length > 16384) return;
    for (const subject of [`user:${auth.userId ?? auth.login.toLowerCase()}`, auth.rateSubject ?? "ip:unknown"]) {
      if (!(await rateLimit(this.env, subject, "move")).allowed) { ws.close(1008, "Too many actions; retry later"); return; }
    }
    if (await this.githubStopped()) { ws.close(1008, "GitHub access changed"); return; }
    if (await authorizationRevoked(this.env.DB, auth.login, auth.issuedAt ?? 0)) { ws.close(1008, "GitHub authorization revoked"); return; }
    await this.load();
    const repo = this.meta?.repo ?? this.state?.repo;
    const viewId=(auth as {adminView?:string}).adminView;
    const view=viewId && auth.user ? await activeAdminView(this.env,viewId,auth.user.id,auth.user.sessionHash,repo) : null;
    if(viewId && !view?.writable) { ws.send(JSON.stringify({type:'log',level:'warn',text:'Viewing as player is read-only. Enable write mode in God controls.',at:Date.now()}));return; }
    if (!repo || (auth as { repo?: string }).repo !== repo.toLowerCase() || !auth.user || !view?.writable && !await repoAccess(this.env, auth.user, repo, "write")) { ws.close(1008, "Repository write access required"); return; }

    let value: unknown;
    try { value = JSON.parse(raw); } catch { return; }
    if (value && typeof value === "object" && "repo" in value && (value as { repo: unknown }).repo !== repo) { ws.close(1008, "Repository mismatch"); return; }
    const parsed = WebToServer.safeParse(value);
    if (!parsed.success || !(await this.load())) return;
    const msg = parsed.data;
    if(view) await auditAdmin(this.env.DB,auth.login,'view-write',repo,view.login,{message:msg.type});
    const trace = currentTrace();
    if (trace) { trace.repo = this.meta?.repo; if ("itemId" in msg && typeof msg.itemId === "string") trace.itemId = msg.itemId; }
    if (this.meta?.repo) Sentry.setTag("repo", this.meta.repo);
    if (trace?.itemId) Sentry.setTag("itemId", trace.itemId);
    if (msg.type === "research" && !(await flagEnabled(this.env, "research", auth.login))) return;
    if (msg.type === "set_autonomy" && msg.permit && !(await flagEnabled(this.env, "permits", auth.login))) return;
    const s = this.state!;
    if (msg.type === "undo") { await this.undoDecision(msg.actionId); return; }
    if (msg.type === "unlearn") { await this.unlearn(msg.key); return; }
    if (msg.type === "brain_look") { await this.brainLook(); return; }
    if (msg.type === "choose_move" || msg.type === "defer_move" || msg.type === "dismiss_move") {
      await this.decisionData();
      const card = (s.deck ?? (s.move ? [s.move] : [])).find(m => m.id === msg.moveId);
      if (!card) return; // stale or forged card ids never execute
      const original = card.id.endsWith(":deferred") ? this.openMoves!.find(m => `${m.id}:deferred` === card.id) ?? Object.values(this.deckBook!.decisions).find(d => `${d.move.id}:deferred` === card.id)?.move : card;
      if (!original) return;
      if (msg.type === "defer_move") {
        const apply = async () => {
          const current = (s.deck ?? (s.move ? [s.move] : [])).find(m => m.id === msg.moveId);
          if (!current) return;
          const intent = msg.intentId ? {id: msg.intentId, userId: auth.user!.id, scope: await issueRevision(original.id, JSON.stringify([original.plan, original.locked, original.options]))} : undefined;
          if (!intent || !hasDeferReceipt(this.deckBook!, original, intent)) await this.logTap(current, "later");
          await this.swipe(original, "defer", intent);
        };
        if (msg.intentId) await this.ctx.blockConcurrencyWhile(apply); else await apply();
        return;
      }
      if (msg.type === "dismiss_move") { await this.logTap(card, "never", undefined, msg.why); await this.swipe(original, msg.why); return; }
      const option = card.options.find(o => o.id === msg.optionId);
      if (!option) return;
      if (card.id.endsWith(":deferred")) {
        await this.logTap(card, msg.optionId === "keep-later" ? "later" : "never", msg.optionId, msg.optionId === "never-kind" ? "kind" : msg.optionId === "decide-class" ? "spark" : undefined);
        await this.swipe(original, msg.optionId === "never-kind" ? "kind" : msg.optionId === "decide-class" ? "spark" : "defer"); return;
      }
      // Existing handlers validate their own job/revision/head. Select any visible deck card temporarily.
      await this.logTap(card, option.recommended ? "continue" : "other", option.id);
      s.move = card;
      const action = option.actions[0];
      if (action?.tool === "approve_runner_job") log("info", "factory.runner_approval_received", { itemId: card.itemId });
      if (action?.tool === "research" && !(await flagEnabled(this.env, "research", auth.login))) return;
      if (card.kind === "automate" && msg.optionId === "allow" && !(await flagEnabled(this.env, "permits", auth.login))) return;
      if (action?.tool === "run_missing_check") {
        await this.scheduleTick(); this.log("info", "The missing check is queued. Merging still waits for proof.");
      } else if (action?.tool === "inspect_bottleneck") {
        this.log("info", s.bottleneck?.summary ?? "The factory is waiting for its next input.");
      } else if (card.locked && (option.id === "launch" || action?.tool === "request_merge")) {
        this.log("warn", "Run the missing checks before launching.");
      } else {
        const jobsBefore = await this.runnerJobs(), before = JSON.stringify(jobsBefore);
        // docs/LEARN.md: only first-time work counts toward teaching the factory; judged before the tap changes it.
        const fresh = freshWork(card, s.items.find(i => i.id === card.itemId), jobsBefore);
        const handled = await this.chooseBrainMove(card, option) || await this.chooseSupportMove(card, option, (tool, ticketId, draftHash) => tool === "send_customer_reply" ? playerTap(ticketId, draftHash, playerLogin(auth)) : null) || await this.chooseResearchMove(msg.moveId, msg.optionId) || await this.chooseGoalMove(msg.moveId, msg.optionId) || await this.chooseLevelMove(msg.moveId, msg.optionId) || await this.choosePermitMove(msg.moveId, msg.optionId) || await this.chooseGauntletMove(msg.moveId, msg.optionId);
        const runnerConsumed = handled ? false : await this.chooseRunnerMove(card, msg.optionId);
        // Only the invocation that committed a runner transition may teach approval.
        // Another socket can observe that transition too; observation is not a second tap.
        const consumed = handled ? !this.openMoves!.some(m => m.id === card.id) || before !== JSON.stringify(await this.runnerJobs()) : runnerConsumed;
        if (!consumed && action?.tool === "approve_runner_job") log("warn", "factory.runner_approval_not_applied", { itemId: card.itemId, handledElsewhere: handled });
        if (consumed && option.recommended) {
          await this.recordApproval(card.kind ?? "unblock", moveScope(card, s));
          noteYes(this.deckBook!, card.kind ?? "unblock", moveScope(card, s));
          if (await flagEnabled(this.env, "learn", playerLogin(auth)) && learnFromYes(this.deckBook!, card, learnScope(card, moveScope(card, s), jobsBefore), Date.now(), fresh, playerLogin(auth)))
            this.broadcast({ type: "log", level: "success", text: "Learned. The factory does these on its own now.", at: Date.now(), itemId: card.itemId, actor: "player", reason: "You said yes 3 times in a row. Turn it off in Make it yours." });
          await this.accountPut("deckBook", this.deckBook);
        } else if (consumed && learnOption(card)) {
          // Edit: the player changed the suggestion, so the streak starts over.
          resetLearn(this.deckBook!, card.kind ?? "unblock", learnScope(card, moveScope(card, s), jobsBefore));
          await this.accountPut("deckBook", this.deckBook);
        }
      }
      await this.refreshDecisions(); return;
    }
    const inventory = inventoryCommand(s, msg, () => crypto.randomUUID().slice(0, 6));
    if (inventory.handled) {
      if (inventory.stop) return;
      if (inventory.patch) await this.patch(inventory.patch);
    } else switch (msg.type) {
      case "send_reply":
        await this.sendSupportReply(playerTap(msg.ticketId, msg.draftHash, playerLogin(auth)));
        await this.refreshDecisions();
        break;
      case "edit_reply":
        await this.editSupportReply(msg.ticketId, msg.text);
        break;
      case "file_issue":
        await this.fileSupportIssue(msg.ticketId);
        break;
      case "close_ticket":
        await this.closeTicket(msg.ticketId);
        break;
      case "set_goal":
        await this.patch({ goal: msg.text });
        break;
      case "set_goals": {
        const goals = goalsFromPick(msg.picks, Date.now(), s.metrics?.rockets);
        if (goals) await this.setGoals(goals, "menu");
        break;
      }
      case "research":
        await this.research(msg.tech, "tree");
        break;
      case "set_autonomy":
        if (msg.district && msg.permit !== undefined) await this.grantPermit(msg.district, msg.permit, "toggle");
        else if (msg.level) await this.setLevel(msg.level);
        break;
      case "connect_source": {
        if (msg.kind === "github") {
          await this.ctx.storage.delete("githubDisabled");
          const source = githubStatus(this.env);
          await this.patch({ sources: [...(s.sources ?? []).filter((entry) => entry.kind !== "github"), source] });
          this.log("info", source.setup.steps.join(" "));
        } else if (msg.kind === "sentry" || msg.kind === "posthog") {
          await this.connectMine(msg.kind);
        } else if (msg.kind === "email") {
          await this.connectSupport();
        } else {
          const source = { kind: msg.kind, state: "needs_action" as const, detail: "Connector setup is not implemented yet.", eventsToday: 0, setup: { steps: ["GitHub is the first source checkpoint. This connector follows the verified shipping loop."] } };
          await this.patch({ sources: [...(s.sources ?? []).filter((entry) => entry.kind !== msg.kind), source] });
          this.log("info", source.detail);
        }
        break;
      }
      case "disconnect_source": {
        if (msg.kind === "github") await this.disconnectGitHub();
        else if (msg.kind === "sentry" || msg.kind === "posthog") await this.disconnectMine(msg.kind);
        else if (msg.kind === "email") await this.disconnectSupport();
        else await this.patch({ sources: (s.sources ?? []).map((source) => source.kind === msg.kind ? { ...source, state: "not_connected", detail: "Disconnected" } : source) });
        break;
      }
      case "route_item": {
        const item = s.items.find((i) => i.id === msg.itemId);
        const m = s.machines.find((x) => x.id === msg.machineId);
        if (item && m?.type === "assembler" && (item.state === "ore" || item.state === "queued")) {
          await this.patch({ items: [{ ...item, state: "queued", machineId: m.id, updatedAt: Date.now() }] });
          await this.scheduleTick();
        }
        break;
      }
      case "set_priority": {
        // A cart's callout: Rush goes to the front of the line, Park sets it aside until Unpark (shared/src/priority.ts).
        const item = s.items.find((i) => i.id === msg.itemId);
        if (!item || !canSetPriority(item, msg.priority)) break;
        await this.patch({ items: [{ ...withPriority(item, msg.priority), updatedAt: Date.now() }] });
        this.log("info", msg.priority === "rush" ? `Rushed "${item.title}" to the front of the line` : msg.priority === "park" ? `Parked "${item.title}"` : `Unparked "${item.title}"`, item.id);
        break;
      }
      case "launch_pr": {
        // A human merge launches the rocket; this just points the player at the PR.
        const item = s.items.find((i) => i.id === msg.itemId);
        if (item?.prUrl) this.log("info", `Merge ${item.prUrl} to launch.`, item.id);
        break;
      }
    }
    await this.scheduleTick();
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close([1005, 1006, 1015].includes(code) ? 1000 : code, "bye");
  }

  private async guard(operation: string, run: () => Promise<unknown>): Promise<void> {
    try { await run(); } catch (error) { await this.reliabilityFailure(operation, error); }
  }

  /**
   * GitHub-bound tick work rests until a cooldown passes. Retrying every 2s tick kept a short-term limit alive and
   * re-raised it with a fresh deadline each time, so nothing moved for as long as anyone watched.
   */
  private githubRestUntil = 0;
  private async githubGuard(operation: string, run: () => Promise<unknown>): Promise<void> {
    if (Date.now() < this.githubRestUntil) return;
    try { await run(); } catch (error) {
      if (error instanceof RateLimitError) { this.githubRest(error.retryAt); return; }
      await this.reliabilityFailure(operation, error);
    }
  }
  private githubRest(retryAt: number) {
    if (retryAt <= this.githubRestUntil) return;
    if (this.githubRestUntil < Date.now()) this.log("warn", `GitHub is busy. The factory waits until ${new Date(retryAt).toISOString().slice(11, 19)} UTC before asking again.`);
    this.githubRestUntil = retryAt;
  }

  private async reliabilityFailure(operation: string, error: unknown, itemId?: string): Promise<void> {
    this.log("error", `${operation}: ${String(error)}`, itemId);
    await this.accountPut(`reliabilityFailure:${operation}`, { at: Date.now(), error: String(error).slice(0, 500), itemId });
    if (this.state && this.meta) await this.publishDecision({ id: `reliability:${operation}`, itemId, title: "Factory work needs attention", why: `${RELIABILITY_WORDS[operation.split(":")[0] as keyof typeof RELIABILITY_WORDS] ?? "Background work"} failed. Check the connection or worker before trying again.`, stage: "inspect", kind: "unblock", createdAt: Date.now(), options: [{ id: "later", label: "Look later", recommended: true, actions: [] }] });
  }

  private async watchdog(): Promise<void> {
    const now = Date.now();
    const presence = await this.ctx.storage.get<{ seenAt: number }>("runnerPresence");
    const runnerOnline = !!presence && now - presence.seenAt < 20000;
    for (const item of [...this.state!.items]) {
      const key = `stageClock:${item.id}`;
      let clock = await this.ctx.storage.get<{ state: string; since: number; alerted?: boolean }>(key);
      const stage = `${item.state}:${item.machineId ?? ""}`;
      if (!clock || clock.state !== stage) clock = { state: stage, since: item.updatedAt };
      if (!clock.alerted && !(item.state === "queued" && runnerOnline)) {
        const result = stuckItem(item, clock.since, now);
        if (result) {
          await this.patch({ items: [result.item] });
          await this.publishDecision(result.move);
          clock.alerted = true;
          this.log("warn", result.item.failure!, item.id);
        }
      }
      await this.accountPut(key, clock);
    }
    await pruneExpiredDeliveryMarkers(this.ctx.storage, now);
  }

  /** Repair missed webhooks without ever issuing a merge. Reuse the normal gated transitions. */
  private async reconcileGitHub(): Promise<void> {
    if (!this.meta || !this.env.GITHUB_APP_ID || !this.state) return;
    const now = Date.now();
    const due = await this.ctx.storage.get<number>("reconcileAt");
    if (due === undefined) { await this.accountPut("reconcileAt", now + 60000); return; }
    if (due > now) return;
    await this.accountPut("reconcileAt", now + 60000);
    const token = await installationToken(this.env, this.meta.installationId);
    const published = await gh<{ number: number; html_url: string; state: string; merged_at?: string | null; merge_commit_sha?: string; head: { ref: string; sha: string } }[]>(`/repos/${this.meta.repo}/pulls?state=all&sort=updated&direction=desc&per_page=100`, token);
    const jobs = await this.runnerJobs();
    for (const pr of published) {
      if (await this.ctx.storage.get(`launchCredit:${pr.number}`)) continue;
      const job = jobs.find(j => j.branch === pr.head.ref && j.status === "running") ?? jobs.find(j => j.branch === pr.head.ref && j.status === "completed");
      if (!job) continue;
      const item = this.state.items.find(i => i.id === job.itemId);
      if (!item || item.prNumber || item.orbit?.prNumber === pr.number || !["running", "completed"].includes(job.status)) continue;
      const recovered: Item = { ...item, state: "inspecting", branch: job.branch, prNumber: pr.number, prUrl: pr.html_url, inspection: freshInspection(pr.head.sha), machineId: "ci-1", updatedAt: now };
      if (job.status === "running") {
        // A discovered branch is not a supervisor receipt. Require rework/approval for lost receipts.
        const reason = "Publication recovered, but the runner receipt was lost. Verify before another launch attempt.";
        await this.patch({ items: [setStage(recovered, "verify", "rework", reason)] });
        job.status = "failed"; job.error = reason;
      } else await this.patch({ items: [recovered] });
      job.prUrl = pr.html_url; job.headSha = pr.head.sha;
      await this.accountPut(`runnerJob:${job.id}`, job);
    }
    const candidates = this.state.items.filter(i => i.prNumber && i.state !== "launched");
    // Rotate a bounded batch so one old broken PR cannot starve newer work.
    const cursor = (await this.ctx.storage.get<number>("reconcileCursor") ?? 0) % Math.max(1, candidates.length);
    const batch = [...candidates.slice(cursor), ...candidates.slice(0, cursor)].slice(0, 10);
    await this.accountPut("reconcileCursor", cursor + batch.length);
    for (const item of batch) {
      try {
        const pr = await gh<{ state: string; merged: boolean; merge_commit_sha?: string; head: { sha: string } }>(`/repos/${this.meta.repo}/pulls/${item.prNumber}`, token);
        // A confirmed merge belongs to this immutable PR number even if another
        // tick refreshed the item while GitHub replied. onPullClosed rechecks the
        // current PR and durable launch credit; only open-PR results need identity.
        if (pr.merged) { await this.onPullClosed(item.prNumber!, true, pr.merge_commit_sha); continue; }
        if (!this.state!.items.some(current => current === item && current.state !== "launched")) continue;
        if (pr.state === "closed") await this.onPullClosed(item.prNumber!, false);
        else {
          if (item.inspection && item.inspection.headSha !== pr.head.sha) await this.patch({ items: [{ ...item, lane: undefined, state: "inspecting", machineId: "ci-1", inspection: freshInspection(pr.head.sha), updatedAt: now }] });
          await this.onCheckSuite([item.prNumber!], false, "Periodic GitHub reconciliation", pr.head.sha);
        }
      } catch (error) { await this.reliabilityFailure(`reconcile:${item.id}`, error, item.id); }
    }
  }

  // ---------- the tick loop ----------

  async alarm(): Promise<void> {
    try { await this.assertAccountActive(); } catch (error) { if (this.accountErased) return; throw error; }
    if (await this.ctx.storage.get("device") || await this.ctx.storage.get("deviceRate") || await this.ctx.storage.get("join")) { await this.ctx.storage.deleteAll(); return; }
    if (await this.ctx.storage.get("migratedTo")) { await this.ctx.storage.deleteAlarm(); return; }
    const lifecycle = await this.ctx.storage.get<{ deleteAt?: number }>("githubLifecycle");
    if (lifecycle) {
      await this.ctx.storage.deleteAlarm();
      if (lifecycle.deleteAt && lifecycle.deleteAt <= Date.now()) {
        const meta = await this.ctx.storage.get<Meta>("meta");
        const repoId = await this.ctx.storage.get<number>("githubRepoId");
        const dataKey = await this.ctx.storage.get<string>("githubDataKey") ?? meta?.repo;
        let ownsName = true;
        if (meta) {
          const row = await this.env.DB.prepare("SELECT repo_id, archived_at FROM repos WHERE full_name = ?").bind(meta.repo).first<{ repo_id: number | null; archived_at: number | null }>();
          ownsName = !row || !repoId || row.repo_id === repoId;
          if (row && ownsName && row.archived_at == null) return; // reinstall RPC resumes the object
        }
        if (meta) await this.env.DB.batch([
          this.env.DB.prepare("DELETE FROM pull_requests WHERE repo = ?").bind(dataKey!),
          this.env.DB.prepare("DELETE FROM move_kind_rules WHERE repo = ?").bind(dataKey!),
          this.env.DB.prepare("DELETE FROM card_taps WHERE repo = ?").bind(dataKey!),
          ...(ownsName ? [this.env.DB.prepare("DELETE FROM repos WHERE full_name = ? AND archived_at IS NOT NULL").bind(meta.repo)] : []),
        ]);
        if (meta && dataKey?.startsWith("repo:")) await this.env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`archived:${dataKey}:installation:${meta.installationId}:repo:${meta.repo}`).run();
        if (meta && repoId) await this.env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`installation:${meta.installationId}:repo-id:${repoId}`).run();
        if (meta && ownsName) {
          for (const kind of ["sentry", "posthog"] as const) {
            if (repoId && await legacyCredentialOwner(this.env, kind, { repoId, installationId: meta.installationId, repo: meta.repo })) {
              await this.env.CACHE?.delete(`cred:${kind}:${meta.repo}`);
              await this.env.CACHE?.delete(`cred:${kind}`);
              await this.env.CACHE?.delete(`link:${kind}`);
            }
          }
          await this.env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`installation:${meta.installationId}:repo:${meta.repo}`).run();
          await this.env.DB.prepare("DELETE FROM installations WHERE id = ? AND status = 'deleted' AND NOT EXISTS (SELECT 1 FROM repos WHERE installation_id = ?)").bind(meta.installationId, meta.installationId).run();
        }
        await this.ctx.storage.deleteAll();
        this.state = null; this.meta = null; this.openMoves = null; this.deckBook = null; this.deckRules = null;
      } else if (lifecycle.deleteAt) await this.accountAlarm(lifecycle.deleteAt);
      return;
    }
    try { await this.load(); } catch (error) { if (this.accountErased) return; throw error; }
    if (this.meta) {
      const access = await reconcileFactoryGitHubAccess(this.env, this.meta, await this.ctx.storage.get<number>("githubAccessCheckedAt"));
      if (access.stopped) {
        if (access.archivedAt !== undefined) await this.archiveGitHub(access.reason, access.archivedAt);
        else await this.pauseGitHub(access.reason);
        return;
      }
      if (access.checkedAt !== undefined) await this.accountPut("githubAccessCheckedAt", access.checkedAt);
    }
    return inTrace({ requestId: crypto.randomUUID(), repo: this.meta?.repo }, this.env, task => this.ctx.waitUntil(task), async () => {
      try { await this.tick(); } catch (error) { report(error, "factory.alarm_failed"); throw error; }
    });
  }

  private async tick(): Promise<void> {

    this.batchingDecisions = true;
    try {
    await this.load();
    // Paused factories retain queued deliveries without spending provider calls.
    if (await adminPaused(this.env.DB,this.meta?.repo)) { await this.accountAlarm(Date.now()+TICK_MS); return; }
    await this.processDeliveries();
    if (await this.githubStopped()) return;
    if (!(await this.load())) return;
    await this.githubGuard("runGauntlet", () => this.runGauntletBurst());
    await this.guard("pollPostHog", () => this.pollPostHog());
    await this.guard("tickSupport", () => this.tickSupport());
    await this.githubGuard("retryReviewComments", () => this.retryReviewComments());
    await this.guard("planRunnerJobs", () => this.planRunnerJobs());
    await this.githubGuard("reconcileGitHub", () => this.reconcileGitHub());
    await this.guard("reconnectMines", () => this.reconnectMines());
    await this.guard("watchdog", () => this.watchdog());
    const s = this.state!;
    await this.patch({ tick: s.tick + 1 });
    const now = Date.now();

    for (const item of [...s.items]) {
      try {
      if (item.state === "ore" && hasMachine(s, "splitter")) {
        const t = await this.sparkTriage({ id: item.id, title: item.title, body: item.body ?? "" }, s.districts.map((d) => d.name));
        // Without Spark, a keyword guess shouldn't override a stack frame or route a mine already placed.
        const district = (!t?.reason && item.district !== "/" ? item.district : t?.district) ?? item.district;
        await this.patch({ items: [{ ...item, kind: t?.kind ?? item.kind, district, state: "queued", updatedAt: now }] });
        this.broadcast({ type: "log", level: "info", text: `Planner sorted "${item.title}" as ${t?.kind ?? item.kind} → ${district}`, at: Date.now(), itemId: item.id, ...(t?.reason ? { actor: "spark" as const, tool: "triage", reason: t.reason } : {}) });
      } else if (item.state === "rejected") {
        if (item.attempts >= MAX_ATTEMPTS) continue; // stays rejected until a human steps in
        if (item.branch?.startsWith("shiptorio/runner-")) continue; // local builds rework only with player approval
        await this.patch({ items: [{ ...item, state: "queued", updatedAt: now }] });
        this.log("info", `Rework: "${item.title}" goes back to the assemblers`, item.id);
      }
      } catch (error) { await this.reliabilityFailure(`tick:${item.id}`, error, item.id); }
    }

    if (this.env.HOSTED_SPARK_ASSEMBLER !== "1") {
      // The hosted assembler only stops here for want of a local agent. Once one is plugged in it isn't stuck,
      // even after the queue empties, so the map stops saying "needs a look".
      const presence = await this.ctx.storage.get<{ harnesses: string[]; seenAt: number }>("runnerPresence");
      const stale = s.machines.filter((m) => m.type === "assembler" && m.harness === "spark" && m.state === "blocked");
      if (stale.length && presence?.harnesses.length && Date.now() - presence.seenAt < 20000) await this.patch({ machines: stale.map((m) => ({ ...m, state: "idle" as const })) });
    }
    for (const item of lineOrder(s.items.filter((i) => i.state === "queued" && i.attempts < MAX_ATTEMPTS))) {
      if (planningHold(await this.ctx.storage.get<PlanningRetry>(`planningRetry:${item.id}`))) continue;
      const jobs = await this.runnerJobs();
      if (jobs.some(j => j.itemId === item.id && ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) continue;
      if (this.env.SPARK_DISABLED === "1" || this.running.size + jobs.filter(j => ["planning", "ready", "running", "awaiting_approval"].includes(j.status)).length >= budgetLimits(this.env).jobs) continue;
      const m = pickAssembler(s, item);
      if (!m) continue;
      if (this.env.HOSTED_SPARK_ASSEMBLER !== "1") {
        const presence = await this.ctx.storage.get<{ harnesses: string[]; seenAt: number }>("runnerPresence");
        if (presence?.harnesses.length && Date.now() - presence.seenAt < 20000 || jobs.some(j => ["planning", "awaiting_approval", "ready", "running"].includes(j.status))) continue;
        await this.patch({
          machines: [{ ...m, state: "blocked" }],

        });
        if (!s.move) {
          s.move = { id: crypto.randomUUID(), title: "Your computer writes the code. Plug it in to start building.", why: "The factory plans the work. Codex or Meta Muse Code on your computer writes the code: paste one line, once.", stage: "resources", itemId: item.id, createdAt: now, options: [{ id: "connect", label: "Connect a local agent", recommended: true, actions: [{ tool: "connect_source", args: { kind: "claude" }, reason: "No subscription builder is connected." }] }] };
          await this.publishDecision(s.move);
        }
        continue;
      }
      if (!sparkConfigured(this.env)) {
        if (m.state !== "blocked") this.log("warn", "The planner has no power. Add the Meta API key to start this line.", item.id);
        await this.patch({ machines: [{ ...m, state: "blocked" }] });
        continue;
      }
      {
        const account = (await this.env.DB.prepare("SELECT login FROM signup_resources WHERE kind='factory' AND resource=? ORDER BY rowid LIMIT 1").bind(this.meta!.repo.toLowerCase()).first<{login:string}>())?.login;
        if (!account) break;
        const quota = await runQuotaStatus(this.env, account);
        if (quota.used >= quota.limit) break;
      }
      await this.patch({
        items: [{ ...item, state: "working", machineId: m.id, updatedAt: now }],
        machines: [{ ...m, state: "working" }],
      });
      this.running.add(item.id);
      // Bounded hosted jobs execute in an alarm, not an HTTP request or a 30-second waitUntil.
      // One job per alarm keeps total work under the alarm's 15-minute limit.
      await this.runSparkJob(item.id, m.id);
      break;
    }

    await this.guard("orbitExpire", () => this.orbitExpire());
    await this.guard("autoLaunchPermitted", () => this.autoLaunchPermitted());
    await this.guard("offerGauntletMove", () => this.offerGauntletMove(true));
    await this.guard("offerPermitMove", () => this.offerPermitMove());
    await this.guard("offerLevelMove", () => this.offerLevelMove());
    await this.guard("offerGoalMove", () => this.offerGoalMove());
    await this.guard("offerResearchMove", () => this.offerResearchMove());
    await this.githubGuard("offerRunnerPlan", () => this.offerRunnerPlan());
    await this.guard("runLevel", () => this.runLevel());
    await this.guard("runLearned", () => this.runLearned());
    const presence = await this.ctx.storage.get<{ seenAt: number }>("runnerPresence");
    const busy = s.items.some((i) => i.attempts < MAX_ATTEMPTS && ((i.state === "ore" && hasMachine(s, "splitter")) || i.state === "rejected" || (i.state === "queued" && this.env.HOSTED_SPARK_ASSEMBLER === "1" && sparkConfigured(this.env) && !!pickAssembler(s, i))));
    if ((busy || this.ctx.getWebSockets("web").length > 0 || presence && Date.now() - presence.seenAt < 22000) && (await this.ctx.storage.getAlarm()) == null) await this.accountAlarm(Date.now() + TICK_MS);
    else await this.save();
    const retryAt = Math.min(...(await this.planningRetries()).map(r => r.retryAt), planningHold(await this.ctx.storage.get<PlanningRetry>(PLANNER_REST_KEY))?.retryAt ?? Infinity);
    const currentAlarm = await this.ctx.storage.getAlarm();
    if (Number.isFinite(retryAt) && (currentAlarm == null || currentAlarm > retryAt)) await this.accountAlarm(retryAt);
    const poll = await this.ctx.storage.get<{ nextAt: number }>("posthogPoll");
    if (poll && (await this.ctx.storage.get<boolean>("posthogLinked"))) {
      const next = Math.max(Date.now() + TICK_MS, poll.nextAt);
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm == null || alarm > next) await this.accountAlarm(next);
    }
    await this.scheduleOrbitDeadline();
    } catch (error) {
      await this.reliabilityFailure("alarm", error);
    } finally {
      this.batchingDecisions = false;
      if (this.accountErased || !this.state) return;
      // Schedule before refresh: even broken card/storage logic must not strand the factory.
      const next = Date.now() + 60000;
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm == null || alarm > next) await this.accountAlarm(next);
      try { await this.refreshDecisions(); } catch (error) { this.log("error", `Decision refresh failed: ${String(error)}`); }
    }
  }

  private async runSparkJob(itemId: string, machineId: string): Promise<void> {
    const s = this.state!;
    const get = () => s.items.find((i) => i.id === itemId)!;
    const machine = () => s.machines.find((m) => m.id === machineId);
    let buildStarted = false;
    try {
      if (!sparkConfigured(this.env)) throw new Error("The planner has no power: META_API_KEY isn't set");
      if (!this.meta) throw new Error("factory has no repo");
      const item = get();
      const token = await installationToken(this.env, this.meta.installationId);
      const tree = await repoTree(token, this.meta.repo);
      const paths = tree.entries.filter((e) => e.type === "blob").map((e) => e.path);
      const inDistrict = item.district === "/" ? paths : paths.filter((p) => p.startsWith(`${item.district}/`));
      const task = { title: item.title, body: item.body ?? "", district: item.district, failure: item.failure };
      const ref = item.branch ?? s.baseBranch;

      this.log("info", `Builder ${machineId} is reading the code`, itemId);
      const wanted = await pickFiles(this.sparkEnv(), task, inDistrict.length ? inDistrict : paths);
      const files = (
        await Promise.all(wanted.map(async (path) => ({ path, content: await fileContent(token, this.meta!.repo, path, ref) })))
      ).filter((f): f is { path: string; content: string } => f.content !== null);

      // Scoping is planning; charge only when the legacy hosted assembler actually starts writing.
      const account = await this.runAccount();
      if (!account || !await runQuota(this.env as never, account)) throw new Error("Daily run quota reached; builds paused until 00:00 UTC or a limit increase");
      buildStarted = true;
      await this.ctx.storage.delete(`planningRetry:${itemId}`);
      await this.patch({ items: [{ ...get(), attempts: get().attempts + 1, updatedAt: Date.now() }] });
      this.log("info", `Builder ${machineId} is writing a fix`, itemId);
      const fix = await writeFix(this.sparkEnv(), task, files);
      const bad = fix.changes.find((c) => !SAFE_PATH.test(c.path));
      if (bad) throw new Error(`refused to write ${bad.path}`);
      validatePatch(fix.changes.map(c => c.path), wanted, fix.changes.map(c => `+++ b/${c.path}\n${c.content.split("\n").map(l => `+${l}`).join("\n")}`).join("\n"));

      const branch = item.branch ?? `shiptorio/${item.id}`;
      await commitToBranch(token, this.meta.repo, s.baseBranch, branch, fix.changes, `${fix.title}\n\n${fix.summary}`);

      let { prNumber, prUrl } = item;
      if (!prNumber) {
        const issueNumber = item.source === "github_issue" ? Number(item.id.replace("gh-", "")) : null;
        const pr = await openPullRequest(token, this.meta.repo, {
          head: branch,
          base: s.baseBranch,
          title: fix.title,
          body: `${fix.summary}\n\n${issueNumber ? `Closes #${issueNumber}\n\n` : ""}_Built by Muse Spark at Builder in Shiptorio._`,
        });
        prNumber = pr.number;
        prUrl = pr.html_url;
      }
      await this.patch({
        items: [{ ...get(), state: "inspecting", branch, prNumber, prUrl, updatedAt: Date.now() }],
        machines: machine() ? [{ ...machine()!, state: "idle" }] : [],
      });
      this.log("success", `PR #${prNumber} is on the belt to Checks`, itemId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!buildStarted) {
        const key = `planningRetry:${itemId}`;
        await this.accountPut(key, planningFailure(await this.ctx.storage.get<PlanningRetry>(key), msg));
      }
      await this.patch({
        items: [{ ...get(), state: buildStarted ? "rejected" : "queued", failure: msg, updatedAt: Date.now() }],
        machines: machine() ? [{ ...machine()!, state: "idle" }] : [],
      });
      this.log("error", `Builder ${machineId} failed: ${msg}`, itemId);
    } finally {
      this.running.delete(itemId);
      await this.scheduleTick();
    }
  }
}

export const Factory = Sentry.instrumentDurableObjectWithSentry((env: FactoryEnv) => sentryOptions(env), FactoryBase);
export type Factory = FactoryBase;
