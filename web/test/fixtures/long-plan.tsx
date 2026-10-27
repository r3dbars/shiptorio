// Vite dev-only HTML entry; excluded from the product build. Uses the actual CheckIn and styles.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { CheckIn } from "../../src/ui/CheckIn";
import { longPlan } from "./long-plan-data";
import "../../src/iron.css";
import "../../src/styles.css";
import "../../src/foundry.css";

function Fixture() {
  const [receipt, setReceipt] = useState("No choice sent");
  const [open, setOpen] = useState(true);
  return <>
    <p style={{ padding: 16 }} role="status">LOCAL FIXTURE — {receipt}</p>
    <button type="button" onClick={() => { setReceipt("No choice sent"); setOpen(true); }}>Reset review</button>
    {open && <CheckIn deck={[longPlan]} calm send={(msg) => setReceipt(JSON.stringify(msg))} onFocus={() => {}} onClose={() => setOpen(false)} />}
  </>;
}
createRoot(document.getElementById("root")!).render(<Fixture />);
