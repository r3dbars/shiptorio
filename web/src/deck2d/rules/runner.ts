// What /api/repos/:repo/runner/status reports about the player's machine. ui/runnerStatus.ts polls it for the old app.
export interface RunnerStatus {
  paired: boolean; online: boolean; seenAt: number | null; harnesses: string[];
  lastJob: { id: string; status: string } | null;
  /** The job your machine is on right now, newest server only. */
  working?: { itemId: string; number: number | null; title: string; status: string; harness: string } | null;
  /** The plan or build card it waits on you for. */
  waitingOn?: { moveId: string; title: string } | null;
}
