// Only an authoritative launched-state transition ends an outstanding UI action.
// All failures before that transition still fail the playtest.
export function playerAction(action, launchConfirmed) {
  return Promise.race([action().then(() => false), launchConfirmed.then(() => true)]);
}
