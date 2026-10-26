import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { sound } from "./sound/engine";
import "./styles.css";

sound.install();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
