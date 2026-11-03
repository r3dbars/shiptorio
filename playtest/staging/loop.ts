/** Exercise the private Worker, real Factory and alarm-driven fixture runner together. */
export async function verifyPrivateLoop(open: () => Promise<Response>, timeoutMs = 90000): Promise<void> {
  const response = await open();
  if (response.status !== 101) throw new Error(`Private loop socket failed: ${response.status}`);
  const socket = (response as Response & { webSocket: { accept(): void; send(text: string): void; close(): void; addEventListener(event: string, listener: (event: any) => void): void } }).webSocket;
  const accepted = new Set<string>();
  const sent = new Set<string>();
  const tools = new Set(["plan_runner_job", "approve_runner_job", "request_merge", "inspect_bottleneck", "approve_review", "approve_human_review", "human_approve"]);
  let stage = "first issue", timer: ReturnType<typeof setTimeout>;
  try {
    await new Promise<void>((resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Private fixture loop stalled at ${stage}`)), timeoutMs);
      socket.addEventListener("message", event => {
        try {
          const message = JSON.parse(event.data);
          const state = message.state ?? message.patch;
          if (state?.items?.some((item: any) => item.id === "gh-1" && item.state === "launched")) {
            if (!sent.has("approve_runner_job") || !sent.has("request_merge")) throw new Error("Private loop launched without the required player approvals");
            return resolve();
          }
          const moves = message.type === "deck" ? message.deck : message.type === "move" ? [message.move] : state?.deck ?? (state?.move ? [state.move] : []);
          for (const move of moves) {
            if (move.itemId !== "gh-1" || accepted.has(move.id)) continue;
            const option = move.options.find((option: any) => option.recommended && option.actions?.length);
            if (!option) continue;
            if (option.actions.some((action: any) => !tools.has(action.tool))) throw new Error("Unexpected private fixture action");
            accepted.add(move.id); stage = option.actions.map((action: any) => action.tool).join(",");
            socket.send(JSON.stringify({ type: "choose_move", moveId: move.id, optionId: option.id }));
            for (const action of option.actions) sent.add(action.tool);
          }
        } catch (error) { reject(error); }
      });
      socket.addEventListener("close", () => reject(new Error(`Private loop socket closed at ${stage}`)));
      socket.accept();
    });
  } finally { clearTimeout(timer!); socket.close(); }
}
