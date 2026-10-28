import "./MachineLight.css";
import { RUNNER } from "../copy";
import { machineLine, useRunnerStatus } from "./runnerStatus";

/**
 * The one HUD signal for your machine: a status lamp and one line ("Working on #1", "Connected · waiting on your OK").
 * Self-contained so any HUD can slot it in; tapping it opens the full connection sheet.
 */
export function MachineLight({ repo, onOpen }: { repo?: string; onOpen?: () => void }) {
  const { status } = useRunnerStatus(repo);
  const line = machineLine(status);
  if (!repo || !line) return null;
  const tip = status?.working?.title || status?.waitingOn?.title || undefined;
  return (
    <button type="button" className={`chip machine-light ${line.light}`} onClick={onOpen} title={tip} aria-label={`${RUNNER.light.label}: ${line.text}. ${RUNNER.light.open}`}>
      <span className="ml-lamp" aria-hidden="true" />
      <span role="status" aria-live="polite">{line.text}<small>{RUNNER.light.label}</small></span>
    </button>
  );
}
