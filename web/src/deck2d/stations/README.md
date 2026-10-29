# Machine animation review

Open `/deck.html?source=machine-demo` to inspect the existing machines on the real deck.
Choose a machine, then Idle, Working, or Blocked. Freeze holds the animation frame.
Cycle all six visits each machine in order: idle (3s), working (6s), blocked (4s), recovery (3s).
Only the selected machine changes state. This preview has no factory connection or approvals.

| Machine | Job | Current working motion |
| --- | --- | --- |
| Repo | Receive feedback as a job | Readout bars sequence |
| Planner | Break the job into a plan | Three plan tiles light in order |
| Builder | Build or repair the change | Drive gear turns; stack vents |
| Checks | Run verification checks | Test indicators advance |
| Review | Inspect the change | Scan line travels over the crate |
| Gate | Prepare the release | Vertical status bar advances |

Idle mechanisms rest. Working uses the existing warm activity lights. Blocked stops the work mechanism,
switches its status to red, and marks the affected belt section red; clear the blockage to resume work.
The current blocked sprites include warning smoke on some machines. These are baseline motions for
visual iteration, not new factory behavior. The green automatic state remains separate from idle.

Every machine now has a matching front-mounted status light: green for working/automatic, unlit for idle,
red for blocked. A blocked machine also gets a red contour traced around its own outer structural pixels. Its conveyor
bay holds the red plates and arrows still; cargo stops at that bay and resumes when it clears. Neighboring
healthy bays keep moving. Click a machine to open the existing swipe card with Shippy's explanation.
In the rehearsal, swiping right on a blocked machine clears the simulated jam. Actual factory approvals
reuse their authoritative card and action; status-only cards never invent a live repair action.

`/stations.html?only=code` still provides the original sprite comparison sheet. The in-deck preview is
for focused motion review with the actual floor, shadows, spacing, conveyor and orb.
