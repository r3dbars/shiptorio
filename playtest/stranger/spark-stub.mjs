// Provider boundary only: production Spark parsing, budgets, tools and decisions still run.
export function sparkStub() {
  const calls = [], unexpected = [];
  async function outbound(request) {
    const { messages } = await request.json();
    const prompt = messages.filter(m => m.role === "developer").map(m => m.content).join("\n");
    let reply, kind;
    if (prompt.includes("You triage incoming work")) { kind = "triage"; reply = { kind: "bug", district: "src", reason: "Checkout discount is missing." }; }
    // Review now has a tool loop too; its prompt also says "Choose ONE tool per turn".
    // Match the review station first so the fixture cannot answer it with a planner assignment.
    else if (prompt.includes("hostile reviewer")) { kind = "review"; reply = { tool: "verdict", verdict: "pass", reason: "Discount calculation and regression agree.", findings: [] }; }
    else if (prompt.includes("Choose ONE tool per turn")) {
      kind = "plan";
      // Request history includes observations, so each plan starts fresh without global counters.
      const data = JSON.parse(messages.at(-1).content.split("\n").slice(1, -1).join("\n"));
      if (!data.includes('"tool":"read_issue"')) reply = { tool: "read_issue", reason: "Understand the reported discount problem." };
      else if (!data.includes('"tool":"read_file"')) reply = { tool: "read_file", path: "src/cart.ts", reason: "Inspect the checkout calculation." };
      else reply = { tool: "assign_job", reason: "Fix the calculation with regression coverage.", plan: "Apply the SAVE10 discount to the checkout total and add a regression test.", acceptance: ["SAVE10 reduces a 100 subtotal to 90.", "Regression fails on base and passes on head."], files: ["src/cart.ts", "test/cart.test.ts"], heeded: [] };
    }
    else if (prompt.includes("Pick the files you need")) { kind = "scope"; reply = { files: ["src/cart.ts", "test/cart.test.ts"] }; }
    else if (prompt.includes("routing one approved coding job")) { kind = "power"; reply = { harness: "codex", why: "Use the connected subscription." }; }
    else if (prompt.includes('"order"')) { kind = "deck"; const brief = JSON.parse(JSON.parse(messages.at(-1).content.split("\n").slice(1, -1).join("\n")));
      reply = { order: brief.cards.map(c => c.id), reason: "Keep the available player decisions." }; }
    else if (prompt.includes('"tech"')) { kind = "research"; reply = { tech: null, why: "Finish the first launch." }; }
    else if (prompt.includes('"recommend"')) { kind = "permit"; reply = { recommend: false, why: "Human approval for the first launch." }; }
    else { unexpected.push(prompt.slice(0, 400)); return new Response("Unknown Spark fixture call", { status: 400 }); }
    calls.push(kind);
    return Response.json({ usage: { total_tokens: 100 }, choices: [{ message: { content: JSON.stringify(reply) } }] });
  }
  return { calls, unexpected, outbound };
}
