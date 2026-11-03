/** When each build beat starts, in seconds from the start (build.ts has the story of each beat). */
export const STAGE_AT = { unlock: 0, plot: 0.2, scaffold: 0.45, frame: 0.7, panels: 1.15, top: 1.65, land: 1.95, burst: 2.1, check: 2.3, done: 2.5, gone: 3.5 } as const;
